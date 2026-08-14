import { describe, test, expect } from "vitest";
import { centavosDeReais, reaisDeCentavos, parseLimiteForm, editarPlanoSchema } from "@/lib/plan-schema";

describe("centavosDeReais", () => {
  test("A) valor inteiro sem vírgula", () => {
    expect(centavosDeReais("99")).toBe(9900);
  });

  test("B) valor com vírgula decimal (pt-BR)", () => {
    expect(centavosDeReais("99,90")).toBe(9990);
  });

  test("C) valor com ponto de milhar e vírgula decimal", () => {
    expect(centavosDeReais("1.234,50")).toBe(123450);
  });

  test("D) formato é sempre pt-BR — ponto é separador de milhar, nunca decimal (\"99.90\" = 9990 reais, não 99,90)", () => {
    expect(centavosDeReais("99.90")).toBe(999000);
  });

  test("E) uma casa decimal só -> completa com zero (99,9 = 99,90)", () => {
    expect(centavosDeReais("99,9")).toBe(9990);
  });

  test("F) string vazia -> null (sem preço definido)", () => {
    expect(centavosDeReais("")).toBeNull();
    expect(centavosDeReais("   ")).toBeNull();
  });

  test("G) valor não numérico -> null (nunca adivinha)", () => {
    expect(centavosDeReais("abc")).toBeNull();
    expect(centavosDeReais("99,999")).toBeNull();
  });

  test("H) zero é um valor válido (plano gratuito)", () => {
    expect(centavosDeReais("0")).toBe(0);
  });

  test("nunca produz erro de ponto flutuante (99,99 -> exatamente 9999, não 9998)", () => {
    expect(centavosDeReais("99,99")).toBe(9999);
  });
});

describe("reaisDeCentavos", () => {
  test("I) formata em pt-BR com duas casas", () => {
    expect(reaisDeCentavos(9900)).toBe("99,00");
  });

  test("J) null -> string vazia", () => {
    expect(reaisDeCentavos(null)).toBe("");
  });

  test("ida e volta (round-trip) preserva o valor", () => {
    expect(centavosDeReais(reaisDeCentavos(12345))).toBe(12345);
  });
});

describe("parseLimiteForm", () => {
  test("K) string vazia -> ilimitado (null)", () => {
    expect(parseLimiteForm("")).toEqual({ ok: true, valor: null });
    expect(parseLimiteForm("   ")).toEqual({ ok: true, valor: null });
  });

  test("L) inteiro válido", () => {
    expect(parseLimiteForm("50")).toEqual({ ok: true, valor: 50 });
  });

  test("M) zero é um valor válido (plano com limite zero)", () => {
    expect(parseLimiteForm("0")).toEqual({ ok: true, valor: 0 });
  });

  test("N) negativo é inválido", () => {
    expect(parseLimiteForm("-5")).toEqual({ ok: false });
  });

  test("O) decimal é inválido", () => {
    expect(parseLimiteForm("5.5")).toEqual({ ok: false });
  });

  test("texto não numérico é inválido", () => {
    expect(parseLimiteForm("abc")).toEqual({ ok: false });
  });
});

describe("editarPlanoSchema", () => {
  const base = {
    priceMonthlyCentsRaw: "99,00",
    isTrial: "false" as const,
    trialDaysRaw: "",
    active: "true" as const,
    PROPERTIES: "50",
    PHOTOS_PER_PROPERTY: "10",
    USERS: "1",
    CRM_CLIENTS: "500",
  };

  test("P) dados válidos (plano pago) -> parseado corretamente, trialDays sempre null quando isTrial=false", () => {
    const resultado = editarPlanoSchema.safeParse(base);
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).toEqual({
        priceMonthlyCents: 9900,
        isTrial: false,
        trialDays: null,
        active: true,
        limites: { PROPERTIES: 50, PHOTOS_PER_PROPERTY: 10, USERS: 1, CRM_CLIENTS: 500 },
      });
    }
  });

  test("Q) isTrial=true exige trialDaysRaw > 0", () => {
    const semTrialDays = editarPlanoSchema.safeParse({ ...base, isTrial: "true", trialDaysRaw: "" });
    expect(semTrialDays.success).toBe(false);

    const comTrialDays = editarPlanoSchema.safeParse({ ...base, isTrial: "true", trialDaysRaw: "14" });
    expect(comTrialDays.success).toBe(true);
    if (comTrialDays.success) {
      expect(comTrialDays.data.isTrial).toBe(true);
      expect(comTrialDays.data.trialDays).toBe(14);
    }
  });

  test("R) trialDaysRaw=0 é rejeitado quando isTrial=true (precisa ser > 0)", () => {
    const resultado = editarPlanoSchema.safeParse({ ...base, isTrial: "true", trialDaysRaw: "0" });
    expect(resultado.success).toBe(false);
  });

  test("S) limite com texto vazio vira ilimitado (null) no resultado", () => {
    const resultado = editarPlanoSchema.safeParse({ ...base, CRM_CLIENTS: "" });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.limites.CRM_CLIENTS).toBeNull();
  });

  test("preço inválido é rejeitado", () => {
    const resultado = editarPlanoSchema.safeParse({ ...base, priceMonthlyCentsRaw: "abc" });
    expect(resultado.success).toBe(false);
  });

  test("limite negativo é rejeitado", () => {
    const resultado = editarPlanoSchema.safeParse({ ...base, PROPERTIES: "-1" });
    expect(resultado.success).toBe(false);
  });
});
