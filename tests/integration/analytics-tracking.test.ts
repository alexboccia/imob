import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import { registrarEventoAnalytics } from "@/lib/analytics-tracking";
import { buscarAnalyticsComercial } from "@/lib/analytics-comercial";
import { JANELA_DEDUP_MS, calcularVisitorHash } from "@/lib/analytics-eventos";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) {
    const cenario = cenarios.pop()!;
    await prisma.propertyAnalyticsEvent.deleteMany({
      where: { organizationId: cenario.organization.id },
    });
    await cenario.destruir();
  }
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

const VISITANTE_A = "3f8a1c2e-5b6d-4a7f-9c1e-2d3b4a5c6d7e";
const VISITANTE_B = "11111111-2222-4333-8444-555555555555";
const AGORA = new Date("2026-06-15T12:00:00.000Z");

async function eventosDe(organizationId: string) {
  return prisma.propertyAnalyticsEvent.findMany({
    where: { organizationId },
    select: { type: true, propertyId: true, placement: true, visitorHash: true, occurredAt: true },
  });
}

describe("registro de evento", () => {
  test("view de um visitante num imóvel é persistida com hash escopado (nunca o id cru)", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    const r = await registrarEventoAnalytics({
      organizationId,
      propertyId: imovel.id,
      type: "PROPERTY_VIEW",
      visitorId: VISITANTE_A,
      agora: AGORA,
    });

    expect(r).toEqual({ resultado: "REGISTRADO" });
    const eventos = await eventosDe(organizationId);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ type: "PROPERTY_VIEW", propertyId: imovel.id, placement: null });
    // O identificador cru do visitante NUNCA chega ao banco.
    expect(eventos[0].visitorHash).not.toContain(VISITANTE_A);
    expect(eventos[0].visitorHash).toBe(calcularVisitorHash(VISITANTE_A, organizationId, imovel.id));
  });

  test("clique de WhatsApp grava placement do catálogo", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    await registrarEventoAnalytics({
      organizationId,
      propertyId: imovel.id,
      type: "WHATSAPP_CLICK",
      placement: "MOBILE_BAR",
      visitorId: VISITANTE_A,
      agora: AGORA,
    });

    const eventos = await eventosDe(organizationId);
    expect(eventos[0]).toMatchObject({ type: "WHATSAPP_CLICK", placement: "MOBILE_BAR" });
  });

  test("placement fora do catálogo é descartado, mas o clique real continua contando", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    const r = await registrarEventoAnalytics({
      organizationId,
      propertyId: imovel.id,
      type: "WHATSAPP_CLICK",
      placement: "INVENTADO",
      visitorId: VISITANTE_A,
      agora: AGORA,
    });

    expect(r).toEqual({ resultado: "REGISTRADO" });
    expect((await eventosDe(organizationId))[0].placement).toBeNull();
  });
});

describe("payload inválido não grava nada", () => {
  test("tipo, visitante e imóvel inválidos são todos rejeitados antes do banco", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });
    const base = { organizationId, propertyId: imovel.id, visitorId: VISITANTE_A, agora: AGORA };

    expect(await registrarEventoAnalytics({ ...base, type: "CONTACT_SUBMIT" })).toMatchObject({
      resultado: "IGNORADO",
      motivo: "tipo_invalido",
    });
    expect(await registrarEventoAnalytics({ ...base, type: "PROPERTY_VIEW", visitorId: "nao-e-uuid" })).toMatchObject({
      resultado: "IGNORADO",
      motivo: "visitor_invalido",
    });
    // Nunca aceitar um e-mail/telefone travestido de identificador.
    expect(
      await registrarEventoAnalytics({ ...base, type: "PROPERTY_VIEW", visitorId: "pessoa@exemplo.com" })
    ).toMatchObject({ resultado: "IGNORADO" });
    expect(
      await registrarEventoAnalytics({ ...base, type: "PROPERTY_VIEW", propertyId: "nao-existe" })
    ).toMatchObject({ resultado: "IGNORADO", motivo: "imovel_invalido" });

    expect(await eventosDe(organizationId)).toHaveLength(0);
  });
});

describe("deduplicação", () => {
  test("mesmo visitante, mesmo imóvel, dentro da janela: uma visualização só", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });
    const base = { organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: VISITANTE_A };

    expect(await registrarEventoAnalytics({ ...base, agora: AGORA })).toEqual({ resultado: "REGISTRADO" });
    // Refresh imediato e mais um 29 minutos depois: ambos deduplicados.
    expect(await registrarEventoAnalytics({ ...base, agora: AGORA })).toEqual({ resultado: "DEDUPLICADO" });
    expect(
      await registrarEventoAnalytics({ ...base, agora: new Date(AGORA.getTime() + 29 * 60 * 1000) })
    ).toEqual({ resultado: "DEDUPLICADO" });

    expect(await eventosDe(organizationId)).toHaveLength(1);
  });

  test("depois da janela, a volta do mesmo visitante conta como interesse novo", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });
    const base = { organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: VISITANTE_A };

    await registrarEventoAnalytics({ ...base, agora: AGORA });
    const depois = new Date(AGORA.getTime() + JANELA_DEDUP_MS + 1000);
    expect(await registrarEventoAnalytics({ ...base, agora: depois })).toEqual({ resultado: "REGISTRADO" });

    expect(await eventosDe(organizationId)).toHaveLength(2);
  });

  test("outro imóvel do mesmo visitante é evento próprio", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovelA = await criarImovel({ organizationId });
    const imovelB = await criarImovel({ organizationId });

    await registrarEventoAnalytics({ organizationId, propertyId: imovelA.id, type: "PROPERTY_VIEW", visitorId: VISITANTE_A, agora: AGORA });
    expect(
      await registrarEventoAnalytics({ organizationId, propertyId: imovelB.id, type: "PROPERTY_VIEW", visitorId: VISITANTE_A, agora: AGORA })
    ).toEqual({ resultado: "REGISTRADO" });

    expect(await eventosDe(organizationId)).toHaveLength(2);
  });

  test("outro visitante no mesmo imóvel é evento próprio", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });
    const base = { organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", agora: AGORA };

    await registrarEventoAnalytics({ ...base, visitorId: VISITANTE_A });
    expect(await registrarEventoAnalytics({ ...base, visitorId: VISITANTE_B })).toEqual({
      resultado: "REGISTRADO",
    });
    expect(await eventosDe(organizationId)).toHaveLength(2);
  });

  test("view e clique são deduplicados separadamente (tipos diferentes)", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });
    const base = { organizationId, propertyId: imovel.id, visitorId: VISITANTE_A, agora: AGORA };

    await registrarEventoAnalytics({ ...base, type: "PROPERTY_VIEW" });
    expect(await registrarEventoAnalytics({ ...base, type: "WHATSAPP_CLICK" })).toEqual({
      resultado: "REGISTRADO",
    });
    expect(await eventosDe(organizationId)).toHaveLength(2);
  });
});

describe("isolamento multi-tenant", () => {
  test("imóvel de OUTRA organização nunca grava evento (fronteira de tenant)", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const imovelB = await criarImovel({ organizationId: orgB.organization.id });

    // Tenta atribuir à Org A um imóvel que pertence à Org B.
    const r = await registrarEventoAnalytics({
      organizationId: orgA.organization.id,
      propertyId: imovelB.id,
      type: "PROPERTY_VIEW",
      visitorId: VISITANTE_A,
      agora: AGORA,
    });

    expect(r).toMatchObject({ resultado: "IGNORADO", motivo: "imovel_invalido" });
    expect(await eventosDe(orgA.organization.id)).toHaveLength(0);
    expect(await eventosDe(orgB.organization.id)).toHaveLength(0);
  });

  test("eventos da Org A não alteram nenhum número do funil da Org B", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const imovelA = await criarImovel({ organizationId: orgA.organization.id });
    const imovelB = await criarImovel({ organizationId: orgB.organization.id });

    for (const visitante of [VISITANTE_A, VISITANTE_B]) {
      await registrarEventoAnalytics({ organizationId: orgA.organization.id, propertyId: imovelA.id, type: "PROPERTY_VIEW", visitorId: visitante, agora: AGORA });
      await registrarEventoAnalytics({ organizationId: orgA.organization.id, propertyId: imovelA.id, type: "WHATSAPP_CLICK", visitorId: visitante, agora: AGORA });
    }
    await registrarEventoAnalytics({ organizationId: orgB.organization.id, propertyId: imovelB.id, type: "PROPERTY_VIEW", visitorId: VISITANTE_A, agora: AGORA });

    const a = await buscarAnalyticsComercial(orgA.organization.id, { periodo: "30d", agora: AGORA });
    const b = await buscarAnalyticsComercial(orgB.organization.id, { periodo: "30d", agora: AGORA });

    expect(a.funil.visualizacoes.atual).toBe(2);
    expect(a.funil.cliquesWhatsapp.atual).toBe(2);
    expect(b.funil.visualizacoes.atual).toBe(1);
    expect(b.funil.cliquesWhatsapp.atual).toBe(0);
    expect(b.topImoveis.every((i) => i.id !== imovelA.id)).toBe(true);
  });
});

describe("funil no dashboard", () => {
  test("taxa usa SÓ contatos que nasceram na página do imóvel", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });

    // 4 visualizações (visitantes distintos).
    for (const v of [VISITANTE_A, VISITANTE_B, "22222222-3333-4444-8555-666666666666", "33333333-4444-4555-8666-777777777777"]) {
      await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: v, agora: AGORA });
    }

    await prisma.interaction.createMany({
      data: [
        // Numerador legítimo: nasceu na página deste imóvel.
        { organizationId, personId: pessoa.id, propertyId: imovel.id, type: "MESSAGE", origin: "IMOVEL", occurredAt: AGORA },
        // NÃO entram na taxa: não nasceram de visualização de imóvel.
        { organizationId, personId: pessoa.id, type: "MESSAGE", origin: "CONTATO", occurredAt: AGORA },
        { organizationId, personId: pessoa.id, type: "MESSAGE", origin: "ANUNCIE", occurredAt: AGORA },
      ],
    });

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });

    expect(a.funil.visualizacoes.atual).toBe(4);
    expect(a.contatos.atual).toBe(3);
    // 1 contato de imóvel / 4 visualizações = 25%, e não 3/4 = 75%.
    expect(a.funil.etapas.find((e) => e.chave === "CONTATOS")!.total).toBe(1);
    expect(a.funil.taxaContatoPorVisualizacao).toBeCloseTo(25);
  });

  test("imóvel muito visto e sem contato aparece no ranking (o diagnóstico da fase)", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId, title: "Muito visto e sem contato" });

    for (const v of [VISITANTE_A, VISITANTE_B]) {
      await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: v, agora: AGORA });
    }

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(a.topImoveis).toHaveLength(1);
    expect(a.topImoveis[0]).toMatchObject({
      titulo: "Muito visto e sem contato",
      visualizacoes: 2,
      contatos: 0,
    });
    // 0 contatos / 2 views = 0% real (houve audiência), não "—".
    expect(a.topImoveis[0].taxaConversao).toBe(0);
  });

  test("organização sem nenhum evento: taxas null e aviso de ausência de histórico", async () => {
    const cenario = await novoCenario();
    const a = await buscarAnalyticsComercial(cenario.organization.id, { periodo: "30d", agora: AGORA });

    expect(a.funil.visualizacoes.atual).toBe(0);
    expect(a.funil.taxaContatoPorVisualizacao).toBeNull();
    expect(a.funil.taxaWhatsappPorVisualizacao).toBeNull();
    expect(a.funil.semHistoricoDigital).toBe(true);
  });

  test("com evento fora do período, o histórico existe mas a janela fica zerada", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });
    const antigo = new Date(AGORA.getTime() - 200 * 24 * 60 * 60 * 1000);
    await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: VISITANTE_A, agora: antigo });

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(a.funil.visualizacoes.atual).toBe(0);
    // Já houve medição — a tela não deve dizer "a medição começou agora".
    expect(a.funil.semHistoricoDigital).toBe(false);
  });

  test("compara visualizações com o período anterior", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });
    const anterior = new Date(AGORA.getTime() - 40 * 24 * 60 * 60 * 1000);

    await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: VISITANTE_A, agora: anterior });
    await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: VISITANTE_A, agora: AGORA });
    await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: VISITANTE_B, agora: AGORA });

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(a.funil.visualizacoes.atual).toBe(2);
    expect(a.funil.visualizacoes.anterior).toBe(1);
    expect(a.funil.visualizacoes.percentual).toBeCloseTo(100);
  });
});
