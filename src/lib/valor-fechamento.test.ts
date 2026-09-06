import { describe, test, expect } from "vitest";
import {
  interpretarValorFechamento,
  agregarValorFechado,
  decimalParaValor,
  VALOR_FECHAMENTO_MAXIMO,
} from "@/lib/valor-fechamento";

describe("interpretarValorFechamento", () => {
  test("aceita o formato que o CampoMoeda envia", () => {
    expect(interpretarValorFechamento("850000.00")).toEqual({ ok: true, valor: 850000 });
    expect(interpretarValorFechamento("1234.56")).toEqual({ ok: true, valor: 1234.56 });
    expect(interpretarValorFechamento(750000)).toEqual({ ok: true, valor: 750000 });
  });

  test("ZERO é recusado — 'ganho por R$ 0' é campo em branco, não negócio", () => {
    const r = interpretarValorFechamento("0");
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ erro: expect.stringContaining("maior que zero") });
    expect(interpretarValorFechamento("0.00").ok).toBe(false);
  });

  test("negativo é recusado", () => {
    expect(interpretarValorFechamento("-1").ok).toBe(false);
    expect(interpretarValorFechamento(-850000).ok).toBe(false);
  });

  test("ausente, vazio e não-numérico são recusados (nunca viram 0)", () => {
    for (const invalido of [undefined, null, "", "   ", "abc", {}, [], true]) {
      const r = interpretarValorFechamento(invalido);
      expect(r.ok, `deveria recusar ${JSON.stringify(invalido)}`).toBe(false);
    }
  });

  test("NaN e Infinity são recusados", () => {
    expect(interpretarValorFechamento("NaN").ok).toBe(false);
    expect(interpretarValorFechamento("1e999").ok).toBe(false);
    expect(interpretarValorFechamento(Infinity).ok).toBe(false);
  });

  test("mais de duas casas decimais é recusado (Decimal(14,2) truncaria em silêncio)", () => {
    expect(interpretarValorFechamento("100.999").ok).toBe(false);
    expect(interpretarValorFechamento("100.99").ok).toBe(true);
    expect(interpretarValorFechamento("100.9").ok).toBe(true);
    expect(interpretarValorFechamento("100").ok).toBe(true);
  });

  test("teto de sanidade recusa o dígito a mais da máscara", () => {
    expect(interpretarValorFechamento(String(VALOR_FECHAMENTO_MAXIMO)).ok).toBe(true);
    expect(interpretarValorFechamento(String(VALOR_FECHAMENTO_MAXIMO + 1)).ok).toBe(false);
  });
});

describe("agregarValorFechado — zero vs desconhecido", () => {
  test("soma só os ganhos COM valor e conta os sem valor à parte", () => {
    const r = agregarValorFechado([
      { closedValue: 500000 },
      { closedValue: 300000 },
      { closedValue: null },
    ]);
    expect(r.total).toBe(800000);
    expect(r.ganhosComValor).toBe(2);
    expect(r.ganhosSemValor).toBe(1);
    // Ticket médio divide pelos ganhos COM valor (2), nunca por todos (3):
    // incluir o legado puxaria a média para baixo com um dado que não existe.
    expect(r.ticketMedio).toBe(400000);
  });

  test("todos sem valor: total 0 mas ticket NULL (nunca R$ 0)", () => {
    const r = agregarValorFechado([{ closedValue: null }, { closedValue: null }]);
    expect(r.total).toBe(0);
    expect(r.ganhosComValor).toBe(0);
    expect(r.ganhosSemValor).toBe(2);
    // A distinção central: não houve medição, e não "os negócios valeram zero".
    expect(r.ticketMedio).toBeNull();
  });

  test("sem ganho nenhum: zeros e ticket null", () => {
    expect(agregarValorFechado([])).toEqual({
      total: 0,
      ganhosComValor: 0,
      ganhosSemValor: 0,
      ticketMedio: null,
    });
  });

  test("soma de centavos não acumula erro binário", () => {
    const r = agregarValorFechado([{ closedValue: 0.1 }, { closedValue: 0.2 }]);
    expect(r.total).toBe(0.3);
  });

  test("valor não-finito é tratado como ausente, nunca somado", () => {
    const r = agregarValorFechado([{ closedValue: Number.NaN }, { closedValue: 100 }]);
    expect(r.total).toBe(100);
    expect(r.ganhosSemValor).toBe(1);
  });
});

describe("decimalParaValor", () => {
  test("null e undefined continuam null — nunca viram 0", () => {
    expect(decimalParaValor(null)).toBeNull();
    expect(decimalParaValor(undefined)).toBeNull();
  });

  test("converte Decimal (objeto com toString) e número", () => {
    expect(decimalParaValor({ toString: () => "850000.00" })).toBe(850000);
    expect(decimalParaValor(1234.5)).toBe(1234.5);
  });

  test("lixo vira null, nunca NaN circulando pelo relatório", () => {
    expect(decimalParaValor({ toString: () => "abc" })).toBeNull();
  });
});
