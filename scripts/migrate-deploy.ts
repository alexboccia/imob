// Wrapper de release pra aplicar migrations Prisma em produção com
// segurança — pensado pra rodar como o comando de um Job component
// "Pre-Deploy" na DigitalOcean App Platform (ver
// docs/operations/deployment-runbook.md, seção 3), antes da nova versão
// da aplicação começar a servir tráfego. Também serve pro passo manual
// documentado no mesmo runbook, quando/se a automação da DO ainda não
// estiver configurada.
//
//   npx tsx scripts/migrate-deploy.ts
//
// Por que este wrapper em vez de chamar `npx prisma migrate deploy`
// direto no Run/Build Command da DO:
//   - garante que É SEMPRE `migrate deploy` (nunca `migrate dev`, nunca
//     `db push`, nunca `migrate reset`) — comando fixo no código, não um
//     texto livre editável só no painel da DO;
//   - nunca engole o código de saída: se a migration falhar, o processo
//     sai != 0 e propaga pro Job/step que chamou (sem `|| true` em
//     lugar nenhum) — é isso que faz uma migration com erro BLOQUEAR o
//     release em vez de deixar a versão nova subir contra um schema
//     incompatível (a causa raiz dos dois incidentes documentados no
//     runbook);
//   - nunca imprime DATABASE_URL nem qualquer outra credencial — só
//     repassa a variável de ambiente já presente pro processo filho
//     (nunca interpolada em uma string de log).
//
// Concorrência (múltiplas instâncias/rolling deploy): `prisma migrate
// deploy` grava um advisory lock no Postgres (tabela `_prisma_migrations`)
// antes de aplicar qualquer migration pendente — duas execuções
// concorrentes contra o MESMO banco nunca aplicam a mesma migration em
// duplicado (a segunda espera ou falha ao tentar adquirir o lock,
// dependendo da versão do Postgres/Prisma). Ainda assim, a garantia
// arquitetural real deste projeto é rodar isto uma única vez por deploy,
// num Job component dedicado que roda ANTES de qualquer instância nova
// do serviço web subir — não dentro do Run Command do serviço web em si
// (que rodaria de novo a cada restart/scale-out, sem necessidade).
import { execFileSync } from "node:child_process";

function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "[migrate-deploy] DATABASE_URL ausente no ambiente — recusando continuar."
    );
    process.exitCode = 1;
    return;
  }

  console.log("[migrate-deploy] Aplicando migrations pendentes (prisma migrate deploy)...");
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    // O erro de verdade (SQL, conexão, etc.) já foi impresso por
    // `prisma migrate deploy` via stdio: "inherit" acima — não
    // duplicamos a mensagem, só garantimos que o processo sai != 0.
    console.error("[migrate-deploy] Falha ao aplicar migrations — release deve ser bloqueado.");
    process.exitCode = 1;
    return;
  }

  console.log("[migrate-deploy] Migrations aplicadas (ou já estava tudo em dia). Release pode prosseguir.");
}

main();
