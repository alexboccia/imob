import { describe, test, expect } from "vitest";
import { formatarLocalizacaoImovel, formatarMilharDigitos } from "@/lib/format";

describe("formatarLocalizacaoImovel", () => {
  test("com bairro, mostra bairro + cidade - UF", () => {
    expect(formatarLocalizacaoImovel("Centro", "São Paulo", "SP")).toBe("Centro, São Paulo - SP");
  });

  test("sem bairro (null), omite a vírgula solta", () => {
    expect(formatarLocalizacaoImovel(null, "São Paulo", "SP")).toBe("São Paulo - SP");
  });

  test("sem bairro (string vazia), tratado igual a ausente", () => {
    expect(formatarLocalizacaoImovel("", "São Paulo", "SP")).toBe("São Paulo - SP");
  });

  test("sem bairro (undefined), tratado igual a ausente", () => {
    expect(formatarLocalizacaoImovel(undefined, "São Paulo", "SP")).toBe("São Paulo - SP");
  });
});

describe("formatarMilharDigitos — campo de valor do filtro (Home/FiltrosImoveis)", () => {
  test("string vazia vira string vazia (nunca 'R$ 0' nem 'NaN')", () => {
    expect(formatarMilharDigitos("")).toBe("");
  });

  test("zero explícito formata normalmente", () => {
    expect(formatarMilharDigitos("0")).toBe("0");
  });

  test("adiciona separador de milhar, sem casas decimais", () => {
    expect(formatarMilharDigitos("1000")).toBe("1.000");
    expect(formatarMilharDigitos("5000")).toBe("5.000");
    expect(formatarMilharDigitos("600000")).toBe("600.000");
  });

  test("valores grandes continuam formatando corretamente", () => {
    expect(formatarMilharDigitos("123456789")).toBe("123.456.789");
  });

  test("nunca produz notação decimal — é sempre reais inteiros, não centavos", () => {
    expect(formatarMilharDigitos("600000")).not.toContain(",");
  });
});
