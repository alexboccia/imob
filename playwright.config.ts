import path from "node:path";
import { config as carregarEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Carregado aqui (não só no global-setup) porque os testes em si também
// leem SEED_ADMIN_EMAIL/SEED_ADMIN_SENHA/ORG_SLUG do process.env — workers
// do Playwright herdam o env deste processo principal.
carregarEnv({ path: path.resolve(__dirname, ".env.test"), override: true });

const PORTA = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Specs compartilham o mesmo servidor Next e o mesmo banco de teste
  // (organizações E2E A/B com ids fixos) — rodar em série evita qualquer
  // acoplamento acidental por ordem de execução mascarar uma dependência
  // real entre specs.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // HTML sempre gerado (não só em CI) — é o que o workflow anexa como
  // artefato quando um spec falha (ver .github/workflows/ci.yml).
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npx next dev -p ${PORTA}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      // Causa raiz de um flake real e reproduzido: ao longo da suíte
      // inteira (~300 testes num único servidor), o `next dev` chegava ao
      // limite de heap e se REINICIAVA sozinho — "Server is approaching
      // the used memory threshold, restarting..." aparece no log do
      // WebServer. Toda navegação em voo durante esse reinício morria com
      // ERR_CONNECTION_REFUSED, derrubando um teste arbitrário (foram
      // observados três diferentes, em specs diferentes, sempre com essa
      // mesma mensagem logo antes).
      //
      // Isto NÃO é aumento de timeout nem de retries mascarando um
      // problema: é remover o teto de memória que provoca o reinício. O
      // padrão do Node numa máquina de 16 GB fica em torno de 2 GB, e o
      // Turbopack em modo dev, compilando dezenas de rotas ao longo da
      // suíte, passa disso com folga.
      NODE_OPTIONS: "--max-old-space-size=6144",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
