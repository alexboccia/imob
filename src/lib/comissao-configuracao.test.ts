import { describe, test, expect } from "vitest";
import { interpretarPercentualComissaoPadrao } from "./comissao-configuracao";

describe("interpretarPercentualComissaoPadrao", () => {
  test("ausente/vazio é um padrão não configurado, não um erro", () => {
    expect(interpretarPercentualComissaoPadrao(null)).toEqual({ ok: true, valor: null });
    expect(interpretarPercentualComissaoPadrao(undefined)).toEqual({ ok: true, valor: null });
    expect(interpretarPercentualComissaoPadrao("")).toEqual({ ok: true, valor: null });
    expect(interpretarPercentualComissaoPadrao("   ")).toEqual({ ok: true, valor: null });
  });

  test("aceita número ou string, com vírgula ou ponto", () => {
    expect(interpretarPercentualComissaoPadrao(5)).toEqual({ ok: true, valor: 5 });
    expect(interpretarPercentualComissaoPadrao("5")).toEqual({ ok: true, valor: 5 });
    expect(interpretarPercentualComissaoPadrao("5,5")).toEqual({ ok: true, valor: 5.5 });
    expect(interpretarPercentualComissaoPadrao("5.5")).toEqual({ ok: true, valor: 5.5 });
  });

  test("zero é recusado — padrão de 0% não tem uso real", () => {
    const r = interpretarPercentualComissaoPadrao("0");
    expect(r.ok).toBe(false);
  });

  test("negativo é recusado", () => {
    expect(interpretarPercentualComissaoPadrao("-5").ok).toBe(false);
  });

  test("acima de 100 é recusado", () => {
    expect(interpretarPercentualComissaoPadrao("100.01").ok).toBe(false);
    expect(interpretarPercentualComissaoPadrao("150").ok).toBe(false);
  });

  test("exatamente 100 é aceito", () => {
    expect(interpretarPercentualComissaoPadrao("100")).toEqual({ ok: true, valor: 100 });
  });

  test("mais de duas casas decimais é recusado", () => {
    expect(interpretarPercentualComissaoPadrao("5.123").ok).toBe(false);
  });

  test("texto não numérico é recusado", () => {
    expect(interpretarPercentualComissaoPadrao("abc").ok).toBe(false);
  });

  test("tipo inesperado (objeto, array) é recusado", () => {
    expect(interpretarPercentualComissaoPadrao({}).ok).toBe(false);
    expect(interpretarPercentualComissaoPadrao([5]).ok).toBe(false);
  });
});
