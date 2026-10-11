import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));

const convitesEnviados: { para: string; link: string }[] = [];
vi.mock("@/lib/email", () => ({
  enviarEmailConviteMembro: vi.fn(async ({ para, linkConvite }) => {
    convitesEnviados.push({ para, link: linkConvite });
    return { enviado: true };
  }),
  enviarEmailRecuperacaoSenha: vi.fn(async () => ({ enviado: true })),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { criarCenario } from "@/test/fixtures";
import { convidarUsuario } from "@/app/app/usuarios/actions";
import { definirSenhaConvite } from "@/app/app/convite/[token]/actions";
import {
  criarPessoa,
  criarInteressePessoa,
  registrarProposta,
  marcarInteresseComoGanho,
} from "@/app/app/clientes/actions";
import { criarImovel } from "@/app/app/imoveis/actions";
import { criarAgendamentoVisita, concluirAgendamentoVisita } from "@/app/app/agendamentos/actions";
import { buscarPipelineAberto } from "@/lib/pipeline";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import {
  opcoesFinalidadeAnuncio,
  finalidadeAnuncioAmbigua,
  precoParaFinalidadeAnuncio,
} from "@/lib/anuncio-imovel";
import { precosDoImovel } from "@/lib/imovel-precos";

// =======================================================================
// Fase 109 — aceite de piloto comercial: a jornada INTEIRA, de ponta a
// ponta, para uma imobiliária com dois corretores
// =======================================================================
// Cada etapa já tem cobertura isolada em algum lugar do projeto. O que
// faltava — e é exatamente o que esta fase de homologação pede — é UM
// cenário que encadeia tudo junto, com dados que se parecem com o uso
// real de um piloto: um admin, dois corretores, um imóvel à venda e um
// para locação, dois clientes, uma negociação que percorre os estágios
// até o fechamento com comissão, e uma segunda negociação aberta — tudo
// isolado de uma segunda organização que não deve ver nada disso.
//
// A divulgação (MKT-001/002/003) já tem suíte E2E exaustiva própria
// (tests/e2e/anuncio-imovel.spec.ts) — este teste NÃO a duplica. Aqui só
// confirma que as mesmas funções puras que a rota de anúncio usa
// resolvem corretamente para um imóvel nascido desta jornada real (prova
// de integração entre a jornada comercial e a divulgação, não uma nova
// cobertura da UI).

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const usuariosAvulsos: string[] = [];

afterEach(async () => {
  convitesEnviados.length = 0;
  vi.mocked(auth).mockReset();
  while (usuariosAvulsos.length) {
    const id = usuariosAvulsos.pop()!;
    await prisma.inviteToken.deleteMany({ where: { userId: id } });
    await prisma.organizationMember.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

function autenticarComoOwner(cenario: Cenario) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function autenticarComoBroker(cenario: Cenario, userId: string, membershipId: string) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: userId,
      organizationId: cenario.organization.id,
      organizationMemberId: membershipId,
      role: "BROKER",
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

async function convidarEAtivarBroker(cenario: Cenario, nome: string) {
  autenticarComoOwner(cenario);
  const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const email = `${slug}-${Date.now()}-${Math.random().toString(36).slice(2)}@e2e.test`;
  const convite = await convidarUsuario(
    ESTADO_INICIAL_ACAO,
    form({ nome, email, papel: "BROKER" })
  );
  expect(convite.success).toBe(true);

  const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
  usuariosAvulsos.push(usuario.id);
  const vinculo = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: cenario.organization.id, userId: usuario.id },
  });

  const link = convitesEnviados.at(-1)!.link;
  const token = link.split("/").pop()!;
  try {
    await definirSenhaConvite(token, ESTADO_INICIAL_ACAO, form({ senha: "SenhaForte123!" }));
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.startsWith("redirect:")) throw erro;
  }

  return { userId: usuario.id, membershipId: vinculo.id };
}

async function criarImovelDaOrganizacao(
  organizationId: string,
  extras: Record<string, string>
): Promise<string> {
  const base = {
    titulo: "Imóvel do Piloto",
    tipo: "Apartamento",
    finalidade: "SALE",
    status: "AVAILABLE",
    bairro: "Pinheiros",
    cidade: "São Paulo",
    estado: "SP",
    ...extras,
  };
  try {
    await criarImovel({ success: false }, form(base));
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.startsWith("redirect:")) throw erro;
  }
  const imovel = await prisma.property.findFirstOrThrow({
    where: { title: base.titulo, organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return imovel.id;
}

describe("Aceite de piloto comercial — dois corretores, SALE e RENT, jornada completa", () => {
  test("ativação → dois corretores → imóvel à venda e à locação → negociação até o fechamento com comissão → isolamento de tenant", async () => {
    const cenario = await novoCenario();

    // 1) Ativação: dois corretores convidados e ativados pelo OWNER.
    const bruno = await convidarEAtivarBroker(cenario, "Bruno Corretor");
    const carla = await convidarEAtivarBroker(cenario, "Carla Corretora");

    // 2) Bruno cadastra um imóvel À VENDA e um PARA LOCAÇÃO — preços
    // diferentes, nunca confundidos entre si.
    autenticarComoBroker(cenario, bruno.userId, bruno.membershipId);
    const imovelVenda = await criarImovelDaOrganizacao(cenario.organization.id, {
      titulo: `Apartamento à Venda ${Date.now()}`,
      finalidade: "SALE",
      preco: "900000",
    });
    const imovelLocacao = await criarImovelDaOrganizacao(cenario.organization.id, {
      titulo: `Apartamento para Locação ${Date.now()}`,
      finalidade: "RENT",
      precoAluguel: "3500",
    });

    const propriedadeVenda = await prisma.property.findUniqueOrThrow({
      where: { id: imovelVenda, organizationId: cenario.organization.id },
      select: { purpose: true, price: true, rentPrice: true },
    });
    expect(propriedadeVenda.purpose).toBe("SALE");
    expect(Number(propriedadeVenda.price)).toBe(900000);
    const propriedadeLocacao = await prisma.property.findUniqueOrThrow({
      where: { id: imovelLocacao, organizationId: cenario.organization.id },
      select: { purpose: true, price: true, rentPrice: true },
    });
    expect(propriedadeLocacao.purpose).toBe("RENT");
    expect(Number(propriedadeLocacao.rentPrice)).toBe(3500);

    // 3) Bruno cadastra dois clientes reais.
    const resultadoCliente1 = await criarPessoa(
      { sucesso: false },
      form({ nome: "Cliente Compra", papel: "LEAD" })
    );
    expect(resultadoCliente1.sucesso).toBe(true);
    const resultadoCliente2 = await criarPessoa(
      { sucesso: false },
      form({ nome: "Cliente Locação", papel: "LEAD" })
    );
    expect(resultadoCliente2.sucesso).toBe(true);
    const clientes = await prisma.person.findMany({
      where: { organizationId: cenario.organization.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    const clienteCompra = clientes.find((c) => c.name === "Cliente Compra")!;
    const clienteLocacao = clientes.find((c) => c.name === "Cliente Locação")!;

    // 4) Negociação de VENDA: relaciona, agenda visita, Carla conclui a
    // visita (ator da transição é quem age, não quem criou), Bruno
    // registra proposta, e a negociação é fechada como GANHA com valor
    // de comissão — a integridade financeira é checada (nunca confunde
    // valor de venda com comissão nem inventa valor não informado).
    const interesseVenda = await criarInteressePessoa(
      clienteCompra.id,
      ESTADO_INICIAL_ACAO,
      form({ propertyId: imovelVenda })
    );
    expect(interesseVenda.success).toBe(true);
    const negociacaoVenda = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, personId: clienteCompra.id, propertyId: imovelVenda },
    });
    expect(negociacaoVenda.stage).toBe("INTERESTED");

    const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const visita = await criarAgendamentoVisita(
      negociacaoVenda.id,
      ESTADO_INICIAL_ACAO,
      form({ scheduledAt: `${amanha}T10:00` })
    );
    expect(visita.success).toBe(true);
    const atividadeVisita = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, propertyInterestId: negociacaoVenda.id },
    });

    autenticarComoBroker(cenario, carla.userId, carla.membershipId);
    const conclusao = await concluirAgendamentoVisita(
      atividadeVisita.id,
      ESTADO_INICIAL_ACAO,
      form({ resultado: "INTERESTED" })
    );
    expect(conclusao.success).toBe(true);

    autenticarComoBroker(cenario, bruno.userId, bruno.membershipId);
    const proposta = await registrarProposta(
      negociacaoVenda.id,
      ESTADO_INICIAL_ACAO,
      form({ lado: "CLIENT", valor: "850000" })
    );
    expect(proposta.success).toBe(true);

    const fechamento = await marcarInteresseComoGanho(
      negociacaoVenda.id,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "870000", valorComissao: "43500" })
    );
    expect(fechamento.success).toBe(true);

    const negociacaoFechada = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: negociacaoVenda.id, organizationId: cenario.organization.id },
      select: { stage: true, closedValue: true, commissionValue: true, closedAt: true },
    });
    expect(negociacaoFechada.stage).toBe("WON");
    expect(Number(negociacaoFechada.closedValue)).toBe(870000);
    expect(Number(negociacaoFechada.commissionValue)).toBe(43500);
    expect(negociacaoFechada.closedAt).not.toBeNull();

    // O histórico de estágios reflete a jornada real inteira, na ordem
    // real, cada transição com o ator correto.
    const historico = await prisma.propertyInterestStageHistory.findMany({
      where: { propertyInterestId: negociacaoVenda.id, organizationId: cenario.organization.id },
      orderBy: { changedAt: "asc" },
      select: { previousStage: true, newStage: true, changedByMemberId: true },
    });
    expect(historico.map((h) => h.newStage)).toEqual([
      "INTERESTED",
      "VISIT_SCHEDULED",
      "VISITED",
      "PROPOSAL",
      "WON",
    ]);
    expect(historico.find((h) => h.newStage === "VISITED")?.changedByMemberId).toBe(
      carla.membershipId
    );

    // 5) Segunda negociação, de LOCAÇÃO, aberta — prova que SALE e RENT
    // convivem na mesma organização sem um contaminar o outro.
    const interesseLocacao = await criarInteressePessoa(
      clienteLocacao.id,
      ESTADO_INICIAL_ACAO,
      form({ propertyId: imovelLocacao })
    );
    expect(interesseLocacao.success).toBe(true);

    // 6) A negociação de venda (fechada) some do board ABERTO; a de
    // locação (em andamento) aparece.
    const pipeline = await buscarPipelineAberto(cenario.organization.id, {}, "UTC");
    const idsAbertos = Object.values(pipeline).flat().map((item) => item.id);
    expect(idsAbertos).not.toContain(negociacaoVenda.id);
    const negociacaoLocacao = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, propertyId: imovelLocacao },
      select: { id: true },
    });
    expect(idsAbertos).toContain(negociacaoLocacao.id);

    // 7) Divulgação (MKT-001/002/003 — já com suíte E2E própria, não
    // duplicada aqui): as mesmas funções puras que a rota de anúncio usa
    // resolvem corretamente para o imóvel À VENDA desta jornada real —
    // finalidade não ambígua, preço de venda correto, nunca o de locação.
    const imovelParaAnuncio = await prisma.property.findUniqueOrThrow({
      where: { id: imovelVenda, organizationId: cenario.organization.id },
      select: { purpose: true, price: true, rentPrice: true },
    });
    expect(finalidadeAnuncioAmbigua(imovelParaAnuncio.purpose)).toBe(false);
    const [finalidadeResolvida] = opcoesFinalidadeAnuncio(imovelParaAnuncio.purpose);
    expect(finalidadeResolvida).toBe("SALE");
    const precos = precosDoImovel(imovelParaAnuncio);
    expect(precoParaFinalidadeAnuncio(finalidadeResolvida, precos)).toBe(900000);

    // 8) Isolamento de tenant: uma segunda organização, do zero, não vê
    // NADA desta jornada — nem os imóveis, nem os clientes, nem a
    // negociação fechada, nem a aberta.
    const outraOrg = await novoCenario();
    expect(
      await prisma.property.count({ where: { organizationId: outraOrg.organization.id } })
    ).toBe(0);
    expect(
      await prisma.person.count({ where: { organizationId: outraOrg.organization.id } })
    ).toBe(0);
    const pipelineDaOutra = await buscarPipelineAberto(outraOrg.organization.id, {}, "UTC");
    expect(Object.values(pipelineDaOutra).flat()).toHaveLength(0);
  });
});
