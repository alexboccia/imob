import { describe, test, expect } from "vitest";
import { interpretarPedidoFavoritos } from "@/lib/favoritos-pedido";
import { LIMITE_FAVORITOS } from "@/lib/favoritos";

describe("interpretarPedidoFavoritos", () => {
  test("pedido válido, sem repetição", () => {
    expect(interpretarPedidoFavoritos({ orgSlug: "org-a", ids: ["a", "b", "a"] })).toEqual({
      orgSlug: "org-a",
      ids: ["a", "b"],
    });
    expect(interpretarPedidoFavoritos({ orgSlug: "org-a", ids: [] })).toEqual({ orgSlug: "org-a", ids: [] });
  });

  test("até o teto passa; acima dele, recusa (não corta em silêncio)", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);
    expect(interpretarPedidoFavoritos({ orgSlug: "o", ids: ids(LIMITE_FAVORITOS) })?.ids).toHaveLength(
      LIMITE_FAVORITOS
    );
    expect(interpretarPedidoFavoritos({ orgSlug: "o", ids: ids(LIMITE_FAVORITOS + 1) })).toBeNull();
  });

  test.each([
    ["nulo", null],
    ["texto", "ids"],
    ["sem orgSlug", { ids: ["a"] }],
    ["orgSlug vazio", { orgSlug: "", ids: ["a"] }],
    ["ids não é lista", { orgSlug: "o", ids: "a" }],
    ["id não é texto", { orgSlug: "o", ids: [1] }],
    ["id com formato inválido", { orgSlug: "o", ids: ["a b"] }],
    ["campo extra (organizationId do navegador)", { orgSlug: "o", ids: ["a"], organizationId: "x" }],
  ])("recusa: %s", (_n, corpo) => {
    expect(interpretarPedidoFavoritos(corpo)).toBeNull();
  });
});
