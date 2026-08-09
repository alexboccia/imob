// Reseta a senha de um PlatformOperator JÁ EXISTENTE — não cria conta nova
// (isso é scripts/seed-platform-operator.ts, que de propósito NÃO atualiza
// senha de e-mail já cadastrado, pra não sobrescrever sem querer numa
// re-execução do bootstrap). Uso manual, mesmas convenções de segurança:
//   PLATFORM_OPERATOR_EMAIL=voce@easymob.com PLATFORM_OPERATOR_NOVA_SENHA=... \
//     npx tsx scripts/reset-platform-operator-password.ts
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.PLATFORM_OPERATOR_EMAIL;
  const novaSenha = process.env.PLATFORM_OPERATOR_NOVA_SENHA;

  if (!email || !novaSenha) {
    throw new Error(
      "Defina PLATFORM_OPERATOR_EMAIL e PLATFORM_OPERATOR_NOVA_SENHA antes de rodar este script."
    );
  }

  const existente = await prisma.platformOperator.findUnique({ where: { email } });
  if (!existente) {
    throw new Error(
      `Nenhum PlatformOperator com o e-mail ${email}. Este script só reseta senha de conta já existente — use seed-platform-operator.ts para criar uma nova.`
    );
  }

  const senhaHash = await bcrypt.hash(novaSenha, 10);

  const operador = await prisma.platformOperator.update({
    where: { email },
    data: { passwordHash: senhaHash },
  });

  console.log(`Senha atualizada: ${operador.email} (role: ${operador.role})`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
