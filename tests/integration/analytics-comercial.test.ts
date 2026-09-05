import { describe, test, expect, afterEach, vi } from "vitest";

// buscarAnalyticsComercial lê o prefixo do código do imóvel via
// buscarConfiguracaoContato, que usa unstable_cache (exige o runtime de
// requisição do Next) — mesmo mock de identidade já usado em
// enviar-contato-dedup.test.ts: preserva a query real, remove só o
// mecanismo de cache.
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import { buscarAnalyticsComercial } from "@/lib/analytics-comercial";

// Analytics comercial (Fase 5) — o que os testes unitários (puros, em
// src/lib/analytics-comercial.test.ts) NÃO conseguem provar: que a
// definição de contato comercial e o isolamento por tenant valem contra o
// banco de verdade, com o Prisma no meio.

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

const MS_POR_DIA = 24 * 60 * 60 * 1000;
// Referência fixa: todo `occurredAt` do teste é posicionado em relação a
// ela, e a mesma data é passada como `agora` — nada depende do relógio da
// máquina que roda a suíte.
const AGORA = new Date("2026-06-15T12:00:00.000Z");

function diasAtras(dias: number, hora = 12): Date {
  const base = new Date(AGORA.getTime() - dias * MS_POR_DIA);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hora, 0, 0, 0)
  );
}

async function criarInteracao(opcoes: {
  organizationId: string;
  personId: string;
  propertyId?: string | null;
  origin: string | null;
  occurredAt: Date;
  type?: "MESSAGE" | "VISIT" | "CALL";
}) {
  await prisma.interaction.create({
    data: {
      organizationId: opcoes.organizationId,
      personId: opcoes.personId,
      propertyId: opcoes.propertyId ?? null,
      type: opcoes.type ?? "MESSAGE",
      origin: opcoes.origin,
      occurredAt: opcoes.occurredAt,
    },
  });
}

describe("definição de contato comercial (contra o banco)", () => {
  test("conta origem do catálogo e NUNCA registro manual/visita/legado (origin=null)", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });

    // 3 contatos comerciais reais (os únicos que devem contar).
    await criarInteracao({ organizationId, personId: pessoa.id, propertyId: imovel.id, origin: "IMOVEL", occurredAt: diasAtras(2) });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "CONTATO", occurredAt: diasAtras(3) });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "ANUNCIE", occurredAt: diasAtras(4) });

    // Ruído que NÃO pode virar captação: nota manual do corretor, visita
    // interna concluída, e um registro legado pré-Fase 4.
    await criarInteracao({ organizationId, personId: pessoa.id, origin: null, type: "CALL", occurredAt: diasAtras(2) });
    await criarInteracao({ organizationId, personId: pessoa.id, propertyId: imovel.id, origin: null, type: "VISIT", occurredAt: diasAtras(3) });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: null, occurredAt: diasAtras(5) });

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });

    expect(analytics.contatos.atual).toBe(3);
    // As 3 interações sem origem aparecem como DIVULGAÇÃO, jamais somadas
    // ao total nem atribuídas a uma origem inventada.
    expect(analytics.interacoesSemOrigem).toBe(3);
    expect(analytics.origens.reduce((s, o) => s + o.total, 0)).toBe(3);
    expect(analytics.serie.reduce((s, p) => s + p.total, 0)).toBe(3);
  });

  test("uma origem fora do catálogo não é promovida a contato comercial", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });

    await criarInteracao({ organizationId, personId: pessoa.id, origin: "PORTAL_FUTURO", occurredAt: diasAtras(1) });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "CONTATO", occurredAt: diasAtras(1) });

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(analytics.contatos.atual).toBe(1);
  });
});

describe("período e comparação (contra o banco)", () => {
  test("só entra no total o que está DENTRO da janela; o anterior vira base de comparação", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });

    // Dentro dos últimos 30 dias.
    for (const dia of [0, 5, 29]) {
      await criarInteracao({ organizationId, personId: pessoa.id, origin: "CONTATO", occurredAt: diasAtras(dia) });
    }
    // Nos 30 dias ANTERIORES.
    for (const dia of [31, 45]) {
      await criarInteracao({ organizationId, personId: pessoa.id, origin: "CONTATO", occurredAt: diasAtras(dia) });
    }
    // Fora das duas janelas — não pode aparecer em lugar nenhum.
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "CONTATO", occurredAt: diasAtras(200) });

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(analytics.contatos.atual).toBe(3);
    expect(analytics.contatos.anterior).toBe(2);
    expect(analytics.contatos.diferenca).toBe(1);
    expect(analytics.contatos.percentual).toBeCloseTo(50);
  });

  test("período anterior vazio devolve percentual null (nunca Infinity vindo do banco)", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "IMOVEL", occurredAt: diasAtras(1) });

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "7d", agora: AGORA });
    expect(analytics.contatos.anterior).toBe(0);
    expect(analytics.contatos.percentual).toBeNull();
  });

  test("13 semanas: série semanal com 13 pontos, incluindo semanas em zero", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "CONTATO", occurredAt: diasAtras(1) });

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "13s", agora: AGORA });
    expect(analytics.granularidade).toBe("SEMANA");
    expect(analytics.serie).toHaveLength(13);
    expect(analytics.serie.filter((p) => p.total === 0)).toHaveLength(12);
  });
});

describe("pessoas × contatos e recortes por origem", () => {
  test("a mesma pessoa com várias interações é 1 pessoa, mas N contatos", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const recorrente = await criarPessoa({ organizationId, name: "Cliente recorrente" });
    const outra = await criarPessoa({ organizationId, name: "Outra pessoa" });

    for (const dia of [1, 2, 3, 4]) {
      await criarInteracao({ organizationId, personId: recorrente.id, origin: "CONTATO", occurredAt: diasAtras(dia) });
    }
    await criarInteracao({ organizationId, personId: outra.id, origin: "CONTATO", occurredAt: diasAtras(1) });

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(analytics.contatos.atual).toBe(5);
    expect(analytics.pessoasDistintas).toBe(2);
  });

  test("proprietário que envia três imóveis é UM proprietário interessado", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const proprietario = await criarPessoa({ organizationId, roles: ["OWNER"] });

    for (const dia of [1, 2, 3]) {
      await criarInteracao({ organizationId, personId: proprietario.id, origin: "ANUNCIE", occurredAt: diasAtras(dia) });
    }

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(analytics.contatos.atual).toBe(3);
    expect(analytics.proprietariosAnunciando).toBe(1);
  });

  test("mesma Person como LEAD e como OWNER aparece nos dois recortes sem duplicar dentro de nenhum", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId, roles: ["LEAD", "OWNER"] });

    await criarInteracao({ organizationId, personId: pessoa.id, origin: "CONTATO", occurredAt: diasAtras(1) });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "ANUNCIE", occurredAt: diasAtras(2) });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "ANUNCIE", occurredAt: diasAtras(3) });

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(analytics.pessoasDistintas).toBe(1);
    expect(analytics.proprietariosAnunciando).toBe(1);
  });
});

describe("imóveis que mais geram contato", () => {
  test("ranqueia por volume real e ignora contato geral sem imóvel", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const procurado = await criarImovel({ organizationId, title: "Cobertura muito procurada", neighborhood: "Moema", city: "São Paulo" });
    const menos = await criarImovel({ organizationId, title: "Kitnet discreta" });
    const semContato = await criarImovel({ organizationId, title: "Imóvel que ninguém procurou" });

    for (const dia of [1, 2, 3]) {
      await criarInteracao({ organizationId, personId: pessoa.id, propertyId: procurado.id, origin: "IMOVEL", occurredAt: diasAtras(dia) });
    }
    await criarInteracao({ organizationId, personId: pessoa.id, propertyId: menos.id, origin: "IMOVEL", occurredAt: diasAtras(1) });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "CONTATO", occurredAt: diasAtras(1) });

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });

    expect(analytics.topImoveis.map((i) => i.titulo)).toEqual([
      "Cobertura muito procurada",
      "Kitnet discreta",
    ]);
    expect(analytics.topImoveis[0].contatos).toBe(3);
    expect(analytics.topImoveis[0].localizacao).toBe("Moema, São Paulo - SP");
    expect(analytics.imoveisComContato).toBe(2);
    // Imóvel sem nenhum contato nunca vira linha em zero no ranking.
    expect(analytics.topImoveis.some((i) => i.id === semContato.id)).toBe(false);
  });

  test("nenhum contato com imóvel: ranking vazio, sem quebrar", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    await criarInteracao({ organizationId, personId: pessoa.id, origin: "CONTATO", occurredAt: diasAtras(1) });

    const analytics = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: AGORA });
    expect(analytics.topImoveis).toEqual([]);
    expect(analytics.imoveisComContato).toBe(0);
  });
});

describe("tenant vazio", () => {
  test("organização sem nenhuma interação devolve zeros coerentes, nunca NaN/undefined", async () => {
    const cenario = await novoCenario();
    const analytics = await buscarAnalyticsComercial(cenario.organization.id, { periodo: "30d", agora: AGORA });

    expect(analytics.contatos).toMatchObject({ atual: 0, anterior: 0, diferenca: 0, percentual: null });
    expect(analytics.pessoasDistintas).toBe(0);
    expect(analytics.imoveisComContato).toBe(0);
    expect(analytics.proprietariosAnunciando).toBe(0);
    expect(analytics.interacoesSemOrigem).toBe(0);
    expect(analytics.topImoveis).toEqual([]);
    // A série continua existindo, cheia de zeros — o gráfico nunca fica
    // sem eixo.
    expect(analytics.serie).toHaveLength(30);
    expect(analytics.serie.every((p) => p.total === 0)).toBe(true);
    expect(analytics.origens).toHaveLength(3);
    expect(analytics.origens.every((o) => o.total === 0 && o.percentual === 0)).toBe(true);
  });
});

describe("isolamento multi-tenant", () => {
  test("dados da Org A não alteram NENHUMA métrica da Org B (KPIs, origem, série, top imóveis)", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();

    const pessoaA = await criarPessoa({ organizationId: orgA.organization.id });
    const imovelA = await criarImovel({ organizationId: orgA.organization.id, title: "Imóvel exclusivo da Org A" });
    const pessoaB = await criarPessoa({ organizationId: orgB.organization.id });
    const imovelB = await criarImovel({ organizationId: orgB.organization.id, title: "Imóvel exclusivo da Org B" });

    // Org A: volume alto e variado.
    for (const dia of [1, 2, 3, 4, 5]) {
      await criarInteracao({ organizationId: orgA.organization.id, personId: pessoaA.id, propertyId: imovelA.id, origin: "IMOVEL", occurredAt: diasAtras(dia) });
    }
    await criarInteracao({ organizationId: orgA.organization.id, personId: pessoaA.id, origin: "ANUNCIE", occurredAt: diasAtras(1) });
    // Org A no período anterior — nem isso pode influenciar a base de B.
    await criarInteracao({ organizationId: orgA.organization.id, personId: pessoaA.id, origin: "CONTATO", occurredAt: diasAtras(40) });

    // Org B: um único contato, de outra natureza.
    await criarInteracao({ organizationId: orgB.organization.id, personId: pessoaB.id, propertyId: imovelB.id, origin: "IMOVEL", occurredAt: diasAtras(1) });

    const a = await buscarAnalyticsComercial(orgA.organization.id, { periodo: "30d", agora: AGORA });
    const b = await buscarAnalyticsComercial(orgB.organization.id, { periodo: "30d", agora: AGORA });

    expect(a.contatos.atual).toBe(6);
    expect(a.contatos.anterior).toBe(1);
    expect(a.proprietariosAnunciando).toBe(1);

    expect(b.contatos.atual).toBe(1);
    expect(b.contatos.anterior).toBe(0);
    expect(b.pessoasDistintas).toBe(1);
    expect(b.proprietariosAnunciando).toBe(0);
    expect(b.serie.reduce((s, p) => s + p.total, 0)).toBe(1);
    expect(b.origens.find((o) => o.origem === "IMOVEL")!.total).toBe(1);
    expect(b.origens.find((o) => o.origem === "ANUNCIE")!.total).toBe(0);
    expect(b.topImoveis.map((i) => i.titulo)).toEqual(["Imóvel exclusivo da Org B"]);
    expect(b.topImoveis.some((i) => i.titulo.includes("Org A"))).toBe(false);
  });

  test("interação de outro tenant no MESMO imóvel-alvo não infla o ranking de ninguém", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const pessoaA = await criarPessoa({ organizationId: orgA.organization.id });
    const imovelA = await criarImovel({ organizationId: orgA.organization.id, title: "Alvo da Org A" });
    const pessoaB = await criarPessoa({ organizationId: orgB.organization.id });

    await criarInteracao({ organizationId: orgA.organization.id, personId: pessoaA.id, propertyId: imovelA.id, origin: "IMOVEL", occurredAt: diasAtras(1) });
    await criarInteracao({ organizationId: orgB.organization.id, personId: pessoaB.id, origin: "CONTATO", occurredAt: diasAtras(1) });

    const b = await buscarAnalyticsComercial(orgB.organization.id, { periodo: "30d", agora: AGORA });
    expect(b.topImoveis).toEqual([]);
    expect(b.imoveisComContato).toBe(0);
  });
});
