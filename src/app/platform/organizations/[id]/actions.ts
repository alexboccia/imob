"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, prismaPlatform } from "@/lib/prisma";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { PAPEIS_PLATAFORMA_TUDO, temPapelPlataforma } from "@/lib/platform/authorization";
import { logPlatformActivity } from "@/lib/platform/audit";
import { limiteEfetivoDoCatalogo, contarUsoAtual } from "@/lib/entitlements";
import { centavosDeReais, parseLimiteForm, FEATURES_EDITAVEIS_PLANO } from "@/lib/plan-schema";
import { gerarTokenConvite, hashToken, expiracaoConvite } from "@/lib/platform/invite";
import { enviarEmailConviteOwner } from "@/lib/email";
import { logger } from "@/lib/logger";
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

// Exclusão DEFINITIVA — diferente de suspenderOrganization, aqui os dados
// realmente somem. Protegida por confirmação (digitar o slug exato) na
// própria action, nunca só no client (o client component só desabilita o
// botão por UX). Ordem dos deleteMany replica limparOrganizacao
// (src/test/fixtures.ts) — filhos antes de pais, respeitando as FKs
// RESTRICT de Organization. Cascatas automáticas do Prisma cobrem o resto
// (Property→Media/PropertyStatusHistory/PortalListing,
// Person→PersonPreference/ScheduledActivity,
// PropertyInterest→PropertyInterestStageHistory). User NUNCA é apagado
// aqui — só o vínculo OrganizationMember some; a conta de login do
// responsável sobrevive (pode ser membro de outra organização).
export async function deletarOrganization(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) return erroAcessoNegado();

  const organizacao = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, slug: true },
  });
  if (!organizacao) return erroGenerico("Organization não encontrada.");

  const confirmacao = String(formData.get("confirmacao") ?? "").trim();
  if (confirmacao !== organizacao.slug) {
    return erroGenerico(`Digite exatamente "${organizacao.slug}" para confirmar a exclusão.`);
  }

  try {
    await prismaPlatform.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { invoice: { organizationId } } });
      await tx.invoice.deleteMany({ where: { organizationId } });
      await tx.subscription.deleteMany({ where: { organizationId } });
      await tx.organizationLimitOverride.deleteMany({ where: { organizationId } });
      await tx.billingEvent.deleteMany({ where: { organizationId } });
      await tx.aiUsage.deleteMany({ where: { organizationId } });
      await tx.notification.deleteMany({ where: { organizationId } });
      await tx.activityLog.deleteMany({ where: { organizationId } });
      await tx.notificationPreference.deleteMany({ where: { organizationMember: { organizationId } } });
      // Deal e Interaction têm FK restrict pra Property — saem antes.
      // PropertyInterest também (FK restrict pra Property).
      await tx.deal.deleteMany({ where: { organizationId } });
      await tx.interaction.deleteMany({ where: { organizationId } });
      await tx.propertyInterest.deleteMany({ where: { organizationId } });
      await tx.property.deleteMany({ where: { organizationId } });
      await tx.person.deleteMany({ where: { organizationId } });
      await tx.featureOption.deleteMany({ where: { organizationId } });
      await tx.propertyTypeOption.deleteMany({ where: { organizationId } });
      await tx.ownerInviteToken.deleteMany({ where: { organizationId } });
      await tx.organizationMember.deleteMany({ where: { organizationId } });
      await tx.organizationSettings.deleteMany({ where: { organizationId } });
      await tx.organizationBranding.deleteMany({ where: { organizationId } });
      await tx.organization.delete({ where: { id: organizationId } });
    });
  } catch (erro) {
    logger.error("Falha ao deletar Organization — transação revertida, nada foi apagado", erro, {
      platformOperatorId: operador.id,
      organizationId,
      modulo: "platform",
    });
    return erroGenerico("Não foi possível excluir a organização. Nenhum dado foi apagado — tente novamente.");
  }

  // PlatformAuditLog.organizationId é solto, sem FK real pra Organization
  // (só pra filtro) — logar depois do delete é seguro, o registro
  // continua consultável mesmo com a Organization já apagada.
  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "ORGANIZATION_DELETED",
    entity: "Organization",
    entityId: organizationId,
    organizationId,
    metadata: { name: organizacao.name, slug: organizacao.slug },
  });

  revalidatePath("/platform/organizations");
  redirect("/platform/organizations");
}

export type EstadoReenviarConvite = ActionState & { linkConvite?: string };

const reenviarConviteSchema = z.object({
  novoEmail: z.string().email("E-mail inválido."),
});

// Reenvia (ou muda o e-mail e reenvia) o convite de primeiro acesso do
// OWNER — só faz sentido enquanto o vínculo ainda está INVITED (nunca
// depois de ativado, ali quem manda é a troca de senha normal do
// usuário). Sempre invalida convites antigos não usados antes de criar um
// novo, pra nunca deixar dois links válidos ao mesmo tempo.
export async function reenviarConvite(
  organizationId: string,
  _prevState: EstadoReenviarConvite,
  formData: FormData
): Promise<EstadoReenviarConvite> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) return erroAcessoNegado();

  const organizacao = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  if (!organizacao) return erroGenerico("Organization não encontrada.");

  const membroOwner = await prisma.organizationMember.findFirst({
    where: { organizationId, role: "OWNER", status: "INVITED" },
    include: { user: true },
  });
  if (!membroOwner) {
    return erroGenerico("Não há convite pendente para esta organização.");
  }

  const parsed = reenviarConviteSchema.safeParse({
    novoEmail: formData.get("novoEmail"),
  });
  if (!parsed.success) return erroValidacao(parsed.error);
  const novoEmail = parsed.data.novoEmail;

  const emailAnterior = membroOwner.user.email;
  const emailAlterado = novoEmail !== emailAnterior;

  if (emailAlterado) {
    const emailEmUso = await prisma.user.findUnique({ where: { email: novoEmail }, select: { id: true } });
    if (emailEmUso && emailEmUso.id !== membroOwner.userId) {
      return erroGenerico("Já existe uma conta com este e-mail.");
    }
    await prisma.user.update({ where: { id: membroOwner.userId }, data: { email: novoEmail } });
  }

  // Sai antes de criar o novo — nunca dois links válidos ao mesmo tempo
  // pro mesmo convite.
  await prisma.ownerInviteToken.deleteMany({
    where: { userId: membroOwner.userId, organizationId, usedAt: null },
  });

  const token = gerarTokenConvite();
  const tokenHash = hashToken(token);
  const expiresAt = expiracaoConvite();
  await prisma.ownerInviteToken.create({
    data: { userId: membroOwner.userId, organizationId, tokenHash, expiresAt },
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "OWNER_INVITE_RESENT",
    entity: "User",
    entityId: membroOwner.userId,
    organizationId,
    metadata: emailAlterado ? { emailAnterior, emailNovo: novoEmail } : { email: novoEmail },
  });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const linkConvite = `${baseUrl}/app/convite/${token}`;

  const { enviado } = await enviarEmailConviteOwner({
    para: novoEmail,
    nomeOrganizacao: organizacao.name,
    linkConvite,
  });

  revalidatePath(`/platform/organizations/${organizationId}`);

  if (!enviado) {
    return {
      success: true,
      message: "Convite atualizado, mas o e-mail não pôde ser enviado. Copie o link abaixo e envie manualmente.",
      linkConvite,
    };
  }

  return sucesso(`Convite reenviado para ${novoEmail}.`);
}
