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
import { criarPessoa, criarInteressePessoa } from "@/app/app/clientes/actions";
import { criarImovel } from "@/app/app/imoveis/actions";
import { criarAgendamentoVisita } from "@/app/app/agendamentos/actions";
import { buscarPipelineAberto } from "@/lib/pipeline";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Fase 107 — jornada completa de ativação de uma organização NOVA
// =======================================================================
// Cada etapa (criar organização, convidar membro, aceitar convite,
// cadastrar cliente/imóvel, abrir negociação, agendar visita, ver no
// pipeline) já tem cobertura isolada em outros arquivos de teste. Nenhum
// deles, até aqui, encadeava a jornada inteira ponta a ponta para uma
// organização recém-criada, sem nenhum dado histórico — exatamente o que
// a Fase 107 pede para provar que uma imobiliária nova consegue começar
// a operar sem depender de registros preexistentes nem de intervenção
// técnica.

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

function formImovel(extras: Record<string, string> = {}) {
  return form({
    titulo: "Apartamento — primeira captação da organização",
    tipo: "Apartamento",
    finalidade: "SALE",
    status: "AVAILABLE",
    bairro: "Centro",
    cidade: "São Paulo",
    estado: "SP",
    preco: "450000",
    ...extras,
  });
}

const tokenDoLink = (link: string) => link.split("/").pop()!;

async function executarAcao<T>(acao: () => Promise<T>): Promise<T | "redirecionou"> {
  try {
    return await acao();
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.startsWith("redirect:")) throw erro;
    return "redirecionou";
  }
}

describe("Jornada de ativação — organização recém-criada, sem histórico", () => {
  test("OWNER convida BROKER, BROKER aceita e opera: primeiro cliente, primeiro imóvel, primeira negociação, primeira visita, aparece no pipeline", async () => {
    const cenario = await novoCenario();

    // 1) OWNER convida um BROKER — nenhum convite anterior, organização
    // zerada.
    autenticarComoOwner(cenario);
    const emailBroker = `broker-ativacao-${Date.now()}@e2e.test`;
    const convite = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      form({ nome: "Corretor Novo", email: emailBroker, papel: "BROKER" })
    );
    expect(convite.success).toBe(true);
    expect(convitesEnviados).toHaveLength(1);

    const usuarioBroker = await prisma.user.findUniqueOrThrow({ where: { email: emailBroker } });
    usuariosAvulsos.push(usuarioBroker.id);
    const vinculoBroker = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, userId: usuarioBroker.id },
    });
    expect(vinculoBroker.status).toBe("INVITED");

    // 2) BROKER aceita o convite (ambiente controlado — nunca login real
    // nem e-mail real; só o token capturado do mock de envio).
    const token = tokenDoLink(convitesEnviados[0].link);
    const aceite = await executarAcao(() =>
      definirSenhaConvite(token, ESTADO_INICIAL_ACAO, form({ senha: "SenhaForte123!" }))
    );
    expect(aceite).toBe("redirecionou");

    const vinculoAtivo = await prisma.organizationMember.findFirstOrThrow({
      where: { id: vinculoBroker.id, organizationId: cenario.organization.id },
    });
    expect(vinculoAtivo.status).toBe("ACTIVE");

    // 3) Primeiro acesso do corretor: papel aplicado, organização
    // correta — a partir daqui toda ação é como o BROKER recém-ativado.
    autenticarComoBroker(cenario, usuarioBroker.id, vinculoBroker.id);

    // 4) Primeiro cliente — organização não tinha NENHUM Person antes.
    expect(await prisma.person.count({ where: { organizationId: cenario.organization.id } })).toBe(0);
    const resultadoCliente = await criarPessoa(
      { sucesso: false },
      form({ nome: "Primeiro Cliente da Organização", papel: "LEAD" })
    );
    expect(resultadoCliente.sucesso).toBe(true);
    const cliente = await prisma.person.findFirstOrThrow({
      where: { organizationId: cenario.organization.id },
    });

    // 5) Primeiro imóvel — organização não tinha NENHUM Property antes.
    expect(await prisma.property.count({ where: { organizationId: cenario.organization.id } })).toBe(0);
    const resultadoImovel = await executarAcao(() =>
      criarImovel({ success: false }, formImovel())
    );
    expect(resultadoImovel).toBe("redirecionou");
    const imovel = await prisma.property.findFirstOrThrow({
      where: { organizationId: cenario.organization.id },
    });

    // 6) Primeira negociação — relacionar o cliente ao imóvel.
    const resultadoInteresse = await criarInteressePessoa(
      cliente.id,
      ESTADO_INICIAL_ACAO,
      form({ propertyId: imovel.id })
    );
    expect(resultadoInteresse.success).toBe(true);
    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, personId: cliente.id, propertyId: imovel.id },
    });
    expect(interesse.stage).toBe("INTERESTED");

    // 7) Primeira atividade — agendar uma visita para essa negociação.
    const amanha = new Date(Date.now() + 24 * 3600 * 1000);
    const dataFutura = amanha.toISOString().slice(0, 10);
    const resultadoVisita = await criarAgendamentoVisita(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      form({ scheduledAt: `${dataFutura}T10:00` })
    );
    expect(resultadoVisita.success).toBe(true);

    const interesseAtualizado = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
    });
    expect(interesseAtualizado.stage).toBe("VISIT_SCHEDULED");

    // 8) A negociação aparece no Pipeline da própria organização.
    const pipeline = await buscarPipelineAberto(cenario.organization.id, {}, "UTC");
    const idsNoPipeline = Object.values(pipeline).flat().map((item) => item.id);
    expect(idsNoPipeline).toContain(interesse.id);

    // 9) Isolamento: uma segunda organização, recém-criada e sem nenhuma
    // relação com a primeira, não vê nada disso.
    const outraOrg = await novoCenario();
    const pipelineDaOutra = await buscarPipelineAberto(outraOrg.organization.id, {}, "UTC");
    const idsNoPipelineDaOutra = Object.values(pipelineDaOutra).flat().map((item) => item.id);
    expect(idsNoPipelineDaOutra).not.toContain(interesse.id);
    expect(
      await prisma.person.count({ where: { organizationId: outraOrg.organization.id } })
    ).toBe(0);
    expect(
      await prisma.property.count({ where: { organizationId: outraOrg.organization.id } })
    ).toBe(0);
  });
});
