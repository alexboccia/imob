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
import { buscarPipelineAberto, buscarPipelineEncerrado, COLUNAS_ABERTAS } from "@/lib/pipeline";
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
});
