import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { criarCenario, criarPessoa, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import {
  criarFollowUp,
  atualizarFollowUp,
  concluirFollowUp,
  cancelarFollowUp,
  concluirAgendamentoVisita,
  cancelarAgendamentoVisita,
  remarcarAgendamentoVisita,
  criarAgendamentoVisita,
} from "@/app/app/agendamentos/actions";
import { buscarCentralTrabalho } from "@/lib/central-trabalho";
import { buscarAgendaHoje, buscarAgendaProximas, contarAgenda } from "@/lib/agenda";
import { paraDatetimeLocalNoFuso } from "@/lib/fuso-horario";

// =======================================================================
// Follow-up comercial (Fase 19) — contra o banco
// =======================================================================
// RELÓGIO FIXO onde a classificação importa. Onde a action exige data
// FUTURA (ela usa Date.now(), não um relógio injetável), as datas são
// derivadas de `new Date()` — mas a asserção nunca depende do horário da
// máquina, só da ordem relativa.
//
// O fuso de todo cenário é EXPLÍCITO: nenhum caso depende do fallback por
// acidente.

const SP = "America/Sao_Paulo";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(timezone: string | null = "UTC"): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"], timezone });
  cenarios.push(cenario);
  return cenario;
}

function autenticarComo(cenario: Cenario, membroId?: string) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: membroId ?? cenario.membro.id,
      role: "OWNER",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function negociacao(
  cenario: Cenario,
  opcoes: { responsavelId?: string | null; stage?: "INTERESTED" | "WON" | "REJECTED" } = {}
) {
  const organizationId = cenario.organization.id;
  const pessoa = await criarPessoa({ organizationId });
  const imovel = await criarImovel({ organizationId, status: "AVAILABLE" });
  return prisma.propertyInterest.create({
    data: {
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: opcoes.stage ?? "INTERESTED",
      responsibleMemberId:
        opcoes.responsavelId === undefined ? cenario.membro.id : opcoes.responsavelId,
      ...(opcoes.stage === "WON" || opcoes.stage === "REJECTED"
        ? { closedAt: new Date() }
        : {}),
    },
    select: { id: true, personId: true, propertyId: true, stage: true },
  });
}

const emHoras = (horas: number) => new Date(Date.now() + horas * 3_600_000);

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

// Cria um follow-up pela ACTION (caminho real), com data futura.
async function criarPelaAction(
  cenario: Cenario,
  interesseId: string,
  opcoes: { assunto?: string; quando?: Date; notes?: string } = {}
) {
  const fuso = cenario.organization.timezone ?? "UTC";
  const quando = opcoes.quando ?? emHoras(26);
  return criarFollowUp(
    interesseId,
    { success: false, message: "" },
    formulario({
      subject: opcoes.assunto ?? "Enviar proposta revisada",
      scheduledAt: paraDatetimeLocalNoFuso(quando, fuso),
      notes: opcoes.notes ?? "",
    })
  );
}

// Escrita direta para os casos que precisam de data PASSADA (a action
// recusa passado de propósito) ou de relógio controlado.
async function followUpDireto(
  cenario: Cenario,
  interesse: { id: string; personId: string; propertyId: string },
  quando: Date,
  opcoes: { assunto?: string; status?: "SCHEDULED" | "COMPLETED" | "CANCELLED" } = {}
) {
  return prisma.scheduledActivity.create({
    data: {
      organizationId: cenario.organization.id,
      personId: interesse.personId,
      propertyId: interesse.propertyId,
      propertyInterestId: interesse.id,
      type: "FOLLOW_UP",
      subject: opcoes.assunto ?? "Cobrar documentos",
      status: opcoes.status ?? "SCHEDULED",
      scheduledAt: quando,
    },
    select: { id: true },
  });
}

async function visitaDireta(
  cenario: Cenario,
  interesse: { id: string; personId: string; propertyId: string },
  quando: Date
) {
  return prisma.scheduledActivity.create({
    data: {
      organizationId: cenario.organization.id,
      personId: interesse.personId,
      propertyId: interesse.propertyId,
      propertyInterestId: interesse.id,
      type: "VISIT",
      status: "SCHEDULED",
      scheduledAt: quando,
    },
    select: { id: true },
  });
}

// -----------------------------------------------------------------------
// 1. Criar
// -----------------------------------------------------------------------
describe("criar follow-up", () => {
  test("grava tipo, assunto e instante — e nada mais", async () => {
    const cenario = await novoCenario(SP);
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);

    const estado = await criarPelaAction(cenario, interesse.id, {
      assunto: "  Enviar proposta revisada  ",
      notes: "Cliente pediu entrada menor.",
    });
    expect(estado.success).toBe(true);

    const linha = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, propertyInterestId: interesse.id },
    });
    expect(linha.type).toBe("FOLLOW_UP");
    // trim aplicado; nunca espaços persistidos.
    expect(linha.subject).toBe("Enviar proposta revisada");
    expect(linha.notes).toBe("Cliente pediu entrada menor.");
    expect(linha.status).toBe("SCHEDULED");
    expect(linha.completedAt).toBeNull();
    expect(linha.cancelledAt).toBeNull();
    // Person/Property derivados da NEGOCIAÇÃO, nunca do formulário.
    expect(linha.personId).toBe(interesse.personId);
    expect(linha.propertyId).toBe(interesse.propertyId);
  });

  test("criar follow-up NÃO move o stage — diferente de agendar visita", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);

    await criarPelaAction(cenario, interesse.id);

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      select: { stage: true },
    });
    expect(depois.stage).toBe("INTERESTED");
    const historico = await prisma.propertyInterestStageHistory.count({
      where: { organizationId: cenario.organization.id, propertyInterestId: interesse.id },
    });
    expect(historico).toBe(0);
  });

  test("assunto vazio é recusado e nada é gravado", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);

    const estado = await criarFollowUp(
      interesse.id,
      { success: false, message: "" },
      formulario({ subject: "   ", scheduledAt: paraDatetimeLocalNoFuso(emHoras(26), "UTC"), notes: "" })
    );
    expect(estado.success).toBe(false);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } })
    ).toBe(0);
  });

  test("data no passado é recusada", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);

    const estado = await criarPelaAction(cenario, interesse.id, { quando: emHoras(-2) });
    expect(estado.success).toBe(false);
    expect(estado.fieldErrors?.scheduledAt?.[0]).toContain("futura");
  });

  test("o imóvel NÃO precisa estar disponível — cobrar documentos continua sendo trabalho", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    await prisma.property.update({
      where: { id: interesse.propertyId, organizationId: cenario.organization.id },
      data: { status: "SOLD" },
    });

    const estado = await criarPelaAction(cenario, interesse.id);
    expect(estado.success).toBe(true);
  });
});

// -----------------------------------------------------------------------
// 2. Tenant
// -----------------------------------------------------------------------
describe("isolamento entre tenants", () => {
  test("não é possível criar follow-up na negociação de outra organização", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const interesseDeB = await negociacao(b);

    autenticarComo(a);
    const estado = await criarPelaAction(a, interesseDeB.id);
    expect(estado.success).toBe(false);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: b.organization.id } })
    ).toBe(0);
  });

  test("não é possível concluir nem cancelar o follow-up de outra organização", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const interesseDeB = await negociacao(b);
    const followUp = await followUpDireto(b, interesseDeB, emHoras(26));

    autenticarComo(a);
    expect((await concluirFollowUp(followUp.id, { success: false, message: "" }, new FormData())).success).toBe(false);
    expect((await cancelarFollowUp(followUp.id, { success: false, message: "" }, new FormData())).success).toBe(false);

    const linha = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: followUp.id, organizationId: b.organization.id },
    });
    expect(linha.status).toBe("SCHEDULED");
  });
});

// -----------------------------------------------------------------------
// 3. Timezone (Fase 18 preservada)
// -----------------------------------------------------------------------
describe("timezone da organização", () => {
  test("o horário digitado é lido no fuso da ORGANIZAÇÃO", async () => {
    const cenario = await novoCenario(SP);
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);

    // Data futura fixa e distante, para não depender do relógio.
    const estado = await criarFollowUp(
      interesse.id,
      { success: false, message: "" },
      formulario({ subject: "Ligar para o cliente", scheduledAt: "2099-09-07T14:30", notes: "" })
    );
    expect(estado.success).toBe(true);

    const linha = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, propertyInterestId: interesse.id },
      select: { scheduledAt: true },
    });
    // 14:30 em São Paulo é 17:30 UTC — o instante persistido.
    expect(linha.scheduledAt.toISOString()).toBe("2099-09-07T17:30:00.000Z");
    // ... e volta ao formulário como 14:30.
    expect(paraDatetimeLocalNoFuso(linha.scheduledAt, SP)).toBe("2099-09-07T14:30");
  });

  test("organização com timezone null usa o fallback UTC, sem quebrar", async () => {
    const cenario = await novoCenario(null);
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);

    const estado = await criarFollowUp(
      interesse.id,
      { success: false, message: "" },
      formulario({ subject: "Ligar", scheduledAt: "2099-09-07T14:30", notes: "" })
    );
    expect(estado.success).toBe(true);
    const linha = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id },
      select: { scheduledAt: true },
    });
    expect(linha.scheduledAt.toISOString()).toBe("2099-09-07T14:30:00.000Z");
  });
});

// -----------------------------------------------------------------------
// 4-5. Responsável ≠ criador
// -----------------------------------------------------------------------
describe("responsável e criador", () => {
  async function outroMembro(cenario: Cenario) {
    const usuario = await criarUsuario();
    return criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
  }

  test("o follow-up aparece na Central do RESPONSÁVEL, mesmo criado por outro membro", async () => {
    const cenario = await novoCenario();
    const responsavel = cenario.membro;
    const criador = await outroMembro(cenario);
    const interesse = await negociacao(cenario, { responsavelId: responsavel.id });

    // Quem cria é OUTRO membro.
    autenticarComo(cenario, criador.id);
    expect((await criarPelaAction(cenario, interesse.id)).success).toBe(true);

    const linha = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id },
      select: { createdByMemberId: true },
    });
    expect(linha.createdByMemberId).toBe(criador.id);

    // A Central do RESPONSÁVEL vê; a de quem criou, não.
    const doResponsavel = await buscarCentralTrabalho(
      cenario.organization.id,
      responsavel.id,
      "UTC"
    );
    const doCriador = await buscarCentralTrabalho(cenario.organization.id, criador.id, "UTC");
    expect(doResponsavel.proximas.length + doResponsavel.hoje.total).toBeGreaterThan(0);
    expect(doCriador.proximas).toHaveLength(0);
    expect(doCriador.hoje.total).toBe(0);
  });

  test("transferir a negociação leva os follow-ups futuros junto", async () => {
    const cenario = await novoCenario();
    const ana = cenario.membro;
    const bruno = await outroMembro(cenario);
    const interesse = await negociacao(cenario, { responsavelId: ana.id });
    autenticarComo(cenario);
    await criarPelaAction(cenario, interesse.id, { assunto: "Enviar proposta" });

    const antes = await buscarCentralTrabalho(cenario.organization.id, ana.id, "UTC");
    expect(antes.proximas).toHaveLength(1);

    // Transferência — só o responsável da NEGOCIAÇÃO muda; a atividade
    // não é tocada.
    await prisma.propertyInterest.update({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      data: { responsibleMemberId: bruno.id },
    });

    const anaDepois = await buscarCentralTrabalho(cenario.organization.id, ana.id, "UTC");
    const brunoDepois = await buscarCentralTrabalho(cenario.organization.id, bruno.id, "UTC");
    expect(anaDepois.proximas).toHaveLength(0);
    expect(brunoDepois.proximas).toHaveLength(1);
    expect(brunoDepois.proximas[0].assunto).toBe("Enviar proposta");
  });

  test("responsável INATIVO mantém o follow-up — nada é redistribuído sozinho", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    autenticarComo(cenario);
    await criarPelaAction(cenario, interesse.id);

    await prisma.organizationMember.update({
      where: { id: cenario.membro.id },
      data: { status: "SUSPENDED" },
    });

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC");
    expect(central.proximas).toHaveLength(1);
    const linha = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id },
      select: { status: true },
    });
    expect(linha.status).toBe("SCHEDULED");
  });
});

// -----------------------------------------------------------------------
// 6-8. Central: Hoje / Atrasadas / Próximas
// -----------------------------------------------------------------------
describe("Central de trabalho", () => {
  const AGORA = new Date("2026-09-07T12:00:00.000Z");

  test("follow-up de hoje aparece em HOJE, com tipo e assunto", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await followUpDireto(cenario, interesse, new Date("2026-09-07T09:00:00.000Z"), {
      assunto: "Retornar ligação",
    });

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.hoje.total).toBe(1);
    expect(central.hoje.itens[0].tipo).toBe("FOLLOW_UP");
    expect(central.hoje.itens[0].assunto).toBe("Retornar ligação");
  });

  test("horário de hoje que já passou continua em HOJE — atraso é por DIA (Fases 17/18)", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    // 09:00, com agora 12:00 do mesmo dia.
    await followUpDireto(cenario, interesse, new Date("2026-09-07T09:00:00.000Z"));

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.hoje.total).toBe(1);
    expect(central.atrasadas.total).toBe(0);
  });

  test("follow-up de dia anterior aparece em ATRASADAS", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await followUpDireto(cenario, interesse, new Date("2026-09-04T09:00:00.000Z"));

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.atrasadas.total).toBe(1);
    expect(central.atrasadas.itens[0].tipo).toBe("FOLLOW_UP");
  });

  test("follow-up de dia futuro aparece em PRÓXIMAS", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await followUpDireto(cenario, interesse, new Date("2026-09-10T09:00:00.000Z"));

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.proximas).toHaveLength(1);
  });

  test("visita e follow-up convivem nos mesmos blocos, sem se anular", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await visitaDireta(cenario, interesse, new Date("2026-09-07T10:00:00.000Z"));
    await followUpDireto(cenario, interesse, new Date("2026-09-07T15:00:00.000Z"));

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.hoje.total).toBe(2);
    expect(central.hoje.itens.map((i) => i.tipo).sort()).toEqual(["FOLLOW_UP", "VISIT"]);
  });

  test("a classificação no fuso da organização vale para follow-up igualmente", async () => {
    const cenario = await novoCenario(SP);
    const interesse = await negociacao(cenario);
    // 07/09 23:00 em São Paulo = 08/09 02:00 UTC.
    await followUpDireto(cenario, interesse, new Date("2026-09-08T02:00:00.000Z"));

    const agora = new Date("2026-09-07T23:30:00.000Z"); // 20:30 em SP
    const emSaoPaulo = await buscarCentralTrabalho(
      cenario.organization.id,
      cenario.membro.id,
      SP,
      { agora }
    );
    const emUtc = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora,
    });
    expect(emSaoPaulo.hoje.total).toBe(1);
    expect(emUtc.proximas).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------
// 9-10. Concluir e cancelar
// -----------------------------------------------------------------------
describe("concluir e cancelar", () => {
  const AGORA = new Date("2026-09-07T12:00:00.000Z");

  test("concluir tira o follow-up das pendências e NÃO cria Interaction nem move stage", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    const followUp = await followUpDireto(cenario, interesse, new Date("2026-09-07T09:00:00.000Z"));

    const estado = await concluirFollowUp(followUp.id, { success: false, message: "" }, new FormData());
    expect(estado.success).toBe(true);

    const linha = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: followUp.id, organizationId: cenario.organization.id },
    });
    expect(linha.status).toBe("COMPLETED");
    expect(linha.completedAt).not.toBeNull();

    // O ponto central da fase: planejado ≠ realizado.
    expect(
      await prisma.interaction.count({ where: { organizationId: cenario.organization.id } })
    ).toBe(0);
    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      select: { stage: true },
    });
    expect(depois.stage).toBe("INTERESTED");
    expect(
      await prisma.propertyInterestStageHistory.count({
        where: { organizationId: cenario.organization.id },
      })
    ).toBe(0);

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.hoje.total).toBe(0);
    expect(central.atrasadas.total).toBe(0);
  });

  test("cancelar tira das pendências e preserva o registro", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    const followUp = await followUpDireto(cenario, interesse, new Date("2026-09-10T09:00:00.000Z"));

    expect((await cancelarFollowUp(followUp.id, { success: false, message: "" }, new FormData())).success).toBe(true);

    const linha = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: followUp.id, organizationId: cenario.organization.id },
    });
    expect(linha.status).toBe("CANCELLED");
    expect(linha.cancelledAt).not.toBeNull();
    // A linha continua existindo — cancelar não apaga histórico.
    expect(linha.subject).toBe("Cobrar documentos");

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.proximas).toHaveLength(0);
  });

  test("concluir é idempotente e cancelar um concluído é recusado", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    const followUp = await followUpDireto(cenario, interesse, new Date("2026-09-10T09:00:00.000Z"));

    await concluirFollowUp(followUp.id, { success: false, message: "" }, new FormData());
    const segunda = await concluirFollowUp(followUp.id, { success: false, message: "" }, new FormData());
    expect(segunda.success).toBe(true);
    const cancelar = await cancelarFollowUp(followUp.id, { success: false, message: "" }, new FormData());
    expect(cancelar.success).toBe(false);

    // Um único ActivityLog de conclusão, mesmo com duas chamadas.
    expect(
      await prisma.activityLog.count({
        where: { organizationId: cenario.organization.id, action: "follow_up_completed" },
      })
    ).toBe(1);
  });

  test("editar altera assunto, data e observação; só enquanto aberto", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    const followUp = await followUpDireto(cenario, interesse, new Date("2026-09-10T09:00:00.000Z"));

    const estado = await atualizarFollowUp(
      followUp.id,
      { success: false, message: "" },
      formulario({ subject: "Enviar contrato", scheduledAt: "2099-01-05T09:00", notes: "Urgente" })
    );
    expect(estado.success).toBe(true);
    const linha = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: followUp.id, organizationId: cenario.organization.id },
    });
    expect(linha.subject).toBe("Enviar contrato");
    expect(linha.notes).toBe("Urgente");
    expect(linha.status).toBe("SCHEDULED");

    await concluirFollowUp(followUp.id, { success: false, message: "" }, new FormData());
    const depois = await atualizarFollowUp(
      followUp.id,
      { success: false, message: "" },
      formulario({ subject: "Outra coisa", scheduledAt: "2099-01-06T09:00", notes: "" })
    );
    expect(depois.success).toBe(false);
  });
});

// -----------------------------------------------------------------------
// 11-13. REGRESSÃO DE VISITA — a mais importante da fase
// -----------------------------------------------------------------------
describe("regressão: a visita continua exatamente como era", () => {
  test("criar visita avança o stage e registra StageHistory", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);

    const estado = await criarAgendamentoVisita(
      interesse.id,
      { success: false, message: "" },
      formulario({ scheduledAt: paraDatetimeLocalNoFuso(emHoras(26), "UTC"), notes: "" })
    );
    expect(estado.success).toBe(true);

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      select: { stage: true },
    });
    expect(depois.stage).toBe("VISIT_SCHEDULED");
    expect(
      await prisma.propertyInterestStageHistory.count({
        where: { organizationId: cenario.organization.id, newStage: "VISIT_SCHEDULED" },
      })
    ).toBe(1);
  });

  test("concluir visita cria Interaction VISIT e avança para VISITED", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    await criarAgendamentoVisita(
      interesse.id,
      { success: false, message: "" },
      formulario({ scheduledAt: paraDatetimeLocalNoFuso(emHoras(26), "UTC"), notes: "" })
    );
    const visita = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, type: "VISIT" },
      select: { id: true },
    });

    const estado = await concluirAgendamentoVisita(
      visita.id,
      { success: false, message: "" },
      new FormData()
    );
    expect(estado.success).toBe(true);

    const interacoes = await prisma.interaction.findMany({
      where: { organizationId: cenario.organization.id },
      select: { type: true },
    });
    expect(interacoes).toHaveLength(1);
    expect(interacoes[0].type).toBe("VISIT");
    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      select: { stage: true },
    });
    expect(depois.stage).toBe("VISITED");
  });

  // A guarda de tipo, nos dois sentidos. É ela que torna a separação
  // estrutural em vez de uma convenção que alguém precisa lembrar.
  test("as actions de VISITA recusam um follow-up", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    const followUp = await followUpDireto(cenario, interesse, emHoras(26));
    const estadoVazio = { success: false, message: "" };

    expect((await concluirAgendamentoVisita(followUp.id, estadoVazio, new FormData())).success).toBe(false);
    expect((await cancelarAgendamentoVisita(followUp.id, estadoVazio, new FormData())).success).toBe(false);
    expect(
      (
        await remarcarAgendamentoVisita(
          followUp.id,
          estadoVazio,
          formulario({ scheduledAt: paraDatetimeLocalNoFuso(emHoras(48), "UTC") })
        )
      ).success
    ).toBe(false);

    // Nada foi tocado, e nenhuma Interaction falsa foi criada.
    const linha = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: followUp.id, organizationId: cenario.organization.id },
    });
    expect(linha.status).toBe("SCHEDULED");
    expect(
      await prisma.interaction.count({ where: { organizationId: cenario.organization.id } })
    ).toBe(0);
  });

  test("as actions de FOLLOW-UP recusam uma visita", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    const visita = await visitaDireta(cenario, interesse, emHoras(26));
    const estadoVazio = { success: false, message: "" };

    expect((await concluirFollowUp(visita.id, estadoVazio, new FormData())).success).toBe(false);
    expect((await cancelarFollowUp(visita.id, estadoVazio, new FormData())).success).toBe(false);
    expect(
      (
        await atualizarFollowUp(
          visita.id,
          estadoVazio,
          formulario({ subject: "x", scheduledAt: "2099-01-05T09:00", notes: "" })
        )
      ).success
    ).toBe(false);

    const linha = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: visita.id, organizationId: cenario.organization.id },
    });
    expect(linha.status).toBe("SCHEDULED");
    expect(linha.subject).toBeNull();
  });
});

// -----------------------------------------------------------------------
// 14-16. Próximo compromisso
// -----------------------------------------------------------------------
describe("próximo compromisso da negociação", () => {
  const AGORA = new Date("2026-09-07T12:00:00.000Z");

  test("follow-up futuro tira a negociação de 'sem próximo compromisso'", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);

    const antes = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(antes.negociacoes.itens[0].semProximoCompromisso).toBe(true);

    await followUpDireto(cenario, interesse, new Date("2026-09-08T09:00:00.000Z"), {
      assunto: "Enviar proposta",
    });

    const depois = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(depois.negociacoes.itens[0].semProximoCompromisso).toBe(false);
    expect(depois.negociacoes.itens[0].proximoCompromisso).toEqual({
      tipo: "FOLLOW_UP",
      assunto: "Enviar proposta",
      scheduledAtISO: "2026-09-08T09:00:00.000Z",
    });
  });

  test("cancelar o follow-up devolve a negociação para 'sem próximo compromisso'", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    const followUp = await followUpDireto(cenario, interesse, new Date("2026-09-08T09:00:00.000Z"));

    await cancelarFollowUp(followUp.id, { success: false, message: "" }, new FormData());

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.negociacoes.itens[0].semProximoCompromisso).toBe(true);
    expect(central.negociacoes.itens[0].proximoCompromisso).toBeNull();
  });

  test("com vários compromissos futuros, o próximo é o mais próximo — sem unique artificial", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await followUpDireto(cenario, interesse, new Date("2026-09-20T09:00:00.000Z"), {
      assunto: "Follow-up distante",
    });
    await visitaDireta(cenario, interesse, new Date("2026-09-09T09:00:00.000Z"));
    await followUpDireto(cenario, interesse, new Date("2026-09-08T09:00:00.000Z"), {
      assunto: "Follow-up mais próximo",
    });

    // Três compromissos futuros coexistem na mesma negociação.
    expect(
      await prisma.scheduledActivity.count({
        where: { organizationId: cenario.organization.id, propertyInterestId: interesse.id },
      })
    ).toBe(3);

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.negociacoes.itens[0].proximoCompromisso?.assunto).toBe("Follow-up mais próximo");
  });

  test("um follow-up PASSADO não conta como próximo compromisso", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await followUpDireto(cenario, interesse, new Date("2026-09-01T09:00:00.000Z"));

    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: AGORA,
    });
    expect(central.negociacoes.itens[0].semProximoCompromisso).toBe(true);
    // ... mas continua sendo trabalho atrasado.
    expect(central.atrasadas.total).toBe(1);
  });
});

// -----------------------------------------------------------------------
// 17-18. Negociação encerrada
// -----------------------------------------------------------------------
describe("negociação encerrada (WON/REJECTED)", () => {
  test.each(["WON", "REJECTED"] as const)(
    "%s não recebe follow-up NOVO",
    async (stage) => {
      const cenario = await novoCenario();
      autenticarComo(cenario);
      const interesse = await negociacao(cenario, { stage });

      const estado = await criarPelaAction(cenario, interesse.id);
      expect(estado.success).toBe(false);
      expect(
        await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } })
      ).toBe(0);
    }
  );

  // Decisão conservadora e EXPLÍCITA: fechar a negociação NÃO cancela
  // compromissos existentes. Nenhum fluxo do produto fazia isso com
  // visitas (auditado), e a Fase 19 não inventa mutação automática. O
  // corretor cancela o que não faz mais sentido — e o compromisso
  // continua aparecendo até lá, porque ele é real.
  test("fechar a negociação NÃO cancela o follow-up existente", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    const followUp = await followUpDireto(cenario, interesse, new Date("2026-09-10T09:00:00.000Z"));

    await prisma.propertyInterest.update({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      data: { stage: "WON", closedAt: new Date() },
    });

    const linha = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: followUp.id, organizationId: cenario.organization.id },
    });
    expect(linha.status).toBe("SCHEDULED");

    // A negociação some de "minhas negociações" (só estágios abertos),
    // mas o compromisso continua visível como trabalho pendente — ele
    // ainda existe e alguém precisa decidir o que fazer com ele.
    const central = await buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", {
      agora: new Date("2026-09-07T12:00:00.000Z"),
    });
    expect(central.negociacoes.total).toBe(0);
    expect(central.proximas).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------
// 19-21. Agenda
// -----------------------------------------------------------------------
describe("Agenda", () => {
  const AGORA = new Date("2026-09-07T12:00:00.000Z");

  test("a Agenda lista visita E follow-up, com tipo e assunto", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await visitaDireta(cenario, interesse, new Date("2026-09-07T10:00:00.000Z"));
    await followUpDireto(cenario, interesse, new Date("2026-09-07T15:00:00.000Z"), {
      assunto: "Enviar proposta",
    });

    const hoje = await buscarAgendaHoje(cenario.organization.id, "UTC", {}, { agora: AGORA });
    expect(hoje).toHaveLength(2);
    expect(hoje.map((i) => i.type)).toEqual(["VISIT", "FOLLOW_UP"]);
    expect(hoje[1].subject).toBe("Enviar proposta");
    expect(hoje[0].subject).toBeNull();
  });

  test("os contadores da Agenda incluem os dois tipos", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await visitaDireta(cenario, interesse, new Date("2026-09-07T10:00:00.000Z"));
    await followUpDireto(cenario, interesse, new Date("2026-09-10T15:00:00.000Z"));
    await followUpDireto(cenario, interesse, new Date("2026-09-01T15:00:00.000Z"));

    const contadores = await contarAgenda(cenario.organization.id, "UTC", {}, { agora: AGORA });
    expect(contadores.hoje).toBe(1);
    expect(contadores.proximas).toBe(1);
    expect(contadores.atrasadas).toBe(1);
  });

  test("Agenda e Central concordam sobre os mesmos compromissos", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await visitaDireta(cenario, interesse, new Date("2026-09-07T10:00:00.000Z"));
    await followUpDireto(cenario, interesse, new Date("2026-09-07T15:00:00.000Z"));
    await followUpDireto(cenario, interesse, new Date("2026-09-10T15:00:00.000Z"));

    const [hoje, proximas, central] = await Promise.all([
      buscarAgendaHoje(cenario.organization.id, "UTC", {}, { agora: AGORA }),
      buscarAgendaProximas(cenario.organization.id, "UTC", {}, { agora: AGORA }),
      buscarCentralTrabalho(cenario.organization.id, cenario.membro.id, "UTC", { agora: AGORA }),
    ]);
    const ordenar = (v: string[]) => [...v].sort();
    expect(ordenar(hoje.map((i) => i.id))).toEqual(ordenar(central.hoje.itens.map((i) => i.id)));
    expect(ordenar(proximas.map((i) => i.id))).toEqual(
      ordenar(central.proximas.map((i) => i.id))
    );
  });
});

// -----------------------------------------------------------------------
// ActivityLog
// -----------------------------------------------------------------------
describe("ActivityLog", () => {
  test("os três eventos do ciclo são registrados, sem PII", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    await criarPelaAction(cenario, interesse.id, { assunto: "Cobrar documentos do João" });
    const followUp = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id },
      select: { id: true },
    });
    await cancelarFollowUp(followUp.id, { success: false, message: "" }, new FormData());

    const logs = await prisma.activityLog.findMany({
      where: { organizationId: cenario.organization.id, entity: "ScheduledActivity" },
      select: { action: true, entityId: true, payload: true },
    });
    expect(logs.map((l) => l.action).sort()).toEqual(["follow_up_cancelled", "follow_up_created"]);
    for (const log of logs) {
      expect(log.entityId).toBe(followUp.id);
      // O assunto é texto livre do corretor e nunca entra no log.
      expect(JSON.stringify(log.payload ?? {})).not.toContain("João");
    }
  });

  test("editar registra o deslocamento da data, sem o assunto", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const interesse = await negociacao(cenario);
    const followUp = await followUpDireto(cenario, interesse, new Date("2026-09-10T09:00:00.000Z"));

    await atualizarFollowUp(
      followUp.id,
      { success: false, message: "" },
      formulario({ subject: "Segredo comercial", scheduledAt: "2099-01-05T09:00", notes: "" })
    );

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, action: "follow_up_updated" },
      select: { payload: true },
    });
    const payload = JSON.stringify(log.payload);
    expect(payload).toContain("2026-09-10T09:00:00.000Z");
    expect(payload).not.toContain("Segredo");
  });
});
