import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";

// Mesma limitação de resolução de módulo já documentada nos outros testes
// de integração desta sessão (next-auth → next/server não resolve sob
// Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/auth";
import {
  atualizarEstagioInteresse,
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import {
  buscarPipelineAberto,
  buscarPipelineEncerrado,
  buscarMetricasPipeline,
  buscarAnalyticsHistoricoPipeline,
  classificarPrioridadePipeline,
  COLUNAS_ABERTAS,
} from "@/lib/pipeline";
import type { PropertyInterestStage } from "@/generated/prisma/client";

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

async function mudarEstagio(interesseId: string, stage: string) {
  return atualizarEstagioInteresse(interesseId, ESTADO_INICIAL_ACAO, formData({ stage }));
}
async function marcarGanho(interesseId: string) {
  return marcarInteresseComoGanho(interesseId, ESTADO_INICIAL_ACAO, new FormData());
}
async function marcarPerdido(interesseId: string) {
  return marcarInteresseComoPerdido(interesseId, ESTADO_INICIAL_ACAO, new FormData());
}

async function criarInteresseDireto(opcoes: {
  organizationId: string;
  personId: string;
  propertyId: string;
  stage?: PropertyInterestStage;
}) {
  return prisma.propertyInterest.create({
    data: {
      organizationId: opcoes.organizationId,
      personId: opcoes.personId,
      propertyId: opcoes.propertyId,
      stage: opcoes.stage ?? "INTERESTED",
    },
  });
}

// Visita SCHEDULED criada direto via Prisma (não passa pela Server Action
// H.2 — não é o que este arquivo testa) pra popular proximaVisita nos
// cenários de leitura do Pipeline.
async function criarVisitaDireta(opcoes: {
  organizationId: string;
  personId: string;
  propertyId: string;
  propertyInterestId: string;
  scheduledAt: Date;
}) {
  return prisma.scheduledActivity.create({
    data: {
      organizationId: opcoes.organizationId,
      personId: opcoes.personId,
      propertyId: opcoes.propertyId,
      propertyInterestId: opcoes.propertyInterestId,
      type: "VISIT",
      status: "SCHEDULED",
      scheduledAt: opcoes.scheduledAt,
    },
  });
}

function futuro(dias = 3): Date {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
}

describe("Pipeline — Kanban operacional (Fase P.4)", () => {
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  test("K/L) tenant A só recebe PropertyInterest de A — B nunca aparece", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesseA = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoaA.id,
      propertyId: imovelA.id,
    });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({
      organizationId: cenarioB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);

    const idsRetornados = COLUNAS_ABERTAS.flatMap((c) => colunas[c].map((i) => i.id));
    expect(idsRetornados).toEqual([interesseA.id]);
  });

  test("M) ScheduledActivity de outro tenant (anomalia de dado) não influencia o card — proximaVisita permanece null", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesseA = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoaA.id,
      propertyId: imovelA.id,
      stage: "VISIT_SCHEDULED",
    });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, status: "AVAILABLE" });
    // Anomalia deliberada: ScheduledActivity de B com propertyInterestId
    // apontando pro interesse de A — sem FK composta, o Postgres permite
    // isso. Existe exatamente pra provar que a query do Pipeline não
    // confia na FK simples.
    await prisma.scheduledActivity.create({
      data: {
        organizationId: cenarioB.organization.id,
        personId: pessoaB.id,
        propertyId: imovelB.id,
        propertyInterestId: interesseA.id,
        type: "VISIT",
        status: "SCHEDULED",
        scheduledAt: futuro(),
      },
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const item = colunas.VISIT_SCHEDULED.find((i) => i.id === interesseA.id);
    expect(item).toBeDefined();
    expect(item?.proximaVisita).toBeNull();
  });

  test("N) Person/Property corretos no card", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id, name: "Cliente Nominal" });
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      status: "AVAILABLE",
      title: "Cobertura Duplex",
    });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const item = colunas.INTERESTED.find((i) => i.id === interesse.id);
    expect(item?.person).toEqual({ id: pessoa.id, name: "Cliente Nominal" });
    expect(item?.property).toEqual({ id: imovel.id, title: "Cobertura Duplex", status: "AVAILABLE" });
  });

  test("O) os 4 stages abertos aparecem cada um na sua coluna correta", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const ids: Record<string, string> = {};
    for (const stage of COLUNAS_ABERTAS) {
      const pessoaDoStage = await criarPessoa({ organizationId: cenario.organization.id });
      const interesse = await criarInteresseDireto({
        organizationId: cenario.organization.id,
        personId: pessoaDoStage.id,
        propertyId: imovel.id,
        stage,
      });
      ids[stage] = interesse.id;
    }

    const colunas = await buscarPipelineAberto(cenario.organization.id);

    for (const stage of COLUNAS_ABERTAS) {
      expect(colunas[stage].map((i) => i.id)).toContain(ids[stage]);
      for (const outraColuna of COLUNAS_ABERTAS) {
        if (outraColuna !== stage) {
          expect(colunas[outraColuna].map((i) => i.id)).not.toContain(ids[stage]);
        }
      }
    }
  });

  test("P) WON aparece somente em Encerradas, nunca nas 4 colunas abertas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "WON",
        closedAt: new Date(),
      },
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(colunas[coluna].map((i) => i.id)).not.toContain(interesse.id);
    }

    const encerradas = await buscarPipelineEncerrado(cenario.organization.id);
    expect(encerradas.itens.map((i) => i.id)).toContain(interesse.id);
  });

  test("Q) REJECTED aparece somente em Encerradas, nunca nas 4 colunas abertas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "REJECTED",
        closedAt: new Date(),
      },
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(colunas[coluna].map((i) => i.id)).not.toContain(interesse.id);
    }

    const encerradas = await buscarPipelineEncerrado(cenario.organization.id);
    expect(encerradas.itens.map((i) => i.id)).toContain(interesse.id);
  });

  test("R) closedAt é retornado pra item terminal em Encerradas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const agora = new Date();
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "WON",
        closedAt: agora,
      },
    });

    const { itens } = await buscarPipelineEncerrado(cenario.organization.id);
    const item = itens.find((i) => i.id === interesse.id);
    expect(item?.closedAtISO).toBe(agora.toISOString());
  });

  test("S) mover entre stages abertos funciona (reaproveita atualizarEstagioInteresse sem nova regra)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "INTERESTED",
    });

    const resultado = await mudarEstagio(interesse.id, "PROPOSAL");
    expect(resultado.success).toBe(true);

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    expect(colunas.PROPOSAL.map((i) => i.id)).toContain(interesse.id);
    expect(colunas.INTERESTED.map((i) => i.id)).not.toContain(interesse.id);
  });

  test("T) tentativa genérica de mover para WON é rejeitada — item permanece na coluna original", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "PROPOSAL",
    });

    const resultado = await mudarEstagio(interesse.id, "WON");
    expect(resultado.success).toBe(false);

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    expect(colunas.PROPOSAL.map((i) => i.id)).toContain(interesse.id);
    const encerradas = await buscarPipelineEncerrado(cenario.organization.id);
    expect(encerradas.itens.map((i) => i.id)).not.toContain(interesse.id);
  });

  test("U) tentativa genérica de mover para REJECTED é rejeitada — item permanece na coluna original", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "VISITED",
    });

    const resultado = await mudarEstagio(interesse.id, "REJECTED");
    expect(resultado.success).toBe(false);

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    expect(colunas.VISITED.map((i) => i.id)).toContain(interesse.id);
    const encerradas = await buscarPipelineEncerrado(cenario.organization.id);
    expect(encerradas.itens.map((i) => i.id)).not.toContain(interesse.id);
  });

  test("V/X) ganhar pelo fluxo oficial: some das colunas abertas e aparece em Encerradas após nova leitura", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "PROPOSAL",
    });

    const antes = await buscarPipelineAberto(cenario.organization.id);
    expect(antes.PROPOSAL.map((i) => i.id)).toContain(interesse.id);

    const resultado = await marcarGanho(interesse.id);
    expect(resultado.success).toBe(true);

    const depois = await buscarPipelineAberto(cenario.organization.id);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(depois[coluna].map((i) => i.id)).not.toContain(interesse.id);
    }
    const encerradas = await buscarPipelineEncerrado(cenario.organization.id, { resultado: "GANHO" });
    expect(encerradas.itens.map((i) => i.id)).toContain(interesse.id);
  });

  test("W/X) perder pelo fluxo oficial: some das colunas abertas e aparece em Encerradas após nova leitura", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "VISIT_SCHEDULED",
    });

    const resultado = await marcarPerdido(interesse.id);
    expect(resultado.success).toBe(true);

    const depois = await buscarPipelineAberto(cenario.organization.id);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(depois[coluna].map((i) => i.id)).not.toContain(interesse.id);
    }
    const encerradas = await buscarPipelineEncerrado(cenario.organization.id, { resultado: "PERDIDO" });
    expect(encerradas.itens.map((i) => i.id)).toContain(interesse.id);
  });

  // Y) Ausência de N+1 — não instrumentado via contagem literal de SQL
  // (o projeto não tem infraestrutura de log de query em teste, e
  // src/lib/prisma.ts é protegido, não alterado pra isso). A garantia é
  // ESTRUTURAL: o `include`/`select` aninhado de scheduledActivities
  // dentro de propertyInterest.findMany é resolvido pelo Prisma como uma
  // segunda query BATCHED (WHERE propertyInterestId IN (...)), nunca uma
  // consulta por linha — este teste prova a CORREÇÃO desse batching com
  // múltiplos itens, cada um com uma visita distinta, numa única chamada.
  test("Y) múltiplos itens, cada um com sua própria próxima visita, resolvidos numa única chamada (prova de correção do batching, não contagem de SQL)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesses: { id: string; visitaId: string; scheduledAt: Date }[] = [];
    for (let i = 0; i < 5; i++) {
      const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
      const interesse = await criarInteresseDireto({
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "VISIT_SCHEDULED",
      });
      const scheduledAt = futuro(i + 1);
      const visita = await criarVisitaDireta({
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        propertyInterestId: interesse.id,
        scheduledAt,
      });
      interesses.push({ id: interesse.id, visitaId: visita.id, scheduledAt });
    }

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    for (const { id, visitaId, scheduledAt } of interesses) {
      const item = colunas.VISIT_SCHEDULED.find((i) => i.id === id);
      expect(item?.proximaVisita).toEqual({ id: visitaId, scheduledAtISO: scheduledAt.toISOString() });
    }
  });

  test("Z) filtros (busca) respeitam tenant — busca por nome que só existe em B não retorna nada em A", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id, name: "Nome Exclusivo De B" });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({
      organizationId: cenarioB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id, { busca: "Nome Exclusivo De B" });
    const total = COLUNAS_ABERTAS.reduce((soma, c) => soma + colunas[c].length, 0);
    expect(total).toBe(0);
  });

  test("AA) anomalia cross-tenant de Person (FK simples) é redigida no card, nunca vaza dado de outro tenant", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id, name: "Pessoa Sigilosa De B" });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesseAnomalo = await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoaB.id, propertyId: imovelA.id },
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const item = colunas.INTERESTED.find((i) => i.id === interesseAnomalo.id);
    expect(item).toBeDefined();
    expect(item?.person).toBeNull();
    // Nunca vaza o nome de B em nenhum lugar da resposta.
    expect(JSON.stringify(colunas)).not.toContain("Pessoa Sigilosa De B");
  });

  // -------------------------------------------------------------------
  // Métricas do Pipeline (Fase P.5) — buscarMetricasPipeline.
  // -------------------------------------------------------------------

  async function criarEncerradoDireto(opcoes: {
    organizationId: string;
    personId: string;
    propertyId: string;
    stage: "WON" | "REJECTED";
    closedAt: Date | null;
  }) {
    return prisma.propertyInterest.create({
      data: {
        organizationId: opcoes.organizationId,
        personId: opcoes.personId,
        propertyId: opcoes.propertyId,
        stage: opcoes.stage,
        closedAt: opcoes.closedAt,
      },
    });
  }

  test("P) organização A não conta PropertyInterest de B nas métricas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoaA.id, propertyId: imovelA.id });

    const pessoaB1 = await criarPessoa({ organizationId: cenarioB.organization.id });
    const pessoaB2 = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({ organizationId: cenarioB.organization.id, personId: pessoaB1.id, propertyId: imovelB.id });
    await criarInteresseDireto({ organizationId: cenarioB.organization.id, personId: pessoaB2.id, propertyId: imovelB.id, stage: "PROPOSAL" });

    const metricasA = await buscarMetricasPipeline(cenario.organization.id);
    expect(metricasA.emAndamento).toBe(1);
  });

  test("Q/T) quatro stages abertos contados corretamente, total em andamento é a soma exata", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    for (const [stage, quantas] of [
      ["INTERESTED", 3],
      ["VISIT_SCHEDULED", 2],
      ["VISITED", 1],
      ["PROPOSAL", 4],
    ] as const) {
      for (let i = 0; i < quantas; i++) {
        const p = await criarPessoa({ organizationId: cenario.organization.id });
        await criarInteresseDireto({ organizationId: cenario.organization.id, personId: p.id, propertyId: imovel.id, stage });
      }
    }

    const metricas = await buscarMetricasPipeline(cenario.organization.id);
    expect(metricas.porStage).toEqual({ INTERESTED: 3, VISIT_SCHEDULED: 2, VISITED: 1, PROPOSAL: 4 });
    expect(metricas.emAndamento).toBe(10);
  });

  test("R/S) WON e REJECTED contados no período 'todos' (global)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa1 = await criarPessoa({ organizationId: cenario.organization.id });
    const pessoa2 = await criarPessoa({ organizationId: cenario.organization.id });
    const pessoa3 = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoa1.id, propertyId: imovel.id, stage: "WON", closedAt: new Date() });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoa2.id, propertyId: imovel.id, stage: "WON", closedAt: new Date() });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoa3.id, propertyId: imovel.id, stage: "REJECTED", closedAt: new Date() });

    const metricas = await buscarMetricasPipeline(cenario.organization.id, { periodo: "TODOS" });
    expect(metricas.ganhos).toBe(2);
    expect(metricas.perdidos).toBe(1);
    expect(metricas.encerradas).toBe(3);
  });

  test("U/V) 30d conta WON dentro do período e exclui WON anterior ao período", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const agora = new Date("2026-06-15T12:00:00.000Z");
    const dentro = new Date("2026-06-01T00:00:00.000Z"); // 14 dias atrás, dentro de 30d
    const fora = new Date("2026-04-01T00:00:00.000Z"); // muito antes dos 30d
    const pessoaDentro = await criarPessoa({ organizationId: cenario.organization.id });
    const pessoaFora = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoaDentro.id, propertyId: imovel.id, stage: "WON", closedAt: dentro });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoaFora.id, propertyId: imovel.id, stage: "WON", closedAt: fora });

    const metricas = await buscarMetricasPipeline(cenario.organization.id, { periodo: "30d", agora });
    expect(metricas.ganhos).toBe(1);
  });

  test("W) 30d conta REJECTED dentro do período", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const agora = new Date("2026-06-15T12:00:00.000Z");
    const dentro = new Date("2026-06-10T00:00:00.000Z");
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "REJECTED", closedAt: dentro });

    const metricas = await buscarMetricasPipeline(cenario.organization.id, { periodo: "30d", agora });
    expect(metricas.perdidos).toBe(1);
  });

  test("X) closedAt null é excluído do período 30d (legado sem data real, nunca inferida)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "REJECTED", closedAt: null });

    const metricas = await buscarMetricasPipeline(cenario.organization.id, { periodo: "30d" });
    expect(metricas.perdidos).toBe(0);
    expect(metricas.ganhos).toBe(0);
  });

  test("Y) período 'todos' inclui terminal com closedAt null (total histórico, não janela de tempo)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "REJECTED", closedAt: null });

    const metricas = await buscarMetricasPipeline(cenario.organization.id, { periodo: "TODOS" });
    expect(metricas.perdidos).toBe(1);
  });

  test("Z) taxa de ganho correta no período (2 ganhos, 1 perdido -> ~66,7%)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const agora = new Date("2026-06-15T12:00:00.000Z");
    const dentro = new Date("2026-06-10T00:00:00.000Z");
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    for (let i = 0; i < 2; i++) {
      const p = await criarPessoa({ organizationId: cenario.organization.id });
      await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: p.id, propertyId: imovel.id, stage: "WON", closedAt: dentro });
    }
    const pPerdido = await criarPessoa({ organizationId: cenario.organization.id });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pPerdido.id, propertyId: imovel.id, stage: "REJECTED", closedAt: dentro });

    const metricas = await buscarMetricasPipeline(cenario.organization.id, { periodo: "30d", agora });
    expect(metricas.ganhos).toBe(2);
    expect(metricas.perdidos).toBe(1);
    expect(metricas.taxaGanho).not.toBeNull();
    expect(metricas.taxaGanho!).toBeCloseTo(66.6666, 3);
  });

  test("AA) zero encerradas no período -> taxaGanho null (nunca 0%)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id });

    const metricas = await buscarMetricasPipeline(cenario.organization.id, { periodo: "30d" });
    expect(metricas.ganhos).toBe(0);
    expect(metricas.perdidos).toBe(0);
    expect(metricas.taxaGanho).toBeNull();
  });

  test("AB) busca textual (q) do Kanban não é aceita por buscarMetricasPipeline — resumo é sempre global, sem parâmetro de busca", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa1 = await criarPessoa({ organizationId: cenario.organization.id, name: "Alfa" });
    const pessoa2 = await criarPessoa({ organizationId: cenario.organization.id, name: "Beta" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoa1.id, propertyId: imovel.id });
    await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoa2.id, propertyId: imovel.id });

    // buscarMetricasPipeline não tem parâmetro de busca — o resumo global
    // é estruturalmente o mesmo independente de qualquer filtro textual
    // que a UI aplique só ao Kanban (buscarPipelineAberto).
    const metricas = await buscarMetricasPipeline(cenario.organization.id);
    expect(metricas.emAndamento).toBe(2);
  });

  test("AC) resumo global é idêntico independente da visão do Kanban (aberta/encerrada) — mesma chamada, mesmo resultado, sem parâmetro de visão", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "PROPOSAL" });

    // A página chama buscarMetricasPipeline exatamente da mesma forma
    // seja qual for a visão (aberta/encerrada) — simulado aqui chamando
    // duas vezes seguidas, mesmos argumentos, sem nada relacionado a
    // "visao" influenciando a chamada.
    const resumoQuandoAberta = await buscarMetricasPipeline(cenario.organization.id, { periodo: "30d" });
    const resumoQuandoEncerrada = await buscarMetricasPipeline(cenario.organization.id, { periodo: "30d" });
    expect(resumoQuandoAberta).toEqual(resumoQuandoEncerrada);
  });

  test("AD) buscarMetricasPipeline não escreve nada — zero PropertyInterest/ActivityLog criado/alterado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id });

    const antes = {
      interesses: await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } }),
      logs: await prisma.activityLog.count({ where: { organizationId: cenario.organization.id } }),
    };

    await buscarMetricasPipeline(cenario.organization.id, { periodo: "30d" });
    await buscarMetricasPipeline(cenario.organization.id, { periodo: "TODOS" });

    const depois = {
      interesses: await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } }),
      logs: await prisma.activityLog.count({ where: { organizationId: cenario.organization.id } }),
    };
    expect(depois).toEqual(antes);
  });

  test("AE) tenant scoping continua obrigatório — groupBy sem organizationId explícito é recusado", async () => {
    await expect(
      prisma.propertyInterest.groupBy({ by: ["stage"], _count: { _all: true } })
    ).rejects.toThrow(/organizationId/);
  });

  // -------------------------------------------------------------------
  // Aging via PropertyInterestStageHistory no Kanban (Fase P.6) — leitura
  // real via buscarPipelineAberto, não só o mapper puro (já coberto em
  // src/lib/pipeline.test.ts). Prefixo P6- pra nunca colidir com as letras
  // já usadas por P.4/P.5 neste arquivo.
  // -------------------------------------------------------------------

  async function criarHistoricoDireto(opcoes: {
    organizationId: string;
    propertyInterestId: string;
    previousStage: PropertyInterestStage | null;
    newStage: PropertyInterestStage;
    changedAt: Date;
  }) {
    return prisma.propertyInterestStageHistory.create({ data: opcoes });
  }

  test("P6-A) item sem nenhum PropertyInterestStageHistory -> aging null (registro anterior à P.6)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "VISITED",
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const item = colunas.VISITED.find((i) => i.id === interesse.id);
    expect(item?.aging).toBeNull();
  });

  test("P6-B) item com PropertyInterestStageHistory correspondente ao stage atual -> aging calculado corretamente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "VISITED",
    });
    const agora = new Date();
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: "VISIT_SCHEDULED",
      newStage: "VISITED",
      changedAt: new Date(agora.getTime() - 5 * 60 * 60 * 1000), // 5h atrás
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id, { agora });
    const item = colunas.VISITED.find((i) => i.id === interesse.id);
    expect(item?.aging).toBe("Na etapa há 5h");
  });

  test("P6-C) múltiplos itens, cada um com seu próprio último PropertyInterestStageHistory, resolvidos numa única leitura (prova de correção do batching, mesmo espírito de Y)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const agora = new Date();
    const esperados: { id: string; horas: number }[] = [];
    for (let i = 1; i <= 4; i++) {
      const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
      const interesse = await criarInteresseDireto({
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "PROPOSAL",
      });
      await criarHistoricoDireto({
        organizationId: cenario.organization.id,
        propertyInterestId: interesse.id,
        previousStage: "VISITED",
        newStage: "PROPOSAL",
        changedAt: new Date(agora.getTime() - i * 60 * 60 * 1000),
      });
      esperados.push({ id: interesse.id, horas: i });
    }

    const colunas = await buscarPipelineAberto(cenario.organization.id, { agora });
    for (const { id, horas } of esperados) {
      const item = colunas.PROPOSAL.find((i) => i.id === id);
      expect(item?.aging).toBe(`Na etapa há ${horas}h`);
    }
  });

  test("P6-D) reentrada no mesmo stage: aging reflete a transição MAIS RECENTE pro stage atual, nunca a mais antiga", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "VISITED",
    });
    const agora = new Date();
    // Primeira entrada em VISITED, há muito tempo.
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: "VISIT_SCHEDULED",
      newStage: "VISITED",
      changedAt: new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000),
    });
    // Saiu pra PROPOSAL e voltou pra VISITED recentemente (reentrada).
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: "PROPOSAL",
      newStage: "VISITED",
      changedAt: new Date(agora.getTime() - 2 * 60 * 60 * 1000),
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id, { agora });
    const item = colunas.VISITED.find((i) => i.id === interesse.id);
    expect(item?.aging).toBe("Na etapa há 2h");
  });

  test("P6-E) PropertyInterestStageHistory de outro tenant (anomalia de dado) não influencia o aging do card", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "VISITED",
    });
    // Anomalia deliberada: history de B apontando pro interesse de A —
    // sem FK composta, o Postgres permite isso.
    await criarHistoricoDireto({
      organizationId: cenarioB.organization.id,
      propertyInterestId: interesse.id,
      previousStage: "VISIT_SCHEDULED",
      newStage: "VISITED",
      changedAt: new Date(),
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const item = colunas.VISITED.find((i) => i.id === interesse.id);
    expect(item?.aging).toBeNull();
  });

  test("P6-F) item encerrado (WON) nunca tem aging, mesmo com PropertyInterestStageHistory presente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const agora = new Date();
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "WON",
        closedAt: agora,
      },
    });
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: "PROPOSAL",
      newStage: "WON",
      changedAt: agora,
    });

    const { itens } = await buscarPipelineEncerrado(cenario.organization.id);
    const item = itens.find((i) => i.id === interesse.id);
    expect(item?.aging).toBeNull();
  });

  // -------------------------------------------------------------------
  // Analytics históricos do Pipeline (Fase P.7) — Postgres real. Prefixo
  // P7- pra nunca colidir com letras já usadas por P.4/P.5/P.6 neste
  // arquivo.
  // -------------------------------------------------------------------

  test("P7-AR) tenant A não conta history/registros de B nos analytics históricos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, status: "AVAILABLE" });
    const interesseB = await criarInteresseDireto({
      organizationId: cenarioB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
      stage: "VISITED",
    });
    await criarHistoricoDireto({
      organizationId: cenarioB.organization.id,
      propertyInterestId: interesseB.id,
      previousStage: null,
      newStage: "INTERESTED",
      changedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id);
    expect(analytics.entradasPorEtapa.INTERESTED).toBe(0);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(analytics.agingAgregado[coluna]).toBeNull();
    }
    expect(analytics.transicoesObservadas).toEqual([]);
  });

  test("P7-AS) history real criado via atualizarEstagioInteresse aparece nas transições/entradas observadas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "INTERESTED",
    });
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: null,
      newStage: "INTERESTED",
      changedAt: new Date(),
    });

    const fd = new FormData();
    fd.set("stage", "PROPOSAL");
    await atualizarEstagioInteresse(interesse.id, ESTADO_INICIAL_ACAO, fd);

    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "TODOS" });
    expect(analytics.entradasPorEtapa.PROPOSAL).toBe(1);
    const transicao = analytics.transicoesObservadas.find((t) => t.de === "INTERESTED" && t.para === "PROPOSAL");
    expect(transicao?.quantidade).toBe(1);
  });

  test("P7-AT) genesis + movimentação real gera episódio concluído com duração correta (tempo médio histórico)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "VISIT_SCHEDULED",
    });
    const agora = new Date();
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: null,
      newStage: "INTERESTED",
      changedAt: new Date(agora.getTime() - 3 * 24 * 60 * 60 * 1000),
    });
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: "INTERESTED",
      newStage: "VISIT_SCHEDULED",
      changedAt: new Date(agora.getTime() - 1 * 24 * 60 * 60 * 1000),
    });

    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "TODOS", agora });
    // INTERESTED: episódio concluído de exatos 2 dias (3 dias atrás -> 1 dia atrás).
    expect(analytics.tempoMedioHistorico.INTERESTED).toBe(2 * 24 * 60 * 60 * 1000);
    // VISIT_SCHEDULED: episódio ainda aberto (aging), não entra no tempo médio histórico.
    expect(analytics.tempoMedioHistorico.VISIT_SCHEDULED).toBeNull();
    expect(analytics.agingAgregado.VISIT_SCHEDULED).toBe(1 * 24 * 60 * 60 * 1000);
  });

  test("P7-AU) fechamento real (marcarInteresseComoGanho) gera tempo até fechamento correto a partir da genesis", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "PROPOSAL",
    });
    const genesisEm = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: null,
      newStage: "INTERESTED",
      changedAt: genesisEm,
    });

    await marcarInteresseComoGanho(interesse.id, ESTADO_INICIAL_ACAO, new FormData());

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: interesse.id, organizationId: cenario.organization.id },
    });
    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "TODOS" });
    expect(analytics.tempoAteFechamento.ganho).not.toBeNull();
    const esperadoMs = atualizado!.closedAt!.getTime() - genesisEm.getTime();
    expect(analytics.tempoAteFechamento.ganho).toBe(esperadoMs);
  });

  test("P7-AV) registro legado (sem NENHUM history) não contamina tempo médio nem aging agregado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "PROPOSAL",
    });

    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(analytics.agingAgregado[coluna]).toBeNull();
      expect(analytics.tempoMedioHistorico[coluna]).toBeNull();
    }
  });

  test("P7-AW) legado com history parcial (primeiro evento não é genesis) contribui com episódios válidos, mas nunca com tempo até fechamento", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "PROPOSAL",
    });
    const agora = new Date();
    // Primeiro history real NÃO é genesis (previousStage != null) —
    // simula um registro que já existia antes da P.6 e só ganhou history
    // a partir da primeira transição real pós-P.6.
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: "VISITED",
      newStage: "PROPOSAL",
      changedAt: new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000),
    });

    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "TODOS", agora });
    // Episódio aberto (aging) ainda é válido mesmo sem genesis.
    expect(analytics.agingAgregado.PROPOSAL).toBe(2 * 24 * 60 * 60 * 1000);
  });

  test("P7-AX) período altera entradas/transições/tempo médio histórico/tempo até fechamento, mas NUNCA o aging agregado (sempre global)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "INTERESTED",
    });
    const agora = new Date("2026-06-15T12:00:00.000Z");
    // Genesis MUITO antiga — fora da janela de 30d, mas aging é estoque
    // presente (sempre global).
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: null,
      newStage: "INTERESTED",
      changedAt: new Date(agora.getTime() - 200 * 24 * 60 * 60 * 1000),
    });

    const em30d = await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "30d", agora });
    const emTodos = await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "TODOS", agora });

    expect(em30d.entradasPorEtapa.INTERESTED).toBe(0); // fora da janela de 30d
    expect(emTodos.entradasPorEtapa.INTERESTED).toBe(1); // sem filtro
    // Aging agregado é idêntico nos dois períodos — nunca filtrado.
    expect(em30d.agingAgregado.INTERESTED).toBe(emTodos.agingAgregado.INTERESTED);
    expect(em30d.agingAgregado.INTERESTED).toBe(200 * 24 * 60 * 60 * 1000);
  });

  test("P7-AY) buscarAnalyticsHistoricoPipeline não escreve nada — zero PropertyInterest/PropertyInterestStageHistory/ActivityLog criado/alterado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
    });
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: null,
      newStage: "INTERESTED",
      changedAt: new Date(),
    });

    const antes = {
      interesses: await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } }),
      history: await prisma.propertyInterestStageHistory.count({ where: { organizationId: cenario.organization.id } }),
      logs: await prisma.activityLog.count({ where: { organizationId: cenario.organization.id } }),
    };

    await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "30d" });
    await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "TODOS" });

    const depois = {
      interesses: await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } }),
      history: await prisma.propertyInterestStageHistory.count({ where: { organizationId: cenario.organization.id } }),
      logs: await prisma.activityLog.count({ where: { organizationId: cenario.organization.id } }),
    };
    expect(depois).toEqual(antes);
  });

  test("P7-AZ) buscarMetricasPipeline (P.5) continua idêntica após a introdução dos analytics históricos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa1 = await criarPessoa({ organizationId: cenario.organization.id });
    const pessoa2 = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoa1.id, propertyId: imovel.id, stage: "PROPOSAL" });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoa2.id, propertyId: imovel.id, stage: "WON", closedAt: new Date() });

    const metricas = await buscarMetricasPipeline(cenario.organization.id, { periodo: "TODOS" });
    expect(metricas.emAndamento).toBe(1);
    expect(metricas.ganhos).toBe(1);
    expect(metricas.porStage.PROPOSAL).toBe(1);
  });

  test("P7-BA) tenant scoping obrigatório — groupBy de PropertyInterestStageHistory sem organizationId explícito é recusado", async () => {
    await expect(
      prisma.propertyInterestStageHistory.groupBy({ by: ["newStage"], _count: { _all: true } })
    ).rejects.toThrow(/organizationId/);
  });

  test("P7-BB) amostraLimitada é false quando a organização tem menos registros que o teto", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id });

    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id);
    expect(analytics.amostraLimitada).toBe(false);
  });

  test("P7-BC) reentrada real na mesma etapa (via atualizarEstagioInteresse) produz dois episódios distintos, nunca fundidos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "INTERESTED",
    });
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: interesse.id,
      previousStage: null,
      newStage: "INTERESTED",
      changedAt: new Date(),
    });

    const fd1 = new FormData();
    fd1.set("stage", "VISIT_SCHEDULED");
    await atualizarEstagioInteresse(interesse.id, ESTADO_INICIAL_ACAO, fd1);
    const fd2 = new FormData();
    fd2.set("stage", "PROPOSAL");
    await atualizarEstagioInteresse(interesse.id, ESTADO_INICIAL_ACAO, fd2);
    const fd3 = new FormData();
    fd3.set("stage", "VISIT_SCHEDULED");
    await atualizarEstagioInteresse(interesse.id, ESTADO_INICIAL_ACAO, fd3);

    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "TODOS" });
    // 2 entradas em VISIT_SCHEDULED: a primeira (concluída) e a segunda (reentrada, aberta/aging).
    expect(analytics.entradasPorEtapa.VISIT_SCHEDULED).toBe(2);
    expect(analytics.tempoMedioHistorico.VISIT_SCHEDULED).not.toBeNull();
    expect(analytics.agingAgregado.VISIT_SCHEDULED).not.toBeNull();
  });

  // -------------------------------------------------------------------
  // Priorização comercial (Fase P.8) — wiring real: buscarPipelineAberto
  // (P.4) + buscarAnalyticsHistoricoPipeline (P.7) + classificarPrioridadePipeline,
  // exatamente como pipeline/page.tsx combina os três. Prefixo P8- pra
  // nunca colidir com letras já usadas por P.4/P.5/P.6/P.7 neste arquivo.
  // -------------------------------------------------------------------

  function passado(dias: number): Date {
    return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  }

  test("P8-U) atividade SCHEDULED vencida (dia calendário já passado) via buscarPipelineAberto real -> ALTA com ATIVIDADE_VENCIDA", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "VISIT_SCHEDULED",
    });
    await criarVisitaDireta({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      propertyInterestId: interesse.id,
      scheduledAt: passado(3),
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id);
    const item = colunas.VISIT_SCHEDULED.find((i) => i.id === interesse.id)!;
    const prioridade = classificarPrioridadePipeline(item, analytics.tempoMedioHistorico.VISIT_SCHEDULED, new Date());

    expect(prioridade.nivel).toBe("ALTA");
    expect(prioridade.motivos[0]).toEqual({ tipo: "ATIVIDADE_VENCIDA", scheduledAtISO: item.proximaVisita!.scheduledAtISO });
  });

  test("P8-V) PROPOSAL sem nenhuma ScheduledActivity real -> ALTA com PROPOSTA_SEM_PROXIMA_ACAO", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "PROPOSAL",
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const item = colunas.PROPOSAL.find((i) => i.id === interesse.id)!;
    const prioridade = classificarPrioridadePipeline(item, null, new Date());

    expect(prioridade).toEqual({ nivel: "ALTA", motivos: [{ tipo: "PROPOSTA_SEM_PROXIMA_ACAO" }] });
  });

  test("P8-W) VISITED sem próxima ação real -> MEDIA; INTERESTED sem próxima ação real -> NORMAL (nunca penalizado)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa1 = await criarPessoa({ organizationId: cenario.organization.id });
    const pessoa2 = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const visitado = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa1.id,
      propertyId: imovel.id,
      stage: "VISITED",
    });
    const interessado = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa2.id,
      propertyId: imovel.id,
      stage: "INTERESTED",
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const itemVisitado = colunas.VISITED.find((i) => i.id === visitado.id)!;
    const itemInteressado = colunas.INTERESTED.find((i) => i.id === interessado.id)!;

    expect(classificarPrioridadePipeline(itemVisitado, null, new Date()).nivel).toBe("MEDIA");
    expect(classificarPrioridadePipeline(itemInteressado, null, new Date())).toEqual({ nivel: "NORMAL", motivos: [] });
  });

  test("P8-X) aging real (via PropertyInterestStageHistory) acima da média histórica real (via buscarAnalyticsHistoricoPipeline) -> MEDIA com AGING_ACIMA_DA_MEDIA", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });

    // Um episódio CONCLUÍDO curto em INTERESTED (1 dia) pra estabelecer uma
    // média histórica baixa e real, via genesis + movimentação.
    const pessoaConcluida = await criarPessoa({ organizationId: cenario.organization.id });
    const concluido = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoaConcluida.id,
      propertyId: imovel.id,
      stage: "VISIT_SCHEDULED",
    });
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: concluido.id,
      previousStage: null,
      newStage: "INTERESTED",
      changedAt: passado(10),
    });
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: concluido.id,
      previousStage: "INTERESTED",
      newStage: "VISIT_SCHEDULED",
      changedAt: passado(9), // episódio INTERESTED durou 1 dia
    });

    // Item ATUAL, aberto há 8 dias em INTERESTED — bem acima da média de 1 dia.
    const pessoaAtual = await criarPessoa({ organizationId: cenario.organization.id });
    const atual = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoaAtual.id,
      propertyId: imovel.id,
      stage: "INTERESTED",
    });
    await criarHistoricoDireto({
      organizationId: cenario.organization.id,
      propertyInterestId: atual.id,
      previousStage: null,
      newStage: "INTERESTED",
      changedAt: passado(8),
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id, { periodo: "TODOS" });
    const item = colunas.INTERESTED.find((i) => i.id === atual.id)!;
    expect(item.agingMs).not.toBeNull();
    expect(analytics.tempoMedioHistorico.INTERESTED).not.toBeNull();

    const prioridade = classificarPrioridadePipeline(item, analytics.tempoMedioHistorico.INTERESTED, new Date());
    expect(prioridade.nivel).toBe("MEDIA");
    expect(prioridade.motivos.map((m) => m.tipo)).toContain("AGING_ACIMA_DA_MEDIA");
  });

  test("P8-Y) legado sem NENHUM PropertyInterestStageHistory e sem ScheduledActivity -> NORMAL (nunca penalizado pela ausência de dado)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const legado = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "INTERESTED",
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id);
    const item = colunas.INTERESTED.find((i) => i.id === legado.id)!;
    expect(item.agingMs).toBeNull();

    const prioridade = classificarPrioridadePipeline(item, analytics.tempoMedioHistorico.INTERESTED, new Date());
    expect(prioridade).toEqual({ nivel: "NORMAL", motivos: [] });
  });

  test("P8-Z) legado sem history mas com atividade vencida real -> ainda ALTA (sinal de agenda é independente de history)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const legado = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "VISIT_SCHEDULED",
    });
    await criarVisitaDireta({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      propertyInterestId: legado.id,
      scheduledAt: passado(2),
    });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const item = colunas.VISIT_SCHEDULED.find((i) => i.id === legado.id)!;
    expect(item.agingMs).toBeNull();

    const prioridade = classificarPrioridadePipeline(item, null, new Date());
    expect(prioridade.nivel).toBe("ALTA");
  });

  test("P8-AA) WON/REJECTED nunca aparecem em buscarPipelineAberto — nunca chegam a ser classificados", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarEncerradoDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "WON", closedAt: new Date() });

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const total = COLUNAS_ABERTAS.reduce((soma, c) => soma + colunas[c].length, 0);
    expect(total).toBe(0);
  });

  test("P8-AB) tenant A nunca tem prioridade influenciada por atividade vencida de B (isolamento herdado de buscarPipelineAberto/buscarAnalyticsHistoricoPipeline)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesseA = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoaA.id,
      propertyId: imovelA.id,
      stage: "INTERESTED",
    });

    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, status: "AVAILABLE" });
    const interesseB = await criarInteresseDireto({
      organizationId: cenarioB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
      stage: "VISIT_SCHEDULED",
    });
    await criarVisitaDireta({
      organizationId: cenarioB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
      propertyInterestId: interesseB.id,
      scheduledAt: passado(5),
    });

    const colunasA = await buscarPipelineAberto(cenario.organization.id);
    expect(colunasA.INTERESTED.map((i) => i.id)).toEqual([interesseA.id]);
    // interesseB nunca aparece em nenhuma coluna de A — sua atividade
    // vencida jamais pode influenciar a prioridade de A.
    const idsEmA = COLUNAS_ABERTAS.flatMap((c) => colunasA[c].map((i) => i.id));
    expect(idsEmA).not.toContain(interesseB.id);
  });

  test("P8-AC) classificarPrioridadePipeline não escreve nada — zero PropertyInterest/ScheduledActivity/PropertyInterestStageHistory alterado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "PROPOSAL" });

    const antes = {
      interesses: await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } }),
      atividades: await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } }),
      historico: await prisma.propertyInterestStageHistory.count({ where: { organizationId: cenario.organization.id } }),
    };

    const colunas = await buscarPipelineAberto(cenario.organization.id);
    const analytics = await buscarAnalyticsHistoricoPipeline(cenario.organization.id);
    for (const coluna of COLUNAS_ABERTAS) {
      for (const item of colunas[coluna]) {
        classificarPrioridadePipeline(item, analytics.tempoMedioHistorico[coluna], new Date());
      }
    }

    const depois = {
      interesses: await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } }),
      atividades: await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } }),
      historico: await prisma.propertyInterestStageHistory.count({ where: { organizationId: cenario.organization.id } }),
    };
    expect(depois).toEqual(antes);
  });

  test("P8-AD) determinístico entre duas leituras consecutivas — mesmo estado no banco produz a mesma classificação", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const interesse = await criarInteresseDireto({ organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "PROPOSAL" });

    async function ler() {
      const colunas = await buscarPipelineAberto(cenario!.organization.id);
      const analytics = await buscarAnalyticsHistoricoPipeline(cenario!.organization.id);
      const item = colunas.PROPOSAL.find((i) => i.id === interesse.id)!;
      return classificarPrioridadePipeline(item, analytics.tempoMedioHistorico.PROPOSAL, new Date("2026-06-15T12:00:00.000Z"));
    }

    const primeira = await ler();
    const segunda = await ler();
    expect(primeira).toEqual(segunda);
  });
});
