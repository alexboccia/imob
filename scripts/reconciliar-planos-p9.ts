// Reconciliação ÚNICA (Fase P.9) dos planos BASICO/PRO/PREMIUM — já
// existiam antes da P.9, com preço/módulos/limites antigos. A partir da
// P.9, prisma/seed.ts nunca mais sobrescreve um Plan/PlanModule/PlanLimit
// já existente (create-if-missing, protege edição feita no Platform
// Admin) — por isso esta correção pontual para os valores V1 aprovados
// vive AQUI, fora do seed idempotente, e não deve ser incorporada a ele.
//
// Idempotente (upsert real, valores fixos) — seguro rodar mais de uma
// vez, mas seu propósito é rodar UMA VEZ por ambiente (dev/test agora;
// produção só sob a mesma autorização controlada já usada para migrations
// de produção neste projeto — nunca automatizado).
import { config } from "dotenv";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PLANOS_CATALOGO, modulosHabilitadosDoPlano } from "../src/lib/plan-catalog";

config({ path: path.resolve(__dirname, "..", ".env"), override: false });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Fase 122-B (AUD-121-005) — valores vêm da MESMA fonte única usada por
// prisma/seed.ts (src/lib/plan-catalog.ts). Antes desta fase este
// arquivo tinha seu PRÓPRIO literal, que havia divergido do seed.ts (o
// PRO daqui nunca ganhou "custom-domain" quando a Fase P.10 o acrescentou
// ao seed) — rodar este script depois do seed.ts desabilitaria domínio
// próprio do PRO em silêncio. Nunca mais pode acontecer: os dois agora
// leem exatamente a mesma lista. STARTER fica de fora da reconciliação
// de propósito (sempre nasce correto na criação, nunca precisou de
// correção pontual).
const RECONCILIACAO = PLANOS_CATALOGO.filter((p) => p.code !== "STARTER").map((p) => ({
  code: p.code,
  priceMonthlyCents: p.priceMonthlyCents,
  modulosHabilitados: modulosHabilitadosDoPlano(p),
  limites: p.limites,
}));

async function main() {
  const todosModulos = await prisma.module.findMany({ select: { id: true, code: true } });

  for (const config of RECONCILIACAO) {
    const plano = await prisma.plan.findUniqueOrThrow({ where: { code: config.code } });

    await prisma.plan.update({
      where: { id: plano.id },
      data: { priceMonthlyCents: config.priceMonthlyCents },
    });

    const habilitados = config.modulosHabilitados ?? todosModulos.map((m) => m.code);
    for (const modulo of todosModulos) {
      await prisma.planModule.upsert({
        where: { planId_moduleId: { planId: plano.id, moduleId: modulo.id } },
        update: { enabled: habilitados.includes(modulo.code) },
        create: { planId: plano.id, moduleId: modulo.id, enabled: habilitados.includes(modulo.code) },
      });
    }

    for (const [feature, limit] of Object.entries(config.limites)) {
      await prisma.planLimit.upsert({
        where: { planId_feature: { planId: plano.id, feature } },
        update: { limit },
        create: { planId: plano.id, feature, limit },
      });
    }

    console.log(`Plano ${config.code} reconciliado para os valores V1 aprovados (P.9).`);
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
