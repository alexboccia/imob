// Checagem informativa (nunca bloqueia o CI) — olha só a migration MAIS
// RECENTE em prisma/migrations/ e avisa se ela contém uma operação
// potencialmente destrutiva (DROP, RENAME, ALTER COLUMN ... TYPE, SET NOT
// NULL sem DEFAULT). Mesma lista de padrões já documentada manualmente em
// docs/operations/rollback-runbook.md, seção 2 — isto só torna visível no
// CI o que antes só era lembrado se alguém abrisse aquele runbook.
//
// Deliberadamente não-bloqueante: uma migration destrutiva pode ser
// perfeitamente legítima (ex: a própria migration real deste projeto que
// renomeou o schema inteiro pra inglês) — a decisão de prosseguir é do
// autor da mudança, não deste script. Ele só garante que ninguém precisa
// lembrar de olhar manualmente.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PADROES_DESTRUTIVOS: { regex: RegExp; rotulo: string }[] = [
  { regex: /\bDROP\s+(TABLE|COLUMN)\b/i, rotulo: "DROP TABLE/COLUMN" },
  { regex: /\bRENAME\s+(TO|COLUMN)\b/i, rotulo: "RENAME" },
  { regex: /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, rotulo: "ALTER COLUMN ... TYPE" },
  { regex: /\bSET\s+NOT\s+NULL\b/i, rotulo: "SET NOT NULL" },
];

function main() {
  const migrationsDir = join(__dirname, "..", "prisma", "migrations");
  const pastas = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const ultima = pastas.at(-1);
  if (!ultima) {
    console.log("[check-latest-migration] Nenhuma migration encontrada — nada a checar.");
    return;
  }

  const sqlPath = join(migrationsDir, ultima, "migration.sql");
  let sql: string;
  try {
    sql = readFileSync(sqlPath, "utf-8");
  } catch {
    console.log(`[check-latest-migration] ${ultima} não tem migration.sql legível — pulando.`);
    return;
  }

  const encontrados = PADROES_DESTRUTIVOS.filter((p) => p.regex.test(sql)).map((p) => p.rotulo);
  if (encontrados.length === 0) {
    console.log(`[check-latest-migration] ${ultima}: só operações aditivas detectadas.`);
    return;
  }

  const mensagem =
    `Migration mais recente (${ultima}) contém operação(ões) potencialmente destrutiva(s): ` +
    `${encontrados.join(", ")}. Revisar docs/operations/rollback-runbook.md (seção 2) antes ` +
    `de mergear — pode exigir dois deploys (expand/contract) ou migration de compatibilidade.`;

  // Anotação do GitHub Actions — aparece destacada no resumo do run, sem
  // falhar o job (ver comentário do topo: decisão fica com quem revisa).
  console.log(`::warning::${mensagem}`);
}

main();
