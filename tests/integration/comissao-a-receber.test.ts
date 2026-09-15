import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
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
import { buscarComissaoAReceber } from "@/lib/comissao-a-receber";
import {
  registrarPagamentoParticipante,
  cancelarPagamentoParticipante,
} from "@/app/app/clientes/actions";

// =======================================================================
// Fase 35 — comissão a receber, contra o banco
// =======================================================================
// A pergunta que estes testes respondem não é "a soma está certa" (isso
// os testes unitários já fazem, sem banco). É se o VALOR É MEU: se o
// pagamento que entra na minha conta é inequivocamente o pagamento da
// MINHA participação — nunca o de um colega, nunca o de outro tenant,
// nunca um rateio.
//
// Os pagamentos são criados pela AÇÃO REAL do produto sempre que possível,
// e não por insert direto: é a action que define o que é um pagamento
// válido, e testar contra um insert que a ignore provaria outra coisa.

const CLOSED_AT = new Date("2026-03-10T12:00:00.000Z");

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

async function membro(cenario: Cenario, nome: string, role = "BROKER") {
  const usuario = await criarUsuario({ name: nome });
  const m = await criarMembro({
    organizationId: cenario.organization.id,
    userId: usuario.id,
    role: role as "BROKER",
  });
  return { ...m, userId: usuario.id };
}

// A sessão é sempre a do SERVIDOR: nenhuma consulta desta fase aceita um
// memberId vindo de fora.
function autenticarComo(
  cenario: Cenario,
  m: { id: string; userId: string },
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

async function negocioGanho(
  cenario: Cenario,
  opcoes: {
    stage?: "WON" | "REJECTED" | "PROPOSAL";
    commissionValue?: string | null;
    closedValue?: string | null;
    titulo?: string;
  } = {}
) {
  const organizationId = cenario.organization.id;
  const pessoa = await criarPessoa({ organizationId });
  const imovel = await criarImovel({
    organizationId,
    status: "AVAILABLE",
    ...(opcoes.titulo ? { title: opcoes.titulo } : {}),
  });
  return prisma.propertyInterest.create({
    data: {
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: opcoes.stage ?? "WON",
      closedAt: CLOSED_AT,
      closedValue: opcoes.closedValue === undefined ? "500000.00" : opcoes.closedValue,
      commissionValue:
        opcoes.commissionValue === undefined ? "30000.00" : opcoes.commissionValue,
    },
    select: { id: true },
  });
}

function participacao(
  cenario: Cenario,
  interesseId: string,
  memberId: string,
  valor: string | null
) {
  return prisma.propertyInterestParticipant.create({
    data: {
      organizationId: cenario.organization.id,
      propertyInterestId: interesseId,
      memberId,
      allocationValue: valor,
    },
    select: { id: true },
  });
}

// Pagamento pelo caminho REAL do produto. Devolve o resultado da action
// para que os testes possam afirmar recusa tanto quanto aceitação.
async function pagar(participanteId: string, valor: string, data = "2026-03-20") {
  const form = new FormData();
  form.set("valorPagamento", valor);
  form.set("dataPagamento", data);
  return registrarPagamentoParticipante(participanteId, { success: false }, form);
}

const carteiraDe = (cenario: Cenario, memberId: string) =>
  buscarComissaoAReceber(cenario.organization.id, memberId);

// -----------------------------------------------------------------------
// O valor é meu
// -----------------------------------------------------------------------
describe("a comissão de cada um é a sua", () => {
  test("dois participantes no mesmo negócio: cada carteira vê só a própria parcela", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    autenticarComo(cenario, { id: cenario.membro.id, userId: cenario.usuario.id });

    // Comissão do negócio R$ 30.000, dividida 20/10.
    const negocio = await negocioGanho(cenario, { commissionValue: "30000.00" });
    const parcelaAna = await participacao(cenario, negocio.id, ana.id, "20000.00");
    const parcelaBruno = await participacao(cenario, negocio.id, bruno.id, "10000.00");

    await pagar(parcelaAna.id, "5000");
    await pagar(parcelaBruno.id, "9000");

    const daAna = await carteiraDe(cenario, ana.id);
    // ATRIBUÍDO é a MINHA parte — nunca a comissão total do negócio.
    expect(daAna.totalAtribuido).toBe(20000);
    expect(daAna.totalRecebido).toBe(5000);
    expect(daAna.totalAReceber).toBe(15000);
    expect(daAna.negocios).toHaveLength(1);
    expect(daAna.negocios[0].comissaoDoNegocio).toBe(30000);

    const doBruno = await carteiraDe(cenario, bruno.id);
    expect(doBruno.totalAtribuido).toBe(10000);
    // O pagamento da Ana não encosta na conta do Bruno.
    expect(doBruno.totalRecebido).toBe(9000);
    expect(doBruno.totalAReceber).toBe(1000);
  });

  test("responsável pela negociação sem participação não recebe comissão nenhuma", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    autenticarComo(cenario, { id: cenario.membro.id, userId: cenario.usuario.id });

    const negocio = await negocioGanho(cenario);
    // Bruno CONDUZ; só Ana é beneficiária.
    // organizationId explícito: a extensão de tenant recusa — com razão —
    // qualquer escrita que não declare o tenant, inclusive a do teste.
    await prisma.propertyInterest.updateMany({
      where: { id: negocio.id, organizationId: cenario.organization.id },
      data: { responsibleMemberId: bruno.id },
    });
    await participacao(cenario, negocio.id, ana.id, "12000.00");

    // Responsabilidade comercial não vira dinheiro: a carteira do Bruno
    // está vazia mesmo sendo dele a negociação.
    const doBruno = await carteiraDe(cenario, bruno.id);
    expect(doBruno.negocios).toHaveLength(0);
    expect(doBruno.totalAtribuido).toBe(0);
    expect(doBruno.totalAReceber).toBe(0);

    const daAna = await carteiraDe(cenario, ana.id);
    expect(daAna.totalAReceber).toBe(12000);
  });
});

// -----------------------------------------------------------------------
// Negócios elegíveis
// -----------------------------------------------------------------------
describe("só negócio ganho compõe a carteira", () => {
  test("negócio perdido com participação residual fica de fora", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");

    const perdido = await negocioGanho(cenario, { stage: "REJECTED" });
    await participacao(cenario, perdido.id, ana.id, "9000.00");

    const carteira = await carteiraDe(cenario, ana.id);
    expect(carteira.negocios).toHaveLength(0);
    expect(carteira.totalAtribuido).toBe(0);
  });

  test("negócio em aberto não vira comissão a receber", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, { id: cenario.membro.id, userId: cenario.usuario.id });

    const aberto = await negocioGanho(cenario, { stage: "PROPOSAL" });
    const parcela = await participacao(cenario, aberto.id, ana.id, "9000.00");

    // E a própria escrita já recusa pagar num negócio não ganho.
    const resultado = await pagar(parcela.id, "1000");
    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain("ganha");

    expect((await carteiraDe(cenario, ana.id)).negocios).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// Pagamentos
// -----------------------------------------------------------------------
describe("pagamentos parciais, cancelamento e precisão", () => {
  test("parciais somam; o saldo é a diferença", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, { id: cenario.membro.id, userId: cenario.usuario.id });

    const negocio = await negocioGanho(cenario);
    const parcela = await participacao(cenario, negocio.id, ana.id, "20000.00");
    await pagar(parcela.id, "5000");
    await pagar(parcela.id, "3000");

    const carteira = await carteiraDe(cenario, ana.id);
    expect(carteira.totalAtribuido).toBe(20000);
    expect(carteira.totalRecebido).toBe(8000);
    expect(carteira.totalAReceber).toBe(12000);
    expect(carteira.negocios[0].liquidacao.status).toBe("PARCIAL");
  });

  test("pagamento cancelado sai do recebido e devolve o saldo", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, { id: cenario.membro.id, userId: cenario.usuario.id });

    const negocio = await negocioGanho(cenario);
    const parcela = await participacao(cenario, negocio.id, ana.id, "10000.00");
    await pagar(parcela.id, "4000");
    await pagar(parcela.id, "2000");

    expect((await carteiraDe(cenario, ana.id)).totalRecebido).toBe(6000);

    // Cancela o de R$ 2.000 — o cenário exato do enunciado da fase.
    const doisMil = await prisma.propertyInterestParticipantPayment.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, participantId: parcela.id, amount: 2000 },
      select: { id: true },
    });
    await cancelarPagamentoParticipante(doisMil.id, { success: false }, new FormData());

    const depois = await carteiraDe(cenario, ana.id);
    expect(depois.totalRecebido).toBe(4000);
    expect(depois.totalAReceber).toBe(6000);
    // A linha cancelada continua existindo — ela saiu da soma, não do histórico.
    expect(
      await prisma.propertyInterestParticipantPayment.count({
        where: { organizationId: cenario.organization.id, id: doisMil.id },
      })
    ).toBe(1);
  });

  test("liquidação total: saldo zero e estado RECEBIDO", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, { id: cenario.membro.id, userId: cenario.usuario.id });

    const negocio = await negocioGanho(cenario);
    const parcela = await participacao(cenario, negocio.id, ana.id, "7000.00");
    await pagar(parcela.id, "7000");

    const carteira = await carteiraDe(cenario, ana.id);
    expect(carteira.totalRecebido).toBe(7000);
    expect(carteira.totalAReceber).toBe(0);
    expect(carteira.negocios[0].liquidacao.status).toBe("LIQUIDADO");
  });

  test("centavos atravessam o banco sem erro de precisão", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, { id: cenario.membro.id, userId: cenario.usuario.id });

    const negocio = await negocioGanho(cenario, { commissionValue: "10.37" });
    const parcela = await participacao(cenario, negocio.id, ana.id, "10.37");
    await pagar(parcela.id, "0.01");
    await pagar(parcela.id, "0.10");
    await pagar(parcela.id, "0.20");

    const carteira = await carteiraDe(cenario, ana.id);
    expect(carteira.totalAtribuido).toBe(10.37);
    expect(carteira.totalRecebido).toBe(0.31);
    expect(carteira.totalAReceber).toBe(10.06);
  });

  test("o domínio IMPEDE pagar mais que a parcela — por isso não há saldo negativo", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, { id: cenario.membro.id, userId: cenario.usuario.id });

    const negocio = await negocioGanho(cenario);
    const parcela = await participacao(cenario, negocio.id, ana.id, "10000.00");
    await pagar(parcela.id, "10000");

    const excesso = await pagar(parcela.id, "500");
    expect(excesso.success).toBe(false);
    expect(excesso.message).toContain("ultrapassar");

    const carteira = await carteiraDe(cenario, ana.id);
    expect(carteira.totalRecebido).toBe(10000);
    expect(carteira.totalAReceber).toBe(0);
  });
});

// -----------------------------------------------------------------------
// Ausente não é zero
// -----------------------------------------------------------------------
describe("null e zero são fatos diferentes", () => {
  test("participação sem valor: não entra na soma e é declarada à parte", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");

    const comValor = await negocioGanho(cenario);
    await participacao(cenario, comValor.id, ana.id, "6000.00");
    const semValor = await negocioGanho(cenario, { commissionValue: null });
    await participacao(cenario, semValor.id, ana.id, null);

    const carteira = await carteiraDe(cenario, ana.id);
    expect(carteira.totalAtribuido).toBe(6000);
    expect(carteira.totalAReceber).toBe(6000);
    expect(carteira.semValorAtribuido).toBe(1);

    // A linha existe na composição, com saldo NULL — nunca "R$ 0 a receber".
    const linha = carteira.negocios.find((n) => n.negociacaoId === semValor.id);
    expect(linha?.liquidacao.atribuido).toBeNull();
    expect(linha?.aReceber).toBeNull();
    expect(linha?.liquidacao.status).toBe("SEM_VALOR");
  });

  test("a escrita recusa pagar numa participação sem valor definido", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, { id: cenario.membro.id, userId: cenario.usuario.id });

    const negocio = await negocioGanho(cenario, { commissionValue: null });
    const parcela = await participacao(cenario, negocio.id, ana.id, null);

    const resultado = await pagar(parcela.id, "1000");
    expect(resultado.success).toBe(false);
    expect((await carteiraDe(cenario, ana.id)).totalRecebido).toBe(0);
  });
});

// -----------------------------------------------------------------------
// Tenant
// -----------------------------------------------------------------------
describe("isolamento entre organizações", () => {
  test("a carteira nunca alcança participação, parcela ou pagamento de outro tenant", async () => {
    const cenarioA = await novoCenario();
    const cenarioB = await novoCenario();
    const ana = await membro(cenarioA, "Ana");
    const anaB = await membro(cenarioB, "Ana do outro tenant");

    autenticarComo(cenarioA, { id: cenarioA.membro.id, userId: cenarioA.usuario.id });
    const negocioA = await negocioGanho(cenarioA);
    const parcelaA = await participacao(cenarioA, negocioA.id, ana.id, "10000.00");
    await pagar(parcelaA.id, "1000");

    autenticarComo(cenarioB, { id: cenarioB.membro.id, userId: cenarioB.usuario.id });
    const negocioB = await negocioGanho(cenarioB, { commissionValue: "90000.00" });
    const parcelaB = await participacao(cenarioB, negocioB.id, anaB.id, "80000.00");
    await pagar(parcelaB.id, "70000");

    const carteiraA = await carteiraDe(cenarioA, ana.id);
    expect(carteiraA.totalAtribuido).toBe(10000);
    expect(carteiraA.totalRecebido).toBe(1000);
    expect(carteiraA.negocios).toHaveLength(1);

    // IDOR: pedir a carteira de um membro do OUTRO tenant dentro desta
    // organização devolve vazio — o organizationId manda, não o memberId.
    const cruzada = await buscarComissaoAReceber(cenarioA.organization.id, anaB.id);
    expect(cruzada.negocios).toHaveLength(0);
    expect(cruzada.totalAtribuido).toBe(0);
    expect(cruzada.totalRecebido).toBe(0);
  });
});
