import { describe, test, expect, afterEach, vi } from "vitest";

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
import { criarCenario, criarPessoa, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import { auth } from "@/lib/auth";
import {
  criarInteressePessoa,
  adicionarParticipante,
  atualizarParticipante,
  removerParticipante,
  registrarPagamentoParticipante,
  cancelarPagamentoParticipante,
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
  corrigirDadosFechamento,
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
  autenticarComo(cenario, cenario.membro.id, "OWNER");
  return cenario;
}

function autenticarComo(cenario: Cenario, membroId: string | undefined, role = "OWNER") {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: membroId,
      role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const HOJE = new Date().toISOString().slice(0, 10);

async function outroMembro(organizationId: string, nome: string) {
  const usuario = await criarUsuario({ name: nome });
  const membro = await criarMembro({ organizationId, userId: usuario.id, role: "BROKER" });
  return { ...membro, nome };
}

// Negócio GANHO, com comissão e um participante já atribuído — o estado
// em que pagamento faz sentido.
async function negocioComParcela(
  cenario: Cenario,
  opcoes: { comissao?: string; parcela?: string; memberId?: string } = {}
) {
  const organizationId = cenario.organization.id;
  const pessoa = await criarPessoa({ organizationId });
  const imovel = await criarImovel({ organizationId });
  await criarInteressePessoa(pessoa.id, ESTADO_INICIAL_ACAO, form({ propertyId: imovel.id }));
  const interesse = await prisma.propertyInterest.findFirstOrThrow({
    where: { organizationId, personId: pessoa.id, propertyId: imovel.id },
    select: { id: true },
  });
  if (opcoes.comissao !== undefined) {
    await marcarInteresseComoGanho(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "800000", valorComissao: opcoes.comissao })
    );
  }
  const memberId = opcoes.memberId ?? cenario.membro.id;
  await adicionarParticipante(
    interesse.id,
    ESTADO_INICIAL_ACAO,
    form(
      opcoes.parcela === undefined
        ? { memberId }
        : { memberId, valorParticipacao: opcoes.parcela }
    )
  );
  const parcela = await prisma.propertyInterestParticipant.findFirstOrThrow({
    where: { organizationId, propertyInterestId: interesse.id, memberId },
    select: { id: true },
  });
  return { interesseId: interesse.id, participanteId: parcela.id };
}

const pagar = (participanteId: string, valor: string, data = HOJE) =>
  registrarPagamentoParticipante(
    participanteId,
    ESTADO_INICIAL_ACAO,
    form({ valorPagamento: valor, dataPagamento: data })
  );

async function pagamentosDe(participanteId: string, organizationId: string) {
  return prisma.propertyInterestParticipantPayment.findMany({
    where: { organizationId, participantId: participanteId },
    select: { id: true, amount: true, paidAt: true, cancelledAt: true, createdByMemberId: true },
    orderBy: { createdAt: "asc" },
  });
}

const somaValida = (linhas: { amount: unknown; cancelledAt: Date | null }[]) =>
  linhas.filter((l) => l.cancelledAt === null).reduce((s, l) => s + Number(l.amount), 0);

describe("registro de pagamento", () => {
  test("pagamento parcial registra e deixa saldo", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });

    expect((await pagar(participanteId, "15000")).success).toBe(true);

    const linhas = await pagamentosDe(participanteId, c.organization.id);
    expect(linhas).toHaveLength(1);
    expect(Number(linhas[0].amount)).toBe(15000);
    // Ator tenant-specific gravado no ledger.
    expect(linhas[0].createdByMemberId).toBe(c.membro.id);
  });

  test("segundo pagamento fecha a parcela (liquidação total)", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });

    expect((await pagar(participanteId, "15000")).success).toBe(true);
    expect((await pagar(participanteId, "5000")).success).toBe(true);

    const linhas = await pagamentosDe(participanteId, c.organization.id);
    expect(somaValida(linhas)).toBe(20000);
  });

  test("excesso sobre a parcela é bloqueado e nada é gravado", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "15000");

    const excesso = await pagar(participanteId, "5001");
    expect(excesso.success).toBe(false);
    expect(excesso.message).toContain("não pode ultrapassar");

    const linhas = await pagamentosDe(participanteId, c.organization.id);
    expect(somaValida(linhas)).toBe(15000);
  });

  test("participação SEM valor não aceita pagamento", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000" });

    const r = await pagar(participanteId, "1000");
    expect(r.success).toBe(false);
    expect(r.message).toContain("Defina o valor da participação");
  });

  test("negócio sem comissão não chega a ter parcela, logo não aceita pagamento", async () => {
    const c = await novoCenario();
    // Sem comissão a Fase 12 já bloqueia atribuir valor; a parcela fica
    // null e o pagamento cai na mesma barreira, sem regra separada.
    const { participanteId } = await negocioComParcela(c);
    const r = await pagar(participanteId, "1000");
    expect(r.success).toBe(false);
  });

  test("data futura é recusada", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    const amanha = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);

    const r = await pagar(participanteId, "1000", amanha);
    expect(r.success).toBe(false);
    expect(r.message).toContain("futuro");
  });

  test("negócio ABERTO não aceita pagamento", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    await criarInteressePessoa(pessoa.id, ESTADO_INICIAL_ACAO, form({ propertyId: imovel.id }));
    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId, personId: pessoa.id },
      select: { id: true },
    });
    await adicionarParticipante(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      form({ memberId: c.membro.id })
    );
    const parcela = await prisma.propertyInterestParticipant.findFirstOrThrow({
      where: { organizationId, propertyInterestId: interesse.id },
      select: { id: true },
    });

    const r = await pagar(parcela.id, "1000");
    expect(r.success).toBe(false);
  });

  test("negócio PERDIDO não aceita pagamento", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    await criarInteressePessoa(pessoa.id, ESTADO_INICIAL_ACAO, form({ propertyId: imovel.id }));
    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId, personId: pessoa.id },
      select: { id: true },
    });
    await adicionarParticipante(interesse.id, ESTADO_INICIAL_ACAO, form({ memberId: c.membro.id }));
    const parcela = await prisma.propertyInterestParticipant.findFirstOrThrow({
      where: { organizationId, propertyInterestId: interesse.id },
      select: { id: true },
    });
    await marcarInteresseComoPerdido(interesse.id, ESTADO_INICIAL_ACAO, new FormData());

    expect((await pagar(parcela.id, "1000")).success).toBe(false);
  });

  test("inclusão é auditada com valor e data", async () => {
    const c = await novoCenario();
    const { interesseId, participanteId } = await negocioComParcela(c, {
      comissao: "40000",
      parcela: "20000",
    });
    await pagar(participanteId, "15000");

    const log = await prisma.activityLog.findFirstOrThrow({
      where: {
        organizationId: c.organization.id,
        entityId: interesseId,
        action: "property_interest_payment_added",
      },
      select: { payload: true, userId: true },
    });
    expect(log.payload).toMatchObject({ participantId: participanteId, valor: 15000 });
    expect(log.userId).toBe(c.usuario.id);
  });
});

describe("concorrência", () => {
  test("duas baixas simultâneas nunca ultrapassam a parcela", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "10000" });

    // Cada uma cabe sozinha (7.000 <= 10.000); juntas somam 14.000.
    const [a, b] = await Promise.all([
      pagar(participanteId, "7000"),
      pagar(participanteId, "7000"),
    ]);

    expect([a, b].filter((r) => r.success).length).toBe(1);
    const linhas = await pagamentosDe(participanteId, c.organization.id);
    expect(somaValida(linhas)).toBe(7000);
    expect(somaValida(linhas)).toBeLessThanOrEqual(10000);
  });

  test("pagamento e redução de parcela simultâneos não deixam pago > atribuído", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });

    // A mesma trava por negociação serializa as duas operações, que
    // disputam a mesma invariante em pontas opostas.
    const [pagamento, reducao] = await Promise.all([
      pagar(participanteId, "20000"),
      atualizarParticipante(participanteId, ESTADO_INICIAL_ACAO, form({ valorParticipacao: "5000" })),
    ]);
    expect([pagamento, reducao].filter((r) => r.success).length).toBeGreaterThanOrEqual(1);

    const parcela = await prisma.propertyInterestParticipant.findUniqueOrThrow({
      where: { id: participanteId, organizationId: c.organization.id },
      select: { allocationValue: true },
    });
    const linhas = await pagamentosDe(participanteId, c.organization.id);
    expect(somaValida(linhas)).toBeLessThanOrEqual(Number(parcela.allocationValue));
  });
});

describe("cancelamento e correção", () => {
  test("cancelar devolve o valor ao saldo sem apagar a linha", async () => {
    const c = await novoCenario();
    const { interesseId, participanteId } = await negocioComParcela(c, {
      comissao: "40000",
      parcela: "20000",
    });
    await pagar(participanteId, "20000");
    const [linha] = await pagamentosDe(participanteId, c.organization.id);

    expect(
      (await cancelarPagamentoParticipante(linha.id, ESTADO_INICIAL_ACAO, new FormData())).success
    ).toBe(true);

    const depois = await pagamentosDe(participanteId, c.organization.id);
    // A linha CONTINUA no histórico, apenas marcada.
    expect(depois).toHaveLength(1);
    expect(depois[0].cancelledAt).not.toBeNull();
    expect(somaValida(depois)).toBe(0);

    const log = await prisma.activityLog.findFirstOrThrow({
      where: {
        organizationId: c.organization.id,
        entityId: interesseId,
        action: "property_interest_payment_cancelled",
      },
      select: { payload: true },
    });
    expect(log.payload).toMatchObject({ paymentId: linha.id, valor: 20000 });
  });

  test("correção = cancelar e registrar o valor certo", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "18000"); // digitado errado
    const [errado] = await pagamentosDe(participanteId, c.organization.id);

    await cancelarPagamentoParticipante(errado.id, ESTADO_INICIAL_ACAO, new FormData());
    expect((await pagar(participanteId, "8000")).success).toBe(true);

    const linhas = await pagamentosDe(participanteId, c.organization.id);
    expect(linhas).toHaveLength(2);
    expect(somaValida(linhas)).toBe(8000);
  });

  test("cancelar duas vezes é recusado", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "1000");
    const [linha] = await pagamentosDe(participanteId, c.organization.id);

    await cancelarPagamentoParticipante(linha.id, ESTADO_INICIAL_ACAO, new FormData());
    const segundo = await cancelarPagamentoParticipante(
      linha.id,
      ESTADO_INICIAL_ACAO,
      new FormData()
    );
    expect(segundo.success).toBe(false);
    expect(segundo.message).toContain("já está cancelado");
  });

  test("cancelado libera espaço para novo pagamento até o teto", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "10000" });
    await pagar(participanteId, "10000");
    const [linha] = await pagamentosDe(participanteId, c.organization.id);

    // Cheio: novo pagamento recusado.
    expect((await pagar(participanteId, "1")).success).toBe(false);
    await cancelarPagamentoParticipante(linha.id, ESTADO_INICIAL_ACAO, new FormData());
    // Depois do cancelamento, cabe de novo.
    expect((await pagar(participanteId, "10000")).success).toBe(true);
  });
});

describe("invariantes retroativas", () => {
  test("reduzir a parcela abaixo do pago é bloqueado", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "15000");

    const r = await atualizarParticipante(
      participanteId,
      ESTADO_INICIAL_ACAO,
      form({ valorParticipacao: "10000" })
    );
    expect(r.success).toBe(false);
    expect(r.message).toContain("abaixo do que já foi pago");
  });

  test("limpar a parcela com pagamento é bloqueado", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "15000");

    const r = await atualizarParticipante(
      participanteId,
      ESTADO_INICIAL_ACAO,
      form({ valorParticipacao: "" })
    );
    expect(r.success).toBe(false);
    expect(r.message).toContain("sem valor");
  });

  test("aumentar a parcela continua permitido", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "15000");

    expect(
      (await atualizarParticipante(participanteId, ESTADO_INICIAL_ACAO, form({ valorParticipacao: "30000" })))
        .success
    ).toBe(true);
  });

  test("remover participante com pagamento é bloqueado", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "15000");

    const r = await removerParticipante(participanteId, ESTADO_INICIAL_ACAO, new FormData());
    expect(r.success).toBe(false);
    expect(r.message).toContain("histórico de pagamentos");

    const existe = await prisma.propertyInterestParticipant.count({
      where: { id: participanteId, organizationId: c.organization.id },
    });
    expect(existe).toBe(1);
  });

  test("cancelar NÃO libera a remoção — o histórico financeiro permanece", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "15000");
    const [linha] = await pagamentosDe(participanteId, c.organization.id);
    await cancelarPagamentoParticipante(linha.id, ESTADO_INICIAL_ACAO, new FormData());

    // Cancelado existe para PRESERVAR o rastro de que houve movimento,
    // não para liberar o apagamento da participação. É também o que a FK
    // RESTRICT do ledger impõe no banco.
    const r = await removerParticipante(participanteId, ESTADO_INICIAL_ACAO, new FormData());
    expect(r.success).toBe(false);
    expect(r.message).toContain("histórico de pagamentos");

    const existe = await prisma.propertyInterestParticipant.count({
      where: { id: participanteId, organizationId: c.organization.id },
    });
    expect(existe).toBe(1);
  });

  test("participação SEM histórico de pagamento continua removível", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    expect(
      (await removerParticipante(participanteId, ESTADO_INICIAL_ACAO, new FormData())).success
    ).toBe(true);
  });

  test("reduzir a comissão abaixo do que já foi dividido é bloqueado", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioComParcela(c, { comissao: "40000", parcela: "30000" });

    const r = await corrigirDadosFechamento(
      interesseId,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "800000", valorComissao: "20000" })
    );
    expect(r.success).toBe(false);
    expect(r.message).toContain("abaixo do que já foi dividido");

    const interesse = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesseId, organizationId: c.organization.id },
      select: { commissionValue: true },
    });
    expect(Number(interesse.commissionValue)).toBe(40000);
  });

  test("limpar a comissão com parcelas atribuídas é bloqueado", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioComParcela(c, { comissao: "40000", parcela: "30000" });

    const r = await corrigirDadosFechamento(
      interesseId,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "800000", valorComissao: "" })
    );
    expect(r.success).toBe(false);
  });

  test("aumentar a comissão continua permitido", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioComParcela(c, { comissao: "40000", parcela: "30000" });

    expect(
      (await corrigirDadosFechamento(
        interesseId,
        ESTADO_INICIAL_ACAO,
        form({ valorFechamento: "800000", valorComissao: "50000" })
      )).success
    ).toBe(true);
  });
});

describe("autorização e tenant", () => {
  test("papel sem gerência não registra nem cancela pagamento", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "1000");
    const [linha] = await pagamentosDe(participanteId, c.organization.id);

    autenticarComo(c, c.membro.id, "BROKER");
    const registro = await pagar(participanteId, "1000");
    expect(registro.success).toBe(false);
    expect(registro.message).toContain("permissão");

    const cancelamento = await cancelarPagamentoParticipante(
      linha.id,
      ESTADO_INICIAL_ACAO,
      new FormData()
    );
    expect(cancelamento.success).toBe(false);
  });

  test("MANAGER pode registrar", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    autenticarComo(c, c.membro.id, "MANAGER");
    expect((await pagar(participanteId, "1000")).success).toBe(true);
  });

  test("participação de OUTRA organização não recebe pagamento", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);

    autenticarComo(b, b.membro.id, "OWNER");
    const alvo = await negocioComParcela(b, { comissao: "40000", parcela: "20000" });

    autenticarComo(a, a.membro.id, "OWNER");
    const r = await pagar(alvo.participanteId, "1000");
    expect(r.success).toBe(false);
    // Mensagem genérica: não revela que a participação existe em outro tenant.
    expect(r.message).toContain("não encontrada");
    expect(await pagamentosDe(alvo.participanteId, b.organization.id)).toHaveLength(0);
  });

  test("pagamento de OUTRA organização não é cancelável", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);

    autenticarComo(b, b.membro.id, "OWNER");
    const alvo = await negocioComParcela(b, { comissao: "40000", parcela: "20000" });
    await pagar(alvo.participanteId, "5000");
    const [linha] = await pagamentosDe(alvo.participanteId, b.organization.id);

    autenticarComo(a, a.membro.id, "OWNER");
    expect(
      (await cancelarPagamentoParticipante(linha.id, ESTADO_INICIAL_ACAO, new FormData())).success
    ).toBe(false);

    const [intacta] = await pagamentosDe(alvo.participanteId, b.organization.id);
    expect(intacta.cancelledAt).toBeNull();
  });
});

describe("membro inativo", () => {
  test("beneficiário suspenso CONTINUA recebendo pagamento de obrigação existente", async () => {
    const c = await novoCenario();
    const membro = await outroMembro(c.organization.id, "Dina Corretora");
    const { participanteId } = await negocioComParcela(c, {
      comissao: "40000",
      parcela: "20000",
      memberId: membro.id,
    });
    // Suspenso DEPOIS de a obrigação existir.
    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { status: "SUSPENDED" },
    });

    // Suspender não apaga dívida: o pagamento do que já era devido segue
    // registrável. O que a suspensão impede é entrar em divisão NOVA.
    expect((await pagar(participanteId, "20000")).success).toBe(true);
    const linhas = await pagamentosDe(participanteId, c.organization.id);
    expect(somaValida(linhas)).toBe(20000);
  });
});

describe("analytics de liquidação", () => {
  test("pago no período usa paidAt, e cancelado não conta", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "15000");

    let analytics = await buscarAnalyticsComercial(c.organization.id, "UTC");
    expect(analytics.liquidacao.pagoNoPeriodo).toBe(15000);
    expect(analytics.liquidacao.pagamentos).toBe(1);
    expect(analytics.liquidacao.participantes[0].pago).toBe(15000);

    const [linha] = await pagamentosDe(participanteId, c.organization.id);
    await cancelarPagamentoParticipante(linha.id, ESTADO_INICIAL_ACAO, new FormData());

    analytics = await buscarAnalyticsComercial(c.organization.id, "UTC");
    expect(analytics.liquidacao.pagoNoPeriodo).toBe(0);
    expect(analytics.liquidacao.participantes).toHaveLength(0);
  });

  test("pagamento FORA da janela não entra, mesmo com o negócio dentro", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    // 90 dias atrás: fora do período padrão de 30 dias.
    const antigo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect((await pagar(participanteId, "15000", antigo)).success).toBe(true);

    const analytics = await buscarAnalyticsComercial(c.organization.id, "UTC");
    // Coorte por paidAt: o negócio está no período, o pagamento não.
    expect(analytics.liquidacao.pagoNoPeriodo).toBe(0);
    // E o bloco de atribuição (outra coorte) continua contando o negócio.
    expect(analytics.participacao.comissaoAtribuida).toBe(20000);
  });

  test("atribuído e pago convivem sem se confundir", async () => {
    const c = await novoCenario();
    const { participanteId } = await negocioComParcela(c, { comissao: "40000", parcela: "20000" });
    await pagar(participanteId, "5000");

    const analytics = await buscarAnalyticsComercial(c.organization.id, "UTC");
    expect(analytics.participacao.comissaoAtribuida).toBe(20000);
    expect(analytics.participacao.comissaoNaoDistribuida).toBe(20000);
    expect(analytics.liquidacao.pagoNoPeriodo).toBe(5000);
  });
});
