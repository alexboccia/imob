// Execução manual do diagnóstico aprofundado (mesma lógica de
// /api/admin/diagnostics), sem precisar de sessão/HTTP — pra rodar direto
// do terminal (local, ou via `doctl` num shell da própria DigitalOcean).
//
//   npx tsx scripts/health-check-deep.ts
//
// Carrega .env (não .env.test) por padrão — para apontar num ambiente
// diferente, exporte DATABASE_URL/R2_*/RESEND_* antes de rodar.
import { config } from "dotenv";
config();

// Import dinâmico de propósito: "../src/lib/health" importa
// "@/lib/prisma", que lê DATABASE_URL uma única vez, no momento em que o
// módulo é avaliado — um import estático no topo do arquivo seria
// hoisted e rodaria ANTES do config() acima (mesma pegadinha documentada
// em src/lib/prisma.ts e em vitest.setup.ts), conectando com
// DATABASE_URL ainda undefined.
async function main() {
  const { verificarSaudeCompleta } = await import("../src/lib/health");
  const resultado = await verificarSaudeCompleta();
  console.log(JSON.stringify(resultado, null, 2));
  process.exitCode = resultado.saudavel ? 0 : 1;
}

main();
