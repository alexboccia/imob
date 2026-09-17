import { describe, test, expect } from "vitest";
import {
  ORDEM_PUBLICA_PADRAO,
  compararOrdemPublica,
  consultasVizinhos,
  hrefDoImovel,
  type PosicaoNaOrdem,
} from "@/lib/navegacao-imoveis";

// =======================================================================
// Imóvel anterior / próximo (Fase 48) — regras puras. O comportamento
// contra o banco está em tests/integration/navegacao-imoveis.test.ts.
// =======================================================================

const dia = (d: number) => new Date(Date.UTC(2026, 0, d));

function ordenar(lista: PosicaoNaOrdem[]) {
  return [...lista].sort(compararOrdemPublica).map((p) => p.id);
}

describe("compararOrdemPublica", () => {
  test("mais recentes primeiro", () => {
    expect(
      ordenar([
        { id: "a", publishedAt: dia(1) },
        { id: "c", publishedAt: dia(3) },
        { id: "b", publishedAt: dia(2) },
      ])
    ).toEqual(["c", "b", "a"]);
  });

  test("mesmo instante: id desempata (decrescente), qualquer que seja a entrada", () => {
    const empate = [
      { id: "x1", publishedAt: dia(5) },
      { id: "x3", publishedAt: dia(5) },
      { id: "x2", publishedAt: dia(5) },
    ];
    expect(ordenar(empate)).toEqual(["x3", "x2", "x1"]);
    expect(ordenar([...empate].reverse())).toEqual(["x3", "x2", "x1"]);
  });

  test("sem data de publicação vem antes (NULLS FIRST, como o Postgres em DESC)", () => {
    expect(
      ordenar([
        { id: "a", publishedAt: dia(9) },
        { id: "n1", publishedAt: null },
        { id: "n2", publishedAt: null },
      ])
    ).toEqual(["n2", "n1", "a"]);
  });
});

describe("consultasVizinhos", () => {
  const posicao = { id: "b", publishedAt: dia(2) };

  test("as duas consultas nascem na visibilidade pública da organização", () => {
    const { anterior, proximo } = consultasVizinhos("org-1", posicao);
    for (const c of [anterior, proximo]) {
      // No nível de cima do where, onde a guarda de tenant procura.
      expect(c.where).toMatchObject({ organizationId: "org-1", status: "AVAILABLE" });
    }
  });

  test("próximo usa a ordem da listagem; anterior, a inversa (desempate incluso)", () => {
    const { anterior, proximo } = consultasVizinhos("org-1", posicao);
    expect(proximo.orderBy).toBe(ORDEM_PUBLICA_PADRAO);
    expect(anterior.orderBy).toEqual([
      { publishedAt: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ]);
    expect(ORDEM_PUBLICA_PADRAO.at(-1)).toEqual({ id: "desc" });
  });

  test("posição sem data: anterior só entre os sem data; próximo inclui todos os datados", () => {
    const { anterior, proximo } = consultasVizinhos("org-1", { id: "n", publishedAt: null });
    expect(anterior.where.AND[0]).toEqual({ publishedAt: null, id: { gt: "n" } });
    expect(proximo.where.AND[0]).toEqual({
      OR: [{ publishedAt: null, id: { lt: "n" } }, { publishedAt: { not: null } }],
    });
  });
});

test("hrefDoImovel respeita o prefixo da organização", () => {
  expect(hrefDoImovel("", "abc")).toBe("/imoveis/abc");
  expect(hrefDoImovel("/org-x", "abc")).toBe("/org-x/imoveis/abc");
});
