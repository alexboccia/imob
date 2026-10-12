"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { PAPEIS_PLATAFORMA_TUDO, temPapelPlataforma } from "@/lib/platform/authorization";
import { logPlatformActivity } from "@/lib/platform/audit";
import { criarPlanoSchema, FEATURES_EDITAVEIS_PLANO } from "@/lib/plan-schema";
import { type ActionState, erroAcessoNegado, erroGenerico, erroValidacao, sucesso } from "@/lib/action-result";

export type EstadoCriarPlano = ActionState & { planId?: string };

// Fase 114 — PLN-001: antes desta fase, não havia NENHUMA forma de criar
// um Plan pelo painel (só edição de planos pré-existentes, atualizarPlano
// em ../[id]/actions.ts). Mesmo padrão de autorização e mesma convenção
// de auditoria daquele arquivo. `active` nunca vem do formulário: todo
// plano nasce ativo (nenhuma organização usa ele ainda, nada a proteger).
export async function criarPlano(
  _prevState: EstadoCriarPlano,
  formData: FormData
): Promise<EstadoCriarPlano> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) {
    return erroAcessoNegado();
  }

  const parsed = criarPlanoSchema.safeParse({
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
    descriptionRaw: formData.get("descriptionRaw") ?? "",
    priceMonthlyCentsRaw: formData.get("priceMonthlyCentsRaw") ?? "",
    isTrial: formData.get("isTrial") ?? "false",
    trialDaysRaw: formData.get("trialDaysRaw") ?? "",
    PROPERTIES: formData.get("PROPERTIES") ?? "",
    PHOTOS_PER_PROPERTY: formData.get("PHOTOS_PER_PROPERTY") ?? "",
    USERS: formData.get("USERS") ?? "",
    CRM_CLIENTS: formData.get("CRM_CLIENTS") ?? "",
  });
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;

  const existente = await prisma.plan.findUnique({ where: { code: dados.code } });
  if (existente) return erroGenerico(`Já existe um plano com o código "${dados.code}".`);

  const novoPlano = await prisma.$transaction(async (tx) => {
    const plano = await tx.plan.create({
      data: {
        code: dados.code,
        name: dados.name,
        description: dados.description,
        priceMonthlyCents: dados.priceMonthlyCents,
        active: true,
        isTrial: dados.isTrial,
        trialDays: dados.trialDays,
      },
    });

    for (const feature of FEATURES_EDITAVEIS_PLANO) {
      await tx.planLimit.create({
        data: { planId: plano.id, feature, limit: dados.limites[feature] },
      });
    }

    return plano;
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "PLAN_CREATED",
    entity: "Plan",
    entityId: novoPlano.id,
    metadata: {
      code: novoPlano.code,
      name: novoPlano.name,
      priceMonthlyCents: novoPlano.priceMonthlyCents,
    },
  });

  revalidatePath("/platform/plans");
  return { ...sucesso(`Plano "${novoPlano.name}" criado.`), planId: novoPlano.id };
}
