import { describe, test, expect } from "vitest";
import {
  interpretarValorProposta,
  ladoOposto,
  LADO_PROPOSTA_LABEL,
  precoPedido,
  situacaoDaNegociacao,
  type PropostaRegistrada,
} from "@/lib/proposta-negociacao";

// O estado comercial é DERIVADO da sequência — não existe coluna de
// status. Estes testes são a prova de que a derivação responde as quatro
// perguntas do corretor: qual foi o último valor, quem propôs, quando, e
// de quem é a vez.

const proposta = (
  id: string,
  valor: number,
  lado: "CLIENT" | "OWNER",
  iso: string
): PropostaRegistrada => ({
  id,
  valor,
  lado,
  ocorridoEmISO: iso,
  registradoPor: "Corretor A",
});

describe("situacaoDaNegociacao", () => {
  test("sem proposta: ninguém está esperando", () => {
    expect(situacaoDaNegociacao([], false)).toEqual({
      ultima: null,
      aguardando: null,
      total: 0,
    });
  });

  test("cliente propôs: a vez é do proprietário", () => {
    const s = situacaoDaNegociacao(
      [proposta("a", 480000, "CLIENT", "2026-09-14T14:20:00.000Z")],
      false
    );
    expect(s.ultima?.valor).toBe(480000);
    expect(s.aguardando).toBe("OWNER");
    expect(s.total).toBe(1);
  });

  test("contraproposta do proprietário: a vez volta para o cliente", () => {
    // A sequência É a história: a mais recente primeiro.
    const s = situacaoDaNegociacao(
      [
        proposta("b", 510000, "OWNER", "2026-09-14T15:05:00.000Z"),
        proposta("a", 480000, "CLIENT", "2026-09-14T14:20:00.000Z"),
      ],
      false
    );
    expect(s.ultima?.valor).toBe(510000);
    expect(s.ultima?.lado).toBe("OWNER");
    expect(s.aguardando).toBe("CLIENT");
    expect(s.total).toBe(2);
  });

  test("terceira rodada: quem manda é a última, não a maior", () => {
    const s = situacaoDaNegociacao(
      [
        proposta("c", 500000, "CLIENT", "2026-09-14T16:10:00.000Z"),
        proposta("b", 510000, "OWNER", "2026-09-14T15:05:00.000Z"),
        proposta("a", 480000, "CLIENT", "2026-09-14T14:20:00.000Z"),
      ],
      false
    );
    expect(s.ultima?.valor).toBe(500000);
    expect(s.aguardando).toBe("OWNER");
  });

  test("negociação encerrada: não há vez de ninguém", () => {
    // Dizer "aguardando o proprietário" num negócio já fechado afirmaria
    // trabalho que não existe.
    const s = situacaoDaNegociacao(
      [proposta("a", 480000, "CLIENT", "2026-09-14T14:20:00.000Z")],
      true
    );
    expect(s.ultima).not.toBeNull();
    expect(s.aguardando).toBeNull();
  });
});

describe("ladoOposto e rótulos", () => {
  test("os dois lados da mesa, e só eles", () => {
    expect(ladoOposto("CLIENT")).toBe("OWNER");
    expect(ladoOposto("OWNER")).toBe("CLIENT");
    expect(LADO_PROPOSTA_LABEL.CLIENT).toBe("Cliente");
    expect(LADO_PROPOSTA_LABEL.OWNER).toBe("Proprietário");
  });
});

describe("precoPedido", () => {
  test("venda lê o preço de venda; aluguel lê o aluguel", () => {
    const imovel = { price: 550000, rentPrice: 2500 };
    expect(precoPedido({ ...imovel, purpose: "SALE" })).toBe(550000);
    expect(precoPedido({ ...imovel, purpose: "RENT" })).toBe(2500);
  });

  test("sem preço cadastrado para a finalidade, não inventa o outro", () => {
    expect(precoPedido({ purpose: "RENT", price: 550000, rentPrice: null })).toBeNull();
    expect(precoPedido({ purpose: "SALE", price: null, rentPrice: 2500 })).toBeNull();
  });
});

describe("interpretarValorProposta", () => {
  test("aceita valor com centavos", () => {
    expect(interpretarValorProposta("480000.50")).toEqual({ ok: true, valor: 480000.5 });
  });

  test("recusa zero, negativo e lixo — mesma regra do fechamento", () => {
    for (const bruto of ["0", "-1", "", "abc", "1e999", null, undefined, {}]) {
      expect(interpretarValorProposta(bruto).ok, String(bruto)).toBe(false);
    }
  });

  test("recusa mais de duas casas — não trunca em silêncio", () => {
    expect(interpretarValorProposta("100.999").ok).toBe(false);
  });

  test("a mensagem fala de proposta, não de fechamento", () => {
    const r = interpretarValorProposta("0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("da proposta");
  });
});
