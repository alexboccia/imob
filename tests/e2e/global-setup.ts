import path from "node:path";
import { execFileSync } from "node:child_process";

// Roda antes de qualquer spec e antes do webServer do Playwright: garante
// que o banco de teste existe/está migrado e recria o seed determinístico
// de E2E (organizações A/B, usuários, imóveis com ids fixos — ver
// prisma/seed-e2e.ts). Ambos os scripts são idempotentes.
export default function globalSetup(): void {
  const raiz = path.resolve(__dirname, "..", "..");
  execFileSync("npx", ["tsx", "scripts/prepare-test-db.ts"], { stdio: "inherit", cwd: raiz });
  execFileSync("npx", ["tsx", "prisma/seed-e2e.ts"], { stdio: "inherit", cwd: raiz });
}
