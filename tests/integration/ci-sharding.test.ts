import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// =======================================================================
// Invariantes do sharding do E2E no CI
// =======================================================================
// Não é teste de YAML por snapshot: são as três formas conhecidas de esta
// configuração falhar EM SILÊNCIO, cada uma capaz de reduzir a cobertura
// sem deixar o CI vermelho.
//
//   1. matriz e comando fora de sincronia. Com `shard: [1, 2, 3]` na
//      matriz e `--shard=N/2` no comando, o shard 3 roda o recorte 3 de
//      2 — que não existe — e o run fica verde tendo executado menos
//      testes do que a suíte tem.
//   2. o check estável desaparecer. A proteção de branch exige
//      "E2E (Playwright)"; uma matriz publica "E2E shard 1/2" e
//      "E2E shard 2/2". Sem o job agregador com o nome antigo, a
//      proteção passa a exigir um check que ninguém mais emite e a suíte
//      deixa de bloquear merge.
//   3. agregação frouxa. Se o agregador não exigir `success` explícito,
//      um shard cancelado ou pulado o deixa verde por omissão.
//
// Este arquivo não usa banco: é invariante de configuração do
// repositório, no mesmo espírito de rotas-publicas.test.ts.

const WORKFLOW = path.join(".github", "workflows", "ci.yml");
const texto = fs.readFileSync(WORKFLOW, "utf8");

function valoresDaMatrizDeShard(): number[] {
  const bloco = /matrix:\s*\n\s*shard:\s*\[([^\]]+)\]/.exec(texto);
  if (!bloco) return [];
  return bloco[1]
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v));
}

function totalNoComandoDeShard(): number | null {
  const m = /--shard=\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)/.exec(texto);
  return m ? Number(m[1]) : null;
}

describe("sharding do E2E", () => {
  test("a matriz declara shards contíguos começando em 1", () => {
    const shards = valoresDaMatrizDeShard();
    expect(shards.length).toBeGreaterThan(1);
    expect(shards).toEqual(shards.map((_, i) => i + 1));
  });

  test("o total no comando bate com o tamanho da matriz", () => {
    // A falha silenciosa nº 1: um shard fora do total roda um recorte
    // inexistente e o CI fica verde com menos testes.
    expect(totalNoComandoDeShard()).toBe(valoresDaMatrizDeShard().length);
  });

  test("o relatório é anexado por shard, sem colidir entre legs", () => {
    expect(texto).toMatch(/name:\s*playwright-report-shard-\$\{\{\s*matrix\.shard\s*\}\}/);
  });
});

describe("check estável exigido pela proteção de branch", () => {
  test('existe um job com o nome "E2E (Playwright)"', () => {
    expect(texto).toMatch(/name:\s*E2E \(Playwright\)\s*\n/);
  });

  test("esse job depende do job de shards", () => {
    const bloco = /\n  e2e:\n([\s\S]*?)(?=\n  [a-z0-9-]+:\n|$)/.exec(texto);
    expect(bloco, "job com id `e2e` precisa existir").not.toBeNull();
    expect(bloco![1]).toMatch(/needs:\s*\[e2e-shard\]/);
  });

  test("a agregação exige success explícito e roda mesmo com falha", () => {
    const bloco = /\n  e2e:\n([\s\S]*?)$/.exec(texto)![1];
    // if: always() sem checagem de resultado seria pior que não ter
    // agregador nenhum.
    expect(bloco).toMatch(/if:\s*always\(\)/);
    expect(bloco).toMatch(/!=\s*"success"/);
    expect(bloco).toMatch(/exit 1/);
  });
});

describe("o que o sharding não pode ter mudado", () => {
  test("cada shard continua com o seu próprio Postgres", () => {
    // É isto que torna o paralelismo isolamento, e não esperança: dois
    // legs nunca compartilham banco.
    const legs = texto.match(/image:\s*postgres:16-alpine/g) ?? [];
    expect(legs.length).toBeGreaterThanOrEqual(2);
  });

  test("verify e E2E seguem independentes — nenhum needs entre eles", () => {
    const verify = /\n  verify:\n([\s\S]*?)(?=\n  [a-z0-9-]+:\n)/.exec(texto)![1];
    const shard = /\n  e2e-shard:\n([\s\S]*?)(?=\n  [a-z0-9-]+:\n)/.exec(texto)![1];
    expect(verify).not.toMatch(/needs:/);
    expect(shard).not.toMatch(/needs:/);
  });

  test("o teto de tempo de cada shard continua declarado", () => {
    const shard = /\n  e2e-shard:\n([\s\S]*?)(?=\n  [a-z0-9-]+:\n)/.exec(texto)![1];
    expect(shard).toMatch(/timeout-minutes:\s*18/);
  });
});
