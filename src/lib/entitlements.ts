import { cache } from "react";
import { prisma } from "@/lib/prisma";

// "Feature"s de limite conhecidas (strings livres no banco — PlanLimit.feature
// não é enum de propósito, pra permitir novos limites sem migration).
export const FEATURE_PROPERTIES = "PROPERTIES";
export const FEATURE_USERS = "USERS";

// Status de Property que contam como "ativo" pro limite de imóveis.
const STATUS_IMOVEL_ATIVO = ["DRAFT", "AVAILABLE", "RESERVED"] as const;

const carregarPlano = cache(async (organizationId: string) => {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: {
      plan: {
        include: {
          planModules: { include: { module: true } },
          planLimits: true,
        },
      },
    },
  });
  return organization.plan;
});

export async function hasModule(
  organizationId: string,
  moduleCode: string
): Promise<boolean> {
  const plano = await carregarPlano(organizationId);
  const planModule = plano.planModules.find((pm) => pm.module.code === moduleCode);
  return planModule?.enabled ?? false;
}

// null = sem limite (ilimitado, seja por config explícita ou por ausência
// de linha pra essa feature nesse plano).
export async function getLimit(
  organizationId: string,
  feature: string
): Promise<number | null> {
  const plano = await carregarPlano(organizationId);
  const planLimit = plano.planLimits.find((l) => l.feature === feature);
  return planLimit?.limit ?? null;
}

export class LimiteDoPlanoError extends Error {}

export async function verificarLimiteImoveis(organizationId: string): Promise<void> {
  const limite = await getLimit(organizationId, FEATURE_PROPERTIES);
  if (limite === null) return;

  const total = await prisma.property.count({
    where: { organizationId, status: { in: [...STATUS_IMOVEL_ATIVO] } },
  });
  if (total >= limite) {
    throw new LimiteDoPlanoError(
      `Seu plano permite até ${limite} imóveis ativos. Encerre ou remova um imóvel, ou faça upgrade de plano, para cadastrar um novo.`
    );
  }
}

export async function verificarLimiteUsuarios(organizationId: string): Promise<void> {
  const limite = await getLimit(organizationId, FEATURE_USERS);
  if (limite === null) return;

  const total = await prisma.organizationMember.count({
    where: { organizationId, status: "ACTIVE" },
  });
  if (total >= limite) {
    throw new LimiteDoPlanoError(
      `Seu plano permite até ${limite} usuários ativos. Desative um usuário ou faça upgrade de plano para cadastrar um novo.`
    );
  }
}
