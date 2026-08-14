"use server";

import { revalidatePath } from "next/cache";
import { prisma, prismaPlatform } from "@/lib/prisma";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { PAPEIS_PLATAFORMA_TUDO, temPapelPlataforma } from "@/lib/platform/authorization";
import { logPlatformActivity } from "@/lib/platform/audit";
import { limiteEfetivoDoCatalogo, contarUsoAtual } from "@/lib/entitlements";
import { centavosDeReais, parseLimiteForm, FEATURES_EDITAVEIS_PLANO } from "@/lib/plan-schema";
import { type ActionState, erroAcessoNegado, erroGenerico, erroValidacao, sucesso } from "@/lib/action-result";
import { z } from "zod";

// Fase P.9: features agregadas checáveis no guard de downgrade — mesma
// lista de contarUsoAtual (PHOTOS_PER_PROPERTY é por imóvel, não entra
// aqui, ver comentário de contarUsoAtual em src/lib/entitlements.ts).
const FEATURES_GUARD_DOWNGRADE = ["PROPERTIES", "USERS", "CRM_CLIENTS"] as const;

// Atribui um plano JÁ EXISTENTE a uma Organization — mesma action genérica
// serve STARTER→BASIC/PRO/PREMIUM e qualquer outra combinação (Fase P.9),
// nunca uma action por plano de destino. Não há edição de
// Plan/PlanModule/PlanLimit aqui (isso agora vive em
// /platform/plans/[id]/editar) — só a atribuição planId↔Organization.
// OrganizationLimitOverride nunca é tocado por esta função (sem planId na
// tabela — sobrevive intacto a qualquer troca de plano, ver comentário do
// model no schema).
//
// Correção pós-auditoria (achado MEDIUM, fail-open): quando o plano de
// DESTINO é isTrial=true, esta action agora garante atomicamente (mesma
// transação do planId) que a organização fica com um período de trial
// VÁLIDO — nunca mais "planId trial + zero Subscription", que
// resolverEstadoAcesso (fail-closed) trataria como bloqueado, mas que é
// melhor prevenir na origem do que depender só do fail-closed como única
// defesa. Se já existir uma Subscription TRIALING ainda válida (agora <=
// currentPeriodEnd) pra esta organização, ela é reaproveitada — nunca
// cria uma segunda. Subscription de plano ATUAL não-trial (histórico de
// um trial anterior, já expirado ou não) nunca é tocada/apagada — sempre
// preservada como registro factual.
export async function alterarPlano(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) {
    return erroAcessoNegado();
  }

  const planId = formData.get("planId");
  if (typeof planId !== "string" || !planId) {
    return erroGenerico("Selecione um plano.");
  }

  const organizacao = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planId: true, limitOverrides: true },
  });
  if (!organizacao) return erroGenerico("Organization não encontrada.");
  if (organizacao.planId === planId) {
    return sucesso("Nenhuma alteração — a organização já está nesse plano.");
  }

  const planoNovo = await prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true, active: true, isTrial: true, trialDays: true, planLimits: true },
  });
  if (!planoNovo) return erroGenerico("Plano inválido.");
  if (!planoNovo.active) {
    return erroGenerico("Este plano está inativo e não pode ser atribuído a organizações.");
  }
  // Defensivo: Plan edit (atualizarPlano) já exige trialDays > 0 quando
  // isTrial=true, então este caso não deveria ser alcançável — mas se um
  // plano trial inconsistente (trialDays null) existir por algum motivo,
  // recusar explicitamente em vez de criar uma Subscription sem fim
  // válido (o que reabriria o próprio fail-open que esta correção fecha).
  if (planoNovo.isTrial && planoNovo.trialDays === null) {
    return erroGenerico(
      "Este plano está marcado como trial mas não tem duração definida (trialDays). Corrija o plano antes de atribuí-lo."
    );
  }

  // Guard de downgrade (Fase P.9, seção 35): nunca desativa/apaga dado —
  // só recusa a TROCA DE PLANO quando o uso atual já excede o limite
  // efetivo do plano de destino (override da organização continua
  // valendo, se existir). Nunca dispara numa troca que só aumenta
  // limites (upgrade) — a comparação é sempre uso > novoLimite, nunca o
  // contrário.
  for (const feature of FEATURES_GUARD_DOWNGRADE) {
    const novoLimite = limiteEfetivoDoCatalogo(organizacao.limitOverrides, planoNovo.planLimits, feature);
    if (novoLimite === null) continue;
    const usoAtual = await contarUsoAtual(organizationId, feature);
    if (usoAtual !== null && usoAtual > novoLimite) {
      return erroGenerico(
        `Não é possível mudar para este plano: uso atual de ${feature} (${usoAtual}) excede o novo limite (${novoLimite}). Reduza o uso ou escolha outro plano.`
      );
    }
  }

  // prismaPlatform.$transaction: planId + (quando aplicável) Subscription
  // de trial são escritas atômicas — nunca planId comitado sozinho com a
  // criação da Subscription falhando depois (ver seção 12/21 da
  // correção).
  await prismaPlatform.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organizationId },
      data: { planId },
    });

    if (planoNovo.isTrial && planoNovo.trialDays !== null) {
      const agora = new Date();
      const trialValido = await tx.subscription.findFirst({
        where: { organizationId, status: "TRIALING", currentPeriodEnd: { gte: agora } },
        orderBy: { createdAt: "desc" },
      });
      if (!trialValido) {
        await tx.subscription.create({
          data: {
            organizationId,
            planId,
            status: "TRIALING",
            currentPeriodStart: agora,
            currentPeriodEnd: new Date(agora.getTime() + planoNovo.trialDays * 24 * 60 * 60 * 1000),
          },
        });
      }
    }
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "PLAN_CHANGED",
    entity: "Organization",
    entityId: organizationId,
    organizationId,
    metadata: { planIdAnterior: organizacao.planId, planIdNovo: planId },
  });

  revalidatePath(`/platform/organizations/${organizationId}`);
  return sucesso("Plano atualizado.");
}

// Nenhum dado é apagado em suspensão/ativação — só o acesso é bloqueado
// (enforcement real em src/lib/tenant.ts requireOrganizationId/
// getOrganizationBySlug e nas Server Actions/Route Handlers públicas que
// revalidam organization.active, e src/lib/auth.ts authorize()).
export async function suspenderOrganization(organizationId: string): Promise<void> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) return;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { active: false },
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "ORGANIZATION_SUSPENDED",
    entity: "Organization",
    entityId: organizationId,
    organizationId,
  });

  revalidatePath(`/platform/organizations/${organizationId}`);
  revalidatePath("/platform/organizations");
}

export async function ativarOrganization(organizationId: string): Promise<void> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) return;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { active: true },
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "ORGANIZATION_ACTIVATED",
    entity: "Organization",
    entityId: organizationId,
    organizationId,
  });

  revalidatePath(`/platform/organizations/${organizationId}`);
  revalidatePath("/platform/organizations");
}

// Fase P.9: estende/redefine o fim do trial de uma organização. Só faz
// sentido pra organização cujo PLANO ATUAL é isTrial — planos pagos nunca
// chegam aqui pela UI (ver Organization detail), mas a action reforça a
// regra mesmo assim. "base = max(agora, currentPeriodEnd)" (seção 30 do
// pedido): se o trial ainda não expirou, soma a partir do fim atual
// (nunca "perde" dias já concedidos); se já expirou, soma a partir de
// agora (reativa a organização a partir de hoje, nunca retroativo).
export async function estenderTrial(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) return erroAcessoNegado();

  const organizacao = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planId: true, plan: { select: { isTrial: true } } },
  });
  if (!organizacao) return erroGenerico("Organization não encontrada.");
  if (!organizacao.plan.isTrial) {
    return erroGenerico("Esta organização não está em um plano de trial.");
  }

  // Fase P.9: prismaPlatform (via de escape cross-tenant explícita,
  // src/lib/prisma.ts) — esta action já validou a sessão via
  // requirePlatformOperator() acima e opera sobre uma organização
  // ARBITRÁRIA (nunca "a organização da sessão atual", que nem existe
  // aqui), o exato caso de uso documentado pra essa via de escape.
  const trialAtual = await prismaPlatform.subscription.findFirst({
    where: { organizationId, status: "TRIALING" },
    orderBy: { createdAt: "desc" },
  });

  const agora = new Date();
  const modo = formData.get("modo");
  let novaData: Date;

  if (modo === "DIAS") {
    const dias = Number(formData.get("dias"));
    if (!Number.isInteger(dias) || dias <= 0) return erroGenerico("Informe um número de dias válido.");
    const baseMs = Math.max(agora.getTime(), trialAtual?.currentPeriodEnd?.getTime() ?? agora.getTime());
    novaData = new Date(baseMs + dias * 24 * 60 * 60 * 1000);
  } else if (modo === "DATA") {
    const dataRaw = formData.get("data");
    if (typeof dataRaw !== "string" || !dataRaw) return erroGenerico("Informe uma data.");
    const parsedDate = new Date(dataRaw);
    if (Number.isNaN(parsedDate.getTime())) return erroGenerico("Data inválida.");
    if (parsedDate.getTime() <= agora.getTime()) return erroGenerico("A nova data precisa ser no futuro.");
    novaData = parsedDate;
  } else {
    return erroGenerico("Escolha uma forma de estender o trial.");
  }

  if (trialAtual) {
    await prismaPlatform.subscription.update({
      where: { id: trialAtual.id, organizationId },
      data: { currentPeriodEnd: novaData },
    });
  } else {
    // Organização em plano trial sem NENHUMA Subscription ainda (dado
    // legado, ou trial nunca criado por algum motivo) — cria agora,
    // começando hoje, pra nunca deixar o Platform Admin sem conseguir
    // estender.
    await prismaPlatform.subscription.create({
      data: {
        organizationId,
        planId: organizacao.planId,
        status: "TRIALING",
        currentPeriodStart: agora,
        currentPeriodEnd: novaData,
      },
    });
  }

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "TRIAL_EXTENDED",
    entity: "Organization",
    entityId: organizationId,
    organizationId,
    metadata: {
      trialEndsAtAntes: trialAtual?.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAtDepois: novaData.toISOString(),
    },
  });

  revalidatePath(`/platform/organizations/${organizationId}`);
  return sucesso("Trial atualizado.");
}

const modoOverrideSchema = z.enum(["PADRAO", "ILIMITADO", "PERSONALIZADO"]);

// Fase P.9: preço e limites contratados especificamente por esta
// organização, independente de qual plano ela está — OrganizationLimitOverride
// não tem planId (sobrevive a qualquer alterarPlano). "PADRAO" remove a
// linha de override (nunca grava limit=valor-atual-do-plano — ver
// comentário do model no schema); "ILIMITADO" grava explicitamente
// limit=null; "PERSONALIZADO" grava o valor digitado. As três opções são
// mutuamente exclusivas por feature, nunca ambíguas.
export async function atualizarOverrides(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) return erroAcessoNegado();

  const precoOverrideRaw = String(formData.get("precoOverrideRaw") ?? "").trim();
  const precoOverride = precoOverrideRaw === "" ? null : centavosDeReais(precoOverrideRaw);
  if (precoOverrideRaw !== "" && precoOverride === null) {
    return erroGenerico("Preço override inválido.");
  }

  type Decisao =
    | { feature: string; acao: "REMOVER" }
    | { feature: string; acao: "DEFINIR"; limit: number | null };
  const decisoes: Decisao[] = [];

  for (const feature of FEATURES_EDITAVEIS_PLANO) {
    const modoParsed = modoOverrideSchema.safeParse(formData.get(`${feature}_modo`));
    if (!modoParsed.success) return erroValidacao(modoParsed.error);

    if (modoParsed.data === "PADRAO") {
      decisoes.push({ feature, acao: "REMOVER" });
    } else if (modoParsed.data === "ILIMITADO") {
      decisoes.push({ feature, acao: "DEFINIR", limit: null });
    } else {
      const valorRaw = String(formData.get(`${feature}_valor`) ?? "");
      const parsedValor = parseLimiteForm(valorRaw);
      if (!parsedValor.ok || parsedValor.valor === null) {
        return erroGenerico(`Informe um valor numérico para ${feature}, ou escolha "Ilimitado"/"Usar padrão".`);
      }
      decisoes.push({ feature, acao: "DEFINIR", limit: parsedValor.valor });
    }
  }

  const antes = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { priceMonthlyCentsOverride: true },
  });
  if (!antes) return erroGenerico("Organization não encontrada.");

  // prismaPlatform.$transaction (não prisma.$transaction): upsert por
  // chave composta (organizationId_feature) nunca consegue satisfazer a
  // checagem de tenant-scoping da extensão (o objeto `where` de um upsert
  // por chave composta é sempre `{ organizationId_feature: {...} }` —
  // organizationId nunca aparece como chave direta de `where`, só
  // aninhado). Mesma via de escape documentada em src/lib/prisma.ts,
  // mesmo racional do trialAtual acima.
  await prismaPlatform.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organizationId },
      data: { priceMonthlyCentsOverride: precoOverride },
    });

    for (const decisao of decisoes) {
      if (decisao.acao === "REMOVER") {
        await tx.organizationLimitOverride.deleteMany({ where: { organizationId, feature: decisao.feature } });
      } else {
        await tx.organizationLimitOverride.upsert({
          where: { organizationId_feature: { organizationId, feature: decisao.feature } },
          update: { limit: decisao.limit },
          create: { organizationId, feature: decisao.feature, limit: decisao.limit },
        });
      }
    }
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "PLAN_OVERRIDE_UPDATED",
    entity: "Organization",
    entityId: organizationId,
    organizationId,
    metadata: {
      priceMonthlyCentsOverrideAntes: antes.priceMonthlyCentsOverride,
      priceMonthlyCentsOverrideDepois: precoOverride,
    },
  });

  revalidatePath(`/platform/organizations/${organizationId}`);
  return sucesso("Overrides atualizados.");
}
