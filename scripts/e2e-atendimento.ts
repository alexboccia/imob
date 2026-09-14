import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: path.resolve(__dirname, "..", ".env.test"), override: true, quiet: true });

if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error("DATABASE_URL não aponta para um banco de teste — abortando.");
}

// =======================================================================
// Restauração do fixture da caixa de entrada (E2E)
// =======================================================================
// O spec que registra atendimento pela Central MUTA estado global do
// tenant: o contato sai da fila e não volta sozinho. Como os outros
// testes do mesmo arquivo afirmam números absolutos, a restauração
// precisa acontecer mesmo se o teste estourar — e por isso ela escreve
// direto no banco, sem depender de navegador vivo (mesmo raciocínio de
// scripts/e2e-perfil-publico.ts).
//
// A limpeza é CIRÚRGICA: apaga só os atendimentos marcados com a nota do
// próprio teste. O atendimento que faz parte do seed (a Carla, que
// nasce já atendida) precisa sobreviver, senão a fixture muda de
// significado.
//
// Uso:
//   npx tsx scripts/e2e-atendimento.ts limpar <marcador>
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [acao, marcador] = process.argv.slice(2);
  if (acao !== "limpar") throw new Error(`Ação desconhecida: ${acao ?? "(nenhuma)"}.`);
  if (!marcador) throw new Error("limpar exige o marcador da nota do teste.");

  const { count } = await prisma.interaction.deleteMany({
    where: { memberId: { not: null }, notes: marcador },
  });
  console.log(String(count));
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
