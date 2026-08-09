// Bootstrap do primeiro PlatformOperator (SUPER_ADMIN) — não faz parte do
// seed principal (prisma/seed.ts) de propósito: é um bootstrap único de
// identidade de plataforma, uma preocupação completamente separada dos
// catálogos/dados de tenant que o seed principal povoa. Rodar manualmente:
//   SEED_PLATFORM_ADMIN_EMAIL=voce@easymob.com SEED_PLATFORM_ADMIN_SENHA=... \
//     npx tsx scripts/seed-platform-operator.ts
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// dotenv não sobrescreve variáveis já definidas no ambiente por padrão —
// em produção (DigitalOcean), DATABASE_URL já vem injetada no processo e
// este load vira no-op; localmente, carrega de .env (rodando via
// `npx tsx`, sem passar pela CLI do Prisma, que faz esse load sozinha).
config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_PLATFORM_ADMIN_EMAIL;
  const senha = process.env.SEED_PLATFORM_ADMIN_SENHA;

  if (!email || !senha) {
    throw new Error(
      "Defina SEED_PLATFORM_ADMIN_EMAIL e SEED_PLATFORM_ADMIN_SENHA antes de rodar este script."
    );
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const operador = await prisma.platformOperator.upsert({
    where: { email },
    update: {},
    create: {
      name: "Super Admin",
      email,
      passwordHash: senhaHash,
      role: "SUPER_ADMIN",
    },
  });

  console.log(`PlatformOperator pronto: ${operador.email} (role: ${operador.role})`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
