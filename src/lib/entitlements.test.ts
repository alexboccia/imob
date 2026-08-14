import { describe, test, expect } from "vitest";
import {
  limiteExcedido,
  moduloHabilitado,
  limiteDoCatalogo,
  limiteEfetivoDoCatalogo,
  precoEfetivoCents,
  limiteFotosExcedido,
  resolverEstadoAcesso,
} from "@/lib/entitlements";

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

// -----------------------------------------------------------------------
// Fase P.9 — override, preço efetivo, limite de fotos, trial.
// -----------------------------------------------------------------------

describe("limiteEfetivoDoCatalogo", () => {
  const planLimits = [{ feature: "PROPERTIES", limit: 50 }];

  test("A) sem override -> usa o limite do plano", () => {
    expect(limiteEfetivoDoCatalogo([], planLimits, "PROPERTIES")).toBe(50);
  });

  test("B) override com valor numérico -> vence o plano", () => {
    const overrides = [{ feature: "PROPERTIES", limit: 80 }];
    expect(limiteEfetivoDoCatalogo(overrides, planLimits, "PROPERTIES")).toBe(80);
  });

  test("C) override presente com limit=null -> ilimitado explícito (nunca confundido com 'sem override')", () => {
    const overrides = [{ feature: "PROPERTIES", limit: null }];
    expect(limiteEfetivoDoCatalogo(overrides, planLimits, "PROPERTIES")).toBeNull();
  });

  test("D) override de OUTRA feature não interfere", () => {
    const overrides = [{ feature: "USERS", limit: 3 }];
    expect(limiteEfetivoDoCatalogo(overrides, planLimits, "PROPERTIES")).toBe(50);
  });

  test("E) sem override e sem limite no plano -> ilimitado (herda comportamento de limiteDoCatalogo)", () => {
    expect(limiteEfetivoDoCatalogo([], [], "CRM_CLIENTS")).toBeNull();
  });
});

describe("precoEfetivoCents", () => {
  test("F) sem override -> usa o preço do plano", () => {
    expect(precoEfetivoCents(null, 9900)).toBe(9900);
  });

  test("G) override numérico -> vence o plano", () => {
    expect(precoEfetivoCents(12900, 9900)).toBe(12900);
  });

  test("H) override zero é um valor válido (plano cortesia), nunca tratado como ausente", () => {
    expect(precoEfetivoCents(0, 9900)).toBe(0);
  });

  test("plano sem preço e sem override -> null", () => {
    expect(precoEfetivoCents(null, null)).toBeNull();
  });
});

describe("limiteFotosExcedido", () => {
  test("I) limite null -> nunca excede", () => {
    expect(limiteFotosExcedido(1000, null)).toBe(false);
  });

  test("J) quantidade abaixo do limite -> não excede", () => {
    expect(limiteFotosExcedido(4, 10)).toBe(false);
  });

  test("K) quantidade EXATAMENTE no limite -> não excede (diferente de limiteExcedido, que usa >=)", () => {
    expect(limiteFotosExcedido(10, 10)).toBe(false);
  });

  test("L) quantidade acima do limite -> excede", () => {
    expect(limiteFotosExcedido(11, 10)).toBe(true);
  });

  test("limite zero: 0 fotos é permitido, 1 já excede", () => {
    expect(limiteFotosExcedido(0, 0)).toBe(false);
    expect(limiteFotosExcedido(1, 0)).toBe(true);
  });
});

describe("resolverEstadoAcesso", () => {
  const agora = new Date("2026-06-15T12:00:00.000Z");

  test("M) organização suspensa -> bloqueada por SUSPENSA, mesmo em plano pago", () => {
    const resultado = resolverEstadoAcesso({ active: false, isTrial: false, trialEndsAt: null }, agora);
    expect(resultado).toEqual({ bloqueado: true, motivo: "SUSPENSA" });
  });

  test("N) suspensa E trial expirado -> SUSPENSA vence (nunca reporta os dois)", () => {
    const passado = new Date("2026-01-01T00:00:00.000Z");
    const resultado = resolverEstadoAcesso({ active: false, isTrial: true, trialEndsAt: passado }, agora);
    expect(resultado).toEqual({ bloqueado: true, motivo: "SUSPENSA" });
  });

  test("O) plano pago (isTrial=false) nunca é bloqueado por trial, mesmo com trialEndsAt no passado", () => {
    const passado = new Date("2026-01-01T00:00:00.000Z");
    const resultado = resolverEstadoAcesso({ active: true, isTrial: false, trialEndsAt: passado }, agora);
    expect(resultado).toEqual({ bloqueado: false });
  });

  test("P) trial ativo (agora antes do fim) -> não bloqueado", () => {
    const futuro = new Date("2026-06-20T12:00:00.000Z");
    const resultado = resolverEstadoAcesso({ active: true, isTrial: true, trialEndsAt: futuro }, agora);
    expect(resultado).toEqual({ bloqueado: false });
  });

  test("Q) boundary exato — agora === trialEndsAt ainda NÃO é expirado (só agora > fim bloqueia)", () => {
    const resultado = resolverEstadoAcesso({ active: true, isTrial: true, trialEndsAt: agora }, agora);
    expect(resultado).toEqual({ bloqueado: false });
  });

  test("R) trial expirado -> bloqueado com motivo TRIAL_EXPIRADO e a data preservada", () => {
    const passado = new Date("2026-06-10T00:00:00.000Z");
    const resultado = resolverEstadoAcesso({ active: true, isTrial: true, trialEndsAt: passado }, agora);
    expect(resultado).toEqual({
      bloqueado: true,
      motivo: "TRIAL_EXPIRADO",
      trialEndsAtISO: passado.toISOString(),
    });
  });

  // Correção pós-auditoria (achado MEDIUM, fail-open): S foi INVERTIDO —
  // ausência de período de trial válido agora BLOQUEIA (fail-closed),
  // nunca libera por ausência de dado. T1-T8 abaixo são o conjunto
  // explícito exigido pela correção; alguns coincidem conceitualmente com
  // M-R acima (mantidos como redundância deliberada, documentando o
  // requisito literal).
  test("S/T1) trial sem Subscription (trialEndsAt null) -> BLOQUEADO (fail-closed, nunca libera por ausência de dado)", () => {
    const resultado = resolverEstadoAcesso({ active: true, isTrial: true, trialEndsAt: null }, agora);
    expect(resultado).toEqual({ bloqueado: true, motivo: "TRIAL_EXPIRADO", trialEndsAtISO: null });
  });

  test("T2) trial com Subscription sem currentPeriodEnd válido -> BLOQUEADO (mesmo caminho de T1: trialEndsAt null)", () => {
    const resultado = resolverEstadoAcesso({ active: true, isTrial: true, trialEndsAt: null }, agora);
    expect(resultado.bloqueado).toBe(true);
    if (resultado.bloqueado) expect(resultado.motivo).toBe("TRIAL_EXPIRADO");
  });

  test("T3) trial ativo -> liberado", () => {
    const futuro = new Date("2026-06-20T12:00:00.000Z");
    expect(resolverEstadoAcesso({ active: true, isTrial: true, trialEndsAt: futuro }, agora)).toEqual({
      bloqueado: false,
    });
  });

  test("T4) boundary agora === end -> liberado", () => {
    expect(resolverEstadoAcesso({ active: true, isTrial: true, trialEndsAt: agora }, agora)).toEqual({
      bloqueado: false,
    });
  });

  test("T5) agora > end -> bloqueado", () => {
    const passado = new Date("2026-06-10T00:00:00.000Z");
    const resultado = resolverEstadoAcesso({ active: true, isTrial: true, trialEndsAt: passado }, agora);
    expect(resultado).toEqual({ bloqueado: true, motivo: "TRIAL_EXPIRADO", trialEndsAtISO: passado.toISOString() });
  });

  test("T6) plano pago sem Subscription -> liberado (fail-closed só se aplica a isTrial=true)", () => {
    const resultado = resolverEstadoAcesso({ active: true, isTrial: false, trialEndsAt: null }, agora);
    expect(resultado).toEqual({ bloqueado: false });
  });

  test("T7) plano pago com Subscription antiga expirada -> liberado", () => {
    const passado = new Date("2026-01-01T00:00:00.000Z");
    const resultado = resolverEstadoAcesso({ active: true, isTrial: false, trialEndsAt: passado }, agora);
    expect(resultado).toEqual({ bloqueado: false });
  });

  test("T8) suspensa + trial sem Subscription -> SUSPENSA vence (nunca reporta TRIAL_EXPIRADO)", () => {
    const resultado = resolverEstadoAcesso({ active: false, isTrial: true, trialEndsAt: null }, agora);
    expect(resultado).toEqual({ bloqueado: true, motivo: "SUSPENSA" });
  });
});
