// Cria o banco de teste (se não existir) e aplica as migrations nele.
// Roda sozinho antes de "npm run test"/"test:coverage"/"test:e2e" (ver
// scripts do package.json) — nunca precisa ser chamado manualmente, mas
// pode ser (idempotente).
import { config } from "dotenv";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "pg";

config({ path: path.resolve(__dirname, "..", ".env.test"), override: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL ausente em .env.test.");
}
if (!databaseUrl.includes("_test")) {
  throw new Error(
    "DATABASE_URL em .env.test não termina em \"_test\" — recusando continuar " +
      "pra nunca rodar isto contra um banco de dev/produção por engano."
  );
}

const url = new URL(databaseUrl);
const nomeBanco = url.pathname.replace(/^\//, "");

async function garantirBancoExiste() {
  // Conecta na base de manutenção "postgres" (sempre existe) com as
  // mesmas credenciais, só pra poder criar o banco de teste se faltar.
  const urlManutencao = new URL(databaseUrl!);
  urlManutencao.pathname = "/postgres";

  const client = new Client({ connectionString: urlManutencao.toString() });
  await client.connect();
  try {
    const resultado = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      nomeBanco,
    ]);
    if (resultado.rowCount === 0) {
      // Nome do banco não pode ser parametrizado em CREATE DATABASE — já
      // validamos acima que vem de .env.test (não é input de usuário) e
      // sempre termina em "_test", então não é uma superfície de SQL
      // injection real.
      await client.query(`CREATE DATABASE "${nomeBanco}"`);
      console.log(`Banco de teste "${nomeBanco}" criado.`);
    } else {
      console.log(`Banco de teste "${nomeBanco}" já existe.`);
    }
  } finally {
    await client.end();
  }
}

function aplicarMigrations() {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function main() {
  await garantirBancoExiste();
  aplicarMigrations();
}

main().catch((erro) => {
  console.error("Falha ao preparar o banco de teste:", erro);
  process.exitCode = 1;
});
