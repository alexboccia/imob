import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { MemoriaInsuficienteParaE2E, tetoDeHeapMB } from "../src/test/heap-e2e";

// =======================================================================
// Preparo da suíte E2E local (hook `pretest:e2e` do npm)
// =======================================================================
// O caminho canônico da suíte é o MESMO do CI: servir o build em vez de
// compilar sob demanda. Para isso o build precisa existir e estar
// atualizado — e precisa ter sido feito com NODE_ENV=test, senão
// PUBLIC_ORG_SLUG entra errado nos rewrites e a home pública responde
// 404 (13 falhas fantasma, duas fases atrás; um diagnóstico inteiro, na
// seguinte).
//
// Isto roda como hook do npm, e não como um pipeline de bash à parte,
// porque o projeto já usa `pretest*` para exatamente este papel
// (prepare-test-db.ts em `pretest`/`pretest:integration`). Quem sobe e
// derruba o servidor continua sendo o `webServer` do Playwright — nada
// aqui gerencia processo, nem precisa de trap para encerrar em falha.
//
// Três caminhos, e só um deles builda:
//
//   CI            -> não faz nada. O workflow tem seu próprio passo de
//                    build (e pagá-lo duas vezes custaria ~46s por shard).
//   E2E_MODO=dev  -> não builda. É o modo exploratório, servido por
//                    `next dev`, para iterar em um spec.
//   local padrão  -> valida a máquina e builda com NODE_ENV=test.

function main(): void {
  if (process.env.CI) {
    console.log("CI: build feito pelo próprio workflow — nada a preparar aqui.");
    return;
  }

  if (process.env.E2E_MODO === "dev") {
    console.log(
      "Modo dev (exploratório): sem build, servido por `next dev`.\n" +
        "Para a suíte completa e reprodutível, use `npm run test:e2e`."
    );
    return;
  }

  // Falhar alto e cedo é melhor que vinte minutos de flake: se a máquina
  // não comporta uma configuração segura, a mensagem sai ANTES do build.
  try {
    const teto = tetoDeHeapMB({
      ramTotalMB: os.totalmem() / (1024 * 1024),
      ci: false,
      override: process.env.E2E_HEAP_MB,
    });
    console.log(`Servidor E2E: build de teste, heap de ${teto} MB.`);
  } catch (erro) {
    if (erro instanceof MemoriaInsuficienteParaE2E) {
      console.error(erro.message);
      process.exit(1);
    }
    throw erro;
  }

  const raiz = path.resolve(__dirname, "..");

  // O cache de dados do Next (unstable_cache) sobrevive entre builds em
  // .next/cache/fetch-cache, e o seed da suíte grava direto no banco —
  // sem passar pelas actions que invalidam as tags. Uma entrada de uma
  // rodada anterior serviria o dado VELHO (aconteceu na Fase 49: o logo
  // novo de uma organização do seed não aparecia). O CI parte de um
  // diretório limpo; aqui, limpa-se antes do build.
  fs.rmSync(path.join(raiz, ".next", "cache", "fetch-cache"), { recursive: true, force: true });

  const resultado = spawnSync("npm", ["run", "build"], {
    cwd: raiz,
    stdio: "inherit",
    // NODE_ENV=test é a razão de este passo existir. Não remover.
    env: { ...process.env, NODE_ENV: "test" },
  });

  if (resultado.status !== 0) {
    console.error("O build de teste falhou — a suíte E2E não vai rodar contra um build velho.");
    process.exit(resultado.status ?? 1);
  }
}

main();
