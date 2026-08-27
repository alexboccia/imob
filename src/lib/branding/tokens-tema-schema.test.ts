import { describe, test, expect } from "vitest";
import { tokensTemaSchema, parseTokensTemaSeguro } from "@/lib/branding/tokens-tema-schema";
import { CATALOGO_TEMAS } from "@/lib/branding/temas";

const TOKENS_VALIDOS = {
  primary: "oklch(0.55 0.18 255)",
  primaryHover: "oklch(0.47 0.18 255)",
  primaryLight: "oklch(0.93 0.036 255)",
  onPrimary: "oklch(1 0 0)",
  secondary: "oklch(0.96 0.02 255)",
  border: "oklch(0.875 0.027 255)",
  link: "oklch(0.55 0.18 255)",
};

describe("parseTokensTemaSeguro — único portão pra JSON virar CSS de verdade", () => {
  test("aceita um TokensTema completo e válido", () => {
    expect(parseTokensTemaSeguro(TOKENS_VALIDOS)).toEqual(TOKENS_VALIDOS);
  });

  test("aceita qualquer um dos 6 temas reais do catálogo fixo (mesmo shape)", () => {
    for (const tema of Object.values(CATALOGO_TEMAS)) {
      const tokens = {
        primary: tema.primary,
        primaryHover: tema.primaryHover,
        primaryLight: tema.primaryLight,
        onPrimary: tema.onPrimary,
        secondary: tema.secondary,
        border: tema.border,
        link: tema.link,
      };
      expect(parseTokensTemaSeguro(tokens)).toEqual(tokens);
    }
  });

  test.each(["primary", "primaryHover", "primaryLight", "onPrimary", "secondary", "border", "link"])(
    "rejeita quando falta a chave obrigatória: %s",
    (chave) => {
      const incompleto: Record<string, string> = { ...TOKENS_VALIDOS };
      delete incompleto[chave];
      expect(parseTokensTemaSeguro(incompleto)).toBeNull();
    }
  );

  test("rejeita chave extra desconhecida (.strict())", () => {
    expect(
      parseTokensTemaSeguro({ ...TOKENS_VALIDOS, cssArbitrario: "</style><script>alert(1)</script>" })
    ).toBeNull();
  });

  test("rejeita quando uma cor não está no formato oklch(...) — vetor de CSS injection", () => {
    expect(
      parseTokensTemaSeguro({
        ...TOKENS_VALIDOS,
        primary: "red; background:url(javascript:alert(1))",
      })
    ).toBeNull();
  });

  test("rejeita null/undefined/tipos primitivos/arrays", () => {
    for (const valor of [null, undefined, "string qualquer", 42, [], true]) {
      expect(parseTokensTemaSeguro(valor)).toBeNull();
    }
  });

  test("tokensTemaSchema.safeParse concorda com parseTokensTemaSeguro", () => {
    expect(tokensTemaSchema.safeParse(TOKENS_VALIDOS).success).toBe(true);
    expect(tokensTemaSchema.safeParse({}).success).toBe(false);
  });
});
