import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma, prismaPlatform } from "@/lib/prisma";
import {
  criarCenario,
  criarPlano,
  criarOrganizacao,
  criarImovel,
  criarPessoa,
  criarPlatformOperator,
  destruirPlatformOperator,
  criarSubscriptionTrial,
} from "@/test/fixtures";

// requirePlatformOperator mora no MESMO módulo que `auth` aqui
// (@/lib/platform/auth.ts, diferente de @/lib/tenant.ts/@/lib/auth.ts no
// app) — um mock raso ({ auth: vi.fn() }) apagaria requirePlatformOperator
// inteiro, e importOriginal() puxa o next-auth real (mesma limitação de
// resolução de módulo — next-auth → next/server não resolve sob Vitest
// puro — já documentada nesta sessão). Solução: reimplementa
// requirePlatformOperator no mock, com a MESMA lógica real (session via
// auth() mockado + checagem real de PlatformOperator.active no Postgres),
// nunca inventando um atalho que puderia mascarar um bug de autorização.
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform/auth", () => ({
  auth: mockAuth,
  requirePlatformOperator: async () => {
    const { redirect } = await import("next/navigation");
    const { prisma } = await import("@/lib/prisma");
    const session = await mockAuth();
    if (!session?.user?.platformOperatorId) {
      redirect("/platform/login");
      throw new Error("NEXT_REDIRECT (mock): sem sessão/operador válido");
    }
    const operador = await prisma.platformOperator.findUnique({
      where: { id: session.user.platformOperatorId },
      select: { id: true, role: true, active: true },
    });
    if (!operador || !operador.active) {
      redirect("/platform/login");
      throw new Error("NEXT_REDIRECT (mock): sem sessão/operador válido");
    }
    return { id: operador.id, role: operador.role };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/platform/auth";
import { redirect } from "next/navigation";
import { atualizarPlano } from "@/app/platform/plans/[id]/actions";
import {
  alterarPlano,
  estenderTrial,
  atualizarOverrides,
} from "@/app/platform/organizations/[id]/actions";
import { criarOrganization } from "@/app/platform/organizations/nova/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { FEATURE_PROPERTIES, FEATURE_CRM_CLIENTS, resolverEstadoAcessoOrganizacao } from "@/lib/entitlements";

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

async function autenticarComoOperador(role: "SUPER_ADMIN" | "PLATFORM_ADMIN" = "SUPER_ADMIN") {
  const operador = await criarPlatformOperator({ role });
  vi.mocked(auth).mockResolvedValue({
    user: { platformOperatorId: operador.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return operador;
}

describe("Fase P.9 — atualizarPlano (editar Plan)", () => {
  let operadorId: string | undefined;
  let planoId: string | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (planoId) {
      await prisma.planLimit.deleteMany({ where: { planId: planoId } });
      await prisma.planModule.deleteMany({ where: { planId: planoId } });
      await prisma.plan.delete({ where: { id: planoId } });
    }
    if (operadorId) await destruirPlatformOperator(operadorId);
    operadorId = undefined;
    planoId = undefined;
  });

  test("T) atualiza preço/limites/trial/active e grava audit log PLAN_UPDATED", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const plano = await criarPlano({ priceMonthlyCents: 5000, limites: { PROPERTIES: 10 } });
    planoId = plano.id;

    const resultado = await atualizarPlano(
      plano.id,
      ESTADO_INICIAL_ACAO,
      formData({
        priceMonthlyCentsRaw: "129,90",
        isTrial: "false",
        trialDaysRaw: "",
        active: "true",
        PROPERTIES: "80",
        PHOTOS_PER_PROPERTY: "15",
        USERS: "3",
        CRM_CLIENTS: "1000",
      })
    );
    expect(resultado.success).toBe(true);

    const atualizado = await prisma.plan.findUniqueOrThrow({
      where: { id: plano.id },
      include: { planLimits: true },
    });
    expect(atualizado.priceMonthlyCents).toBe(12990);
    expect(atualizado.planLimits.find((l) => l.feature === "PROPERTIES")?.limit).toBe(80);
    expect(atualizado.planLimits.find((l) => l.feature === "CRM_CLIENTS")?.limit).toBe(1000);

    const log = await prisma.platformAuditLog.findFirst({
      where: { action: "PLAN_UPDATED", entityId: plano.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
  });

  test("U) limite vazio no formulário vira ilimitado (null)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const plano = await criarPlano({ limites: { PROPERTIES: 10 } });
    planoId = plano.id;

    await atualizarPlano(
      plano.id,
      ESTADO_INICIAL_ACAO,
      formData({
        priceMonthlyCentsRaw: "99,00",
        isTrial: "false",
        trialDaysRaw: "",
        active: "true",
        PROPERTIES: "",
        PHOTOS_PER_PROPERTY: "",
        USERS: "",
        CRM_CLIENTS: "",
      })
    );

    const limite = await prisma.planLimit.findUnique({
      where: { planId_feature: { planId: plano.id, feature: "PROPERTIES" } },
    });
    expect(limite?.limit).toBeNull();
  });

  test("V) sem sessão de platform operator, ação é recusada e nada muda", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(null as any);
    const plano = await criarPlano({ priceMonthlyCents: 5000 });
    planoId = plano.id;

    try {
      await atualizarPlano(
        plano.id,
        ESTADO_INICIAL_ACAO,
        formData({
          priceMonthlyCentsRaw: "999,00",
          isTrial: "false",
          trialDaysRaw: "",
          active: "true",
          PROPERTIES: "",
          PHOTOS_PER_PROPERTY: "",
          USERS: "",
          CRM_CLIENTS: "",
        })
      );
    } catch {
      // esperado: redirect() mockado não interrompe o fluxo como o real
      // faria (mesmo racional já estabelecido em property-interest.test.ts)
      // — o que importa é confirmar abaixo que redirect foi chamado e
      // nada mudou.
    }

    expect(redirect).toHaveBeenCalledWith("/platform/login");
    const inalterado = await prisma.plan.findUniqueOrThrow({ where: { id: plano.id } });
    expect(inalterado.priceMonthlyCents).toBe(5000);
  });
});

describe("Fase P.9 — atualizarOverrides", () => {
  let operadorId: string | undefined;
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    if (operadorId) await destruirPlatformOperator(operadorId);
    operadorId = undefined;
    cenario = undefined;
  });

  test("W) define override numérico, preço override e grava audit log", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ priceMonthlyCents: 9900, limites: { PROPERTIES: 50 } });

    const resultado = await atualizarOverrides(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({
        precoOverrideRaw: "129,00",
        PROPERTIES_modo: "PERSONALIZADO",
        PROPERTIES_valor: "80",
        PHOTOS_PER_PROPERTY_modo: "PADRAO",
        USERS_modo: "PADRAO",
        CRM_CLIENTS_modo: "PADRAO",
      })
    );
    expect(resultado.success).toBe(true);

    const organizacao = await prisma.organization.findUniqueOrThrow({
      where: { id: cenario.organization.id },
      include: { limitOverrides: true },
    });
    expect(organizacao.priceMonthlyCentsOverride).toBe(12900);
    expect(organizacao.limitOverrides.find((o) => o.feature === "PROPERTIES")?.limit).toBe(80);

    const log = await prisma.platformAuditLog.findFirst({
      where: { action: "PLAN_OVERRIDE_UPDATED", entityId: cenario.organization.id },
    });
    expect(log).not.toBeNull();
  });

  test("X) modo ILIMITADO grava override explícito com limit=null", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ limites: { PROPERTIES: 50 } });

    await atualizarOverrides(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({
        precoOverrideRaw: "",
        PROPERTIES_modo: "ILIMITADO",
        PHOTOS_PER_PROPERTY_modo: "PADRAO",
        USERS_modo: "PADRAO",
        CRM_CLIENTS_modo: "PADRAO",
      })
    );

    const override = await prisma.organizationLimitOverride.findFirst({
      where: { organizationId: cenario.organization.id, feature: "PROPERTIES" },
    });
    expect(override).not.toBeNull();
    expect(override?.limit).toBeNull();
  });

  test("Y) 'usar padrão do plano' REMOVE a linha de override (nunca copia o valor atual)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ limites: { PROPERTIES: 50 } });

    await atualizarOverrides(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({
        precoOverrideRaw: "",
        PROPERTIES_modo: "PERSONALIZADO",
        PROPERTIES_valor: "80",
        PHOTOS_PER_PROPERTY_modo: "PADRAO",
        USERS_modo: "PADRAO",
        CRM_CLIENTS_modo: "PADRAO",
      })
    );
    let override = await prisma.organizationLimitOverride.findFirst({
      where: { organizationId: cenario.organization.id, feature: "PROPERTIES" },
    });
    expect(override).not.toBeNull();

    await atualizarOverrides(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({
        precoOverrideRaw: "",
        PROPERTIES_modo: "PADRAO",
        PHOTOS_PER_PROPERTY_modo: "PADRAO",
        USERS_modo: "PADRAO",
        CRM_CLIENTS_modo: "PADRAO",
      })
    );
    override = await prisma.organizationLimitOverride.findFirst({
      where: { organizationId: cenario.organization.id, feature: "PROPERTIES" },
    });
    expect(override).toBeNull();
  });

  test("Z) override de uma organização nunca afeta outra (tenant isolation)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ limites: { PROPERTIES: 50 } });
    const cenarioB = await criarCenario({ limites: { PROPERTIES: 50 } });

    await atualizarOverrides(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({
        precoOverrideRaw: "",
        PROPERTIES_modo: "PERSONALIZADO",
        PROPERTIES_valor: "999",
        PHOTOS_PER_PROPERTY_modo: "PADRAO",
        USERS_modo: "PADRAO",
        CRM_CLIENTS_modo: "PADRAO",
      })
    );

    const overrideB = await prisma.organizationLimitOverride.findFirst({
      where: { organizationId: cenarioB.organization.id, feature: FEATURE_PROPERTIES },
    });
    expect(overrideB).toBeNull();
    await cenarioB.destruir();
  });
});

describe("Fase P.9 — estenderTrial", () => {
  let operadorId: string | undefined;
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    if (operadorId) await destruirPlatformOperator(operadorId);
    operadorId = undefined;
    cenario = undefined;
  });

  test("AA) +7 dias estende a partir do fim atual quando o trial ainda não expirou", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    const fimAtual = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: fimAtual,
    });

    const resultado = await estenderTrial(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ modo: "DIAS", dias: "7" })
    );
    expect(resultado.success).toBe(true);

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, status: "TRIALING" },
    });
    const esperado = fimAtual.getTime() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(subscription.currentPeriodEnd!.getTime() - esperado)).toBeLessThan(2000);
  });

  test("AB) +7 dias em trial JÁ EXPIRADO reativa a partir de agora (nunca soma sobre uma data passada)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    const fimExpirado = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date(Date.now() - 44 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: fimExpirado,
    });

    await estenderTrial(cenario.organization.id, ESTADO_INICIAL_ACAO, formData({ modo: "DIAS", dias: "7" }));

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, status: "TRIALING" },
    });
    // Base = agora (não fimExpirado, que já passou) — resultado deve estar
    // ~7 dias no futuro, nunca ~23 dias no passado.
    expect(subscription.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
  });

  test("AC) definir data recusa data no passado", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    const dataPassada = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const resultado = await estenderTrial(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ modo: "DATA", data: dataPassada })
    );
    expect(resultado.success).toBe(false);
  });

  test("AD) organização em plano pago (não-trial) não pode ter o trial estendido", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: false });

    const resultado = await estenderTrial(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ modo: "DIAS", dias: "7" })
    );
    expect(resultado.success).toBe(false);
  });

  test("AE) grava audit log TRIAL_EXTENDED", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    await estenderTrial(cenario.organization.id, ESTADO_INICIAL_ACAO, formData({ modo: "DIAS", dias: "14" }));

    const log = await prisma.platformAuditLog.findFirst({
      where: { action: "TRIAL_EXTENDED", entityId: cenario.organization.id },
    });
    expect(log).not.toBeNull();
  });
});

describe("Fase P.9 — alterarPlano (upgrade/downgrade)", () => {
  let operadorId: string | undefined;
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;
  let planoDestino: { id: string } | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    if (planoDestino) {
      await prisma.planLimit.deleteMany({ where: { planId: planoDestino.id } });
      await prisma.planModule.deleteMany({ where: { planId: planoDestino.id } });
      await prisma.plan.delete({ where: { id: planoDestino.id } });
    }
    if (operadorId) await destruirPlatformOperator(operadorId);
    operadorId = undefined;
    cenario = undefined;
    planoDestino = undefined;
  });

  test("AF) STARTER→BASIC: muda planId, preserva Organization/dados, Subscription de trial permanece intocada (histórico factual)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: true, trialDays: 14, modulos: ["core", "properties"] });
    const trialInicio = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const trialFim = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000);
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: trialInicio,
      currentPeriodEnd: trialFim,
    });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    planoDestino = await criarPlano({ limites: { PROPERTIES: 50, USERS: 1, CRM_CLIENTS: 500 } });

    const resultado = await alterarPlano(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ planId: planoDestino.id })
    );
    expect(resultado.success).toBe(true);

    const organizacao = await prisma.organization.findUniqueOrThrow({ where: { id: cenario.organization.id } });
    expect(organizacao.id).toBe(cenario.organization.id);
    expect(organizacao.planId).toBe(planoDestino.id);

    // Dados intocados — mesmos ids, nenhuma cópia/recriação.
    const imovelDepois = await prisma.property.findUnique({
      where: { id: imovel.id, organizationId: cenario.organization.id },
    });
    expect(imovelDepois?.id).toBe(imovel.id);
    const pessoaDepois = await prisma.person.findUnique({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(pessoaDepois?.id).toBe(pessoa.id);

    // Subscription de trial preservada, sem mutação — histórico factual.
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, status: "TRIALING" },
    });
    expect(subscription.currentPeriodStart!.getTime()).toBe(trialInicio.getTime());
    expect(subscription.currentPeriodEnd!.getTime()).toBe(trialFim.getTime());

    const log = await prisma.platformAuditLog.findFirst({
      where: { action: "PLAN_CHANGED", entityId: cenario.organization.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
  });

  test("AG) mesmo plano de destino é no-op", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario();
    const resultado = await alterarPlano(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ planId: cenario.plano.id })
    );
    expect(resultado.success).toBe(true);
    expect(resultado.message).toContain("já está");
  });

  test("AH) plano de destino inativo é recusado", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario();
    planoDestino = await criarPlano({ active: false });

    const resultado = await alterarPlano(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ planId: planoDestino.id })
    );
    expect(resultado.success).toBe(false);

    const organizacao = await prisma.organization.findUniqueOrThrow({ where: { id: cenario.organization.id } });
    expect(organizacao.planId).toBe(cenario.plano.id);
  });

  test("AI) downgrade bloqueado quando uso atual excede o novo limite (imóveis)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ limites: { PROPERTIES: 100 } });
    await criarImovel({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });

    planoDestino = await criarPlano({ limites: { PROPERTIES: 2 } });

    const resultado = await alterarPlano(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ planId: planoDestino.id })
    );
    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain("PROPERTIES");

    const organizacao = await prisma.organization.findUniqueOrThrow({ where: { id: cenario.organization.id } });
    expect(organizacao.planId).toBe(cenario.plano.id);
    // Nada foi apagado.
    const total = await prisma.property.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(3);
  });

  test("AJ) downgrade permitido quando o uso atual cabe no novo limite", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ limites: { PROPERTIES: 100 } });
    await criarImovel({ organizationId: cenario.organization.id });

    planoDestino = await criarPlano({ limites: { PROPERTIES: 10 } });

    const resultado = await alterarPlano(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ planId: planoDestino.id })
    );
    expect(resultado.success).toBe(true);
  });

  test("AK) upgrade nunca é bloqueado pelo guard de downgrade (limite só aumenta)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ limites: { PROPERTIES: 2 } });
    await criarImovel({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });

    planoDestino = await criarPlano({ limites: { PROPERTIES: 100 } });

    const resultado = await alterarPlano(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ planId: planoDestino.id })
    );
    expect(resultado.success).toBe(true);
  });

  test("AL) override de organização sobrevive à troca de plano (sem planId na tabela)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ limites: { CRM_CLIENTS: 10 } });
    await prisma.organizationLimitOverride.create({
      data: { organizationId: cenario.organization.id, feature: FEATURE_CRM_CLIENTS, limit: 999 },
    });

    planoDestino = await criarPlano({ limites: { CRM_CLIENTS: 5 } });
    await alterarPlano(cenario.organization.id, ESTADO_INICIAL_ACAO, formData({ planId: planoDestino.id }));

    const override = await prisma.organizationLimitOverride.findFirst({
      where: { organizationId: cenario.organization.id, feature: FEATURE_CRM_CLIENTS },
    });
    expect(override?.limit).toBe(999);
  });

  // Correção pós-auditoria (achado MEDIUM, fail-open) — T9-T16: mover uma
  // organização para um plano isTrial=true através de alterarPlano agora
  // garante atomicamente um período de trial válido.

  test("T9) BASIC→STARTER cria uma Subscription TRIALING válida com currentPeriodEnd = agora + trialDays", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: false });
    planoDestino = await criarPlano({ isTrial: true, trialDays: 14 });

    const resultado = await alterarPlano(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ planId: planoDestino.id })
    );
    expect(resultado.success).toBe(true);

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, status: "TRIALING" },
    });
    const diffDias = Math.round(
      (subscription.currentPeriodEnd!.getTime() - subscription.currentPeriodStart!.getTime()) /
        (24 * 60 * 60 * 1000)
    );
    expect(diffDias).toBe(14);

    // T10 (atomicidade): planId E Subscription aparecem juntos — nunca um
    // sem o outro (garantido estruturalmente pela mesma transação).
    const organizacao = await prisma.organization.findUniqueOrThrow({ where: { id: cenario.organization.id } });
    expect(organizacao.planId).toBe(planoDestino.id);

    // Regressão do fail-closed: a organização agora tem acesso liberado
    // (trial válido), nunca bloqueada por ausência de Subscription.
    const estadoAcesso = await resolverEstadoAcessoOrganizacao(cenario.organization.id);
    expect(estadoAcesso).toEqual({ bloqueado: false });
  });

  test("T11) organização já com trial VÁLIDO no plano de destino não gera uma segunda Subscription", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: false });
    planoDestino = await criarPlano({ isTrial: true, trialDays: 14 });
    // Trial válido pré-existente pra ESTE plano de destino (ex: a
    // organização já tinha sido Starter antes, saiu, e está voltando).
    const trialExistente = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: planoDestino.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialExistente,
    });

    await alterarPlano(cenario.organization.id, ESTADO_INICIAL_ACAO, formData({ planId: planoDestino.id }));

    const total = await prisma.subscription.count({
      where: { organizationId: cenario.organization.id, status: "TRIALING" },
    });
    expect(total).toBe(1);
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, status: "TRIALING" },
    });
    // Reaproveitada, não recriada — mesma data de fim original.
    expect(subscription.currentPeriodEnd!.getTime()).toBe(trialExistente.getTime());
  });

  test("T12) same-plan (já é o mesmo plano trial) nunca reinicia o trial", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    const fimOriginal = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: fimOriginal,
    });

    const resultado = await alterarPlano(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ planId: cenario.plano.id })
    );
    expect(resultado.message).toContain("já está");

    const total = await prisma.subscription.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: cenario.organization.id },
    });
    expect(subscription.currentPeriodEnd!.getTime()).toBe(fimOriginal.getTime());
  });

  test("T13) STARTER expirado + same-plan não reativa (no-op de verdade, nunca toca Subscription)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    const fimExpirado = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: fimExpirado,
    });

    await alterarPlano(cenario.organization.id, ESTADO_INICIAL_ACAO, formData({ planId: cenario.plano.id }));

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: cenario.organization.id },
    });
    expect(subscription.currentPeriodEnd!.getTime()).toBe(fimExpirado.getTime());
    const estadoAcesso = await resolverEstadoAcessoOrganizacao(cenario.organization.id);
    expect(estadoAcesso.bloqueado).toBe(true);
  });

  test("T15/T16) STARTER→BASIC continua liberando acesso, com os mesmos IDs preservados", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    // Trial JÁ EXPIRADO — a organização estaria bloqueada se continuasse Starter.
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    });
    planoDestino = await criarPlano({ isTrial: false });

    const idAntes = cenario.organization.id;
    const resultado = await alterarPlano(
      cenario.organization.id,
      ESTADO_INICIAL_ACAO,
      formData({ planId: planoDestino.id })
    );
    expect(resultado.success).toBe(true);

    const organizacao = await prisma.organization.findUniqueOrThrow({ where: { id: idAntes } });
    expect(organizacao.id).toBe(idAntes);
    expect(organizacao.planId).toBe(planoDestino.id);

    const estadoAcesso = await resolverEstadoAcessoOrganizacao(idAntes);
    expect(estadoAcesso).toEqual({ bloqueado: false });
  });
});

describe("Fase P.9 — atualizarPlano isTrial false→true guard (correção pós-auditoria)", () => {
  let operadorId: string | undefined;
  let planoId: string | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (planoId) {
      await prismaPlatform.subscription.deleteMany({ where: { planId: planoId } });
      await prisma.organization.deleteMany({ where: { planId: planoId } });
      await prisma.planLimit.deleteMany({ where: { planId: planoId } });
      await prisma.planModule.deleteMany({ where: { planId: planoId } });
      await prisma.plan.delete({ where: { id: planoId } });
    }
    if (operadorId) await destruirPlatformOperator(operadorId);
    operadorId = undefined;
    planoId = undefined;
  });

  test("T17) plano SEM organizações: false→true permitido", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const plano = await criarPlano({ isTrial: false });
    planoId = plano.id;

    const resultado = await atualizarPlano(
      plano.id,
      ESTADO_INICIAL_ACAO,
      formData({
        priceMonthlyCentsRaw: "0",
        isTrial: "true",
        trialDaysRaw: "14",
        active: "true",
        PROPERTIES: "10",
        PHOTOS_PER_PROPERTY: "5",
        USERS: "1",
        CRM_CLIENTS: "100",
      })
    );
    expect(resultado.success).toBe(true);
    const atualizado = await prisma.plan.findUniqueOrThrow({ where: { id: plano.id } });
    expect(atualizado.isTrial).toBe(true);
  });

  test("T18) plano COM organização vinculada: false→true rejeitado, plano não muda", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const plano = await criarPlano({ isTrial: false });
    planoId = plano.id;
    await criarOrganizacao({ planId: plano.id });

    const resultado = await atualizarPlano(
      plano.id,
      ESTADO_INICIAL_ACAO,
      formData({
        priceMonthlyCentsRaw: "0",
        isTrial: "true",
        trialDaysRaw: "14",
        active: "true",
        PROPERTIES: "10",
        PHOTOS_PER_PROPERTY: "5",
        USERS: "1",
        CRM_CLIENTS: "100",
      })
    );
    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain("já possui organizações");

    const inalterado = await prisma.plan.findUniqueOrThrow({ where: { id: plano.id } });
    expect(inalterado.isTrial).toBe(false);
  });

  test("T19) mudar trialDays de um plano trial não altera Subscription de organizações já em trial", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const plano = await criarPlano({ isTrial: true, trialDays: 14 });
    planoId = plano.id;
    const { id: organizationId } = await criarOrganizacao({ planId: plano.id });
    const fimOriginal = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await criarSubscriptionTrial({
      organizationId,
      planId: plano.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: fimOriginal,
    });

    await atualizarPlano(
      plano.id,
      ESTADO_INICIAL_ACAO,
      formData({
        priceMonthlyCentsRaw: "0",
        isTrial: "true",
        trialDaysRaw: "30",
        active: "true",
        PROPERTIES: "10",
        PHOTOS_PER_PROPERTY: "5",
        USERS: "1",
        CRM_CLIENTS: "100",
      })
    );

    const planoAtualizado = await prisma.plan.findUniqueOrThrow({ where: { id: plano.id } });
    expect(planoAtualizado.trialDays).toBe(30);

    const subscription = await prisma.subscription.findFirstOrThrow({ where: { organizationId } });
    expect(subscription.currentPeriodEnd!.getTime()).toBe(fimOriginal.getTime());
  });
});

describe("Fase P.9 — criarOrganization com plano STARTER cria trial server-side", () => {
  let operadorId: string | undefined;
  let organizationId: string | undefined;
  let userId: string | undefined;
  let planoId: string | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (organizationId) {
      await prisma.subscription.deleteMany({ where: { organizationId } });
      await prisma.ownerInviteToken.deleteMany({ where: { organizationId } });
      await prisma.organizationMember.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (planoId) {
      await prisma.planLimit.deleteMany({ where: { planId: planoId } });
      await prisma.planModule.deleteMany({ where: { planId: planoId } });
      await prisma.plan.delete({ where: { id: planoId } });
    }
    if (operadorId) await destruirPlatformOperator(operadorId);
    operadorId = undefined;
    organizationId = undefined;
    userId = undefined;
    planoId = undefined;
  });

  test("AM) organização criada com plano isTrial gera Subscription TRIALING com currentPeriodEnd = agora + trialDays (server-side, nunca do formulário)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const plano = await criarPlano({ isTrial: true, trialDays: 14, modulos: ["core", "properties", "crm"] });
    planoId = plano.id;

    const slug = `org-teste-starter-${Date.now()}`;
    const resultado = await criarOrganization(
      { success: false },
      formData({
        name: "Organização Trial de Teste",
        slug,
        planId: plano.id,
        responsavelNome: "Responsável Teste",
        responsavelEmail: `responsavel-${Date.now()}@e2e.test`,
      })
    );
    expect(resultado.success).toBe(true);

    const organizacao = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    organizationId = organizacao.id;
    userId = (
      await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: organizacao.id } })
    ).userId;

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: organizacao.id, status: "TRIALING" },
    });
    const diffDias = Math.round(
      (subscription.currentPeriodEnd!.getTime() - subscription.currentPeriodStart!.getTime()) /
        (24 * 60 * 60 * 1000)
    );
    expect(diffDias).toBe(14);
  });

  test("AN) organização criada com plano PAGO (isTrial=false) não gera nenhuma Subscription", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const plano = await criarPlano({ isTrial: false, modulos: ["core", "properties"] });
    planoId = plano.id;

    const slug = `org-teste-pago-${Date.now()}`;
    await criarOrganization(
      { success: false },
      formData({
        name: "Organização Paga de Teste",
        slug,
        planId: plano.id,
        responsavelNome: "Responsável Teste",
        responsavelEmail: `responsavel-pago-${Date.now()}@e2e.test`,
      })
    );

    const organizacao = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    organizationId = organizacao.id;
    userId = (
      await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: organizacao.id } })
    ).userId;

    const total = await prisma.subscription.count({ where: { organizationId: organizacao.id } });
    expect(total).toBe(0);
  });
});

