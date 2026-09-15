import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { criarCenario, criarPessoa, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import {
  criarAgendamentoVisita,
  concluirAgendamentoVisita,
  cancelarAgendamentoVisita,
} from "@/app/app/agendamentos/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Resultado da visita (Fase 37) — contra o banco
// =======================================================================
// O que estes testes protegem não é "a coluna grava". É que o produto
// pare de poder MENTIR:
//
//   um no-show nunca vira Interaction VISIT (o cliente não visitou nada)
//   um no-show nunca avança o stage para VISITED
//   um resultado negativo nunca vira REJECTED nem preenche lostReason
//   um resultado positivo nunca vira PROPOSAL
//   cancelar continua sendo outro fato, com outro status
//
// E que encerrar a visita e marcar o próximo passo sejam uma coisa só.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

function autenticarComo(
  cenario: Cenario,
  m: { id: string; userId: string } = { id: cenario.membro.id, userId: cenario.usuario.id },
  role = "OWNER"
) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: m.userId,
      organizationId: cenario.organization.id,
      organizationMemberId: m.id,
      role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

const futuro = (dias = 7) =>
  new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 16);

async function membro(cenario: Cenario, nome: string, role = "BROKER") {
  const usuario = await criarUsuario({ name: nome });
  const m = await criarMembro({
    organizationId: cenario.organization.id,
    userId: usuario.id,
    role: role as "BROKER",
  });
  return { ...m, userId: usuario.id };
}

// Cenário base: organização com CRM, pessoa, imóvel e uma visita AGENDADA
// pela action real — o estado de onde toda jornada desta fase parte.
async function comVisitaAgendada(opcoes: { responsavelId?: string | null } = {}) {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  autenticarComo(cenario);
  const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
  const imovel = await criarImovel({
    organizationId: cenario.organization.id,
    status: "AVAILABLE",
  });
  const interesse = await prisma.propertyInterest.create({
    data: {
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: "INTERESTED",
      responsibleMemberId:
        opcoes.responsavelId === undefined ? cenario.membro.id : opcoes.responsavelId,
    },
  });
  const criada = await criarAgendamentoVisita(
    interesse.id,
    ESTADO_INICIAL_ACAO,
    formData({ scheduledAt: futuro() })
  );
  expect(criada.success).toBe(true);
  const visita = await prisma.scheduledActivity.findFirstOrThrow({
    where: { organizationId: cenario.organization.id, type: "VISIT" },
    select: { id: true },
  });
  return { cenario, pessoa, imovel, interesse, visita };
}

const encerrar = (visitaId: string, campos: Record<string, string>) =>
  concluirAgendamentoVisita(visitaId, ESTADO_INICIAL_ACAO, formData(campos));

const lerVisita = (cenario: Cenario, id: string) =>
  prisma.scheduledActivity.findFirstOrThrow({
    where: { id, organizationId: cenario.organization.id },
    select: {
      status: true,
      visitOutcome: true,
      outcomeNotes: true,
      completedAt: true,
      cancelledAt: true,
    },
  });

const lerNegociacao = (cenario: Cenario, id: string) =>
  prisma.propertyInterest.findFirstOrThrow({
    where: { id, organizationId: cenario.organization.id },
    select: { stage: true, lostReason: true, closedAt: true },
  });

const contarVisitasNoHistorico = (cenario: Cenario, personId: string) =>
  prisma.interaction.count({
    where: { organizationId: cenario.organization.id, personId, type: "VISIT" },
  });

// -----------------------------------------------------------------------
// O resultado é obrigatório
// -----------------------------------------------------------------------
describe("encerrar exige dizer o que aconteceu", () => {
  test("sem resultado a visita continua agendada", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    const r = await encerrar(visita.id, {});
    expect(r.success).toBe(false);
    expect(r.fieldErrors?.resultado).toBeTruthy();
    // NADA foi escrito: a validação acontece antes de qualquer escrita.
    expect((await lerVisita(cenario, visita.id)).status).toBe("SCHEDULED");
  });

  test("resultado que não pertence ao vocabulário é recusado", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    for (const invalido of ["CANCELLED", "REJECTED", "GOSTOU", ""]) {
      expect((await encerrar(visita.id, { resultado: invalido })).success).toBe(false);
    }
    expect((await lerVisita(cenario, visita.id)).status).toBe("SCHEDULED");
  });
});

// -----------------------------------------------------------------------
// Visita realizada
// -----------------------------------------------------------------------
describe("visita realizada", () => {
  test.each(["INTERESTED", "UNDECIDED", "NOT_INTERESTED"])(
    "%s: status COMPLETED, resultado gravado e UMA Interaction VISIT",
    async (resultado) => {
      const { cenario, pessoa, visita } = await comVisitaAgendada();
      expect((await encerrar(visita.id, { resultado })).success).toBe(true);

      const depois = await lerVisita(cenario, visita.id);
      expect(depois.status).toBe("COMPLETED");
      expect(depois.visitOutcome).toBe(resultado);
      expect(depois.completedAt).not.toBeNull();
      // Cancelar é outro fato: nada aqui o toca.
      expect(depois.cancelledAt).toBeNull();

      expect(await contarVisitasNoHistorico(cenario, pessoa.id)).toBe(1);
    }
  );

  test("a observação do resultado é gravada sem tocar a nota do agendamento", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    // Nota de PREPARAÇÃO, escrita antes da visita.
    await prisma.scheduledActivity.updateMany({
      where: { id: visita.id, organizationId: cenario.organization.id },
      data: { notes: "cliente pediu para ver a área de lazer" },
    });

    await encerrar(visita.id, {
      resultado: "UNDECIDED",
      observacaoResultado: "  achou os quartos pequenos  ",
    });

    const depois = await prisma.scheduledActivity.findFirstOrThrow({
      where: { id: visita.id, organizationId: cenario.organization.id },
      select: { notes: true, outcomeNotes: true },
    });
    // Duas observações, dois momentos, nenhuma sobrescreve a outra.
    expect(depois.notes).toBe("cliente pediu para ver a área de lazer");
    expect(depois.outcomeNotes).toBe("achou os quartos pequenos");
  });

  test("a consequência que JÁ EXISTIA é preservada: VISIT_SCHEDULED avança para VISITED", async () => {
    const { cenario, interesse, visita } = await comVisitaAgendada();
    // Agendar já move o stage para VISIT_SCHEDULED (Fase H.2).
    expect((await lerNegociacao(cenario, interesse.id)).stage).toBe("VISIT_SCHEDULED");

    await encerrar(visita.id, { resultado: "INTERESTED" });
    expect((await lerNegociacao(cenario, interesse.id)).stage).toBe("VISITED");
  });
});

// -----------------------------------------------------------------------
// Resultado não é stage
// -----------------------------------------------------------------------
describe("o resultado é um fato, o stage é outro", () => {
  test("resultado POSITIVO não vira PROPOSAL", async () => {
    const { cenario, interesse, visita } = await comVisitaAgendada();
    await encerrar(visita.id, { resultado: "INTERESTED" });
    const depois = await lerNegociacao(cenario, interesse.id);
    expect(depois.stage).toBe("VISITED");
    expect(depois.stage).not.toBe("PROPOSAL");
  });

  test("resultado NEGATIVO não vira REJECTED, não fecha e não inventa motivo de perda", async () => {
    const { cenario, interesse, visita } = await comVisitaAgendada();
    await encerrar(visita.id, { resultado: "NOT_INTERESTED" });

    const depois = await lerNegociacao(cenario, interesse.id);
    expect(depois.stage).toBe("VISITED");
    expect(depois.stage).not.toBe("REJECTED");
    // lostReason pertence ao FECHAMENTO (Fase 34) e nada aqui o preenche.
    expect(depois.lostReason).toBeNull();
    expect(depois.closedAt).toBeNull();
  });
});

// -----------------------------------------------------------------------
// No-show
// -----------------------------------------------------------------------
describe("não comparecimento", () => {
  test("NUNCA cria fato falso de visita realizada, e não avança o stage", async () => {
    const { cenario, pessoa, interesse, visita } = await comVisitaAgendada();
    expect((await lerNegociacao(cenario, interesse.id)).stage).toBe("VISIT_SCHEDULED");

    const r = await encerrar(visita.id, { resultado: "NAO_COMPARECEU" });
    expect(r.success).toBe(true);

    const depois = await lerVisita(cenario, visita.id);
    expect(depois.status).toBe("NO_SHOW");
    // Sem resultado comercial: não há o que opinar sobre um imóvel que
    // ninguém viu.
    expect(depois.visitOutcome).toBeNull();

    // A DUAS invariantes mais importantes da fase.
    expect(await contarVisitasNoHistorico(cenario, pessoa.id)).toBe(0);
    expect((await lerNegociacao(cenario, interesse.id)).stage).toBe("VISIT_SCHEDULED");
  });

  test("no-show NÃO é cancelamento: status próprio e cancelledAt intocado", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    await encerrar(visita.id, { resultado: "NAO_COMPARECEU" });
    const depois = await lerVisita(cenario, visita.id);
    expect(depois.status).toBe("NO_SHOW");
    expect(depois.status).not.toBe("CANCELLED");
    expect(depois.cancelledAt).toBeNull();
  });

  test("cancelamento NÃO vira no-show, e cancelada não pode ser encerrada", async () => {
    const { cenario, pessoa, visita } = await comVisitaAgendada();
    expect(
      (await cancelarAgendamentoVisita(visita.id, ESTADO_INICIAL_ACAO, new FormData())).success
    ).toBe(true);

    const depois = await lerVisita(cenario, visita.id);
    expect(depois.status).toBe("CANCELLED");
    expect(depois.status).not.toBe("NO_SHOW");
    expect(depois.cancelledAt).not.toBeNull();

    // E registrar resultado numa visita cancelada é recusado.
    const r = await encerrar(visita.id, { resultado: "INTERESTED" });
    expect(r.success).toBe(false);
    expect(await contarVisitasNoHistorico(cenario, pessoa.id)).toBe(0);
  });

  test("a observação funciona no no-show — é onde ela mais serve", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    await encerrar(visita.id, {
      resultado: "NAO_COMPARECEU",
      observacaoResultado: "ligou depois dizendo que esqueceu",
    });
    expect((await lerVisita(cenario, visita.id)).outcomeNotes).toBe(
      "ligou depois dizendo que esqueceu"
    );
  });
});

// -----------------------------------------------------------------------
// Próxima ação
// -----------------------------------------------------------------------
describe("próxima ação", () => {
  const contarFollowUps = (cenario: Cenario) =>
    prisma.scheduledActivity.count({
      where: { organizationId: cenario.organization.id, type: "FOLLOW_UP" },
    });

  test("é OPCIONAL: encerrar sem ela não cria compromisso nenhum", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    await encerrar(visita.id, { resultado: "NOT_INTERESTED" });
    expect(await contarFollowUps(cenario)).toBe(0);
  });

  test("quando pedida, nasce ligada à NEGOCIAÇÃO da visita", async () => {
    const { cenario, interesse, visita } = await comVisitaAgendada();
    const r = await encerrar(visita.id, {
      resultado: "INTERESTED",
      agendarProximo: "on",
      proximoAssunto: "Enviar opções parecidas",
      proximoQuando: futuro(2),
    });
    expect(r.success).toBe(true);

    const followUp = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, type: "FOLLOW_UP" },
      select: { subject: true, propertyInterestId: true, status: true },
    });
    expect(followUp.subject).toBe("Enviar opções parecidas");
    // Uma visita sempre pertence a uma negociação, então o próximo passo
    // dela é um passo daquele negócio.
    expect(followUp.propertyInterestId).toBe(interesse.id);
    expect(followUp.status).toBe("SCHEDULED");
  });

  test("também funciona depois de um no-show — é o caso que mais precisa", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    await encerrar(visita.id, {
      resultado: "NAO_COMPARECEU",
      agendarProximo: "on",
      proximoAssunto: "Ligar para remarcar",
      proximoQuando: futuro(1),
    });
    expect(await contarFollowUps(cenario)).toBe(1);
    expect((await lerVisita(cenario, visita.id)).status).toBe("NO_SHOW");
  });

  test("ATÔMICO: próxima ação inválida não encerra a visita pela metade", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    const r = await encerrar(visita.id, {
      resultado: "INTERESTED",
      agendarProximo: "on",
      proximoAssunto: "Ligar",
      // Data no passado — recusada pela mesma regra do follow-up.
      proximoQuando: new Date(Date.now() - 86_400_000).toISOString().slice(0, 16),
    });
    expect(r.success).toBe(false);

    // A visita NÃO foi encerrada: some da lista de pendências sem criar o
    // compromisso pedido seria o pior resultado possível.
    expect((await lerVisita(cenario, visita.id)).status).toBe("SCHEDULED");
    expect(await contarFollowUps(cenario)).toBe(0);
  });
});

// -----------------------------------------------------------------------
// Idempotência e concorrência
// -----------------------------------------------------------------------
describe("encerrar duas vezes", () => {
  test("retry não duplica Interaction, follow-up nem sobrescreve o resultado", async () => {
    const { cenario, pessoa, visita } = await comVisitaAgendada();
    await encerrar(visita.id, {
      resultado: "INTERESTED",
      agendarProximo: "on",
      proximoAssunto: "Ligar amanhã",
      proximoQuando: futuro(1),
    });

    // Segunda tentativa, com resultado DIFERENTE: é sucesso silencioso e
    // o primeiro resultado prevalece — corrigir não é reenviar.
    const segundo = await encerrar(visita.id, { resultado: "NOT_INTERESTED" });
    expect(segundo.success).toBe(true);

    const depois = await lerVisita(cenario, visita.id);
    expect(depois.visitOutcome).toBe("INTERESTED");
    expect(await contarVisitasNoHistorico(cenario, pessoa.id)).toBe(1);
    expect(
      await prisma.scheduledActivity.count({
        where: { organizationId: cenario.organization.id, type: "FOLLOW_UP" },
      })
    ).toBe(1);
  });

  test("duas conclusões CONCORRENTES produzem um único resultado", async () => {
    const { cenario, pessoa, visita } = await comVisitaAgendada();

    const [a, b] = await Promise.all([
      encerrar(visita.id, { resultado: "INTERESTED" }),
      encerrar(visita.id, { resultado: "NOT_INTERESTED" }),
    ]);

    // As duas respondem sucesso (a perdedora é idempotente), mas o banco
    // tem UM resultado e UMA Interaction — a guarda atômica no WHERE.
    expect([a.success, b.success].every(Boolean)).toBe(true);
    const depois = await lerVisita(cenario, visita.id);
    expect(["INTERESTED", "NOT_INTERESTED"]).toContain(depois.visitOutcome);
    expect(await contarVisitasNoHistorico(cenario, pessoa.id)).toBe(1);
  });
});

// -----------------------------------------------------------------------
// Autoria, tenant e escopo
// -----------------------------------------------------------------------
describe("quem pode registrar", () => {
  test("o autor da Interaction é quem encerrou, resolvido no servidor", async () => {
    const { cenario, pessoa, visita } = await comVisitaAgendada();
    await encerrar(visita.id, { resultado: "INTERESTED" });

    const interacao = await prisma.interaction.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, personId: pessoa.id, type: "VISIT" },
      select: { memberId: true },
    });
    expect(interacao.memberId).toBe(cenario.membro.id);
  });

  test("outro tenant não encerra a visita desta organização", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    const outro = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(outro);
    autenticarComo(outro);

    const r = await encerrar(visita.id, { resultado: "INTERESTED" });
    expect(r.success).toBe(false);
    expect((await lerVisita(cenario, visita.id)).status).toBe("SCHEDULED");
  });

  test("em política restrita, a visita de uma negociação de outro corretor é recusada", async () => {
    // A POSSE DA PESSOA (Fase 36) não concede acesso à visita de uma
    // negociação alheia — as duas dimensões continuam separadas.
    const { cenario, pessoa, interesse, visita } = await comVisitaAgendada();
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { commercialVisibility: "RESTRICTED" },
    });
    const bruno = await membro(cenario, "Bruno");
    // Bruno é dono da PESSOA; a negociação continua sendo de outro.
    await prisma.person.updateMany({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
      data: { responsibleMemberId: bruno.id },
    });

    autenticarComo(cenario, bruno, "BROKER");
    const r = await encerrar(visita.id, { resultado: "INTERESTED" });
    expect(r.success).toBe(false);
    expect((await lerVisita(cenario, visita.id)).status).toBe("SCHEDULED");
    expect((await lerNegociacao(cenario, interesse.id)).stage).toBe("VISIT_SCHEDULED");
  });
});

// -----------------------------------------------------------------------
// Múltiplas visitas
// -----------------------------------------------------------------------
describe("histórico", () => {
  test("cada visita mantém o SEU resultado — a segunda não apaga a primeira", async () => {
    const { cenario, interesse, visita } = await comVisitaAgendada();
    await encerrar(visita.id, {
      resultado: "UNDECIDED",
      observacaoResultado: "quer voltar com a esposa",
    });

    // Segunda visita do MESMO imóvel, para a mesma negociação.
    const segunda = await criarAgendamentoVisita(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formData({ scheduledAt: futuro(10) })
    );
    expect(segunda.success).toBe(true);
    const visita2 = await prisma.scheduledActivity.findFirstOrThrow({
      where: {
        organizationId: cenario.organization.id,
        type: "VISIT",
        status: "SCHEDULED",
      },
      select: { id: true },
    });
    await encerrar(visita2.id, { resultado: "INTERESTED" });

    const todas = await prisma.scheduledActivity.findMany({
      where: {
        organizationId: cenario.organization.id,
        propertyInterestId: interesse.id,
        type: "VISIT",
      },
      orderBy: { scheduledAt: "asc" },
      select: { visitOutcome: true, outcomeNotes: true },
    });
    expect(todas).toHaveLength(2);
    expect(todas[0].visitOutcome).toBe("UNDECIDED");
    expect(todas[0].outcomeNotes).toBe("quer voltar com a esposa");
    expect(todas[1].visitOutcome).toBe("INTERESTED");
  });

  test("visita histórica sem resultado continua sem resultado — nenhum backfill", async () => {
    const { cenario, visita } = await comVisitaAgendada();
    // Simula o estado anterior à fase: encerrada, sem resultado.
    await prisma.scheduledActivity.updateMany({
      where: { id: visita.id, organizationId: cenario.organization.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    const depois = await lerVisita(cenario, visita.id);
    expect(depois.status).toBe("COMPLETED");
    expect(depois.visitOutcome).toBeNull();
  });
});
