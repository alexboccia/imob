// Bootstrap one-time (Fase P.9) do Plan STARTER — separado de
// `prisma/seed.ts` de propósito: o seed geral também cria/garante
// Organization/User/OrganizationMember (com fallback de senha default),
// o que a auditoria pré-seed da P.9 classificou como inseguro pra rodar
// em produção sem confirmar variáveis de ambiente que este script não
// tem como verificar. Este bootstrap toca SOMENTE Plan/PlanLimit/
// PlanModule do STARTER — nenhum outro model.
//
// Sempre create-if-missing: nunca faz `update` de uma linha já existente,
// nem do Plan nem de um PlanLimit/PlanModule individual — preserva
// qualquer configuração já editada via Platform Admin. Seguro pra rerun,
// inclusive concorrente (retry em caso de conflito de unique constraint).
// Não deve ser usado depois pra reconciliar customizações futuras — isso
// é escopo do Platform Admin (/platform/plans/[id]/editar), não deste
// script.
//
// Uso:
//   npx tsx scripts/bootstrap-starter-p9.ts             # aplica
//   npx tsx scripts/bootstrap-starter-p9.ts --dry-run    # só reporta, zero write
import { config } from "dotenv";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

const STARTER = {
  code: "STARTER",
  name: "Starter",
  priceMonthlyCents: 0,
  isTrial: true,
  trialDays: 14,
  modulosHabilitados: ["core", "properties", "crm"],
  limites: { PROPERTIES: 10, USERS: 1, PHOTOS_PER_PROPERTY: 5, CRM_CLIENTS: 100 } as Record<
    string,
    number | null
  >,
} as const;

const MODULOS_OBRIGATORIOS = ["core", "properties", "crm"];
const MAX_TENTATIVAS = 3;

function isUniqueViolation(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
}

// Pura, exportada só pra ser testável sem precisar manipular o catálogo
// real e compartilhado de Module no banco de teste (nunca apagamos
// Module ali — é global, outros testes dependem dele existir).
export function modulosObrigatoriosFaltando(todosModulos: { code: string }[]): string[] {
  return MODULOS_OBRIGATORIOS.filter((code) => !todosModulos.some((m) => m.code === code));
}

// Uma única transação: Plan + todos os PlanLimit + todos os PlanModule
// do STARTER, ou nada. Nunca deixa um STARTER parcialmente configurado.
export async function bootstrapStarter(
  prisma: PrismaClient,
  options: { dryRun?: boolean } = {}
): Promise<void> {
  const dryRun = options.dryRun ?? false;

  await prisma.$transaction(async (tx) => {
    const todosModulos = await tx.module.findMany({ select: { id: true, code: true } });
    const faltando = modulosObrigatoriosFaltando(todosModulos);
    if (faltando.length > 0) {
      throw new Error(
        `Módulo(s) obrigatório(s) ausente(s) do catálogo: ${faltando.join(", ")}. Abortando.`
      );
    }

    const planoExistente = await tx.plan.findUnique({ where: { code: STARTER.code } });

    if (!planoExistente) {
      if (dryRun) {
        console.log("[dry-run] STARTER seria criado.");
        for (const feature of Object.keys(STARTER.limites)) {
          console.log(`[dry-run] PlanLimit ${feature} seria criado.`);
        }
        for (const modulo of todosModulos) {
          const enabled = (STARTER.modulosHabilitados as readonly string[]).includes(modulo.code);
          console.log(`[dry-run] PlanModule ${modulo.code} seria criado (enabled=${enabled}).`);
        }
        return;
      }

      const plano = await tx.plan.create({
        data: {
          code: STARTER.code,
          name: STARTER.name,
          priceMonthlyCents: STARTER.priceMonthlyCents,
          isTrial: STARTER.isTrial,
          trialDays: STARTER.trialDays,
        },
      });
      console.log("STARTER criado.");

      for (const [feature, limit] of Object.entries(STARTER.limites)) {
        await tx.planLimit.create({ data: { planId: plano.id, feature, limit } });
        console.log(`PlanLimit ${feature} criado.`);
      }

      for (const modulo of todosModulos) {
        const enabled = (STARTER.modulosHabilitados as readonly string[]).includes(modulo.code);
        await tx.planModule.create({ data: { planId: plano.id, moduleId: modulo.id, enabled } });
        console.log(`PlanModule ${modulo.code} criado.`);
      }
      return;
    }

    console.log("STARTER já existe; preservando configuração.");

    for (const feature of Object.keys(STARTER.limites)) {
      const existente = await tx.planLimit.findUnique({
        where: { planId_feature: { planId: planoExistente.id, feature } },
      });
      if (existente) continue;
      if (dryRun) {
        console.log(`[dry-run] PlanLimit ${feature} seria criado.`);
        continue;
      }
      await tx.planLimit.create({
        data: { planId: planoExistente.id, feature, limit: STARTER.limites[feature] },
      });
      console.log(`PlanLimit ${feature} criado.`);
    }

    for (const modulo of todosModulos) {
      const existente = await tx.planModule.findUnique({
        where: { planId_moduleId: { planId: planoExistente.id, moduleId: modulo.id } },
      });
      if (existente) continue;
      const enabled = (STARTER.modulosHabilitados as readonly string[]).includes(modulo.code);
      if (dryRun) {
        console.log(`[dry-run] PlanModule ${modulo.code} seria criado (enabled=${enabled}).`);
        continue;
      }
      await tx.planModule.create({ data: { planId: planoExistente.id, moduleId: modulo.id, enabled } });
      console.log(`PlanModule ${modulo.code} criado.`);
    }
  });
}

// Retry só em conflito de unique constraint (duas execuções concorrentes
// disputando o mesmo `create`) — qualquer outro erro (ex.: módulo
// obrigatório ausente) propaga e aborta imediatamente, sem retry.
export async function bootstrapStarterComRetry(
  prisma: PrismaClient,
  options: { dryRun?: boolean } = {}
): Promise<void> {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      await bootstrapStarter(prisma, options);
      return;
    } catch (erro) {
      if (isUniqueViolation(erro) && tentativa < MAX_TENTATIVAS) {
        console.log(`Conflito de concorrência detectado (tentativa ${tentativa}/${MAX_TENTATIVAS}), tentando novamente...`);
        continue;
      }
      throw erro;
    }
  }
}

if (require.main === module) {
  config({ path: path.resolve(__dirname, "..", ".env"), override: false });

  const dryRun = process.argv.includes("--dry-run");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  bootstrapStarterComRetry(prisma, { dryRun })
    .then(() => {
      console.log(dryRun ? "Dry-run concluído." : "Bootstrap STARTER concluído.");
    })
    .catch((erro) => {
      console.error(erro);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
