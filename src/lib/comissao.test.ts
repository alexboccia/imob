import { describe, test, expect } from "vitest";
import {
  interpretarComissao,
  comissaoExcedeValorFechado,
  agregarComissao,
  calcularComissaoPorPercentual,
  COMISSAO_MAXIMA,
} from "@/lib/comissao";

describe("interpretarComissao", () => {
  test("aceita o valor que o CampoMoeda envia", () => {
    expect(interpretarComissao("40000.00")).toEqual({ ok: true, valor: 40000 });
    expect(interpretarComissao("1234.56")).toEqual({ ok: true, valor: 1234.56 });
    expect(interpretarComissao(40000)).toEqual({ ok: true, valor: 40000 });
  });

  test("OPCIONAL: vazio/ausente vira null com sucesso — não bloqueia o ganho", () => {
    // A diferença central para closedValue: um negócio real não pode
    // deixar de ser registrado porque a comissão ainda não saiu.
    for (const vazio of [undefined, null, "", "   "]) {
      expect(interpretarComissao(vazio)).toEqual({ ok: true, valor: null });
    }
  });

  test("ZERO é recusado — 'sem comissão' se diz deixando em branco", () => {
    const r = interpretarComissao("0");
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ erro: expect.stringContaining("em branco") });
    expect(interpretarComissao("0.00").ok).toBe(false);
  });

  test("negativo é recusado", () => {
    expect(interpretarComissao("-100").ok).toBe(false);
  });

  test("valor mal formado é recusado (e não vira null silenciosamente)", () => {
    for (const invalido of ["abc", "1e999", {}, [], true, Infinity]) {
      expect(interpretarComissao(invalido).ok, `deveria recusar ${String(invalido)}`).toBe(false);
    }
  });

  test("mais de duas casas é recusado (Decimal(14,2) truncaria em silêncio)", () => {
    expect(interpretarComissao("100.999").ok).toBe(false);
    expect(interpretarComissao("100.99").ok).toBe(true);
  });

  test("teto de sanidade", () => {
    expect(interpretarComissao(String(COMISSAO_MAXIMA)).ok).toBe(true);
    expect(interpretarComissao(String(COMISSAO_MAXIMA + 1)).ok).toBe(false);
  });
});

describe("comissão maior que o valor fechado", () => {
  test("bloqueia — comissão é derivada da transação, não pode superá-la", () => {
    expect(comissaoExcedeValorFechado(900000, 800000)).toBe(true);
    expect(comissaoExcedeValorFechado(800000, 800000)).toBe(false);
    expect(comissaoExcedeValorFechado(40000, 800000)).toBe(false);
  });

  test("sem um dos dois não há o que comparar (WON legado sem valor fechado)", () => {
    expect(comissaoExcedeValorFechado(null, 800000)).toBe(false);
    expect(comissaoExcedeValorFechado(40000, null)).toBe(false);
    expect(comissaoExcedeValorFechado(null, null)).toBe(false);
  });
});

describe("agregarComissao — zero vs desconhecido", () => {
  test("soma só quem tem comissão e conta os demais à parte", () => {
    const r = agregarComissao([
      { closedValue: 800000, commissionValue: 40000 },
      { closedValue: 200000, commissionValue: 10000 },
      { closedValue: 500000, commissionValue: null },
    ]);
    expect(r.total).toBe(50000);
    expect(r.ganhosComComissao).toBe(2);
    expect(r.ganhosSemComissao).toBe(1);
    // Média divide por 2 (com comissão), nunca por 3.
    expect(r.comissaoMedia).toBe(25000);
    // Efetiva usa só os negócios com AMBOS: 50000 / 1000000 = 5%.
    expect(r.comissaoEfetiva).toBeCloseTo(5);
  });

  test("nenhuma comissão: total 0 mas média e efetiva NULL (nunca R$ 0 / 0%)", () => {
    const r = agregarComissao([
      { closedValue: 800000, commissionValue: null },
      { closedValue: null, commissionValue: null },
    ]);
    expect(r.total).toBe(0);
    expect(r.comissaoMedia).toBeNull();
    expect(r.comissaoEfetiva).toBeNull();
    expect(r.ganhosSemComissao).toBe(2);
  });

  test("comissão sem valor fechado entra no total, mas NÃO na efetiva", () => {
    // Misturar universos diferentes produziria uma proporção falsa.
    const r = agregarComissao([{ closedValue: null, commissionValue: 30000 }]);
    expect(r.total).toBe(30000);
    expect(r.ganhosComComissao).toBe(1);
    expect(r.comissaoEfetiva).toBeNull();
  });

  test("lista vazia: zeros e nulls, sem NaN", () => {
    expect(agregarComissao([])).toEqual({
      total: 0,
      ganhosComComissao: 0,
      ganhosSemComissao: 0,
      comissaoMedia: null,
      comissaoEfetiva: null,
    });
  });

  test("soma de centavos não acumula erro binário", () => {
    const r = agregarComissao([
      { closedValue: 1, commissionValue: 0.1 },
      { closedValue: 1, commissionValue: 0.2 },
    ]);
    expect(r.total).toBe(0.3);
  });
});

describe("atalho de percentual (só UI, nunca persistido)", () => {
  test("calcula o valor a partir do valor fechado", () => {
    expect(calcularComissaoPorPercentual(800000, "5")).toBe(40000);
    expect(calcularComissaoPorPercentual(800000, "2,5")).toBe(20000);
    expect(calcularComissaoPorPercentual(333333, "3")).toBe(9999.99);
  });

  test("entrada inválida ou fora da faixa devolve null (nada é preenchido)", () => {
    for (const invalido of ["", "abc", "0", "-5", "101", null, undefined]) {
      expect(calcularComissaoPorPercentual(800000, invalido)).toBeNull();
    }
  });

  test("sem valor fechado não há base para calcular", () => {
    expect(calcularComissaoPorPercentual(null, "5")).toBeNull();
    expect(calcularComissaoPorPercentual(0, "5")).toBeNull();
  });
});
