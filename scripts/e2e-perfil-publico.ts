import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: path.resolve(__dirname, "..", ".env.test"), override: true, quiet: true });

if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error("DATABASE_URL não aponta para um banco de teste — abortando.");
}

// =======================================================================
// Restauração do fixture de perfil público (E2E)
// =======================================================================
// POR QUE ISTO EXISTE — um problema real, observado:
//
// Os testes de perfil público ligam `publicProfileEnabled` pelo painel e
// desligam num `finally`, porque publicar é ESTADO GLOBAL do tenant. Num
// timeout de teste o `finally` até roda, mas ele dirige a INTERFACE — e
// nesse ponto a página já foi fechada pelo Playwright. A restauração
// falha, o perfil fica publicado, e os testes seguintes (que afirmam a
// ausência do card) quebram por contaminação, não por regressão.
// Aconteceu exatamente assim, e derrubou dois testes.
//
// A correção não é aumentar timeout nem enfraquecer asserção: é ter uma
// restauração que NÃO dependa do navegador. Isto aqui escreve direto no
// banco de teste, então funciona mesmo com o contexto do browser morto.
//
// Continua sendo o painel quem PUBLICA nos testes — o caminho real do
// produto é o que está sendo exercitado. Isto é só a rede de segurança
// da limpeza, usada quando a limpeza pela UI falha.
//
// Fase 29 — a ação `publicar` veio pelo mesmo raciocínio, do outro lado.
// A faceta "?corretor=" precisa de DOIS corretores publicados e um não
// publicado, em números absolutos, e publicar cada um pelo painel
// custaria um login e cinco navegações por teste. Aqui a publicação é
// fixture, não é o comportamento sob teste — quem prova que o painel
// publica é perfil-corretor.spec.ts, pela UI, como sempre foi.
//
// Uso:
//   npx tsx scripts/e2e-perfil-publico.ts despublicar [orgSlug]
//   npx tsx scripts/e2e-perfil-publico.ts publicar <membroId> [membroId...]
//   npx tsx scripts/e2e-perfil-publico.ts publicar-email <orgSlug> <email>
//
// `publicar-email` existe para a Organização A, cujo membro NÃO tem id
// fixo no seed: ele publica e IMPRIME o id do membro, que é o que a
// URL da faceta (?corretor=) precisa. Descobrir o id pela interface não
// serve aqui — o link do perfil só aparece depois de publicado, que é
// justamente o que se quer fazer.
//
// Sem orgSlug, despublica em TODAS as organizações do banco de teste —
// que é o comportamento certo para uma faxina: o fixture nasce com
// ninguém publicado (ver seed-e2e.ts e o teste "membro existente nasce
// NÃO publicado").
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const acao = process.argv[2];
  if (acao !== "despublicar" && acao !== "publicar" && acao !== "publicar-email") {
    throw new Error(
      `Ação desconhecida: ${acao ?? "(nenhuma)"} — use "despublicar", "publicar" ou "publicar-email".`
    );
  }

  if (acao === "publicar-email") {
    const [orgSlug, email] = process.argv.slice(3);
    if (!orgSlug || !email) throw new Error("publicar-email exige <orgSlug> <email>.");
    const membro = await prisma.organizationMember.findFirst({
      where: { organization: { slug: orgSlug }, user: { email } },
      select: { id: true },
    });
    if (!membro) throw new Error(`Nenhum membro para ${email} em ${orgSlug}.`);
    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { publicProfileEnabled: true },
    });
    console.log(membro.id);
    return;
  }

  if (acao === "publicar") {
    const ids = process.argv.slice(3);
    if (ids.length === 0) throw new Error("publicar exige ao menos um id de membro.");
    const { count } = await prisma.organizationMember.updateMany({
      where: { id: { in: ids } },
      data: { publicProfileEnabled: true },
    });
    if (count !== ids.length) {
      // Falhar alto: um id que não existe mais (seed reescrito, banco
      // recriado) produziria um teste verde por engano, afirmando
      // ausência de card onde deveria haver presença.
      throw new Error(`Esperava publicar ${ids.length} membro(s), publiquei ${count}.`);
    }
    console.log(String(count));
    return;
  }

  const orgSlug = process.argv[3];

  const where = orgSlug
    ? { publicProfileEnabled: true, organization: { slug: orgSlug } }
    : { publicProfileEnabled: true };

  const { count } = await prisma.organizationMember.updateMany({
    where,
    // Só o portão volta ao padrão. CRECI, bio, foto e WhatsApp ficam como
    // estão de propósito: despublicar nunca apagou dado no produto, e o
    // teste "os dados continuam salvos no painel" depende disso.
    data: { publicProfileEnabled: false },
  });

  console.log(String(count));
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
