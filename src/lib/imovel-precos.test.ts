import { describe, test, expect } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { precosDoImovel } from "@/lib/imovel-precos";

// Fronteira Server -> Client dos preços do imóvel (Fase 16).
//
// Usa Prisma.Decimal DE VERDADE, não um dublê: o objetivo é provar que a
// conversão aceita exatamente o que o Prisma devolve e não perde
// centavos no caminho.

const dec = (v: string) => new Prisma.Decimal(v);

describe("precosDoImovel", () => {
  test("converte venda e locação para número", () => {
    expect(precosDoImovel({ price: dec("500000.00"), rentPrice: dec("2500.00") })).toEqual({
      price: 500000,
      rentPrice: 2500,
    });
  });

  test("null continua null — 'sem preço' não é 'R$ 0'", () => {
    expect(precosDoImovel({ price: null, rentPrice: null })).toEqual({
      price: null,
      rentPrice: null,
    });
    // Um imóvel só de venda tem rentPrice nulo, e vice-versa.
    expect(precosDoImovel({ price: dec("300000.00"), rentPrice: null })).toEqual({
      price: 300000,
      rentPrice: null,
    });
  });

  test("undefined também vira null, sem quebrar", () => {
    expect(precosDoImovel({ price: undefined, rentPrice: undefined })).toEqual({
      price: null,
      rentPrice: null,
    });
  });

  test("zero é preservado como zero — não vira null", () => {
    // Zero e ausência são estados diferentes, e a conversão não os funde.
    expect(precosDoImovel({ price: dec("0.00"), rentPrice: dec("0") })).toEqual({
      price: 0,
      rentPrice: 0,
    });
  });

  test("centavos não se perdem", () => {
    for (const valor of ["0.01", "0.99", "1234.56", "99999.95"]) {
      const { price } = precosDoImovel({ price: dec(valor), rentPrice: null });
      expect(price).toBe(Number(valor));
    }
  });

  test("valor máximo de Decimal(14,2) sobrevive à conversão", () => {
    // 12 dígitos inteiros + 2 casas é o teto do schema; cabe nos ~15
    // dígitos significativos de um double sem arredondar.
    const maximo = "999999999999.99";
    expect(precosDoImovel({ price: dec(maximo), rentPrice: null }).price).toBe(999999999999.99);
    expect(String(precosDoImovel({ price: dec(maximo), rentPrice: null }).price)).toBe(maximo);
  });

  test("o resultado é um objeto PLAIN — atravessa structuredClone", () => {
    const dto = precosDoImovel({ price: dec("500000.00"), rentPrice: dec("2500.00") });
    // structuredClone falha em objetos com prototype não suportado (é o
    // que acontece com Prisma.Decimal); passar aqui é a prova de que o
    // DTO é serializável na fronteira.
    expect(() => structuredClone(dto)).not.toThrow();
    expect(structuredClone(dto)).toEqual(dto);
    // E o Decimal cru, para contraste, NÃO é clonável.
    expect(() => structuredClone({ price: dec("1.00") })).toThrow();
  });

  test("Decimal cru não sobrevive; o DTO sim (contraste explícito)", () => {
    const cru = { price: dec("10.50"), rentPrice: null };
    expect(cru.price).toBeInstanceOf(Prisma.Decimal);
    const dto = precosDoImovel(cru);
    expect(typeof dto.price).toBe("number");
    expect(dto.price).not.toBeInstanceOf(Prisma.Decimal);
  });
});
