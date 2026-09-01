import { describe, test, expect } from "vitest";
import { campoPrecoPorFinalidade } from "@/lib/imovel-filtros";

describe("campoPrecoPorFinalidade — bug real corrigido: preço de aluguel nunca filtrado por price de venda", () => {
  test("RENT usa rentPrice", () => {
    expect(campoPrecoPorFinalidade("RENT")).toBe("rentPrice");
  });

  test("SALE usa price", () => {
    expect(campoPrecoPorFinalidade("SALE")).toBe("price");
  });

  test("ausente/nulo/vazio cai no padrão (price) — nunca quebra", () => {
    expect(campoPrecoPorFinalidade(undefined)).toBe("price");
    expect(campoPrecoPorFinalidade(null)).toBe("price");
    expect(campoPrecoPorFinalidade("")).toBe("price");
  });

  test("valor desconhecido (nem SALE nem RENT) cai no padrão (price)", () => {
    expect(campoPrecoPorFinalidade("SALE_AND_RENT")).toBe("price");
    expect(campoPrecoPorFinalidade("lixo")).toBe("price");
  });
});
