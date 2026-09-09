// Wrapper de release, versionado, para aplicar migrations Prisma em
// produção com segurança. Roda `prisma migrate deploy` — e só isso:
// nunca `prisma migrate dev`, nunca `prisma db push`, nunca
// `prisma migrate reset`, que não têm lugar nenhum neste fluxo.
//
//   npx tsx scripts/migrate-deploy.ts
//
// QUEM CHAMA ISTO, NO FLUXO NORMAL: o Job de pre-deploy da DigitalOcean
// App Platform, antes de a versão nova da aplicação começar a servir
// tráfego. Deploy com migration nova não tem passo humano.
//
// Nota de evidência, para este comentário não afirmar mais do que se
// sabe: ESTE ARQUIVO é versionado; a configuração do Job (nome, tipo,
// run command) vive no painel da DigitalOcean e não está no
// repositório. O que sustenta a frase acima é observação operacional —
// ver docs/operations/deployment-runbook.md, seções 3.2 e 3.2.1, que é
// a fonte operacional atual sobre migrations em produção.
//
// EXECUÇÃO MANUAL É EXCEÇÃO: só faz sentido para recuperação ou
// diagnóstico, diante de falha comprovada do pre-deploy ou de drift de
// schema (runbook, seção 3.3). Rodar "por garantia" depois de todo
// deploy é contraproducente — sendo idempotente, isso torna
// indistinguível "o pipeline aplicou" de "o pipeline falhou e alguém
// encobriu".
//
// Por que este wrapper em vez de chamar `npx prisma migrate deploy`
// direto no Run/Build Command da DO:
//   - garante que É SEMPRE `migrate deploy` (nunca `migrate dev`, nunca
//     `db push`, nunca `migrate reset`) — comando fixo no código, não um
//     texto livre editável só no painel da DO;
//   - nunca engole o código de saída: se a migration falhar, o processo
//     sai != 0 e propaga pro Job/step que chamou (sem `|| true` em
//     lugar nenhum). É o que a plataforma precisa para tratar a
//     migration com erro como deployment falho, em vez de deixar a
//     versão nova subir contra um schema incompatível (a causa raiz dos
//     dois incidentes documentados no runbook). A DigitalOcean documenta
//     que um Job PRE_DEPLOY com saída != 0 bloqueia o release; isso
//     ainda não foi observado neste projeto — ver runbook, 3.3.1;
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
