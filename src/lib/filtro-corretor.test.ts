import { describe, test, expect } from "vitest";
import {
  hrefListagemDoCorretor,
  hrefSemFiltroCorretor,
  interpretarFiltroCorretor,
  PARAM_CORRETOR,
} from "@/lib/filtro-corretor";

describe("interpretarFiltroCorretor", () => {
  test("devolve o id quando ele tem cara de id", () => {
    expect(interpretarFiltroCorretor("cmsfdhuj1000a88p4bmvqucgw")).toBe(
      "cmsfdhuj1000a88p4bmvqucgw"
    );
    expect(interpretarFiltroCorretor("e2e-membro-portfolio-paula")).toBe(
      "e2e-membro-portfolio-paula"
    );
  });

  test("ausência e vazio não são filtro", () => {
    expect(interpretarFiltroCorretor(undefined)).toBeNull();
    expect(interpretarFiltroCorretor("")).toBeNull();
    expect(interpretarFiltroCorretor("   ")).toBeNull();
  });

  test("recusa o que não pode ser um id de membro", () => {
    // Sonda: caractere fora do alfabeto de cuid.
    expect(interpretarFiltroCorretor("' OR 1=1 --")).toBeNull();
    expect(interpretarFiltroCorretor("a/b")).toBeNull();
    expect(interpretarFiltroCorretor("x".repeat(65))).toBeNull();
  });

  test("repetido na URL, vale o primeiro — o filtro é de um profissional só", () => {
    expect(interpretarFiltroCorretor(["primeiro", "segundo"])).toBe("primeiro");
    expect(interpretarFiltroCorretor([])).toBeNull();
  });
});

describe("hrefListagemDoCorretor", () => {
  test("aponta para a listagem pública, não para uma segunda listagem", () => {
    expect(hrefListagemDoCorretor("", "membro-1")).toBe(`/imoveis?${PARAM_CORRETOR}=membro-1`);
    expect(hrefListagemDoCorretor("/org-b", "membro-1")).toBe(
      `/org-b/imoveis?${PARAM_CORRETOR}=membro-1`
    );
  });
});

describe("hrefSemFiltroCorretor", () => {
  test("tira SÓ o corretor: bairro, preço e ordenação continuam", () => {
    const href = hrefSemFiltroCorretor("", {
      corretor: "membro-1",
      bairro: "Jardins",
      precoMax: "900000",
      ordenar: "menor_valor",
    });
    expect(href).not.toContain("corretor=");
    expect(href).toContain("bairro=Jardins");
    expect(href).toContain("precoMax=900000");
    expect(href).toContain("ordenar=menor_valor");
  });

  test("filtros de valor múltiplo sobrevivem inteiros", () => {
    const href = hrefSemFiltroCorretor("", {
      corretor: "membro-1",
      bairro: ["Centro", "Jardins"],
    });
    expect(href).toContain("bairro=Centro");
    expect(href).toContain("bairro=Jardins");
  });

  test("a página volta para a primeira — a página 4 de um conjunto não descreve outro", () => {
    const href = hrefSemFiltroCorretor("", { corretor: "membro-1", page: "4" });
    expect(href).not.toContain("page=");
    expect(href).toBe("/imoveis");
  });

  test("respeita o prefixo da organização", () => {
    expect(hrefSemFiltroCorretor("/org-b", { corretor: "m" })).toBe("/org-b/imoveis");
  });
});
