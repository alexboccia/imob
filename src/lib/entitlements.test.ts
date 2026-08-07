import { describe, test, expect } from "vitest";
import { limiteExcedido, moduloHabilitado, limiteDoCatalogo } from "@/lib/entitlements";

// Só a lógica pura (sem Prisma) — hasModule/getLimit/verificarLimite* exigem
// banco e são cobertos em tests/integration.

describe("limiteExcedido", () => {
  test("limite null significa ilimitado, nunca excede", () => {
    expect(limiteExcedido(0, null)).toBe(false);
    expect(limiteExcedido(1_000_000, null)).toBe(false);
  });

  test("total abaixo do limite não excede", () => {
    expect(limiteExcedido(3, 20)).toBe(false);
  });

  test("total igual ao limite já conta como excedido (limite é o teto, não o próximo permitido)", () => {
    expect(limiteExcedido(20, 20)).toBe(true);
  });

  test("total acima do limite excede", () => {
    expect(limiteExcedido(21, 20)).toBe(true);
  });

  test("limite zero bloqueia qualquer criação", () => {
    expect(limiteExcedido(0, 0)).toBe(true);
  });
});

describe("moduloHabilitado", () => {
  const planModulesBasico = [
    { module: { code: "core" }, enabled: true },
    { module: { code: "properties" }, enabled: true },
    { module: { code: "crm" }, enabled: false },
  ];

  test("módulo presente e habilitado retorna true", () => {
    expect(moduloHabilitado(planModulesBasico, "properties")).toBe(true);
  });

  test("módulo presente mas desabilitado retorna false", () => {
    expect(moduloHabilitado(planModulesBasico, "crm")).toBe(false);
  });

  test("módulo ausente do plano retorna false (não lança erro)", () => {
    expect(moduloHabilitado(planModulesBasico, "ia")).toBe(false);
  });
});

describe("limiteDoCatalogo", () => {
  const planLimitsPro = [
    { feature: "PROPERTIES", limit: 100 },
    { feature: "USERS", limit: 10 },
  ];

  test("retorna o limite configurado para a feature", () => {
    expect(limiteDoCatalogo(planLimitsPro, "PROPERTIES")).toBe(100);
  });

  test("feature ausente do catálogo do plano é tratada como ilimitada (null)", () => {
    expect(limiteDoCatalogo(planLimitsPro, "PHOTOS_PER_PROPERTY")).toBe(null);
  });

  test("limit explicitamente null no catálogo (plano Premium) é ilimitado", () => {
    const planLimitsPremium = [{ feature: "PROPERTIES", limit: null }];
    expect(limiteDoCatalogo(planLimitsPremium, "PROPERTIES")).toBe(null);
  });
});
