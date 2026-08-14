"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { PAPEIS_PLATAFORMA_TUDO, temPapelPlataforma } from "@/lib/platform/authorization";
import { logPlatformActivity } from "@/lib/platform/audit";
import { editarPlanoSchema, FEATURES_EDITAVEIS_PLANO } from "@/lib/plan-schema";
import { type ActionState, erroAcessoNegado, erroGenerico, erroValidacao, sucesso } from "@/lib/action-result";

// Fase P.9: única mutação de Plan/PlanLimit em todo o Platform Admin.
// `code`/`id`/`createdAt` nunca aparecem no formData, portanto nunca são
// alterados aqui. Alterar preço/limites/trial de um plano afeta
// IMEDIATAMENTE toda organização vinculada a ele que não tenha override
// próprio (ver AVISO explícito na UI de edição) — decisão V1 deliberada
// (seção 59 do pedido), não é cobrança retroativa nem versionamento
// histórico de preço.
export async function atualizarPlano(
  planId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) {
    return erroAcessoNegado();
  }

  const parsed = editarPlanoSchema.safeParse({
    priceMonthlyCentsRaw: formData.get("priceMonthlyCentsRaw") ?? "",
    isTrial: formData.get("isTrial") ?? "false",
    trialDaysRaw: formData.get("trialDaysRaw") ?? "",
    active: formData.get("active") ?? "true",
    PROPERTIES: formData.get("PROPERTIES") ?? "",
    PHOTOS_PER_PROPERTY: formData.get("PHOTOS_PER_PROPERTY") ?? "",
    USERS: formData.get("USERS") ?? "",
    CRM_CLIENTS: formData.get("CRM_CLIENTS") ?? "",
  });
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;

  const planoAntes = await prisma.plan.findUnique({
    where: { id: planId },
    select: {
      priceMonthlyCents: true,
      isTrial: true,
      trialDays: true,
      active: true,
      _count: { select: { organizations: true } },
    },
  });
  if (!planoAntes) return erroGenerico("Plano não encontrado.");

  // Correção pós-auditoria (achado MEDIUM, fail-open, segundo caminho):
  // transformar um plano JÁ EM USO em trial silenciosamente deixaria toda
  // organização vinculada com isTrial=true e zero Subscription — o
  // fail-closed de resolverEstadoAcesso bloquearia essas organizações
  // imediatamente, o que é pior que recusar a edição aqui (ninguém pediu
  // pra bloquear organizações pagas existentes). Só bloqueado na
  // transição false→true; permitido livremente quando o plano ainda não
  // tem nenhuma organização (nada a proteger) ou quando não está mudando
  // isTrial.
  if (dados.isTrial && !planoAntes.isTrial && planoAntes._count.organizations > 0) {
    return erroGenerico(
      "Não é possível transformar em trial um plano que já possui organizações. Crie/atribua um plano trial apropriado."
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.plan.update({
      where: { id: planId },
      data: {
        priceMonthlyCents: dados.priceMonthlyCents,
        isTrial: dados.isTrial,
        trialDays: dados.trialDays,
        active: dados.active,
      },
    });

    for (const feature of FEATURES_EDITAVEIS_PLANO) {
      await tx.planLimit.upsert({
        where: { planId_feature: { planId, feature } },
        update: { limit: dados.limites[feature] },
        create: { planId, feature, limit: dados.limites[feature] },
      });
    }
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "PLAN_UPDATED",
    entity: "Plan",
    entityId: planId,
    metadata: {
      priceMonthlyCentsAntes: planoAntes.priceMonthlyCents,
      priceMonthlyCentsDepois: dados.priceMonthlyCents,
      isTrialAntes: planoAntes.isTrial,
      isTrialDepois: dados.isTrial,
      activeAntes: planoAntes.active,
      activeDepois: dados.active,
    },
  });

  revalidatePath(`/platform/plans/${planId}`);
  revalidatePath("/platform/plans");
  return sucesso("Plano atualizado.");
}
