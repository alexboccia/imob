import { describe, test, expect } from "vitest";
import { custosPublicos, precosPublicos } from "@/lib/valores-publicos";

const semNbsp = (s: string) => s.replace(/\s/g, " ");
const valores = (lista: { valor: string }[]) => lista.map((p) => semNbsp(p.valor));

describe("precosPublicos", () => {
  test("SALE: só o preço de venda, sem rótulo nem sufixo", () => {
    const precos = precosPublicos({ price: 850000, rentPrice: null, purpose: "SALE" });
    expect(precos).toHaveLength(1);
    expect(precos[0]).toMatchObject({ chave: "venda", sufixo: null, rotulo: null });
    expect(valores(precos)).toEqual(["R$ 850.000"]);
  });

  test("RENT: só o aluguel, mensal", () => {
    const precos = precosPublicos({ price: null, rentPrice: 4500, purpose: "RENT" });
    expect(precos).toEqual([
      expect.objectContaining({ chave: "aluguel", sufixo: "/mês", rotulo: null }),
    ]);
    expect(valores(precos)).toEqual(["R$ 4.500"]);
  });

  test("SALE_AND_RENT: os dois, rotulados, venda primeiro", () => {
    const precos = precosPublicos({ price: 900000, rentPrice: 5000, purpose: "SALE_AND_RENT" });
    expect(precos.map((p) => [p.chave, p.rotulo, p.sufixo])).toEqual([
      ["venda", "Para comprar", null],
      ["aluguel", "Para alugar", "/mês"],
    ]);
  });

  test("SALE_AND_RENT com um valor só: mostra o que existe, sem inventar o outro", () => {
    const precos = precosPublicos({ price: null, rentPrice: 5000, purpose: "SALE_AND_RENT" });
    expect(precos.map((p) => p.chave)).toEqual(["aluguel"]);
  });

  test("sem preço nenhum: lista vazia — nunca 'Consulte-nos'", () => {
    expect(precosPublicos({ price: null, rentPrice: null, purpose: "SALE" })).toEqual([]);
    expect(precosPublicos({ price: undefined, rentPrice: undefined, purpose: "RENT" })).toEqual([]);
  });

  test("zero é valor cadastrado, não ausência", () => {
    expect(precosPublicos({ price: 0, rentPrice: null, purpose: "SALE" })).toHaveLength(1);
  });

  test("aceita Decimal (objeto com toString), como vem do Prisma", () => {
    const decimal = { toString: () => "1250000" };
    expect(valores(precosPublicos({ price: decimal, rentPrice: null, purpose: "SALE" }))).toEqual([
      "R$ 1.250.000",
    ]);
  });
});

describe("custosPublicos", () => {
  test("condomínio e IPTU, sem periodicidade inventada", () => {
    const custos = custosPublicos({ condoFee: 720, propertyTax: 310 });
    expect(custos.map((c) => [c.rotulo, semNbsp(c.valor)])).toEqual([
      ["Condomínio", "R$ 720"],
      ["IPTU", "R$ 310"],
    ]);
    expect(custos.some((c) => /mês|ano/.test(c.valor))).toBe(false);
  });

  test("cada custo só existe se preenchido", () => {
    expect(custosPublicos({ condoFee: null, propertyTax: 310 }).map((c) => c.chave)).toEqual(["iptu"]);
    expect(custosPublicos({ condoFee: null, propertyTax: null })).toEqual([]);
  });
});
