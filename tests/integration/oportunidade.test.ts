import { describe, test, expect, afterEach, vi } from "vitest";

// Mesmas limitações já documentadas nos outros testes de integração desta
// árvore: as actions importam @/lib/auth -> next-auth -> next/server, que
// não resolve sob Vitest puro; e buscarConfiguracaoContato usa
// unstable_cache. auth() é mockado e devolve uma sessão real de corretor.
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
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import { auth } from "@/lib/auth";
import {
  criarOportunidadeDoContato,
  criarInteressePessoa,
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { buscarAnalyticsComercial } from "@/lib/analytics-comercial";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

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

const GOOGLE_ADS = {
  utmSource: "google",
  utmMedium: "cpc",
  utmCampaign: "verao-2026",
  referrerHost: "google.com",
};

async function criarContato(opcoes: {
  organizationId: string;
  personId: string;
  propertyId?: string | null;
  origin: string | null;
  atribuicao?: Record<string, string>;
}) {
  return prisma.interaction.create({
    data: {
      organizationId: opcoes.organizationId,
      personId: opcoes.personId,
      propertyId: opcoes.propertyId ?? null,
      type: "MESSAGE",
      origin: opcoes.origin,
      ...(opcoes.atribuicao ?? {}),
    },
    select: { id: true },
  });
}

const converter = (interactionId: string) =>
  criarOportunidadeDoContato(interactionId, ESTADO_INICIAL_ACAO, new FormData());

async function interessesDe(organizationId: string) {
  return prisma.propertyInterest.findMany({
    where: { organizationId },
    select: { id: true, personId: true, propertyId: true, sourceInteractionId: true, stage: true },
  });
}

describe("converter contato em oportunidade", () => {
  test("contato de imóvel vira oportunidade COM a interação de origem gravada", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const contato = await criarContato({
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      origin: "IMOVEL",
      atribuicao: GOOGLE_ADS,
    });

    const r = await converter(contato.id);
    expect(r.success).toBe(true);

    const [interesse] = await interessesDe(organizationId);
    expect(interesse).toMatchObject({
      personId: pessoa.id,
      propertyId: imovel.id,
      // O vínculo é o id EXATO da interação em que o corretor clicou —
      // nunca "a interação mais próxima no tempo".
      sourceInteractionId: contato.id,
      stage: "INTERESTED",
    });

    // Histórico inicial criado, igual ao fluxo manual.
    const historico = await prisma.propertyInterestStageHistory.findMany({
      where: { organizationId, propertyInterestId: interesse.id },
      select: { previousStage: true, newStage: true },
    });
    expect(historico).toEqual([{ previousStage: null, newStage: "INTERESTED" }]);
  });

  test("CONTATO e ANUNCIE são recusados — não são funil de comprador", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });

    const geral = await criarContato({ organizationId, personId: pessoa.id, origin: "CONTATO" });
    const anuncie = await criarContato({ organizationId, personId: pessoa.id, origin: "ANUNCIE" });
    // Mesmo com imóvel, ANUNCIE continua fora: é proprietário oferecendo.
    const anuncieComImovel = await criarContato({
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      origin: "ANUNCIE",
    });
    // Interação registrada à mão pela equipe.
    const manual = await criarContato({
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      origin: null,
    });

    for (const contato of [geral, anuncie, anuncieComImovel, manual]) {
      const r = await converter(contato.id);
      expect(r.success).toBe(false);
    }
    expect(await interessesDe(organizationId)).toHaveLength(0);
  });

  test("reenvio é idempotente: não duplica nem sobrescreve a origem existente", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const contato = await criarContato({
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      origin: "IMOVEL",
    });

    await converter(contato.id);
    const segundo = await converter(contato.id);

    expect(segundo.success).toBe(true);
    const interesses = await interessesDe(organizationId);
    expect(interesses).toHaveLength(1);
    expect(interesses[0].sourceInteractionId).toBe(contato.id);
  });

  test("oportunidade já criada MANUALMENTE não ganha origem retroativa", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });

    // Fluxo manual de sempre: relacionar imóvel na ficha do cliente.
    const fd = new FormData();
    fd.set("propertyId", imovel.id);
    await criarInteressePessoa(pessoa.id, ESTADO_INICIAL_ACAO, fd);

    const contato = await criarContato({
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      origin: "IMOVEL",
      atribuicao: GOOGLE_ADS,
    });
    await converter(contato.id);

    const interesses = await interessesDe(organizationId);
    expect(interesses).toHaveLength(1);
    // Continua SEM origem: a oportunidade não nasceu daquele contato, e
    // carimbá-la agora seria atribuição falsa.
    expect(interesses[0].sourceInteractionId).toBeNull();
  });

  test("contato de OUTRO tenant nunca cria oportunidade (fronteira de tenant)", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    autenticarComo(orgA);

    const pessoaB = await criarPessoa({ organizationId: orgB.organization.id });
    const imovelB = await criarImovel({ organizationId: orgB.organization.id });
    const contatoB = await criarContato({
      organizationId: orgB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
      origin: "IMOVEL",
    });

    const r = await converter(contatoB.id);
    expect(r.success).toBe(false);
    expect(await interessesDe(orgA.organization.id)).toHaveLength(0);
    expect(await interessesDe(orgB.organization.id)).toHaveLength(0);
  });

  test("apagar a interação de origem não destrói a oportunidade (SET NULL)", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const contato = await criarContato({
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      origin: "IMOVEL",
    });
    await converter(contato.id);

    // organizationId explícito: a extensão de tenant-scoping recusa
    // qualquer escrita sem ele fora de withOrganization.
    await prisma.interaction.deleteMany({ where: { id: contato.id, organizationId } });

    const interesses = await interessesDe(organizationId);
    expect(interesses).toHaveLength(1);
    expect(interesses[0].sourceInteractionId).toBeNull();
  });
});

describe("resultado comercial no dashboard", () => {
  async function cenarioComOportunidade() {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const contato = await criarContato({
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      origin: "IMOVEL",
      atribuicao: GOOGLE_ADS,
    });
    await converter(contato.id);
    const [interesse] = await interessesDe(organizationId);
    return { cenario, organizationId, pessoa, imovel, contato, interesse };
  }

  test("coorte contato -> oportunidade, e o canal vem da interação de origem", async () => {
    const { organizationId } = await cenarioComOportunidade();

    const a = await buscarAnalyticsComercial(organizationId, "UTC", { periodo: "30d", agora: new Date() });

    expect(a.resultado.oportunidadesCriadas).toBe(1);
    expect(a.resultado.oportunidadesComOrigem).toBe(1);
    expect(a.resultado.contatosElegiveis).toBe(1);
    expect(a.resultado.contatosQueViraramOportunidade).toBe(1);
    expect(a.resultado.taxaContatoParaOportunidade).toBeCloseTo(100);
    expect(a.resultado.semVinculoDeOrigem).toBe(false);

    const anuncios = a.aquisicao.canais.find((c) => c.canal === "ANUNCIOS")!;
    expect(anuncios.oportunidades).toBe(1);
    expect(anuncios.fechamentos).toBe(0);
  });

  test("ganho conta como fechamento no canal de origem", async () => {
    const { organizationId, interesse } = await cenarioComOportunidade();

    // Fase 9 — ganho exige valor de fechamento.
    const fdGanho = new FormData();
    fdGanho.set("valorFechamento", "500000");
    await marcarInteresseComoGanho(interesse.id, ESTADO_INICIAL_ACAO, fdGanho);

    const a = await buscarAnalyticsComercial(organizationId, "UTC", { periodo: "30d", agora: new Date() });
    expect(a.resultado.fechamentosGanhos).toBe(1);
    expect(a.resultado.fechamentosPerdidos).toBe(0);
    expect(a.resultado.taxaOportunidadeParaGanho).toBeCloseTo(100);
    expect(a.aquisicao.canais.find((c) => c.canal === "ANUNCIOS")!.fechamentos).toBe(1);
  });

  test("perda é contabilizada como encerrada, nunca como ganho", async () => {
    const { organizationId, interesse } = await cenarioComOportunidade();

    await marcarInteresseComoPerdido(interesse.id, ESTADO_INICIAL_ACAO, new FormData());

    const a = await buscarAnalyticsComercial(organizationId, "UTC", { periodo: "30d", agora: new Date() });
    expect(a.resultado.fechamentosGanhos).toBe(0);
    expect(a.resultado.fechamentosPerdidos).toBe(1);
    expect(a.resultado.taxaOportunidadeParaGanho).toBe(0);
    expect(a.aquisicao.canais.find((c) => c.canal === "ANUNCIOS")!.fechamentos).toBe(0);
  });

  test("ANUNCIE não entra no denominador de contatos elegíveis", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });

    await criarContato({ organizationId, personId: pessoa.id, propertyId: imovel.id, origin: "IMOVEL" });
    await criarContato({ organizationId, personId: pessoa.id, origin: "CONTATO" });
    await criarContato({ organizationId, personId: pessoa.id, origin: "ANUNCIE" });

    const a = await buscarAnalyticsComercial(organizationId, "UTC", { periodo: "30d", agora: new Date() });
    expect(a.contatos.atual).toBe(3);
    // Só o de página de imóvel pode virar oportunidade.
    expect(a.resultado.contatosElegiveis).toBe(1);
    expect(a.resultado.taxaContatoParaOportunidade).toBe(0);
  });

  test("organização sem vínculo nenhum: semVinculoDeOrigem indica NÃO MEDIDO", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });

    const fd = new FormData();
    fd.set("propertyId", imovel.id);
    await criarInteressePessoa(pessoa.id, ESTADO_INICIAL_ACAO, fd);

    const a = await buscarAnalyticsComercial(organizationId, "UTC", { periodo: "30d", agora: new Date() });
    expect(a.resultado.oportunidadesCriadas).toBe(1);
    expect(a.resultado.oportunidadesComOrigem).toBe(0);
    // A distinção que a tela usa para mostrar "—" em vez de "0".
    expect(a.resultado.semVinculoDeOrigem).toBe(true);
    expect(a.aquisicao.canais.find((c) => c.canal === "SEM_ATRIBUICAO")!.oportunidades).toBe(1);
  });

  test("tenant vazio: zeros coerentes e taxas null, nunca NaN", async () => {
    const cenario = await novoCenario();
    const a = await buscarAnalyticsComercial(cenario.organization.id, "UTC", {
      periodo: "30d",
      agora: new Date(),
    });
    expect(a.resultado.oportunidadesCriadas).toBe(0);
    expect(a.resultado.fechamentosGanhos).toBe(0);
    expect(a.resultado.taxaContatoParaOportunidade).toBeNull();
    expect(a.resultado.taxaOportunidadeParaGanho).toBeNull();
    expect(a.resultado.semVinculoDeOrigem).toBe(true);
  });

  test("isolamento: oportunidade da Org A não aparece no resultado da Org B", async () => {
    const { organizationId: idA } = await cenarioComOportunidade();
    const orgB = await novoCenario();

    const a = await buscarAnalyticsComercial(idA, "UTC", { periodo: "30d", agora: new Date() });
    const b = await buscarAnalyticsComercial(orgB.organization.id, "UTC", {
      periodo: "30d",
      agora: new Date(),
    });

    expect(a.resultado.oportunidadesCriadas).toBe(1);
    expect(b.resultado.oportunidadesCriadas).toBe(0);
    expect(b.resultado.oportunidadesComOrigem).toBe(0);
    expect(b.aquisicao.canais).toEqual([]);
  });
});
