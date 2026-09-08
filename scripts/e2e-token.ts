import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// quiet: o banner do dotenv iria para o STDOUT junto com o token, e
// quem chama lê o stdout inteiro como se fosse o segredo.
config({ path: path.resolve(__dirname, "..", ".env.test"), override: true, quiet: true });

// Mesma trava do seed de E2E: se isto apontar para um banco que não é de
// teste, aborta. Reescrever hash de token num banco real seria invalidar
// convites e recuperações de pessoas de verdade.
if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error(
    "DATABASE_URL não aponta para um banco de teste — abortando."
  );
}

// =======================================================================
// Costura de teste para os segredos de acesso (Fase 25)
// =======================================================================
// PROBLEMA: o token bruto existe em exatamente dois lugares — na memória
// da action que o gerou e no e-mail enviado. O banco guarda só o sha256,
// que é irreversível de propósito. No E2E não há e-mail (RESEND_API_KEY
// não existe em teste), então o Playwright não teria como abrir o link.
//
// SOLUÇÃO: este script não fabrica um fluxo falso — o convite ou o
// pedido de recuperação são criados pelo PRODUTO, pela tela real. Aqui
// apenas se REESCREVE o hash da linha recém-criada para o hash de um
// token que o teste conhece. O que se testa depois disso é o consumo
// real: validação, expiração, uso único, replay, atomicidade.
//
// A correspondência "o token do e-mail é o preimage do hash gravado" é
// provada nos testes de integração, que capturam o link pelo mock de
// e-mail — este script não precisa provar isso de novo.
//
// Vive em scripts/ e nunca é importado pela aplicação: não existe rota,
// action ou flag de produção que faça isto. É uma ferramenta de banco,
// como o próprio seed.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  const [tipo, email, modo] = process.argv.slice(2);
  if (!tipo || !email) {
    throw new Error("uso: tsx scripts/e2e-token.ts <convite|reset> <email> [expirado]");
  }

  const usuario = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!usuario) throw new Error(`nenhum usuário com e-mail ${email}`);

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  // "expirado" ajusta a validade para o passado, para que o E2E possa
  // exercitar o estado de link vencido sem esperar 60 minutos.
  const expiresAt = modo === "expirado" ? new Date(Date.now() - 60_000) : undefined;

  if (tipo === "reset") {
    const alvo = await prisma.passwordResetToken.findFirst({
      where: { userId: usuario.id, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!alvo) throw new Error("nenhum pedido de recuperação pendente");
    await prisma.passwordResetToken.update({
      where: { id: alvo.id },
      data: { tokenHash, ...(expiresAt ? { expiresAt } : {}) },
    });
  } else if (tipo === "convite") {
    const alvo = await prisma.inviteToken.findFirst({
      where: { userId: usuario.id, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!alvo) throw new Error("nenhum convite pendente");
    await prisma.inviteToken.update({
      where: { id: alvo.id },
      data: { tokenHash, ...(expiresAt ? { expiresAt } : {}) },
    });
  } else {
    throw new Error(`tipo desconhecido: ${tipo}`);
  }

  // Única saída no stdout: o token bruto, para o spec capturar.
  process.stdout.write(token);
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
