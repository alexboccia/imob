import { describe, expect, test } from "vitest";
import {
  ehLancamento,
  estaEmObra,
  previsaoEntregaPorExtenso,
  rotuloEstagioObra,
} from "./imovel-lancamento";

describe("ehLancamento", () => {
  test("rótulo comercial sozinho já é lançamento", () => {
    expect(ehLancamento({ isLaunch: true, constructionStage: null })).toBe(true);
  });

  test("obra em andamento sozinha já é lançamento, mesmo sem o rótulo", () => {
    expect(
      ehLancamento({ isLaunch: false, constructionStage: "UNDER_CONSTRUCTION" })
    ).toBe(true);
    expect(
      ehLancamento({ isLaunch: false, constructionStage: "PRE_CONSTRUCTION" })
    ).toBe(true);
  });

  test("imóvel pronto e sem rótulo NÃO é lançamento", () => {
    expect(ehLancamento({ isLaunch: false, constructionStage: null })).toBe(false);
    expect(
      ehLancamento({ isLaunch: false, constructionStage: "READY_TO_MOVE" })
    ).toBe(false);
  });

  test("READY_TO_MOVE com rótulo de lançamento continua lançamento (a decisão é do corretor)", () => {
    expect(
      ehLancamento({ isLaunch: true, constructionStage: "READY_TO_MOVE" })
    ).toBe(true);
  });
});

describe("estaEmObra", () => {
  test("só PRE_CONSTRUCTION e UNDER_CONSTRUCTION contam como obra em andamento", () => {
    expect(estaEmObra({ constructionStage: "PRE_CONSTRUCTION" })).toBe(true);
    expect(estaEmObra({ constructionStage: "UNDER_CONSTRUCTION" })).toBe(true);
    expect(estaEmObra({ constructionStage: "READY_TO_MOVE" })).toBe(false);
    expect(estaEmObra({ constructionStage: null })).toBe(false);
  });

  test("valor desconhecido no banco não vira obra em andamento", () => {
    expect(estaEmObra({ constructionStage: "QUALQUER_COISA" })).toBe(false);
  });
});

describe("rotuloEstagioObra", () => {
  test("traduz os três estágios reais", () => {
    expect(rotuloEstagioObra({ constructionStage: "PRE_CONSTRUCTION" })).toBe("Na planta");
    expect(rotuloEstagioObra({ constructionStage: "UNDER_CONSTRUCTION" })).toBe("Em construção");
    expect(rotuloEstagioObra({ constructionStage: "READY_TO_MOVE" })).toBe("Pronto para morar");
  });

  test("sem estágio cadastrado, não inventa um a partir do rótulo de lançamento", () => {
    expect(rotuloEstagioObra({ constructionStage: null })).toBeNull();
    expect(rotuloEstagioObra({ constructionStage: "INEXISTENTE" })).toBeNull();
  });
});

describe("previsaoEntregaPorExtenso", () => {
  test("respeita a granularidade real do dado: mês e ano, nunca dia", () => {
    const d = new Date("2027-12-01T00:00:00.000Z");
    expect(previsaoEntregaPorExtenso(d)).toBe("Dezembro de 2027");
    expect(previsaoEntregaPorExtenso(d)).not.toMatch(/\b\d{1,2}\s+de\s+dez/i);
  });

  test("junho de 2027 (data do seed) sai por extenso", () => {
    expect(previsaoEntregaPorExtenso(new Date("2027-06-01T00:00:00.000Z"))).toBe(
      "Junho de 2027"
    );
  });

  test("sem data, não há texto", () => {
    expect(previsaoEntregaPorExtenso(null)).toBeNull();
  });
});
