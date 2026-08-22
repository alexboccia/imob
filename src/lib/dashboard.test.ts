import { describe, test, expect } from "vitest";
import { chaveMes, rotuloMes, mesesJanela, bucketizarPorMes } from "@/lib/dashboard";

describe("chaveMes", () => {
  test("formata ano-mês com zero à esquerda, em UTC", () => {
    expect(chaveMes(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-01");
    expect(chaveMes(new Date(Date.UTC(2026, 10, 1)))).toBe("2026-11");
  });
});

describe("rotuloMes", () => {
  test("abrevia mês em pt-BR com ano de 2 dígitos", () => {
    expect(rotuloMes(new Date(2026, 0, 1))).toMatch(/^Jan\/26$/i);
  });
});

describe("mesesJanela", () => {
  test("gera N meses terminando no mês de referência, em ordem crescente", () => {
    const referencia = new Date(2026, 5, 15); // Junho/2026
    const meses = mesesJanela(referencia, 6);
    expect(meses).toHaveLength(6);
    expect(meses.map((m) => m.chave)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  test("atravessa virada de ano corretamente", () => {
    const referencia = new Date(2026, 1, 10); // Fevereiro/2026
    const meses = mesesJanela(referencia, 6);
    expect(meses.map((m) => m.chave)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  test("quantidade 1 retorna só o mês de referência", () => {
    const meses = mesesJanela(new Date(2026, 3, 1), 1);
    expect(meses).toHaveLength(1);
    expect(meses[0].chave).toBe("2026-04");
  });
});

describe("bucketizarPorMes", () => {
  const meses = mesesJanela(new Date(2026, 2, 1), 3); // Jan, Fev, Mar/2026

  test("conta itens no mês correto", () => {
    const itens = [
      { data: new Date(2026, 0, 5) },
      { data: new Date(2026, 0, 20) },
      { data: new Date(2026, 2, 1) },
    ];
    const contagem = bucketizarPorMes(itens, meses, (i) => i.data);
    expect(contagem.get("2026-01")).toBe(2);
    expect(contagem.get("2026-02")).toBe(0);
    expect(contagem.get("2026-03")).toBe(1);
  });

  test("meses sem nenhum item ficam em zero (não ausentes)", () => {
    const contagem = bucketizarPorMes([], meses, (i: { data: Date }) => i.data);
    expect(contagem.get("2026-01")).toBe(0);
    expect(contagem.get("2026-02")).toBe(0);
    expect(contagem.get("2026-03")).toBe(0);
  });

  test("item com data null é ignorado, sem lançar erro", () => {
    const itens = [{ data: new Date(2026, 0, 5) }, { data: null }];
    const contagem = bucketizarPorMes(itens, meses, (i) => i.data);
    expect(contagem.get("2026-01")).toBe(1);
  });

  test("item fora da janela (data anterior ao 1º mês) é ignorado", () => {
    const itens = [{ data: new Date(2025, 0, 1) }];
    const contagem = bucketizarPorMes(itens, meses, (i) => i.data);
    expect([...contagem.values()].every((v) => v === 0)).toBe(true);
  });
});
