"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { PAPEIS_PLATAFORMA_TUDO, temPapelPlataforma } from "@/lib/platform/authorization";
import { logPlatformActivity } from "@/lib/platform/audit";
import { type ActionState, erroAcessoNegado, erroGenerico, sucesso } from "@/lib/action-result";

// Atribui um plano JÁ EXISTENTE a uma Organization — não há edição de
// Plan/PlanModule/PlanLimit no MVP (decisão #8 do plano: risco
// desproporcional, afeta todas as orgs daquele plano de uma vez).
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
    select: { planId: true },
  });
  if (!organizacao) return erroGenerico("Organization não encontrada.");
  if (organizacao.planId === planId) {
    return sucesso("Nenhuma alteração — a organização já está nesse plano.");
  }

  const planoNovo = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!planoNovo) return erroGenerico("Plano inválido.");

  await prisma.organization.update({
    where: { id: organizationId },
    data: { planId },
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
