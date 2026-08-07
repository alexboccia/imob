import { describe, test, expect } from "vitest";
import {
  interpretarPaginacao,
  totalDePaginas,
  normalizarBusca,
  interpretarOrdenacao,
  interpretarFiltros,
  PAGE_SIZE_PADRAO,
  PAGE_SIZE_MAXIMO,
  PAGINA_MAXIMA,
} from "@/lib/pagination";

describe("interpretarPaginacao — página inválida/negativa", () => {
  test("página ausente cai em 1", () => {
    expect(interpretarPaginacao({}).page).toBe(1);
  });

  test("página negativa é tratada como 1, não como erro", () => {
    expect(interpretarPaginacao({ page: "-5" }).page).toBe(1);
  });

  test("página zero é tratada como 1", () => {
    expect(interpretarPaginacao({ page: "0" }).page).toBe(1);
  });

  test("página não numérica cai em 1", () => {
    expect(interpretarPaginacao({ page: "abc" }).page).toBe(1);
  });

  test("página além do limite máximo é clampada", () => {
    expect(interpretarPaginacao({ page: "999999" }).page).toBe(PAGINA_MAXIMA);
  });
});

describe("interpretarPaginacao — pageSize", () => {
  test("sem pageSize usa o padrão", () => {
    expect(interpretarPaginacao({}).pageSize).toBe(PAGE_SIZE_PADRAO);
  });

  test("pageSize arbitrariamente grande é clampado ao máximo", () => {
    expect(interpretarPaginacao({ pageSize: "999999" }).pageSize).toBe(PAGE_SIZE_MAXIMO);
  });

  test("pageSize negativo cai pro mínimo (1), nunca 0 ou negativo", () => {
    expect(interpretarPaginacao({ pageSize: "-10" }).pageSize).toBe(1);
  });

  test("respeita um pageSizeMaximo customizado (ex: listagem pública)", () => {
    const r = interpretarPaginacao({ pageSize: "50" }, { pageSizeMaximo: 24 });
    expect(r.pageSize).toBe(24);
  });
});

describe("interpretarPaginacao — skip/take", () => {
  test("calcula skip corretamente a partir da página", () => {
    const r = interpretarPaginacao({ page: "3", pageSize: "10" });
    expect(r.skip).toBe(20);
    expect(r.take).toBe(10);
  });
});

describe("totalDePaginas — totais corretos", () => {
  test("arredonda pra cima", () => {
    expect(totalDePaginas(21, 10)).toBe(3);
    expect(totalDePaginas(20, 10)).toBe(2);
    expect(totalDePaginas(1, 10)).toBe(1);
  });

  test("zero registros ainda retorna ao menos 1 página", () => {
    expect(totalDePaginas(0, 10)).toBe(1);
  });
});

describe("normalizarBusca", () => {
  test("remove espaços nas pontas e colapsa espaços internos", () => {
    expect(normalizarBusca("  Vila   Madalena  ")).toBe("Vila Madalena");
  });

  test("string vazia/ausente vira string vazia", () => {
    expect(normalizarBusca(undefined)).toBe("");
    expect(normalizarBusca("   ")).toBe("");
  });

  test("corta buscas absurdamente longas", () => {
    const longa = "a".repeat(500);
    expect(normalizarBusca(longa).length <= 100).toBeTruthy();
  });
});

describe("interpretarOrdenacao — impede orderBy em campo arbitrário", () => {
  const permitidos = ["title", "price"];
  const padrao = { campo: "createdAt", direcao: "desc" as const };

  test("aceita campo permitido", () => {
    expect(interpretarOrdenacao("title:asc", permitidos, padrao)).toEqual({
      campo: "title",
      direcao: "asc",
    });
  });

  test("rejeita campo fora da allowlist, cai no padrão", () => {
    expect(interpretarOrdenacao("passwordHash:asc", permitidos, padrao)).toEqual(padrao);
  });

  test("sem sort, usa o padrão", () => {
    expect(interpretarOrdenacao(undefined, permitidos, padrao)).toEqual(padrao);
  });

  test("direção inválida cai em desc", () => {
    expect(interpretarOrdenacao("price:xyz", permitidos, padrao)).toEqual({
      campo: "price",
      direcao: "desc",
    });
  });
});

describe("interpretarFiltros — impede filtro inválido", () => {
  test("aceita só chaves da allowlist", () => {
    const r = interpretarFiltros(JSON.stringify({ status: "AVAILABLE", role: "OWNER" }), [
      "status",
    ] as const);
    expect(r).toEqual({ status: "AVAILABLE" });
  });

  test("JSON malformado não derruba a página, retorna vazio", () => {
    expect(interpretarFiltros("{not valid json", ["status"] as const)).toEqual({});
  });

  test("array no lugar de objeto é ignorado", () => {
    expect(interpretarFiltros(JSON.stringify(["AVAILABLE"]), ["status"] as const)).toEqual({});
  });

  test("valor não-string é ignorado", () => {
    const r = interpretarFiltros(JSON.stringify({ status: { $ne: null } }), ["status"] as const);
    expect(r).toEqual({});
  });

  test("sem filters, retorna objeto vazio", () => {
    expect(interpretarFiltros(undefined, ["status"] as const)).toEqual({});
  });
});
