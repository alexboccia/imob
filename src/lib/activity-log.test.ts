import { describe, test, expect } from "vitest";
import { diffAuditavel } from "@/lib/activity-log";

describe("diffAuditavel", () => {
  test("campos sem mudança são omitidos do resultado", () => {
    const resultado = diffAuditavel(
      { price: 100, title: "Casa" },
      { price: 100, title: "Casa" },
      ["price", "title"]
    );
    expect(resultado).toEqual({});
  });

  test("só o campo que mudou aparece, com sufixo Antes/Depois", () => {
    const resultado = diffAuditavel({ price: 100, title: "Casa" }, { price: 200, title: "Casa" }, [
      "price",
      "title",
    ]);
    expect(resultado).toEqual({ priceAntes: 100, priceDepois: 200 });
  });

  test("múltiplos campos alterados aparecem todos", () => {
    const resultado = diffAuditavel(
      { price: 100, status: "DRAFT" },
      { price: 200, status: "AVAILABLE" },
      ["price", "status"]
    );
    expect(resultado).toEqual({
      priceAntes: 100,
      priceDepois: 200,
      statusAntes: "DRAFT",
      statusDepois: "AVAILABLE",
    });
  });

  test("campo fora da allowlist nunca aparece, mesmo mudando", () => {
    const resultado = diffAuditavel(
      { price: 100, segredo: "a" },
      { price: 100, segredo: "b" },
      ["price"]
    );
    expect(resultado).toEqual({});
    expect(resultado.segredoAntes).toBeUndefined();
  });

  test("null vira null (nunca undefined, nunca a string 'null')", () => {
    const resultado = diffAuditavel(
      { responsibleMemberId: null as string | null },
      { responsibleMemberId: "member-1" },
      ["responsibleMemberId"]
    );
    expect(resultado.responsibleMemberIdAntes).toBeNull();
    expect(resultado.responsibleMemberIdDepois).toBe("member-1");
  });

  test("Date vira string ISO", () => {
    const antes = new Date("2026-01-01T00:00:00.000Z");
    const depois = new Date("2026-02-01T00:00:00.000Z");
    const resultado = diffAuditavel({ archivedAt: antes }, { archivedAt: depois }, ["archivedAt"]);
    expect(resultado.archivedAtAntes).toBe("2026-01-01T00:00:00.000Z");
    expect(resultado.archivedAtDepois).toBe("2026-02-01T00:00:00.000Z");
  });

  test("nenhum campo na allowlist é um no-op seguro (objeto vazio)", () => {
    expect(diffAuditavel({ a: 1 }, { a: 2 }, [])).toEqual({});
  });

  // Bug real encontrado escrevendo os testes de integração desta fase:
  // Prisma.Decimal (o tipo de `Property.price`) nunca é `===` entre duas
  // instâncias, mesmo com o MESMO valor numérico — comparar os valores
  // crus (antes da correção) marcava toda edição como "preço mudou",
  // mesmo sem mudança real.
  class DecimalFalso {
    constructor(private valor: string) {}
    toString() {
      return this.valor;
    }
  }
  test("dois objetos 'tipo Decimal' com o MESMO valor numérico, instâncias diferentes: NÃO é tratado como mudança", () => {
    const resultado = diffAuditavel(
      { price: new DecimalFalso("300000") },
      { price: new DecimalFalso("300000") },
      ["price"]
    );
    expect(resultado).toEqual({});
  });

  test("dois objetos 'tipo Decimal' com valor DIFERENTE: é tratado como mudança, valores como string", () => {
    const resultado = diffAuditavel(
      { price: new DecimalFalso("300000") },
      { price: new DecimalFalso("500000") },
      ["price"]
    );
    expect(resultado).toEqual({ priceAntes: "300000", priceDepois: "500000" });
  });
});
