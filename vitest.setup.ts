import { config } from "dotenv";
import path from "node:path";

// Carrega .env.test ANTES de qualquer teste importar @/lib/prisma — o
// client Prisma lê process.env.DATABASE_URL uma única vez, na primeira
// importação (é um singleton no módulo). Se isso rodasse depois, os
// testes de integração acabariam conectando no banco de dev por engano.
config({ path: path.resolve(__dirname, ".env.test"), override: true });

if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error(
    "DATABASE_URL não aponta para um banco de teste (esperado um nome " +
      "terminado em _test) — abortando pra nunca rodar teste contra " +
      "dev/produção por engano. Verifique o .env.test."
  );
}
