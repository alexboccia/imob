import { describe, test, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";

// Mesma limitação de resolução de módulo já documentada em
// property-interest.test.ts (next-auth → next/server não resolve sob
// Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/auth";
import {
  criarAgendamentoVisita,
  remarcarAgendamentoVisita,
  cancelarAgendamentoVisita,
  concluirAgendamentoVisita,
  atualizarObservacaoAgendamentoVisita,
} from "@/app/app/agendamentos/actions";
import {
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import type { PropertyInterestStage } from "@/generated/prisma/client";

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

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

// datetime-local ("YYYY-MM-DDTHH:mm") — mesma interpretação UTC-explícita
// de parseScheduledAt (scheduled-activity-schema.ts).
function futuro(diasNoFuturo = 7): string {
  return new Date(Date.now() + diasNoFuturo * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
function passado(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

async function agendar(propertyInterestId: string, campos: Record<string, string>) {
  return criarAgendamentoVisita(propertyInterestId, ESTADO_INICIAL_ACAO, formData(campos));
}
async function remarcar(scheduledActivityId: string, campos: Record<string, string>) {
  return remarcarAgendamentoVisita(scheduledActivityId, ESTADO_INICIAL_ACAO, formData(campos));
}
async function cancelar(scheduledActivityId: string) {
  return cancelarAgendamentoVisita(scheduledActivityId, ESTADO_INICIAL_ACAO, new FormData());
}
async function concluir(scheduledActivityId: string) {
  return concluirAgendamentoVisita(scheduledActivityId, ESTADO_INICIAL_ACAO, new FormData());
}
async function atualizarObservacao(scheduledActivityId: string, notes: string) {
  return atualizarObservacaoAgendamentoVisita(
    scheduledActivityId,
    ESTADO_INICIAL_ACAO,
    formData({ notes })
  );
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

// Cenário padrão: organização com CRM habilitado + pessoa + imóvel
// AVAILABLE + PropertyInterest INTERESTED. A maioria dos testes parte
// exatamente daqui.
async function cenarioPadrao(stage?: PropertyInterestStage) {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  autenticarComo(cenario);
  const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
  const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
  const interesse = await criarInteresseDireto({
    organizationId: cenario.organization.id,
    personId: pessoa.id,
    propertyId: imovel.id,
    stage,
  });
  return { cenario, pessoa, imovel, interesse };
}

describe("Agenda de visitas — Fase H.2 do CRM", () => {
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  // -------------------------------------------------------------------
  // Criação
  // -------------------------------------------------------------------

  test("A) cria visita válida", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "Cliente confirmou" });

    expect(resultado.success).toBe(true);
    const linha = await prisma.scheduledActivity.findFirst({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    expect(linha).not.toBeNull();
    expect(linha?.type).toBe("VISIT");
    expect(linha?.status).toBe("SCHEDULED");
    expect(linha?.personId).toBe(ctx.pessoa.id);
    expect(linha?.propertyId).toBe(ctx.imovel.id);
    expect(linha?.notes).toBe("Cliente confirmou");
  });

  test("B) PropertyInterest inteiramente de outro tenant é rejeitado", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });
    const interesseB = await criarInteresseDireto({
      organizationId: cenarioB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
    });

    const resultado = await agendar(interesseB.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
    const total = await prisma.scheduledActivity.count({ where: { organizationId: ctx.cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("C) organizationId forjado no FormData é ignorado", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });

    const resultado = await agendar(ctx.interesse.id, {
      scheduledAt: futuro(),
      organizationId: cenarioB.organization.id,
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.scheduledActivity.findFirst({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    expect(linha?.organizationId).toBe(ctx.cenario.organization.id);
  });

  test("D) createdByMemberId forjado no FormData é ignorado", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, {
      scheduledAt: futuro(),
      createdByMemberId: "outro-membro-forjado",
    });

    expect(resultado.success).toBe(true);
    const linha = await prisma.scheduledActivity.findFirst({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    expect(linha?.createdByMemberId).toBe(ctx.cenario.membro.id);
  });

  test("E) visita no passado é rejeitada", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: passado() });

    expect(resultado.success).toBe(false);
    expect(resultado.fieldErrors?.scheduledAt).toBeDefined();
    const total = await prisma.scheduledActivity.count({ where: { organizationId: ctx.cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("F) notes acima de 2000 caracteres é rejeitada", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "x".repeat(2001) });

    expect(resultado.success).toBe(false);
    expect(resultado.fieldErrors?.notes).toBeDefined();
    const total = await prisma.scheduledActivity.count({ where: { organizationId: ctx.cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("G) propertyInterestId inexistente rejeita a criação", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);

    const resultado = await agendar("propertyinterest-inexistente", { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
    const total = await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("H) PropertyInterest de outro tenant rejeita (não revela existência)", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });
    const interesseB = await criarInteresseDireto({
      organizationId: cenarioB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
    });

    const resultado = await agendar(interesseB.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
    expect(resultado.message).not.toMatch(/outro|tenant|organiza/i);
  });

  test("I) PropertyInterest com Person de outro tenant (anomalia de dado) é rejeitado", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });

    // Simula uma linha corrompida/fora do fluxo normal da aplicação — sem
    // FK composta (personId, organizationId), o Postgres permite isso.
    // Existe exatamente pra provar que a Server Action não confia só no
    // organizationId da própria linha de PropertyInterest.
    const interesseAnomalo = await prisma.propertyInterest.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: pessoaB.id,
        propertyId: ctx.imovel.id,
      },
    });

    const resultado = await agendar(interesseAnomalo.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
    const total = await prisma.scheduledActivity.count({ where: { organizationId: ctx.cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("J) PropertyInterest com Property de outro tenant (anomalia de dado) é rejeitado", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });

    const interesseAnomalo = await prisma.propertyInterest.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: imovelB.id,
      },
    });

    const resultado = await agendar(interesseAnomalo.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
    const total = await prisma.scheduledActivity.count({ where: { organizationId: ctx.cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("K) Property não AVAILABLE rejeita criação", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await prisma.property.update({
      where: { id: ctx.imovel.id, organizationId: ctx.cenario.organization.id },
      data: { status: "SOLD" },
    });

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
    const total = await prisma.scheduledActivity.count({ where: { organizationId: ctx.cenario.organization.id } });
    expect(total).toBe(0);
  });

  // -------------------------------------------------------------------
  // Sincronização de stage na criação
  // -------------------------------------------------------------------

  test("L) INTERESTED avança para VISIT_SCHEDULED ao criar visita", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;

    await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.stage).toBe("VISIT_SCHEDULED");
  });

  test("M) VISIT_SCHEDULED não é regredido ao criar outra visita", async () => {
    const ctx = await cenarioPadrao("VISIT_SCHEDULED");
    cenario = ctx.cenario;

    await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.stage).toBe("VISIT_SCHEDULED");
  });

  test("N) VISITED permite nova visita sem regredir stage", async () => {
    const ctx = await cenarioPadrao("VISITED");
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(true);
    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.stage).toBe("VISITED");
  });

  test("O) PROPOSAL permite nova visita sem regredir stage", async () => {
    const ctx = await cenarioPadrao("PROPOSAL");
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(true);
    const atualizado = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.stage).toBe("PROPOSAL");
  });

  test("P) REJECTED bloqueia nova visita", async () => {
    const ctx = await cenarioPadrao("REJECTED");
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
    const total = await prisma.scheduledActivity.count({ where: { organizationId: ctx.cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("Q) múltiplas visitas são permitidas para o mesmo PropertyInterest", async () => {
    const ctx = await cenarioPadrao("VISITED");
    cenario = ctx.cenario;
    const primeira = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        status: "COMPLETED",
        completedAt: new Date(),
        scheduledAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    });

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(true);
    const total = await prisma.scheduledActivity.count({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    expect(total).toBe(2);
    const primeiraAinda = await prisma.scheduledActivity.findUnique({
      where: { id: primeira.id, organizationId: ctx.cenario.organization.id },
    });
    expect(primeiraAinda?.status).toBe("COMPLETED");
  });

  // -------------------------------------------------------------------
  // Remarcar
  // -------------------------------------------------------------------

  test("R) remarcar visita SCHEDULED atualiza a mesma linha", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(1) });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    const novaData = futuro(14);

    const resultado = await remarcar(original.id, { scheduledAt: novaData });

    expect(resultado.success).toBe(true);
    const total = await prisma.scheduledActivity.count({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    expect(total).toBe(1);
    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.id).toBe(original.id);
    expect(atualizado?.status).toBe("SCHEDULED");
    expect(atualizado?.completedAt).toBeNull();
    expect(atualizado?.cancelledAt).toBeNull();
    expect(atualizado?.scheduledAt.toISOString()).not.toBe(original.scheduledAt.toISOString());
  });

  test("S) remarcar visita COMPLETED rejeita", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(1) });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await concluir(original.id);

    const resultado = await remarcar(original.id, { scheduledAt: futuro(14) });

    expect(resultado.success).toBe(false);
  });

  test("T) remarcar visita CANCELLED rejeita", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(1) });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await cancelar(original.id);

    const resultado = await remarcar(original.id, { scheduledAt: futuro(14) });

    expect(resultado.success).toBe(false);
  });

  test("U) remarcar para o passado rejeita", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(1) });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const resultado = await remarcar(original.id, { scheduledAt: passado() });

    expect(resultado.success).toBe(false);
    expect(resultado.fieldErrors?.scheduledAt).toBeDefined();
  });

  test("V) remarcar com imóvel não AVAILABLE rejeita", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(1) });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await prisma.property.update({
      where: { id: ctx.imovel.id, organizationId: ctx.cenario.organization.id },
      data: { status: "RESERVED" },
    });

    const resultado = await remarcar(original.id, { scheduledAt: futuro(14) });

    expect(resultado.success).toBe(false);
  });

  // -------------------------------------------------------------------
  // Cancelar
  // -------------------------------------------------------------------

  test("W) cancelar visita SCHEDULED", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const resultado = await cancelar(original.id);

    expect(resultado.success).toBe(true);
    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.status).toBe("CANCELLED");
    expect(atualizado?.cancelledAt).not.toBeNull();
    expect(atualizado?.completedAt).toBeNull();
  });

  test("X) cancelar duas vezes é idempotente", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const primeiro = await cancelar(original.id);
    const segundo = await cancelar(original.id);

    expect(primeiro.success).toBe(true);
    expect(segundo.success).toBe(true);
    const totalLogsCancelados = await prisma.activityLog.count({
      where: {
        organizationId: ctx.cenario.organization.id,
        entity: "ScheduledActivity",
        entityId: original.id,
        action: "scheduled_activity_cancelled",
      },
    });
    expect(totalLogsCancelados).toBe(1);
  });

  test("Y) cancelar visita COMPLETED rejeita", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await concluir(original.id);

    const resultado = await cancelar(original.id);

    expect(resultado.success).toBe(false);
    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.status).toBe("COMPLETED");
  });

  test("Z) cancelar não regride PropertyInterest.stage", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await cancelar(original.id);

    const interesseAtual = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(interesseAtual?.stage).toBe("VISIT_SCHEDULED");
  });

  // -------------------------------------------------------------------
  // Concluir
  // -------------------------------------------------------------------

  test("AA) concluir visita SCHEDULED tem sucesso", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const resultado = await concluir(original.id);

    expect(resultado.success).toBe(true);
  });

  test("AB) concluir muda status para COMPLETED", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await concluir(original.id);

    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.status).toBe("COMPLETED");
  });

  test("AC) concluir preenche completedAt", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await concluir(original.id);

    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.completedAt).not.toBeNull();
    expect(atualizado?.cancelledAt).toBeNull();
  });

  test("AD) concluir avança VISIT_SCHEDULED para VISITED", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await concluir(original.id);

    const interesseAtual = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(interesseAtual?.stage).toBe("VISITED");
  });

  test("AE) concluir não altera stage já VISITED", async () => {
    const ctx = await cenarioPadrao("VISITED");
    cenario = ctx.cenario;
    const atividade = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await concluir(atividade.id);

    const interesseAtual = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(interesseAtual?.stage).toBe("VISITED");
  });

  test("AF) concluir não altera stage PROPOSAL", async () => {
    const ctx = await cenarioPadrao("PROPOSAL");
    cenario = ctx.cenario;
    const atividade = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await concluir(atividade.id);

    const interesseAtual = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(interesseAtual?.stage).toBe("PROPOSAL");
  });

  test("AG) concluir visita CANCELLED rejeita", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await cancelar(original.id);

    const resultado = await concluir(original.id);

    expect(resultado.success).toBe(false);
  });

  test("AH) concluir duas vezes é idempotente", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const primeiro = await concluir(original.id);
    const segundo = await concluir(original.id);

    expect(primeiro.success).toBe(true);
    expect(segundo.success).toBe(true);
  });

  // -------------------------------------------------------------------
  // Interaction ao concluir
  // -------------------------------------------------------------------

  test("AI) concluir cria exatamente uma Interaction VISIT", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await concluir(original.id);

    const total = await prisma.interaction.count({
      where: { organizationId: ctx.cenario.organization.id, personId: ctx.pessoa.id, type: "VISIT" },
    });
    expect(total).toBe(1);
  });

  test("AJ) segunda conclusão não duplica a Interaction", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await concluir(original.id);
    await concluir(original.id);

    const total = await prisma.interaction.count({
      where: { organizationId: ctx.cenario.organization.id, personId: ctx.pessoa.id, type: "VISIT" },
    });
    expect(total).toBe(1);
  });

  test("AK) Interaction usa a Person correta", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await concluir(original.id);

    const interacao = await prisma.interaction.findFirst({
      where: { organizationId: ctx.cenario.organization.id, type: "VISIT" },
    });
    expect(interacao?.personId).toBe(ctx.pessoa.id);
    expect(interacao?.propertyId).toBe(ctx.imovel.id);
  });

  test("AL) Interaction pertence ao tenant correto", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await concluir(original.id);

    const interacao = await prisma.interaction.findFirst({
      where: { organizationId: ctx.cenario.organization.id, type: "VISIT" },
    });
    expect(interacao?.organizationId).toBe(ctx.cenario.organization.id);
  });

  // -------------------------------------------------------------------
  // ActivityLog
  // -------------------------------------------------------------------

  test("AM) ActivityLog de criação", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;

    await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: ctx.cenario.organization.id, entity: "ScheduledActivity", action: "scheduled_activity_created" },
    });
    expect(log).not.toBeNull();
  });

  test("AN) ActivityLog de remarcação com from/to", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(1) });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await remarcar(original.id, { scheduledAt: futuro(14) });

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: ctx.cenario.organization.id, entity: "ScheduledActivity", action: "scheduled_activity_rescheduled" },
    });
    expect(log).not.toBeNull();
    const payload = log?.payload as { from: string; to: string };
    expect(payload.from).toBeDefined();
    expect(payload.to).toBeDefined();
    expect(payload.from).not.toBe(payload.to);
  });

  test("AO) ActivityLog de cancelamento sem notes", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "nota sensível do cliente" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await cancelar(original.id);

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: ctx.cenario.organization.id, entity: "ScheduledActivity", action: "scheduled_activity_cancelled" },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log?.payload ?? {})).not.toContain("nota sensível");
  });

  test("AP) ActivityLog de conclusão sem notes", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "nota sensível do cliente" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await concluir(original.id);

    const log = await prisma.activityLog.findFirst({
      where: { organizationId: ctx.cenario.organization.id, entity: "ScheduledActivity", action: "scheduled_activity_completed" },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log?.payload ?? {})).not.toContain("nota sensível");
  });

  test("AQ) nenhum ActivityLog da agenda contém PII", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await prisma.person.update({
      where: { id: ctx.pessoa.id, organizationId: ctx.cenario.organization.id },
      data: { name: "Fulano Sigiloso", email: "fulano-sigiloso@email.com", phone: "11999990000" },
    });
    await agendar(ctx.interesse.id, { scheduledAt: futuro(1), notes: "Segredo: quer pagar à vista" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await remarcar(original.id, { scheduledAt: futuro(14) });
    await concluir(original.id);

    const logs = await prisma.activityLog.findMany({
      where: { organizationId: ctx.cenario.organization.id, entity: { in: ["ScheduledActivity", "PropertyInterest"] } },
    });
    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) {
      const serializado = JSON.stringify(log.payload ?? {});
      expect(serializado).not.toContain("Fulano Sigiloso");
      expect(serializado).not.toContain("fulano-sigiloso@email.com");
      expect(serializado).not.toContain("11999990000");
      expect(serializado).not.toContain("Segredo");
    }
  });

  // -------------------------------------------------------------------
  // Read-only / entitlement / tenant / queries
  // -------------------------------------------------------------------

  test("AR) consulta read-only não cria nada", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;

    await prisma.person.findUnique({
      where: { id: ctx.pessoa.id, organizationId: ctx.cenario.organization.id },
      include: {
        propertyInterests: {
          where: { organizationId: ctx.cenario.organization.id },
          include: {
            property: { select: { id: true, status: true } },
            scheduledActivities: {
              where: { organizationId: ctx.cenario.organization.id, status: "SCHEDULED" },
              orderBy: { scheduledAt: "asc" },
              take: 1,
            },
          },
        },
      },
    });

    const total = await prisma.scheduledActivity.count({ where: { organizationId: ctx.cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("AS) reload (consulta repetida) não cria nada", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    const buscar = () =>
      prisma.propertyInterest.findMany({
        where: { organizationId: ctx.cenario.organization.id, propertyId: ctx.imovel.id },
        include: { scheduledActivities: { where: { status: "SCHEDULED" } } },
      });

    await buscar();
    await buscar();
    await buscar();

    const total = await prisma.scheduledActivity.count({ where: { organizationId: ctx.cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("AT) sem módulo CRM habilitado, criação é rejeitada", async () => {
    // criarCenario() sem "crm" — default é ["core","properties"].
    cenario = await criarCenario();
    autenticarComo(cenario);
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const interesse = await criarInteresseDireto({
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
    });

    const resultado = await agendar(interesse.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
    expect(resultado.message).toMatch(/CRM/);
  });

  test("AU) atividade de outro tenant nunca aparece na listagem escopada", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    await prisma.scheduledActivity.create({
      data: {
        organizationId: cenarioB.organization.id,
        personId: pessoaB.id,
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const listaDeA = await prisma.scheduledActivity.findMany({
      where: { organizationId: ctx.cenario.organization.id },
    });
    expect(listaDeA).toHaveLength(0);
  });

  test("AV) query batch retorna a atividade correta pra múltiplos PropertyInterests numa única chamada", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    const imovel2 = await criarImovel({ organizationId: ctx.cenario.organization.id });
    const interesse2 = await criarInteresseDireto({
      organizationId: ctx.cenario.organization.id,
      personId: ctx.pessoa.id,
      propertyId: imovel2.id,
    });
    const atividade1 = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const atividade2 = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: imovel2.id,
        propertyInterestId: interesse2.id,
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    const pessoaComInteresses = await prisma.person.findUnique({
      where: { id: ctx.pessoa.id, organizationId: ctx.cenario.organization.id },
      include: {
        propertyInterests: {
          where: { organizationId: ctx.cenario.organization.id },
          include: {
            scheduledActivities: {
              where: { organizationId: ctx.cenario.organization.id, status: "SCHEDULED" },
              orderBy: { scheduledAt: "asc" },
              take: 1,
            },
          },
        },
      },
    });

    const porInteresse = new Map(
      pessoaComInteresses?.propertyInterests.map((i) => [i.id, i.scheduledActivities[0]?.id])
    );
    expect(porInteresse.get(ctx.interesse.id)).toBe(atividade1.id);
    expect(porInteresse.get(interesse2.id)).toBe(atividade2.id);
  });

  test("AW) atividade SCHEDULED futura mais próxima é escolhida corretamente", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    const maisDistante = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        scheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });
    // ScheduledActivity não tem unique — múltiplas linhas pro mesmo
    // PropertyInterest são permitidas (H.1), por isso não precisa de um
    // segundo PropertyInterest aqui.
    await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });

    const proxima = await prisma.scheduledActivity.findFirst({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
    });

    expect(proxima?.id).not.toBe(maisDistante.id);
  });

  test("AX) atividade COMPLETED não substitui a próxima SCHEDULED", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    // COMPLETED mais cedo (no passado) — não deve aparecer como "próxima".
    const concluida = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        status: "COMPLETED",
        completedAt: new Date(),
        scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    const agendada = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const proxima = await prisma.scheduledActivity.findFirst({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
    });

    expect(proxima?.id).toBe(agendada.id);
    expect(proxima?.id).not.toBe(concluida.id);
  });

  test("AY) atividade CANCELLED não substitui a próxima SCHEDULED", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    const cancelada = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        status: "CANCELLED",
        cancelledAt: new Date(),
        scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    const agendada = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const proxima = await prisma.scheduledActivity.findFirst({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
    });

    expect(proxima?.id).toBe(agendada.id);
    expect(proxima?.id).not.toBe(cancelada.id);
  });

  // -------------------------------------------------------------------
  // Concorrência
  // -------------------------------------------------------------------

  test("BD) duas conclusões concorrentes produzem só uma transição efetiva", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const [r1, r2] = await Promise.all([concluir(original.id), concluir(original.id)]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    const totalInteracoes = await prisma.interaction.count({
      where: { organizationId: ctx.cenario.organization.id, personId: ctx.pessoa.id, type: "VISIT" },
    });
    expect(totalInteracoes).toBe(1);
    const totalLogsCompletos = await prisma.activityLog.count({
      where: {
        organizationId: ctx.cenario.organization.id,
        entity: "ScheduledActivity",
        entityId: original.id,
        action: "scheduled_activity_completed",
      },
    });
    expect(totalLogsCompletos).toBe(1);
  });

  test("BP) cancelar e concluir concorrentes produzem um estado final consistente (nunca misto)", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    // Não importa qual vence — o que importa é que o estado final nunca
    // fica misto (CANCELLED com Interaction, ou COMPLETED com
    // cancelledAt preenchido, ou dois efeitos aplicados ao mesmo tempo).
    await Promise.all([cancelar(original.id), concluir(original.id)]);

    const final = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    const totalInteracoes = await prisma.interaction.count({
      where: { organizationId: ctx.cenario.organization.id, personId: ctx.pessoa.id, type: "VISIT" },
    });
    const totalLogsCompletos = await prisma.activityLog.count({
      where: {
        organizationId: ctx.cenario.organization.id,
        entity: "ScheduledActivity",
        entityId: original.id,
        action: "scheduled_activity_completed",
      },
    });

    if (final.status === "CANCELLED") {
      expect(final.cancelledAt).not.toBeNull();
      expect(final.completedAt).toBeNull();
      expect(totalInteracoes).toBe(0);
      expect(totalLogsCompletos).toBe(0);
    } else {
      expect(final.status).toBe("COMPLETED");
      expect(final.completedAt).not.toBeNull();
      expect(final.cancelledAt).toBeNull();
      expect(totalInteracoes).toBe(1);
      expect(totalLogsCompletos).toBe(1);
    }
  });

  // -------------------------------------------------------------------
  // Gaps identificados na auditoria pré-commit da H.2
  // -------------------------------------------------------------------

  test("BI) writes de conclusão ficam dentro da mesma transação (garantia estrutural)", () => {
    // Não é possível interceptar chamadas feitas via `tx` pra forçar uma
    // falha REAL no meio da transação: `vi.spyOn(prisma.X, "create")` não
    // intercepta `tx.X.create` (testado empiricamente na auditoria — `tx`
    // é um client interno separado, não o mesmo objeto que `prisma`), e
    // não existe violação de constraint real alcançável aqui sem
    // corromper as próprias FKs que o cenário do teste precisa (ex:
    // ScheduledActivity.personId é CASCADE — apagar a Person apagaria a
    // própria linha que estamos tentando concluir). Mockar o módulo
    // inteiro descartaria a semântica real de commit/rollback do
    // Postgres, o que não provaria nada de útil. Em vez de um teste
    // frágil, esta checagem estrutural confirma que os 4 writes que
    // precisam ficar atômicos continuam todos dentro do mesmo bloco
    // `prisma.$transaction(async (tx) => {...})` em actions.ts — se
    // algum for movido pra fora no futuro, este teste quebra. A garantia
    // de que uma falha real reverte tudo vem do Prisma/Postgres (ACID),
    // não é algo que este projeto precise reprovar.
    const codigo = readFileSync(
      new URL("../../src/app/app/agendamentos/actions.ts", import.meta.url),
      "utf-8"
    );
    // concluirAgendamentoVisita é a última função exportada do arquivo —
    // fatiar do início dela até o fim do arquivo é fatiar exatamente o
    // corpo dela. Se isso deixar de ser verdade (nova função adicionada
    // depois), o teste ainda funciona (só passa a incluir texto extra
    // depois, que não afeta os `toContain` abaixo).
    const inicioConcluir = codigo.indexOf("export async function concluirAgendamentoVisita");
    expect(inicioConcluir).toBeGreaterThan(-1);
    const corpoConcluir = codigo.slice(inicioConcluir);

    const inicioTx = corpoConcluir.indexOf("prisma.$transaction(async (tx)");
    expect(inicioTx).toBeGreaterThan(-1);
    const blocoTransacao = corpoConcluir.slice(inicioTx);

    expect(blocoTransacao).toContain("tx.scheduledActivity.updateMany");
    expect(blocoTransacao).toContain("tx.propertyInterest.update");
    expect(blocoTransacao).toContain("tx.interaction.create");
    expect(blocoTransacao).toContain("tx.activityLog.create");
  });

  test("BK) ScheduledActivity com Person de outro tenant: REMARCAR/CANCELAR agem só na própria linha, CONCLUIR rejeita", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });

    // Três linhas "anômalas" separadas (fora do fluxo normal da app,
    // simulando uma inconsistência estrutural): organizationId de A,
    // mas personId de uma Person de B. propertyId aponta pro imóvel de
    // A (válido) — isola o teste especificamente na inconsistência de
    // personId, não na de property (já coberta por I/J no CREATE).
    const dadosBase = {
      organizationId: ctx.cenario.organization.id,
      personId: pessoaB.id,
      propertyId: ctx.imovel.id,
      status: "SCHEDULED" as const,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const paraRemarcar = await prisma.scheduledActivity.create({ data: dadosBase });
    const paraCancelar = await prisma.scheduledActivity.create({ data: dadosBase });
    const paraConcluir = await prisma.scheduledActivity.create({ data: dadosBase });

    // REMARCAR e CANCELAR só escrevem na própria linha de
    // ScheduledActivity (organizationId já confere) — nunca leem nem
    // escrevem nada derivado de personId, então a inconsistência de
    // Person não é um risco pra essas duas ações. Isso é esperado e
    // documentado, não uma falha de defesa.
    const resultadoRemarcar = await remarcar(paraRemarcar.id, { scheduledAt: futuro(10) });
    expect(resultadoRemarcar.success).toBe(true);

    const resultadoCancelar = await cancelar(paraCancelar.id);
    expect(resultadoCancelar.success).toBe(true);

    // CONCLUIR cria uma Interaction usando personId — é a ação
    // sensível, e reconfere Person.organizationId explicitamente antes
    // de qualquer escrita (linhas 349-356 de actions.ts). Deve rejeitar.
    const resultadoConcluir = await concluir(paraConcluir.id);
    expect(resultadoConcluir.success).toBe(false);

    const aindaScheduled = await prisma.scheduledActivity.findUnique({
      where: { id: paraConcluir.id, organizationId: ctx.cenario.organization.id },
    });
    expect(aindaScheduled?.status).toBe("SCHEDULED");
    const interacoesEmA = await prisma.interaction.count({
      where: { organizationId: ctx.cenario.organization.id },
    });
    expect(interacoesEmA).toBe(0);
    const interacoesEmB = await prisma.interaction.count({
      where: { organizationId: cenarioB.organization.id },
    });
    expect(interacoesEmB).toBe(0);
    const logCompletedIndevido = await prisma.activityLog.findFirst({
      where: {
        organizationId: ctx.cenario.organization.id,
        entity: "ScheduledActivity",
        entityId: paraConcluir.id,
        action: "scheduled_activity_completed",
      },
    });
    expect(logCompletedIndevido).toBeNull();

    // Limpeza manual: essas 3 linhas têm personId de B, então
    // limparOrganizacao(A) não as alcança via cascade de Person(A); e
    // limparOrganizacao(B) também não, porque organizationId é A. Sem
    // isso, ficariam órfãs no banco de teste (e o FK RESTRICT de
    // organizationId bloquearia o delete da própria Organization A no
    // afterEach). organizationId explícito no where — a extensão de
    // tenant scoping não preenche sozinha fora de withOrganization().
    await prisma.scheduledActivity.deleteMany({
      where: {
        id: { in: [paraRemarcar.id, paraCancelar.id, paraConcluir.id] },
        organizationId: ctx.cenario.organization.id,
      },
    });
  });

  test("BN) ScheduledActivity SCHEDULED no passado continua sendo a 'próxima visita' (V1 sem expiração automática)", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    const passada = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        propertyInterestId: ctx.interesse.id,
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    // Mesma query usada pelas páginas (clientes/[id] e imoveis/[id]):
    // filtra só por status, nunca por scheduledAt > now(). Decisão V1
    // deliberada — sem cron/expiração automática nesta fase (ver
    // AGENTS.md da H.2) — o corretor precisa marcar como
    // realizada/cancelar manualmente mesmo depois da data passar.
    const proxima = await prisma.scheduledActivity.findFirst({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
    });

    expect(proxima?.id).toBe(passada.id);
  });

  test("BO) concluir funciona com PropertyInterest já REJECTED, sem alterar o stage", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    // O relacionamento é encerrado DEPOIS que a visita já estava
    // SCHEDULED — cenário estrutural possível (ex: corretor marca
    // REJECTED por engano ou por outro motivo, mas a visita já
    // combinada aconteceu de verdade).
    await prisma.propertyInterest.update({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
      data: { stage: "REJECTED" },
    });

    const resultado = await concluir(original.id);

    expect(resultado.success).toBe(true);
    const atividadeFinal = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atividadeFinal?.status).toBe("COMPLETED");
    const totalInteracoes = await prisma.interaction.count({
      where: { organizationId: ctx.cenario.organization.id, personId: ctx.pessoa.id, type: "VISIT" },
    });
    expect(totalInteracoes).toBe(1);
    const logCompleted = await prisma.activityLog.findFirst({
      where: {
        organizationId: ctx.cenario.organization.id,
        entity: "ScheduledActivity",
        entityId: original.id,
        action: "scheduled_activity_completed",
      },
    });
    expect(logCompleted).not.toBeNull();
    const interesseFinal = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    // Nunca regride nem avança pra VISITED — REJECTED permanece REJECTED.
    expect(interesseFinal?.stage).toBe("REJECTED");
  });

  // -------------------------------------------------------------------
  // Observação do agendamento (Fase H.6)
  // -------------------------------------------------------------------

  test("G/H) atualiza observação de null para texto", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    expect(original.notes).toBeNull();

    const resultado = await atualizarObservacao(original.id, "Cliente pediu para ver a área de lazer.");

    expect(resultado.success).toBe(true);
    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.notes).toBe("Cliente pediu para ver a área de lazer.");
  });

  test("I) atualiza de um texto para outro texto", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "Texto original" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const resultado = await atualizarObservacao(original.id, "Texto atualizado");

    expect(resultado.success).toBe(true);
    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.notes).toBe("Texto atualizado");
  });

  test("J) texto para vazio vira null", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "Será removido" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const resultado = await atualizarObservacao(original.id, "   ");

    expect(resultado.success).toBe(true);
    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atualizado?.notes).toBeNull();
  });

  test("K/L) no-op com o mesmo valor já persistido: sucesso, sem update real, sem ActivityLog novo", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "Valor estável" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    const logsAntes = await prisma.activityLog.count({
      where: {
        organizationId: ctx.cenario.organization.id,
        entity: "ScheduledActivity",
        entityId: original.id,
        action: "scheduled_activity_notes_updated",
      },
    });

    const resultado = await atualizarObservacao(original.id, "Valor estável");

    expect(resultado.success).toBe(true);
    const logsDepois = await prisma.activityLog.count({
      where: {
        organizationId: ctx.cenario.organization.id,
        entity: "ScheduledActivity",
        entityId: original.id,
        action: "scheduled_activity_notes_updated",
      },
    });
    expect(logsDepois).toBe(logsAntes);
    expect(logsDepois).toBe(0);
  });

  test("M/N/O) update real cria exatamente 1 ActivityLog, sem texto de notes, só flags booleanas em metadata", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "Telefone do cliente: 11999999999" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const resultado = await atualizarObservacao(original.id, "Nova observação sem dado sensível");

    expect(resultado.success).toBe(true);
    const logs = await prisma.activityLog.findMany({
      where: {
        organizationId: ctx.cenario.organization.id,
        entity: "ScheduledActivity",
        entityId: original.id,
        action: "scheduled_activity_notes_updated",
      },
    });
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(JSON.stringify(log)).not.toContain("Telefone do cliente");
    expect(JSON.stringify(log)).not.toContain("Nova observação");
    expect(JSON.stringify(log)).not.toContain("11999999999");
    expect(log.payload).toEqual({ hadNotesBefore: true, hasNotesAfter: true });
  });

  test("P) COMPLETED rejeita alteração de observação", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "Antes de concluir" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await concluir(original.id);

    const resultado = await atualizarObservacao(original.id, "Tentativa pós-conclusão");

    expect(resultado.success).toBe(false);
    const atual = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atual?.notes).toBe("Antes de concluir");
  });

  test("Q) CANCELLED rejeita alteração de observação", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "Antes de cancelar" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await cancelar(original.id);

    const resultado = await atualizarObservacao(original.id, "Tentativa pós-cancelamento");

    expect(resultado.success).toBe(false);
    const atual = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atual?.notes).toBe("Antes de cancelar");
  });

  test("R) outro tenant não consegue alterar a observação", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro(), notes: "Pertence à org A" });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioB);

    const resultado = await atualizarObservacao(original.id, "Invasão de outra org");

    expect(resultado.success).toBe(false);
    const atual = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atual?.notes).toBe("Pertence à org A");
  });

  test("S) id inexistente retorna erro seguro, sem exception", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;

    const resultado = await atualizarObservacao("id-que-nao-existe-nunca", "Qualquer coisa");

    expect(resultado.success).toBe(false);
  });

  test("T/U) FormData não controla organizationId/personId/propertyId/memberId", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });

    const fd = formData({
      notes: "Texto legítimo",
      organizationId: cenarioB.organization.id,
      personId: "pessoa-forjada",
      propertyId: "imovel-forjado",
      memberId: "membro-forjado",
      createdByMemberId: "membro-forjado",
    });
    const resultado = await atualizarObservacaoAgendamentoVisita(original.id, ESTADO_INICIAL_ACAO, fd);

    expect(resultado.success).toBe(true);
    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    // organizationId/personId/propertyId continuam exatamente os
    // originais — os campos forjados no FormData nunca são lidos pela
    // action (só `notes` é extraído do schema).
    expect(atualizado?.organizationId).toBe(ctx.cenario.organization.id);
    expect(atualizado?.personId).toBe(ctx.pessoa.id);
    expect(atualizado?.propertyId).toBe(ctx.imovel.id);
    expect(atualizado?.notes).toBe("Texto legítimo");
  });

  test("V) concorrência: duas atualizações simultâneas terminam num estado válido e consistente", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    const [r1, r2] = await Promise.all([
      atualizarObservacao(original.id, "Primeira atualização concorrente"),
      atualizarObservacao(original.id, "Segunda atualização concorrente"),
    ]);

    // V1 (last-write-wins, documentado): ambas podem retornar sucesso —
    // não há detecção de conflito — mas o valor final tem que ser
    // EXATAMENTE um dos dois textos enviados, nunca um valor corrompido/
    // misturado, e a linha continua existindo e SCHEDULED.
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    const atual = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(["Primeira atualização concorrente", "Segunda atualização concorrente"]).toContain(
      atual?.notes
    );
    expect(atual?.status).toBe("SCHEDULED");
  });

  test("W/X/Y/Z/AA) atualizar observação não altera scheduledAt, status, completedAt, cancelledAt, PropertyInterest.stage, nem cria Interaction", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    const interesseAntes = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    // Stage já avançou pra VISIT_SCHEDULED pelo próprio agendar() acima
    // (H.2) — o que importa aqui é que atualizarObservacao não mexe
    // nele de novo, nem em qualquer outro campo alheio a `notes`.
    expect(interesseAntes.stage).toBe("VISIT_SCHEDULED");

    await atualizarObservacao(original.id, "Só a observação deve mudar");

    const atual = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atual.scheduledAt.getTime()).toBe(original.scheduledAt.getTime());
    expect(atual.status).toBe("SCHEDULED");
    expect(atual.completedAt).toBeNull();
    expect(atual.cancelledAt).toBeNull();

    const interesseDepois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(interesseDepois.stage).toBe("VISIT_SCHEDULED");

    const totalInteracoes = await prisma.interaction.count({
      where: { organizationId: ctx.cenario.organization.id, personId: ctx.pessoa.id },
    });
    expect(totalInteracoes).toBe(0);
  });

  test("AB) reconfirmação de tenant: linha com organizationId correto mas relação Person anômala continua editável sem tocar/vazar a relação anômala", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id, name: "Pessoa Sigilosa De B" });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });

    // Linha fora do fluxo normal da app (mesmo padrão da auditoria H.3):
    // organizationId de A (legítima pra esta org), personId de B.
    const anomala = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoaB.id,
        propertyId: imovelA.id,
        status: "SCHEDULED",
        scheduledAt: new Date(futuro() + ":00.000Z"),
      },
    });

    const resultado = await atualizarObservacao(anomala.id, "Observação sobre linha anômala");

    // A escrita é permitida (a ScheduledActivity É legitimamente de A) —
    // o ponto crítico é que isso não lê nem expõe nada de Person/Property
    // de B: nenhuma exception, nenhum dado de B tocado.
    expect(resultado.success).toBe(true);
    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: anomala.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.notes).toBe("Observação sobre linha anômala");
    // Person de B nunca foi alterada.
    const pessoaBAposUpdate = await prisma.person.findUnique({
      where: { id: pessoaB.id, organizationId: cenarioB.organization.id },
    });
    expect(pessoaBAposUpdate?.name).toBe("Pessoa Sigilosa De B");

    await prisma.scheduledActivity.deleteMany({
      where: { id: anomala.id, organizationId: cenario.organization.id },
    });
  });

  test("AD) concluir continua criando Interaction com notes = null, mesmo quando ScheduledActivity.notes tem texto", async () => {
    const ctx = await cenarioPadrao();
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await atualizarObservacao(original.id, "Observação detalhada da visita agendada");

    await concluir(original.id);

    const interacao = await prisma.interaction.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, personId: ctx.pessoa.id, type: "VISIT" },
    });
    expect(interacao.notes).toBeNull();
    // A observação do agendamento continua intacta na própria
    // ScheduledActivity, só nunca é copiada pra Interaction.
    const atividadeFinal = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atividadeFinal?.notes).toBe("Observação detalhada da visita agendada");
  });

  // -------------------------------------------------------------------
  // Fundação de fechamento — WON (Fase P.2). WON se comporta como stage
  // já avançado/terminal pro H.2: mesma regra de REJECTED (teste P acima)
  // pra criação, e mesmo guard de igualdade estrita (já existente,
  // inalterado) pra conclusão nunca sobrescrever um stage que não seja
  // exatamente VISIT_SCHEDULED.
  // -------------------------------------------------------------------

  test("P2-A) WON bloqueia nova visita (mesma regra de REJECTED)", async () => {
    const ctx = await cenarioPadrao("WON");
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
  });

  test("P2-B) WON bloqueado: nenhuma ScheduledActivity é criada", async () => {
    const ctx = await cenarioPadrao("WON");
    cenario = ctx.cenario;

    await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    const total = await prisma.scheduledActivity.count({
      where: { organizationId: ctx.cenario.organization.id },
    });
    expect(total).toBe(0);
  });

  test("P2-C) WON bloqueado: nenhum ActivityLog indevido é criado", async () => {
    const ctx = await cenarioPadrao("WON");
    cenario = ctx.cenario;

    await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    const total = await prisma.activityLog.count({
      where: { organizationId: ctx.cenario.organization.id, entity: "ScheduledActivity" },
    });
    expect(total).toBe(0);
    const totalStageChange = await prisma.activityLog.count({
      where: {
        organizationId: ctx.cenario.organization.id,
        entity: "PropertyInterest",
        action: "property_interest_stage_changed",
      },
    });
    expect(totalStageChange).toBe(0);
  });

  test("P2-D) visita SCHEDULED previamente criada + PropertyInterest depois virou WON: concluir a visita ainda funciona", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    // Cenário estrutural possível: a negociação foi ganha (ex: proposta em
    // outro imóvel, ou o corretor já sabe que este vai fechar) antes de a
    // visita já combinada ter acontecido de fato.
    await prisma.propertyInterest.update({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
      data: { stage: "WON" },
    });

    const resultado = await concluir(original.id);

    expect(resultado.success).toBe(true);
    const atividadeFinal = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atividadeFinal?.status).toBe("COMPLETED");
  });

  test("P2-E) conclusão com PropertyInterest WON mantém o stage em WON (nunca regride pra VISITED)", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await prisma.propertyInterest.update({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
      data: { stage: "WON" },
    });

    await concluir(original.id);

    const interesseFinal = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(interesseFinal?.stage).toBe("WON");
  });

  test("P2-F) conclusão da visita cria a Interaction normalmente (regra H.2 inalterada) mesmo com PropertyInterest WON", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await prisma.propertyInterest.update({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
      data: { stage: "WON" },
    });

    await concluir(original.id);

    const totalInteracoes = await prisma.interaction.count({
      where: { organizationId: ctx.cenario.organization.id, personId: ctx.pessoa.id, type: "VISIT" },
    });
    expect(totalInteracoes).toBe(1);
  });

  test("P2-G) concluir a visita nunca escreve em PropertyInterest.closedAt — isso é responsabilidade da futura action de fechamento (P.3), não da visita", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await prisma.propertyInterest.update({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
      data: { stage: "WON" },
    });

    await concluir(original.id);

    const interesseFinal = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(interesseFinal?.closedAt).toBeNull();
  });

  // -------------------------------------------------------------------
  // Interação com o fechamento oficial via action real (Fase P.3) — P2-D a
  // P2-G acima já provam o mesmo com um UPDATE direto simulando WON; os
  // testes abaixo repetem o essencial passando pela action de verdade
  // (marcarInteresseComoGanho/Perdido), incluindo closedAt setado por ela.
  // -------------------------------------------------------------------

  test("P3-A) visita SCHEDULED criada antes do fechamento ainda pode ser concluída depois de marcarInteresseComoGanho", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    // agendar() avança INTERESTED -> VISIT_SCHEDULED (H.2); fechamento
    // permitido a partir daí (V1, ver ESTAGIOS_INTERESSE).
    const fechamento = await marcarGanho(ctx.interesse.id);
    expect(fechamento.success).toBe(true);

    const resultado = await concluir(original.id);

    expect(resultado.success).toBe(true);
    const atividadeFinal = await prisma.scheduledActivity.findUnique({
      where: { id: original.id, organizationId: ctx.cenario.organization.id },
    });
    expect(atividadeFinal?.status).toBe("COMPLETED");
  });

  test("P3-B) concluir uma visita depois do fechamento via ação real não regride o stage nem apaga closedAt", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const original = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await marcarGanho(ctx.interesse.id);
    const fechado = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });

    await concluir(original.id);

    const interesseFinal = await prisma.propertyInterest.findUnique({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
    });
    expect(interesseFinal?.stage).toBe("WON");
    expect(interesseFinal?.closedAt?.getTime()).toBe(fechado.closedAt?.getTime());
  });

  test("P3-C) marcarInteresseComoPerdido bloqueia nova visita, mesma regra já provada pra WON (P2-A)", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    const fechamento = await marcarPerdido(ctx.interesse.id);
    expect(fechamento.success).toBe(true);

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(false);
    const total = await prisma.scheduledActivity.count({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    expect(total).toBe(0);
  });

  // -------------------------------------------------------------------
  // PropertyInterestStageHistory — exceção pontual e aditiva autorizada
  // pra este arquivo protegido (Fase P.6): as duas transições automáticas
  // de stage abaixo (agendar -> VISIT_SCHEDULED, concluir -> VISITED) já
  // existiam desde a H.2 — aqui só se prova que cada uma agora também
  // grava exatamente 1 PropertyInterestStageHistory, sem nenhuma mudança
  // de regra/guard/mensagem.
  // -------------------------------------------------------------------

  async function historicoDe(organizationId: string, propertyInterestId: string) {
    return prisma.propertyInterestStageHistory.findMany({
      where: { organizationId, propertyInterestId },
      orderBy: { changedAt: "asc" },
    });
  }

  test("P6-A) agendar visita a partir de INTERESTED cria exatamente 1 PropertyInterestStageHistory (INTERESTED -> VISIT_SCHEDULED)", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro() });

    expect(resultado.success).toBe(true);
    const historico = await historicoDe(ctx.cenario.organization.id, ctx.interesse.id);
    expect(historico).toHaveLength(1);
    expect(historico[0].previousStage).toBe("INTERESTED");
    expect(historico[0].newStage).toBe("VISIT_SCHEDULED");
  });

  test("P6-B) agendar segunda visita quando stage já não é INTERESTED não cria novo PropertyInterestStageHistory (stageDeveAvancar=false)", async () => {
    const ctx = await cenarioPadrao("VISIT_SCHEDULED");
    cenario = ctx.cenario;

    const resultado = await agendar(ctx.interesse.id, { scheduledAt: futuro(10) });

    expect(resultado.success).toBe(true);
    expect(await historicoDe(ctx.cenario.organization.id, ctx.interesse.id)).toHaveLength(0);
  });

  test("P6-C) concluir visita agendada a partir de VISIT_SCHEDULED cria exatamente 1 PropertyInterestStageHistory (VISIT_SCHEDULED -> VISITED)", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const atividade = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    // O agendamento já gravou 1 entrada (INTERESTED -> VISIT_SCHEDULED,
    // provado em P6-A) — aqui a asserção é sobre a SEGUNDA entrada, criada
    // pela conclusão.
    expect(await historicoDe(ctx.cenario.organization.id, ctx.interesse.id)).toHaveLength(1);

    const resultado = await concluir(atividade.id);

    expect(resultado.success).toBe(true);
    const historico = await historicoDe(ctx.cenario.organization.id, ctx.interesse.id);
    expect(historico).toHaveLength(2);
    expect(historico[1].previousStage).toBe("VISIT_SCHEDULED");
    expect(historico[1].newStage).toBe("VISITED");
  });

  test("P6-D) concluir visita quando stage não é mais VISIT_SCHEDULED (ex: já REJECTED) não cria novo PropertyInterestStageHistory", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const atividade = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });
    await prisma.propertyInterest.update({
      where: { id: ctx.interesse.id, organizationId: ctx.cenario.organization.id },
      data: { stage: "REJECTED" },
    });
    expect(await historicoDe(ctx.cenario.organization.id, ctx.interesse.id)).toHaveLength(1); // só a do agendamento

    const resultado = await concluir(atividade.id);

    expect(resultado.success).toBe(true);
    // Nenhuma entrada nova — o if (stage === "VISIT_SCHEDULED") não bateu.
    expect(await historicoDe(ctx.cenario.organization.id, ctx.interesse.id)).toHaveLength(1);
  });

  test("P6-E) duas conclusões concorrentes da mesma visita produzem no máximo 1 PropertyInterestStageHistory novo (nunca duplicado pela corrida)", async () => {
    const ctx = await cenarioPadrao("INTERESTED");
    cenario = ctx.cenario;
    await agendar(ctx.interesse.id, { scheduledAt: futuro() });
    const atividade = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: ctx.cenario.organization.id, propertyInterestId: ctx.interesse.id },
    });

    await Promise.all([concluir(atividade.id), concluir(atividade.id)]);

    const historico = await historicoDe(ctx.cenario.organization.id, ctx.interesse.id);
    // 1 do agendamento + exatamente 1 da conclusão — o guard de
    // status:"SCHEDULED" do updateMany garante que só uma das duas
    // chamadas concorrentes realmente conclui (mesmo racional de BD).
    expect(historico).toHaveLength(2);
    const transicoesParaVisited = historico.filter((h) => h.newStage === "VISITED");
    expect(transicoesParaVisited).toHaveLength(1);
  });
});
