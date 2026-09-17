// Reancora, no "agora" do TESTE, as duas visitas que tests/e2e/fuso-organizacao
// usa para provar o calendário no fuso da organização (Fase 18):
//
//   "Fuso Fim Do Dia"        hoje   23:30 em São Paulo
//   "Fuso Comeco De Amanha"  amanhã 00:15 em São Paulo
//
// O seed cria as duas com o "hoje" do momento em que ELE roda — minutos
// antes da spec. Se a meia-noite de São Paulo cai nesse intervalo (CI às
// 03:00 UTC), "hoje" já é outro dia quando a tela é aberta, e a spec
// falha sem que o produto tenha mudado. Chamado no beforeAll da spec, o
// intervalo cai para segundos.
//
// Processo separado (como o seed no global-setup), para o Prisma não
// entrar no processo do Playwright.
import { config } from "dotenv";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { componentesNoFuso, instanteDeComponentes } from "../src/lib/fuso-horario";

config({ path: path.resolve(__dirname, "..", ".env.test"), override: true });

if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error("DATABASE_URL não aponta para um banco de teste (_test) — abortando.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Mesmo fuso e mesma conta do seed (prisma/seed-e2e.ts, Organização F).
const FUSO = "America/Sao_Paulo";
const horarioLocal = (agora: Date, dias: number, hora: number, minuto: number) => {
  const c = componentesNoFuso(agora, FUSO);
  return instanteDeComponentes({ ano: c.ano, mes: c.mes, dia: c.dia + dias, hora, minuto }, FUSO);
};

async function main() {
  const organizacao = await prisma.organization.findUniqueOrThrow({
    where: { slug: "e2e-org-fuso" },
    select: { id: true },
  });
  const agora = new Date();
  const visitas: [string, Date][] = [
    ["Fuso Fim Do Dia", horarioLocal(agora, 0, 23, 30)],
    ["Fuso Comeco De Amanha", horarioLocal(agora, 1, 0, 15)],
  ];
  for (const [nome, quando] of visitas) {
    const { count } = await prisma.scheduledActivity.updateMany({
      where: {
        organizationId: organizacao.id,
        type: "VISIT",
        status: "SCHEDULED",
        person: { organizationId: organizacao.id, name: nome },
      },
      data: { scheduledAt: quando },
    });
    if (count !== 1) throw new Error(`Esperava 1 visita de "${nome}", encontrei ${count}.`);
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
