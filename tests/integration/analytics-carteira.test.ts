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
import { buscarAnalyticsCarteira } from "@/lib/analytics-carteira";
import { buscarAnalyticsComercial } from "@/lib/analytics-comercial";
import { escopoComercialDaSessao } from "@/lib/escopo-comercial-sessao";
import { temPapel, PAPEIS_MANUTENCAO, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";

// =======================================================================
// Fase 23 — Analytics sob a política de visibilidade
// =======================================================================
// RELÓGIO FIXO e fuso EXPLÍCITO em tudo.
//
// O que estes testes protegem não é só "o número certo": é que a métrica
// PESSOAL só existe onde há posse real, e que a ORGANIZACIONAL não é
// filtrada por membro (o que produziria número correto e significado
// falso).

const SP = "America/Sao_Paulo";
const AGORA = new Date("2026-09-15T12:00:00.000Z");
const DENTRO = new Date("2026-09-10T12:00:00.000Z");
const FORA = new Date("2026-05-10T12:00:00.000Z");

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(
  visibilidade: "COLLABORATIVE" | "RESTRICTED" = "RESTRICTED"
): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  await prisma.organization.update({
    where: { id: cenario.organization.id },
    data: { commercialVisibility: visibilidade },
  });
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

function autenticarComo(cenario: Cenario, m: { id: string; userId: string }, role = "BROKER") {
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

async function negociacao(
  cenario: Cenario,
  opcoes: {
    responsavelId?: string | null;
    stage?: "INTERESTED" | "WON" | "REJECTED";
    closedAt?: Date;
    createdAt?: Date;
    closedValue?: string | null;
    commissionValue?: string | null;
  } = {}
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
      ...(opcoes.createdAt ? { createdAt: opcoes.createdAt } : {}),
      ...(opcoes.closedAt ? { closedAt: opcoes.closedAt } : {}),
      ...(opcoes.closedValue !== undefined ? { closedValue: opcoes.closedValue } : {}),
      ...(opcoes.commissionValue !== undefined
        ? { commissionValue: opcoes.commissionValue }
        : {}),
    },
    select: { id: true },
  });
}

const carteira = (cenario: Cenario, memberId: string, periodo: "30d" | "7d" = "30d") =>
  buscarAnalyticsCarteira(cenario.organization.id, memberId, SP, { periodo, agora: AGORA });

// -----------------------------------------------------------------------
// Escopo por política e papel
// -----------------------------------------------------------------------
describe("escopo do Analytics", () => {
  test.each(["OWNER", "ADMIN", "MANAGER", "BROKER", "ASSISTANT"])(
    "COLLABORATIVE: %s recebe escopo de ORGANIZAÇÃO",
    async (role) => {
      const cenario = await novoCenario("COLLABORATIVE");
      const m = await membro(cenario, `M ${role}`, role);
      autenticarComo(cenario, m, role);
      expect((await escopoComercialDaSessao(cenario.organization.id)).tipo).toBe("ORGANIZACAO");
    }
  );

  test.each(["OWNER", "ADMIN", "MANAGER"])(
    "RESTRICTED: %s mantém escopo de ORGANIZAÇÃO",
    async (role) => {
      const cenario = await novoCenario();
      const m = await membro(cenario, `M ${role}`, role);
      autenticarComo(cenario, m, role);
      expect((await escopoComercialDaSessao(cenario.organization.id)).tipo).toBe("ORGANIZACAO");
    }
  );

  test.each(["BROKER", "ASSISTANT"])("RESTRICTED: %s vira escopo de MEMBRO", async (role) => {
    const cenario = await novoCenario();
    const m = await membro(cenario, `M ${role}`, role);
    autenticarComo(cenario, m, role);
    const escopo = await escopoComercialDaSessao(cenario.organization.id);
    expect(escopo).toEqual({ tipo: "MEMBRO", memberId: m.id });
  });
});

// -----------------------------------------------------------------------
// Negociações — posse real, mas ATUAL
// -----------------------------------------------------------------------
describe("minhas negociações", () => {
  test("conta apenas as minhas, nunca as de outro corretor", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    await negociacao(cenario, { responsavelId: ana.id, createdAt: DENTRO });
    await negociacao(cenario, { responsavelId: bruno.id, createdAt: DENTRO });
    await negociacao(cenario, { responsavelId: null, createdAt: DENTRO });

    const daAna = await carteira(cenario, ana.id);
    expect(daAna.negociacoes.criadas.atual).toBe(1);
    expect(daAna.negociacoes.emAndamento).toBe(1);
  });

  test("ganhas, perdidas e valor fechado vêm da coorte de closedAt", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: DENTRO,
      closedValue: "300000.00",
    });
    await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: DENTRO,
      closedValue: "200000.00",
    });
    await negociacao(cenario, { responsavelId: ana.id, stage: "REJECTED", closedAt: DENTRO });
    // Fechada FORA da janela não conta.
    await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: FORA,
      closedValue: "999999.00",
    });

    const dados = await carteira(cenario, ana.id);
    expect(dados.negociacoes.ganhas).toBe(2);
    expect(dados.negociacoes.perdidas).toBe(1);
    expect(dados.negociacoes.valorFechado).toBe(500000);
  });

  // Fase 9 preservada: ausência de valor não é zero.
  test("ganho sem valor registrado é declarado, nunca somado como zero", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: DENTRO,
      closedValue: "100000.00",
    });
    await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: DENTRO,
      closedValue: null,
    });

    const dados = await carteira(cenario, ana.id);
    expect(dados.negociacoes.ganhas).toBe(2);
    expect(dados.negociacoes.valorFechado).toBe(100000);
    expect(dados.negociacoes.ganhasSemValor).toBe(1);
  });

  // A limitação REAL do dado, testada em vez de escondida.
  test("transferir a negociação move o resultado histórico junto — só existe responsável ATUAL", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const interesse = await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: DENTRO,
      closedValue: "100000.00",
    });

    expect((await carteira(cenario, ana.id)).negociacoes.ganhas).toBe(1);
    expect((await carteira(cenario, bruno.id)).negociacoes.ganhas).toBe(0);

    await prisma.propertyInterest.update({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      data: { responsibleMemberId: bruno.id },
    });

    // O fechamento passa para Bruno. Não é bug: é a única verdade que o
    // banco tem, e a tela rotula como "sob sua responsabilidade".
    expect((await carteira(cenario, ana.id)).negociacoes.ganhas).toBe(0);
    expect((await carteira(cenario, bruno.id)).negociacoes.ganhas).toBe(1);
  });

  test("o período anterior usa o MESMO escopo — nunca minha carteira vs organização", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const anterior = new Date("2026-08-10T12:00:00.000Z");
    await negociacao(cenario, { responsavelId: ana.id, createdAt: anterior });
    // Duas do Bruno no período anterior: não podem inflar a comparação.
    await negociacao(cenario, { responsavelId: bruno.id, createdAt: anterior });
    await negociacao(cenario, { responsavelId: bruno.id, createdAt: anterior });
    await negociacao(cenario, { responsavelId: ana.id, createdAt: DENTRO });

    const dados = await carteira(cenario, ana.id);
    expect(dados.negociacoes.criadas.atual).toBe(1);
    expect(dados.negociacoes.criadas.anterior).toBe(1);
  });
});

// -----------------------------------------------------------------------
// Participação — dimensão DIFERENTE da de responsável
// -----------------------------------------------------------------------
describe("minha participação na comissão", () => {
  async function participacao(
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

  test("beneficiário NÃO é responsável: participo de negócio conduzido por outro", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    // Bruno conduz; Ana é beneficiária.
    const interesse = await negociacao(cenario, {
      responsavelId: bruno.id,
      stage: "WON",
      closedAt: DENTRO,
      commissionValue: "10000.00",
    });
    await participacao(cenario, interesse.id, ana.id, "4000.00");

    const daAna = await carteira(cenario, ana.id);
    // Não é negociação dela...
    expect(daAna.negociacoes.ganhas).toBe(0);
    // ... mas a participação é.
    expect(daAna.participacao.atribuido).toBe(4000);
    expect(daAna.participacao.negociacoes).toBe(1);
  });

  test("participação de outro corretor nunca aparece na minha", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const interesse = await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: DENTRO,
      commissionValue: "10000.00",
    });
    await participacao(cenario, interesse.id, ana.id, "6000.00");
    await participacao(cenario, interesse.id, bruno.id, "4000.00");

    expect((await carteira(cenario, ana.id)).participacao.atribuido).toBe(6000);
    expect((await carteira(cenario, bruno.id)).participacao.atribuido).toBe(4000);
  });

  test("participação sem valor atribuído é declarada, nunca somada como zero", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const interesse = await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: DENTRO,
      commissionValue: "10000.00",
    });
    await participacao(cenario, interesse.id, ana.id, null);

    const dados = await carteira(cenario, ana.id);
    expect(dados.participacao.atribuido).toBe(0);
    expect(dados.participacao.semValorAtribuido).toBe(1);
    expect(dados.participacao.negociacoes).toBe(1);
  });

  test("recebimentos: só os meus, no período, e cancelado fica fora", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const interesse = await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: DENTRO,
      commissionValue: "10000.00",
    });
    const daAna = await participacao(cenario, interesse.id, ana.id, "6000.00");
    const doBruno = await participacao(cenario, interesse.id, bruno.id, "4000.00");

    const pagar = (participantId: string, amount: string, extras = {}) =>
      prisma.propertyInterestParticipantPayment.create({
        data: {
          organizationId: cenario.organization.id,
          participantId,
          amount,
          paidAt: DENTRO,
          ...extras,
        },
      });
    await pagar(daAna.id, "2000.00");
    await pagar(daAna.id, "1000.00", { cancelledAt: DENTRO });
    await pagar(doBruno.id, "4000.00");

    const dados = await carteira(cenario, ana.id);
    expect(dados.participacao.recebido).toBe(2000);
    expect(dados.participacao.pagamentos).toBe(1);
  });
});

// -----------------------------------------------------------------------
// O que NÃO é individualizado
// -----------------------------------------------------------------------
describe("métricas organizacionais não são fabricadas como pessoais", () => {
  test("a carteira não expõe tráfego, origens, UTM nem top imóveis", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const dados = await carteira(cenario, ana.id);
    const chaves = Object.keys(dados);
    for (const proibida of [
      "funil",
      "origens",
      "aquisicao",
      "topImoveis",
      "serie",
      "contatos",
      "responsaveis",
      "liquidacao",
      "pessoasDistintas",
      "proprietariosAnunciando",
    ]) {
      expect(chaves).not.toContain(proibida);
    }
    expect(chaves.sort()).toEqual(["janelas", "negociacoes", "participacao", "periodo"]);
  });

  test("o Analytics ORGANIZACIONAL continua idêntico — nenhum predicado de membro entrou nele", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    await negociacao(cenario, { responsavelId: ana.id, createdAt: DENTRO });
    await negociacao(cenario, { responsavelId: bruno.id, createdAt: DENTRO });

    const organizacional = await buscarAnalyticsComercial(cenario.organization.id, SP, {
      periodo: "30d",
      agora: AGORA,
    });
    // As duas oportunidades da organização, sem filtro de membro.
    expect(organizacional.resultado.oportunidadesCriadas).toBe(2);
  });
});

// -----------------------------------------------------------------------
// Tenant, timezone e estado vazio
// -----------------------------------------------------------------------
describe("fronteiras", () => {
  test("a carteira nunca atravessa organizações", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const anaA = await membro(a, "Ana A");
    await negociacao(b, { responsavelId: b.membro.id, createdAt: DENTRO });

    const dados = await carteira(a, anaA.id);
    expect(dados.negociacoes.criadas.atual).toBe(0);
    expect(dados.negociacoes.emAndamento).toBe(0);
  });

  test("o período usa o calendário da ORGANIZAÇÃO (Fase 18 preservada)", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    // 08/09 02:00 UTC = 07/09 23:00 em São Paulo.
    const agora = new Date("2026-09-07T23:30:00.000Z");
    await negociacao(cenario, {
      responsavelId: ana.id,
      stage: "WON",
      closedAt: new Date("2026-09-08T02:00:00.000Z"),
      closedValue: "1000.00",
    });

    const emSaoPaulo = await buscarAnalyticsCarteira(cenario.organization.id, ana.id, SP, {
      periodo: "7d",
      agora,
    });
    const emUtc = await buscarAnalyticsCarteira(cenario.organization.id, ana.id, "UTC", {
      periodo: "7d",
      agora,
    });
    // Em São Paulo ainda é 07/09, dentro da janela; em UTC já é 08/09,
    // depois do fim dela.
    expect(emSaoPaulo.negociacoes.ganhas).toBe(1);
    expect(emUtc.negociacoes.ganhas).toBe(0);
  });

  test("carteira vazia devolve zeros, não erro", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const dados = await carteira(cenario, ana.id);
    expect(dados.negociacoes.criadas.atual).toBe(0);
    expect(dados.negociacoes.valorFechado).toBe(0);
    expect(dados.participacao.recebido).toBe(0);
  });

  test("membro inexistente devolve carteira vazia — falha fechada", async () => {
    const cenario = await novoCenario();
    const dados = await carteira(cenario, "__nenhum__");
    expect(dados.negociacoes.emAndamento).toBe(0);
    expect(dados.participacao.atribuido).toBe(0);
  });
});

// -----------------------------------------------------------------------
// Gates corrigidos nesta fase
// -----------------------------------------------------------------------
describe("gates de autorização centralizados", () => {
  test("manutenção mantém exatamente o trio de sempre, agora nomeado", () => {
    expect([...PAPEIS_MANUTENCAO].sort()).toEqual(["ADMIN", "MANAGER", "OWNER"]);
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      expect(temPapel(role, PAPEIS_MANUTENCAO)).toBe(true);
    }
    for (const role of ["BROKER", "ASSISTANT"]) {
      expect(temPapel(role, PAPEIS_MANUTENCAO)).toBe(false);
    }
  });

  test("configurações continua restrita a OWNER/ADMIN — MANAGER não entra", () => {
    expect([...PAPEIS_GESTAO_CONFIGURACOES].sort()).toEqual(["ADMIN", "OWNER"]);
    expect(temPapel("MANAGER", PAPEIS_GESTAO_CONFIGURACOES)).toBe(false);
  });
});
