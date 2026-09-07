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
  // TETO DURO DA SUÍTE NO CI (Fase 11). Não é aumento de timeout nem
  // máscara de falha — é o contrário: sem ele, um travamento no runner
  // não vira falha, vira um job pendurado. Aconteceu de verdade nesta
  // fase (job E2E preso por mais de 1h30 num commit cuja suíte roda em
  // 7,3 min localmente e passa 348/348), e como o token de CI recebe 403
  // ao cancelar, a única saída era um push corretivo.
  //
  // 15 minutos é exatamente o orçamento disponível: a regra operacional é
  // o RUN inteiro em até 18 min, e o preparo do job (checkout, npm ci,
  // browser, banco, seed) consome ~1,5 min antes do primeiro teste.
  // Estourar isso passa a ser uma falha rápida e diagnosticável, com
  // relatório do Playwright anexado, em vez de um runner ocupado por
  // horas. Local fica sem teto: lá a regra de 18 min é cronometrada à mão
  // e um teto rígido só atrapalharia a depuração.
  //
  // 16 min (era 15): o número foi recalibrado contra medição, não
  // afrouxado para esconder falha. O run 34070254274 mostrou o job E2E
  // levando ~1,4 min de preparo (checkout, npm ci, browser, banco, seed)
  // e começando ~3s depois do run — então a suíte pode rodar até ~16 min
  // e o RUN INTEIRO ainda fecha abaixo dos 18 min exigidos. Com 15 min o
  // teto estava mais apertado que o orçamento real e cortava testes que
  // teriam passado.
  globalTimeout: process.env.CI ? 16 * 60 * 1000 : undefined,
  // HTML sempre gerado (não só em CI) — é o que o workflow anexa como
  // artefato quando um spec falha (ver .github/workflows/ci.yml).
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    // CI serve o BUILD (next start); local segue em dev.
    // Ver o comentário do step "Build de produção" em
    // .github/workflows/ci.yml: o reinício por memória vinha do
    // compilador do modo dev, que `next start` simplesmente não carrega.
    command: process.env.CI ? `npx next start -p ${PORTA}` : `npx next dev -p ${PORTA}`,
    // Readiness apontada para /api/health, não para `/`: a raiz é o site
    // público, resolvido por HOST em ambiente multi-tenant, e em
    // `next start` responde 404 para `localhost` — o polling do
    // Playwright só aceita 2xx/3xx e ficava esperando até estourar.
    // /api/health existe exatamente para dizer "de pé", responde nos dois
    // modos e não depende de organização nenhuma.
    url: `${baseURL}/api/health`,
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
      // O teto precisa caber na MÁQUINA, não só no problema. O runner do
      // GitHub Actions tem ~7 GB de RAM TOTAL e divide isso entre o
      // servidor Next, o Chromium do Playwright e o Postgres do job —
      // autorizar 6 GB só de heap ali empurra tudo para swap e o servidor
      // fica lentíssimo em vez de reiniciar, degradando a suíte inteira.
      // Na máquina local (16 GB+) o teto generoso é o que resolve o
      // reinício por memória descrito acima.
      //
      // Os dois valores continuam bem ACIMA do padrão do Node (~2 GB),
      // que era a causa original dos reinícios — o objetivo nunca foi o
      // número máximo, e sim não esbarrar no teto no meio da suíte.
      // CI: 3072 preservado. Com `next start` sobra memória de folga —
      // o teto continua ali como rede de segurança, não como remédio.
      // LOCAL: 6144 preservado, porque lá o servidor ainda é o dev e é
      // exatamente esse teto que evita o reinício descrito acima.
      NODE_OPTIONS: process.env.CI
        ? "--max-old-space-size=3072"
        : "--max-old-space-size=6144",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
