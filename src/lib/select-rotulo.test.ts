import { describe, test, expect } from "vitest";
import { rotuloSelecionado } from "@/lib/select-rotulo";

// Regressão do bug PÚBLICO confirmado em produção: a sentinela
// "__TODOS__" (Home) e o valor cru "relevantes" (/imoveis) apareciam na
// tela em vez do rótulo humano.
describe("rotuloSelecionado", () => {
  const ROTULOS_TIPO = { __TODOS__: "Todos os imóveis" };
  const ROTULOS_ORDEM = {
    relevantes: "Mais relevantes",
    menor_valor: "Menor valor",
    maior_valor: "Maior valor",
  };

  test("REGRESSÃO: sentinela da Home nunca vaza como rótulo", () => {
    const exibido = rotuloSelecionado("__TODOS__", ROTULOS_TIPO, "Todos os imóveis");
    expect(exibido).toBe("Todos os imóveis");
    expect(exibido).not.toContain("__");
  });

  test("REGRESSÃO: ordenação da listagem mostra o rótulo, não o valor cru", () => {
    expect(rotuloSelecionado("relevantes", ROTULOS_ORDEM, "Mais relevantes")).toBe("Mais relevantes");
    expect(rotuloSelecionado("menor_valor", ROTULOS_ORDEM, "Mais relevantes")).toBe("Menor valor");
  });

  test("valor sem rótulo no catálogo exibe o próprio valor (tipos reais de imóvel)", () => {
    expect(rotuloSelecionado("Apartamento", ROTULOS_TIPO, "Todos os imóveis")).toBe("Apartamento");
    expect(rotuloSelecionado("Sala Comercial", ROTULOS_TIPO, "Todos os imóveis")).toBe("Sala Comercial");
  });

  test("sem seleção (null/undefined/vazio) exibe o texto padrão", () => {
    for (const vazio of [null, undefined, ""]) {
      expect(rotuloSelecionado(vazio, ROTULOS_TIPO, "Todos os imóveis")).toBe("Todos os imóveis");
    }
  });

  test("valor não-string não quebra nem imprime [object Object]", () => {
    for (const invalido of [42, {}, [], true]) {
      expect(rotuloSelecionado(invalido, ROTULOS_TIPO, "Todos os imóveis")).toBe("Todos os imóveis");
    }
  });

  // Fase 7 — mesmas sentinelas, agora nas telas administrativas
  // (ClientesFiltrosAvancados e FiltroDropdown do DataTable).
  test("REGRESSÃO admin: sentinela dos filtros de Clientes não vaza", () => {
    const origem = { __todos__: "Todas", WEBSITE: "Site", REFERRAL: "Indicação" };
    expect(rotuloSelecionado("__todos__", origem, "Todas")).toBe("Todas");
    expect(rotuloSelecionado("WEBSITE", origem, "Todas")).toBe("Site");
    expect(rotuloSelecionado("__todos__", origem, "Todas")).not.toContain("__");
  });

  test("REGRESSÃO admin: FiltroDropdown genérico usa o rótulo composto", () => {
    const rotulos = { __todos__: "Papel: todos", OWNER: "Proprietário" };
    expect(rotuloSelecionado("__todos__", rotulos, "Papel: todos")).toBe("Papel: todos");
    expect(rotuloSelecionado("OWNER", rotulos, "Papel: todos")).toBe("Proprietário");
  });

  test("chave herdada do prototype nunca vira rótulo", () => {
    // Sem Object.hasOwn, "toString"/"constructor" achariam uma função na
    // cadeia de protótipos e o código-fonte dela iria pra tela.
    expect(rotuloSelecionado("toString", ROTULOS_TIPO, "Todos")).toBe("toString");
    expect(rotuloSelecionado("constructor", ROTULOS_TIPO, "Todos")).toBe("constructor");
  });
});
