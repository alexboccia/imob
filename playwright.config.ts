import os from "node:os";
import path from "node:path";
import { config as carregarEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { nodeOptionsDeHeap, tetoDeHeapMB } from "./src/test/heap-e2e";

// Carregado aqui (não só no global-setup) porque os testes em si também
// leem SEED_ADMIN_EMAIL/SEED_ADMIN_SENHA/ORG_SLUG do process.env — workers
// do Playwright herdam o env deste processo principal.
carregarEnv({ path: path.resolve(__dirname, ".env.test"), override: true });

const PORTA = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://localhost:${PORTA}`;

// MODO DEV — exploratório, opt-in explícito (E2E_MODO=dev, via
// `npm run test:e2e:dev`). Serve para iterar em UM spec sem esperar
// build: o Next compila sob demanda e o feedback é imediato.
//
// Ele NÃO é o modo da suíte completa, e isto não é preferência: o
// compilador do modo dev cresce ao longo de centenas de testes até o
// Next se reiniciar sozinho, matando as navegações em voo. Aconteceu no
// CI (Fase 12) e voltou a acontecer na máquina local — 3 reinícios, 12
// testes derrubados em specs sem relação, 6 min virando 23. O caminho
// canônico serve o BUILD, como o CI, e não tem compilador para crescer.
const modoDev = !process.env.CI && process.env.E2E_MODO === "dev";

// Teto aplicado SÓ ao processo do servidor Next (webServer.env abaixo),
// calculado a partir da RAM da máquina — ver src/test/heap-e2e.ts, que
// traz a medição por trás de cada constante. O CI continua com o valor
// de sempre. E2E_HEAP_MB força um valor em máquina incomum.
const tetoHeapMB = tetoDeHeapMB({
  ramTotalMB: os.totalmem() / (1024 * 1024),
  ci: Boolean(process.env.CI),
  override: process.env.E2E_HEAP_MB,
});

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
    // O caminho canônico (local e CI) serve o BUILD. Só o modo dev
    // explícito sobe o compilador — ver o comentário de `modoDev` acima.
    //
    // NODE_ENV=test no BUILD não é detalhe: é o que faz o Next carregar
    // .env.test, e PUBLIC_ORG_SLUG é lido em build time pelos rewrites
    // de next.config.ts (`/` -> `/{slug}`). Um build feito com o env
    // errado serve 404 na home e derruba site-publico.spec.ts inteiro —
    // aconteceu duas vezes, custou 13 falhas fantasma numa fase e um
    // diagnóstico inteiro em outra. Localmente quem garante isso é o
    // hook `pretest:e2e` (scripts/e2e-preparar.ts), que builda com o env
    // certo imediatamente antes da suíte; no CI, o passo de build do
    // workflow.
    command: modoDev ? `npx next dev -p ${PORTA}` : `npx next start -p ${PORTA}`,
    // Readiness apontada para /api/health, não para `/`: a raiz é o site
    // público, resolvido por HOST em ambiente multi-tenant, e em
    // `next start` responde 404 para `localhost` — o polling do
    // Playwright só aceita 2xx/3xx e ficava esperando até estourar.
    // /api/health existe exatamente para dizer "de pé", responde nos dois
    // modos e não depende de organização nenhuma.
    url: `${baseURL}/api/health`,
    // Reaproveitar um servidor já de pé só faz sentido no modo dev, onde
    // ele recompila sozinho a cada mudança. No caminho canônico isso é
    // uma ARMADILHA: um `next start` esquecido na porta 3100 serve o
    // build ANTERIOR, e a suíte reprova código que está correto (ou
    // aprova código que está quebrado). Com `false`, a porta ocupada
    // vira erro imediato em vez de um resultado mentiroso.
    reuseExistingServer: modoDev,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      // Teto de heap do SERVIDOR, e de mais nada — Playwright e browser
      // não herdam isto. O número vem de medição, não de chute: ver
      // src/test/heap-e2e.ts.
      NODE_OPTIONS: nodeOptionsDeHeap(tetoHeapMB),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
