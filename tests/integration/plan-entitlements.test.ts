import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  criarCenario,
  criarOverride,
  criarSubscriptionTrial,
} from "@/test/fixtures";

// Mesma limitação de resolução de módulo já documentada nos outros testes
// de integração desta sessão (next-auth → next/server não resolve sob
// Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/auth";
import { criarPessoa as criarPessoaAction } from "@/app/app/clientes/actions";
import { criarImovel, atualizarImovel } from "@/app/app/imoveis/actions";
import {
  getLimit,
  FEATURE_PROPERTIES,
  FEATURE_CRM_CLIENTS,
  resolverEntitlementsOrganizacao,
  resolverEstadoAcessoOrganizacao,
} from "@/lib/entitlements";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

function autenticarComo(cenario: Cenario) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

// criarPessoa usa EstadoFormulario local ({sucesso, erro}), diferente do
// ActionState padrão ({success, message}) usado por criarImovel/atualizarImovel
// — dois estados iniciais distintos, nunca reaproveitados um pelo outro.
const ESTADO_INICIAL_PESSOA = { sucesso: false } as const;

function midiasJson(quantidade: number): string {
  return JSON.stringify(
    Array.from({ length: quantidade }, (_, i) => ({
      tipo: "FOTO" as const,
      url: `https://exemplo.test/foto-${i}.jpg`,
      ehCapa: i === 0,
    }))
  );
}

function dadosImovelBase(overrides: Record<string, string> = {}) {
  return formData({
    titulo: "Apartamento de teste",
    tipo: "Apartamento",
    finalidade: "SALE",
    status: "AVAILABLE",
    bairro: "Centro",
    cidade: "São Paulo",
    estado: "SP",
    midiasJson: midiasJson(0),
    ...overrides,
  });
}

describe("Fase P.9 — getLimit é override-aware", () => {
  let cenario: Cenario | undefined;
  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("T) sem override, usa o limite do plano", async () => {
    cenario = await criarCenario({ limites: { PROPERTIES: 20 } });
    expect(await getLimit(cenario.organization.id, FEATURE_PROPERTIES)).toBe(20);
  });

  test("override numérico substitui o limite do plano", async () => {
    cenario = await criarCenario({ limites: { PROPERTIES: 20 } });
    await criarOverride({ organizationId: cenario.organization.id, feature: FEATURE_PROPERTIES, limit: 80 });
    expect(await getLimit(cenario.organization.id, FEATURE_PROPERTIES)).toBe(80);
  });

  test("override explícito para ilimitado (limit=null) vence o limite numérico do plano", async () => {
    cenario = await criarCenario({ limites: { PROPERTIES: 20 } });
    await criarOverride({ organizationId: cenario.organization.id, feature: FEATURE_PROPERTIES, limit: null });
    expect(await getLimit(cenario.organization.id, FEATURE_PROPERTIES)).toBeNull();
  });

  test("override de uma organização nunca afeta outra (tenant isolation)", async () => {
    const cenarioB = await criarCenario({ limites: { PROPERTIES: 20 } });
    cenario = await criarCenario({ limites: { PROPERTIES: 20 } });
    await criarOverride({ organizationId: cenario.organization.id, feature: FEATURE_PROPERTIES, limit: 999 });
    expect(await getLimit(cenarioB.organization.id, FEATURE_PROPERTIES)).toBe(20);
    await cenarioB.destruir();
  });
});

describe("Fase P.9 — resolverEntitlementsOrganizacao", () => {
  let cenario: Cenario | undefined;
  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("U) sem override — preço/limites efetivos == padrão do plano", async () => {
    cenario = await criarCenario({
      priceMonthlyCents: 9900,
      limites: { PROPERTIES: 50, USERS: 1, PHOTOS_PER_PROPERTY: 10, CRM_CLIENTS: 500 },
    });
    const entitlements = await resolverEntitlementsOrganizacao(cenario.organization.id);
    expect(entitlements.priceMonthlyCentsPadrao).toBe(9900);
    expect(entitlements.priceMonthlyCentsEfetivo).toBe(9900);
    expect(entitlements.limites).toEqual({ PROPERTIES: 50, USERS: 1, PHOTOS_PER_PROPERTY: 10, CRM_CLIENTS: 500 });
  });

  test("com override de preço e de um limite — efetivo reflete os overrides, resto continua herdando do plano", async () => {
    cenario = await criarCenario({
      priceMonthlyCents: 9900,
      limites: { PROPERTIES: 50, USERS: 1, PHOTOS_PER_PROPERTY: 10, CRM_CLIENTS: 500 },
    });
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { priceMonthlyCentsOverride: 12900 },
    });
    await criarOverride({ organizationId: cenario.organization.id, feature: FEATURE_PROPERTIES, limit: 80 });

    const entitlements = await resolverEntitlementsOrganizacao(cenario.organization.id);
    expect(entitlements.priceMonthlyCentsPadrao).toBe(9900);
    expect(entitlements.priceMonthlyCentsEfetivo).toBe(12900);
    expect(entitlements.limites.PROPERTIES).toBe(80);
    expect(entitlements.limites.USERS).toBe(1);
  });
});

describe("Fase P.9 — resolverEstadoAcessoOrganizacao (trial)", () => {
  let cenario: Cenario | undefined;
  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("V) organização em plano pago nunca é bloqueada por trial", async () => {
    cenario = await criarCenario({ isTrial: false });
    const estado = await resolverEstadoAcessoOrganizacao(cenario.organization.id);
    expect(estado).toEqual({ bloqueado: false });
  });

  test("W) organização em trial ativo (currentPeriodEnd no futuro) não é bloqueada", async () => {
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    const agora = new Date("2026-06-15T12:00:00.000Z");
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-06-20T00:00:00.000Z"),
    });
    const estado = await resolverEstadoAcessoOrganizacao(cenario.organization.id, agora);
    expect(estado).toEqual({ bloqueado: false });
  });

  test("X) organização em trial expirado é bloqueada com TRIAL_EXPIRADO", async () => {
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    const agora = new Date("2026-06-15T12:00:00.000Z");
    const fimTrial = new Date("2026-06-10T00:00:00.000Z");
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date("2026-05-27T00:00:00.000Z"),
      currentPeriodEnd: fimTrial,
    });
    const estado = await resolverEstadoAcessoOrganizacao(cenario.organization.id, agora);
    expect(estado).toEqual({ bloqueado: true, motivo: "TRIAL_EXPIRADO", trialEndsAtISO: fimTrial.toISOString() });
  });

  test("Y) organização suspensa é bloqueada por SUSPENSA mesmo em trial ainda ativo", async () => {
    cenario = await criarCenario({ isTrial: true, trialDays: 14 });
    await prisma.organization.update({ where: { id: cenario.organization.id }, data: { active: false } });
    const agora = new Date("2026-06-15T12:00:00.000Z");
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-06-30T00:00:00.000Z"),
    });
    const estado = await resolverEstadoAcessoOrganizacao(cenario.organization.id, agora);
    expect(estado).toEqual({ bloqueado: true, motivo: "SUSPENSA" });
  });
});

describe("Fase P.9 — enforcement de fotos (PHOTOS_PER_PROPERTY, via criarImovel/atualizarImovel reais)", () => {
  let cenario: Cenario | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("Z) quantidade abaixo do limite é aceita", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties"], limites: { PHOTOS_PER_PROPERTY: 5 } });
    autenticarComo(cenario);
    const resultado = await criarImovel(ESTADO_INICIAL_ACAO, dadosImovelBase({ midiasJson: midiasJson(3) }));
    // criarImovel faz redirect() em caso de sucesso — mockado como no-op,
    // então "sucesso" aqui é simplesmente NÃO ter retornado um ActionState
    // de erro (redirect mockado não lança).
    expect(resultado?.success).not.toBe(false);
  });

  test("AA) quantidade EXATAMENTE no limite é aceita (nunca >=, sempre >)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties"], limites: { PHOTOS_PER_PROPERTY: 5 } });
    autenticarComo(cenario);
    const resultado = await criarImovel(ESTADO_INICIAL_ACAO, dadosImovelBase({ midiasJson: midiasJson(5) }));
    expect(resultado?.success).not.toBe(false);
  });

  test("AB) quantidade acima do limite é rejeitada com mensagem funcional", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties"], limites: { PHOTOS_PER_PROPERTY: 5 } });
    autenticarComo(cenario);
    const resultado = await criarImovel(ESTADO_INICIAL_ACAO, dadosImovelBase({ midiasJson: midiasJson(6) }));
    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain("5 fotos");

    const totalCriado = await prisma.property.count({ where: { organizationId: cenario.organization.id } });
    expect(totalCriado).toBe(0);
  });

  test("AC) limite null (ilimitado) nunca bloqueia", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties"], limites: {} });
    autenticarComo(cenario);
    const resultado = await criarImovel(ESTADO_INICIAL_ACAO, dadosImovelBase({ midiasJson: midiasJson(50) }));
    expect(resultado?.success).not.toBe(false);
  });

  test("AD) atualizarImovel também aplica o limite (replace de mídias)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties"], limites: { PHOTOS_PER_PROPERTY: 2 } });
    autenticarComo(cenario);
    await criarImovel(ESTADO_INICIAL_ACAO, dadosImovelBase({ midiasJson: midiasJson(1) }));
    const imovel = await prisma.property.findFirstOrThrow({ where: { organizationId: cenario.organization.id } });

    const resultadoOk = await atualizarImovel(imovel.id, ESTADO_INICIAL_ACAO, dadosImovelBase({ midiasJson: midiasJson(2) }));
    expect(resultadoOk?.success).not.toBe(false);

    const resultadoExcede = await atualizarImovel(
      imovel.id,
      ESTADO_INICIAL_ACAO,
      dadosImovelBase({ midiasJson: midiasJson(3) })
    );
    expect(resultadoExcede.success).toBe(false);

    // Redução de limite não apaga mídia já existente: a foto-1 continua lá
    // (a rejeição impede a TROCA, não desfaz o estado anterior).
    const midiasExistentes = await prisma.media.count({
      where: { propertyId: imovel.id, organizationId: cenario.organization.id },
    });
    expect(midiasExistentes).toBe(2);
  });
});

describe("Fase P.9 — enforcement de clientes CRM (CRM_CLIENTS, via criarPessoa real)", () => {
  let cenario: Cenario | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  // criarPessoaAction termina com redirect() no caminho de sucesso — mockado
  // como no-op (nunca lança), então o "sucesso" real é `undefined`
  // implícito (mesma limitação já documentada pra criarImovel/atualizarImovel
  // nesta sessão). `resultado?.sucesso !== false` é o jeito correto de
  // verificar sucesso aqui; `.sucesso === false`/`.erro` continuam
  // confiáveis pro caminho de ERRO, que retorna explicitamente sem
  // redirect.

  test("AE) abaixo do limite é aceito", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"], limites: { CRM_CLIENTS: 3 } });
    autenticarComo(cenario);
    const resultado = await criarPessoaAction(ESTADO_INICIAL_PESSOA, formData({ nome: "Cliente A", papel: "LEAD" }));
    expect(resultado?.sucesso).not.toBe(false);
  });

  test("AF) exatamente no limite é aceito, o próximo é rejeitado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"], limites: { CRM_CLIENTS: 1 } });
    autenticarComo(cenario);
    const primeiro = await criarPessoaAction(ESTADO_INICIAL_PESSOA, formData({ nome: "Cliente A", papel: "LEAD" }));
    expect(primeiro?.sucesso).not.toBe(false);

    const segundo = await criarPessoaAction(ESTADO_INICIAL_PESSOA, formData({ nome: "Cliente B", papel: "LEAD" }));
    expect(segundo.sucesso).toBe(false);
    expect(segundo.erro).toContain("1 clientes CRM");

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
  });

  test("AG) override de CRM_CLIENTS é respeitado pelo enforcement real", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"], limites: { CRM_CLIENTS: 1 } });
    await criarOverride({ organizationId: cenario.organization.id, feature: FEATURE_CRM_CLIENTS, limit: 2 });
    autenticarComo(cenario);
    await criarPessoaAction(ESTADO_INICIAL_PESSOA, formData({ nome: "Cliente A", papel: "LEAD" }));
    const segundo = await criarPessoaAction(ESTADO_INICIAL_PESSOA, formData({ nome: "Cliente B", papel: "LEAD" }));
    expect(segundo?.sucesso).not.toBe(false);
    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(2);
  });

  test("AH) tenant B nunca conta pro limite de A", async () => {
    const cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"], limites: { CRM_CLIENTS: 1 } });
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"], limites: { CRM_CLIENTS: 1 } });
    autenticarComo(cenarioB);
    await criarPessoaAction(ESTADO_INICIAL_PESSOA, formData({ nome: "Cliente de B", papel: "LEAD" }));

    autenticarComo(cenario);
    const resultado = await criarPessoaAction(ESTADO_INICIAL_PESSOA, formData({ nome: "Cliente de A", papel: "LEAD" }));
    expect(resultado?.sucesso).not.toBe(false);
    await cenarioB.destruir();
  });

  test("AI) concorrência — duas criações simultâneas no último slot nunca ultrapassam o limite (advisory lock real, Postgres)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"], limites: { CRM_CLIENTS: 1 } });
    autenticarComo(cenario);

    const [resultadoA, resultadoB] = await Promise.all([
      criarPessoaAction(ESTADO_INICIAL_PESSOA, formData({ nome: "Concorrente A", papel: "LEAD" })),
      criarPessoaAction(ESTADO_INICIAL_PESSOA, formData({ nome: "Concorrente B", papel: "LEAD" })),
    ]);

    // Exatamente UM dos dois retorna o erro explícito de limite (o outro
    // "sucesso" vira undefined pelo redirect mockado, ver nota acima) — a
    // prova definitiva de que a race foi serializada é a contagem real no
    // banco, nunca mais que 1.
    const falhas = [resultadoA, resultadoB].filter((r) => r?.sucesso === false);
    expect(falhas.length).toBe(1);
    expect(falhas[0]?.erro).toContain("1 clientes CRM");

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
  });

  test("AJ) limite null (ilimitado) nunca bloqueia", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"], limites: {} });
    autenticarComo(cenario);
    for (let i = 0; i < 5; i++) {
      const resultado = await criarPessoaAction(
        ESTADO_INICIAL_PESSOA,
        formData({ nome: `Cliente ${i}`, papel: "LEAD" })
      );
      expect(resultado?.sucesso).not.toBe(false);
    }
    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(5);
  });
});
