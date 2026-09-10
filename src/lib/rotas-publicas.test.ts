import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  DIRETORIO_ROTAS_PUBLICAS,
  descobrirFamiliasPublicas,
  primeirosSegmentosPublicos,
  rewritesDoSitePublico,
} from "@/lib/rotas-publicas";
import { SLUGS_RESERVADOS } from "@/lib/platform/reserved-words";

// =======================================================================
// Infraestrutura de rotas públicas
// =======================================================================
// Duas garantias, e as duas nasceram de um erro real: a rota
// /corretores/[id] foi criada e ficou 404 na organização principal porque
// a lista de rewrites era manual — e, pelo mesmo esquecimento, o nome
// "corretores" ficou de fora dos slugs reservados.
//
// Aqui os dois lados passam a ser derivados da MESMA verdade: o que
// existe em src/app/[orgSlug]/.

const temporarios: string[] = [];
function arvoreTemporaria(caminhos: string[]): string {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "rotas-"));
  temporarios.push(raiz);
  for (const relativo of caminhos) {
    const completo = path.join(raiz, relativo);
    fs.mkdirSync(path.dirname(completo), { recursive: true });
    fs.writeFileSync(completo, "");
  }
  return raiz;
}
afterEach(() => {
  while (temporarios.length) fs.rmSync(temporarios.pop()!, { recursive: true, force: true });
});

describe("descoberta das famílias de rota", () => {
  test("raiz, estáticas e dinâmicas viram sources de rewrite", () => {
    const raiz = arvoreTemporaria([
      "page.tsx",
      "imoveis/page.tsx",
      "imoveis/[id]/page.tsx",
      "contato/page.tsx",
    ]);
    expect(descobrirFamiliasPublicas(raiz)).toEqual([
      "/",
      "/contato",
      "/imoveis",
      "/imoveis/:id",
    ]);
  });

  test("catch-all e catch-all opcional viram parâmetro repetido", () => {
    const raiz = arvoreTemporaria([
      "docs/[...slug]/page.tsx",
      "loja/[[...filtros]]/page.tsx",
    ]);
    expect(descobrirFamiliasPublicas(raiz)).toEqual(["/docs/:slug*", "/loja/:filtros*"]);
  });

  test("grupo de rotas não aparece na URL; pasta privada não vira rota", () => {
    const raiz = arvoreTemporaria([
      "(marketing)/sobre/page.tsx",
      "_componentes/page.tsx",
    ]);
    expect(descobrirFamiliasPublicas(raiz)).toEqual(["/sobre"]);
  });

  test("só page.tsx conta — layout, actions e metadata não são rotas navegáveis", () => {
    const raiz = arvoreTemporaria([
      "page.tsx",
      "layout.tsx",
      "actions.ts",
      "icon.tsx",
      "parcial/layout.tsx",
    ]);
    expect(descobrirFamiliasPublicas(raiz)).toEqual(["/"]);
  });

  test("diretório inexistente não explode, devolve vazio", () => {
    expect(descobrirFamiliasPublicas(path.join(os.tmpdir(), "nao-existe-jamais"))).toEqual([]);
  });
});

describe("geração dos rewrites", () => {
  test("cada família vira um rewrite para a organização principal", () => {
    const raiz = arvoreTemporaria(["page.tsx", "imoveis/[id]/page.tsx"]);
    expect(rewritesDoSitePublico("acme", raiz)).toEqual([
      { source: "/", destination: "/acme" },
      { source: "/imoveis/:id", destination: "/acme/imoveis/:id" },
    ]);
  });

  test("nenhuma rota encontrada FALHA o build em vez de publicar um site 404", () => {
    const vazio = arvoreTemporaria([]);
    expect(() => rewritesDoSitePublico("acme", vazio)).toThrow(/Nenhuma rota pública/);
  });
});

// =======================================================================
// PARIDADE — a defesa contra o esquecimento que originou esta fase
// =======================================================================
describe("paridade com as rotas reais do produto", () => {
  test("toda rota pública real produz um rewrite para a organização principal", () => {
    const familias = descobrirFamiliasPublicas(DIRETORIO_ROTAS_PUBLICAS);
    // Se isto falhar, ou o diretório mudou de lugar ou o site público
    // sumiu — as duas coisas merecem quebrar o build.
    expect(familias.length).toBeGreaterThan(0);
    expect(familias).toContain("/");

    const rewrites = rewritesDoSitePublico("principal");
    expect(rewrites.map((r) => r.source).sort()).toEqual([...familias].sort());
    for (const { source, destination } of rewrites) {
      expect(destination.startsWith("/principal")).toBe(true);
      // O sufixo do destino é exatamente o source — nenhum parâmetro se
      // perde na tradução.
      expect(destination).toBe(source === "/" ? "/principal" : `/principal${source}`);
    }
  });

  test("todo primeiro segmento público está em SLUGS_RESERVADOS", () => {
    // Sem isto, uma organização poderia registrar o slug de uma rota
    // pública — o rewrite venceria a rota dinâmica e ela ficaria
    // inacessível pelo próprio endereço. Foi assim que "corretores"
    // passou despercebido quando a rota nasceu.
    for (const segmento of primeirosSegmentosPublicos()) {
      expect(
        SLUGS_RESERVADOS.has(segmento),
        `"${segmento}" é uma rota pública e precisa estar em SLUGS_RESERVADOS`
      ).toBe(true);
    }
  });
});
