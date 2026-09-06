import { describe, test, expect, afterEach, vi } from "vitest";

// Mesmas limitações já documentadas em enviar-contato-dedup.test.ts:
// as actions públicas importam @/lib/tenant -> @/lib/auth -> next-auth ->
// next/server, que não resolve sob Vitest puro (nenhuma delas chama
// auth() de fato — são públicas). E protecoesAntiSpam usa headers().
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { criarCenario, criarImovel } from "@/test/fixtures";
import { registrarEventoAnalytics } from "@/lib/analytics-tracking";
import { buscarAnalyticsComercial } from "@/lib/analytics-comercial";
import { enviarContato, enviarAnuncioProprietario } from "@/app/[orgSlug]/actions";

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

const VISITANTE = "3f8a1c2e-5b6d-4a7f-9c1e-2d3b4a5c6d7e";
// Hora REAL, não data fixa: enviarContato cria a Interaction com o now()
// do banco, então uma janela ancorada numa data fixa deixaria o contato
// fora do período e o teste mediria a coisa errada. Os eventos digitais
// são carimbados com o mesmo instante, mantendo tudo na mesma janela.
const AGORA = new Date();

const GOOGLE_ADS = {
  utmSource: "google",
  utmMedium: "cpc",
  utmCampaign: "verao-2026",
  utmContent: null,
  utmTerm: null,
  referrerHost: "google.com",
};
const INSTAGRAM = {
  utmSource: "instagram",
  utmMedium: null,
  utmCampaign: "lancamento",
  utmContent: null,
  utmTerm: null,
  referrerHost: "instagram.com",
};

// O formulário público manda a atribuição num único campo JSON.
function formContato(campos: Record<string, string>, atribuicao?: unknown) {
  const fd = new FormData();
  fd.set("nome", "Visitante Teste");
  fd.set("email", `visitante-${Date.now()}-${Math.random()}@exemplo.test`);
  fd.set("telefone", "");
  fd.set("mensagem", "Tenho interesse neste imóvel.");
  fd.set("renderizadoEm", String(Date.now() - 60_000));
  fd.set("website", "");
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  if (atribuicao !== undefined) fd.set("atribuicao", JSON.stringify(atribuicao));
  return fd;
}

async function eventosDe(organizationId: string) {
  return prisma.propertyAnalyticsEvent.findMany({
    where: { organizationId },
    select: { type: true, utmSource: true, utmMedium: true, utmCampaign: true, referrerHost: true },
  });
}

async function interacoesDe(organizationId: string) {
  return prisma.interaction.findMany({
    where: { organizationId },
    select: {
      origin: true,
      propertyId: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      referrerHost: true,
    },
  });
}

describe("atribuição no evento digital", () => {
  test("PROPERTY_VIEW e WHATSAPP_CLICK carregam a atribuição da jornada", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    await registrarEventoAnalytics({
      organizationId,
      propertyId: imovel.id,
      type: "PROPERTY_VIEW",
      visitorId: VISITANTE,
      atribuicao: GOOGLE_ADS,
      agora: AGORA,
    });
    await registrarEventoAnalytics({
      organizationId,
      propertyId: imovel.id,
      type: "WHATSAPP_CLICK",
      placement: "SIDEBAR",
      visitorId: VISITANTE,
      atribuicao: GOOGLE_ADS,
      agora: AGORA,
    });

    const eventos = await eventosDe(organizationId);
    expect(eventos).toHaveLength(2);
    for (const evento of eventos) {
      expect(evento).toMatchObject({ utmSource: "google", utmMedium: "cpc", utmCampaign: "verao-2026" });
    }
  });

  test("atribuição é saneada no servidor, nunca gravada como veio", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    await registrarEventoAnalytics({
      organizationId,
      propertyId: imovel.id,
      type: "PROPERTY_VIEW",
      visitorId: VISITANTE,
      atribuicao: { utmSource: "  GOOGLE  ", utmCampaign: "x".repeat(500), utmMedium: 42 },
      agora: AGORA,
    });

    const [evento] = await eventosDe(organizationId);
    expect(evento.utmSource).toBe("google");
    expect(evento.utmCampaign!.length).toBe(120);
    expect(evento.utmMedium).toBeNull();
  });

  test("sem atribuição o evento continua sendo gravado (fail-open)", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    const r = await registrarEventoAnalytics({
      organizationId,
      propertyId: imovel.id,
      type: "PROPERTY_VIEW",
      visitorId: VISITANTE,
      atribuicao: "payload quebrado",
      agora: AGORA,
    });

    expect(r).toEqual({ resultado: "REGISTRADO" });
    const [evento] = await eventosDe(organizationId);
    expect(evento.utmSource).toBeNull();
  });

  test("atribuição NÃO consegue mover o evento para outro tenant nem outro imóvel", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const imovelB = await criarImovel({ organizationId: orgB.organization.id });

    const r = await registrarEventoAnalytics({
      organizationId: orgA.organization.id,
      propertyId: imovelB.id,
      type: "PROPERTY_VIEW",
      visitorId: VISITANTE,
      // Payload tentando declarar outro tenant/imóvel junto da atribuição.
      atribuicao: { utmSource: "google", organizationId: orgB.organization.id, propertyId: imovelB.id },
      agora: AGORA,
    });

    expect(r).toMatchObject({ resultado: "IGNORADO" });
    expect(await eventosDe(orgA.organization.id)).toHaveLength(0);
    expect(await eventosDe(orgB.organization.id)).toHaveLength(0);
  });
});

describe("atribuição no contato real (Interaction)", () => {
  test("IMOVEL: origin continua IMOVEL e a atribuição é uma dimensão à parte", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    const r = await enviarContato(cenario.organization.slug, null, formContato({ imovelId: imovel.id }, GOOGLE_ADS));
    expect(r).toMatchObject({ sucesso: true });

    const [interacao] = await interacoesDe(organizationId);
    expect(interacao.origin).toBe("IMOVEL");
    expect(interacao.propertyId).toBe(imovel.id);
    expect(interacao).toMatchObject({ utmSource: "google", utmMedium: "cpc", utmCampaign: "verao-2026" });
  });

  test("CONTATO: página geral, sem imóvel, com atribuição", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;

    await enviarContato(cenario.organization.slug, null, formContato({}, GOOGLE_ADS));

    const [interacao] = await interacoesDe(organizationId);
    expect(interacao.origin).toBe("CONTATO");
    expect(interacao.propertyId).toBeNull();
    expect(interacao.utmSource).toBe("google");
  });

  test("ANUNCIE: proprietário sem imóvel ainda tem origem de tráfego", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;

    const fd = new FormData();
    fd.set("nome", "Proprietário Teste");
    fd.set("email", `dono-${Date.now()}@exemplo.test`);
    fd.set("telefone", "11999998888");
    fd.set("descricaoImovel", "Apartamento de 2 quartos no centro");
    fd.set("renderizadoEm", String(Date.now() - 60_000));
    fd.set("website", "");
    fd.set("atribuicao", JSON.stringify(INSTAGRAM));

    const r = await enviarAnuncioProprietario(cenario.organization.slug, null, fd);
    expect(r).toMatchObject({ sucesso: true });

    const [interacao] = await interacoesDe(organizationId);
    expect(interacao.origin).toBe("ANUNCIE");
    expect(interacao.propertyId).toBeNull();
    expect(interacao).toMatchObject({ utmSource: "instagram", utmCampaign: "lancamento" });
  });

  test("Person.source permanece WEBSITE — atribuição NÃO o redefine", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;

    await enviarContato(cenario.organization.slug, null, formContato({}, INSTAGRAM));

    const pessoas = await prisma.person.findMany({ where: { organizationId }, select: { source: true } });
    expect(pessoas).toHaveLength(1);
    // A decisão (A) da fase, verificada contra o banco: utm_source=instagram
    // NÃO vira Person.source=INSTAGRAM. São semânticas diferentes.
    expect(pessoas[0].source).toBe("WEBSITE");
  });

  test("atribuição ausente ou quebrada não impede o contato (fail-open)", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;

    const semCampo = await enviarContato(cenario.organization.slug, null, formContato({}));
    expect(semCampo).toMatchObject({ sucesso: true });

    const fdQuebrado = formContato({});
    fdQuebrado.set("atribuicao", "{{{ isto não é json");
    const quebrado = await enviarContato(cenario.organization.slug, null, fdQuebrado);
    expect(quebrado).toMatchObject({ sucesso: true });

    const interacoes = await interacoesDe(organizationId);
    expect(interacoes).toHaveLength(2);
    expect(interacoes.every((i) => i.utmSource === null)).toBe(true);
    expect(interacoes.every((i) => i.origin === "CONTATO")).toBe(true);
  });

  test("atribuição não consegue forjar origin nem propertyId", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;

    const fd = formContato({}, { utmSource: "google", origin: "ANUNCIE", propertyId: "forjado" });
    await enviarContato(cenario.organization.slug, null, fd);

    const [interacao] = await interacoesDe(organizationId);
    // origin continua derivado do servidor (sem imóvel -> CONTATO).
    expect(interacao.origin).toBe("CONTATO");
    expect(interacao.propertyId).toBeNull();
    expect(interacao.utmSource).toBe("google");
  });
});

describe("agregação por canal no dashboard", () => {
  test("views e contatos aparecem no canal certo, com anúncio vencendo a plataforma", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    // 2 views de anúncio pago + 1 view orgânica de rede social.
    await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: VISITANTE, atribuicao: GOOGLE_ADS, agora: AGORA });
    await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: "11111111-2222-4333-8444-555555555555", atribuicao: GOOGLE_ADS, agora: AGORA });
    await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: "22222222-3333-4444-8555-666666666666", atribuicao: INSTAGRAM, agora: AGORA });
    // 1 contato vindo do Instagram.
    await enviarContato(cenario.organization.slug, null, formContato({ imovelId: imovel.id }, INSTAGRAM));

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });

    const anuncios = a.aquisicao.canais.find((c) => c.canal === "ANUNCIOS")!;
    const social = a.aquisicao.canais.find((c) => c.canal === "SOCIAL")!;
    expect(anuncios.visualizacoes).toBe(2);
    expect(anuncios.contatos).toBe(0);
    expect(social.visualizacoes).toBe(1);
    expect(social.contatos).toBe(1);
    // 2 de 3 views vieram de anúncio.
    expect(Math.round(anuncios.percentualVisualizacoes)).toBe(67);
    expect(a.aquisicao.semAtribuicao).toBe(false);
  });

  test("campanhas agregam views e contatos, somente leitura", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: VISITANTE, atribuicao: GOOGLE_ADS, agora: AGORA });
    await enviarContato(cenario.organization.slug, null, formContato({ imovelId: imovel.id }, GOOGLE_ADS));

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(a.aquisicao.campanhas).toEqual([{ campanha: "verao-2026", visualizacoes: 1, contatos: 1 }]);
  });

  test("dados sem atribuição (legado) caem em SEM_ATRIBUICAO, nunca inventam canal", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const imovel = await criarImovel({ organizationId });

    await registrarEventoAnalytics({ organizationId, propertyId: imovel.id, type: "PROPERTY_VIEW", visitorId: VISITANTE, agora: AGORA });

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    const sem = a.aquisicao.canais.find((c) => c.canal === "SEM_ATRIBUICAO")!;
    expect(sem.visualizacoes).toBe(1);
    expect(a.aquisicao.semAtribuicao).toBe(true);
    expect(a.aquisicao.campanhas).toEqual([]);
  });

  test("tenant vazio: sem canais, sem campanhas, sem NaN", async () => {
    const cenario = await novoCenario();
    const a = await buscarAnalyticsComercial(cenario.organization.id, { periodo: "30d", agora: AGORA });
    expect(a.aquisicao.canais).toEqual([]);
    expect(a.aquisicao.campanhas).toEqual([]);
  });

  test("isolamento: canal da Org A não aparece na Org B", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const imovelA = await criarImovel({ organizationId: orgA.organization.id });
    const imovelB = await criarImovel({ organizationId: orgB.organization.id });

    await registrarEventoAnalytics({ organizationId: orgA.organization.id, propertyId: imovelA.id, type: "PROPERTY_VIEW", visitorId: VISITANTE, atribuicao: GOOGLE_ADS, agora: AGORA });
    await registrarEventoAnalytics({ organizationId: orgB.organization.id, propertyId: imovelB.id, type: "PROPERTY_VIEW", visitorId: VISITANTE, atribuicao: INSTAGRAM, agora: AGORA });

    const a = await buscarAnalyticsComercial(orgA.organization.id, { periodo: "30d", agora: AGORA });
    const b = await buscarAnalyticsComercial(orgB.organization.id, { periodo: "30d", agora: AGORA });

    expect(a.aquisicao.canais.map((c) => c.canal)).toEqual(["ANUNCIOS"]);
    expect(b.aquisicao.canais.map((c) => c.canal)).toEqual(["SOCIAL"]);
    expect(a.aquisicao.campanhas.map((c) => c.campanha)).toEqual(["verao-2026"]);
    expect(b.aquisicao.campanhas.map((c) => c.campanha)).toEqual(["lancamento"]);
  });
});
