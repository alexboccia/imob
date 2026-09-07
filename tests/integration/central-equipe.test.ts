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

import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import { buscarVisaoEquipe } from "@/lib/central-equipe";
import { buscarCentralTrabalho } from "@/lib/central-trabalho";
import { contarAgenda } from "@/lib/agenda";
import { temPapel, PAPEIS_VISAO_EQUIPE } from "@/lib/authorization";

// =======================================================================
// Visão de equipe (Fase 21) — contra o banco
// =======================================================================
// RELÓGIO FIXO em tudo: o CI pode rodar em qualquer fuso e a qualquer
// hora. O fuso de cada cenário é EXPLÍCITO — nenhum caso depende do
// fallback por acidente, exceto o que testa o fallback.

const SP = "America/Sao_Paulo";
const AGORA = new Date("2026-09-07T12:00:00.000Z");

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(timezone: string | null = "UTC"): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"], timezone });
  cenarios.push(cenario);
  return cenario;
}

async function outroMembro(cenario: Cenario, nome: string, status?: "SUSPENDED") {
  const usuario = await criarUsuario({ name: nome });
  const membro = await criarMembro({
    organizationId: cenario.organization.id,
    userId: usuario.id,
    role: "BROKER",
  });
  if (status) {
    await prisma.organizationMember.update({
      where: { id: membro.id, organizationId: cenario.organization.id },
      data: { status },
    });
  }
  return membro;
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
      ...(opcoes.stage === "WON" || opcoes.stage === "REJECTED" ? { closedAt: AGORA } : {}),
    },
    select: { id: true, personId: true, propertyId: true },
  });
}

async function compromisso(
  cenario: Cenario,
  interesse: { id: string; personId: string; propertyId: string } | null,
  quando: string,
  opcoes: {
    tipo?: "VISIT" | "FOLLOW_UP";
    status?: "SCHEDULED" | "COMPLETED" | "CANCELLED";
    assunto?: string;
    pessoaId?: string;
    imovelId?: string;
  } = {}
) {
  const organizationId = cenario.organization.id;
  const tipo = opcoes.tipo ?? "VISIT";
  return prisma.scheduledActivity.create({
    data: {
      organizationId,
      personId: interesse?.personId ?? opcoes.pessoaId!,
      propertyId: interesse?.propertyId ?? opcoes.imovelId ?? null,
      propertyInterestId: interesse?.id ?? null,
      type: tipo,
      subject: tipo === "FOLLOW_UP" ? (opcoes.assunto ?? "Enviar proposta") : null,
      status: opcoes.status ?? "SCHEDULED",
      scheduledAt: new Date(quando),
      ...(opcoes.status === "COMPLETED" ? { completedAt: AGORA } : {}),
      ...(opcoes.status === "CANCELLED" ? { cancelledAt: AGORA } : {}),
    },
    select: { id: true },
  });
}

const equipe = (cenario: Cenario, fuso = "UTC", limite?: number) =>
  buscarVisaoEquipe(cenario.organization.id, fuso, { agora: AGORA, limite });

// -----------------------------------------------------------------------
// 1-4. Autorização por papel
// -----------------------------------------------------------------------
describe("autorização", () => {
  test.each(["OWNER", "ADMIN", "MANAGER"])("%s tem autoridade comercial", (papel) => {
    expect(temPapel(papel, PAPEIS_VISAO_EQUIPE)).toBe(true);
  });

  test.each(["BROKER", "ASSISTANT"])("%s não tem", (papel) => {
    expect(temPapel(papel, PAPEIS_VISAO_EQUIPE)).toBe(false);
  });
});

// -----------------------------------------------------------------------
// 5-6. Tenant
// -----------------------------------------------------------------------
describe("isolamento entre tenants", () => {
  test("a visão de A não enxerga nada de B", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const interesseB = await negociacao(b);
    await compromisso(b, interesseB, "2026-09-01T10:00:00.000Z");
    await compromisso(b, interesseB, "2026-09-07T10:00:00.000Z");

    const visaoA = await equipe(a);
    expect(visaoA.resumo.atrasadas).toBe(0);
    expect(visaoA.resumo.hoje).toBe(0);
    expect(visaoA.resumo.negociacoesAbertas).toBe(0);
    expect(visaoA.membros).toHaveLength(0);

    // ... e a de B enxerga só o que é dela.
    const visaoB = await equipe(b);
    expect(visaoB.resumo.atrasadas).toBe(1);
    expect(visaoB.resumo.hoje).toBe(1);
  });

  test("membro de outro tenant nunca aparece na distribuição", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    await negociacao(b);

    const visaoA = await equipe(a);
    expect(visaoA.membros.map((m) => m.memberId)).not.toContain(b.membro.id);
  });
});

// -----------------------------------------------------------------------
// 7-13. Baldes temporais e status
// -----------------------------------------------------------------------
describe("classificação temporal", () => {
  test("atrasado, hoje e próximo são contados nos baldes certos", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await compromisso(cenario, interesse, "2026-09-04T10:00:00.000Z");
    await compromisso(cenario, interesse, "2026-09-07T09:00:00.000Z");
    await compromisso(cenario, interesse, "2026-09-10T10:00:00.000Z");

    const visao = await equipe(cenario);
    expect(visao.resumo.atrasadas).toBe(1);
    expect(visao.resumo.hoje).toBe(1);
    expect(visao.resumo.proximas).toBe(1);
  });

  test("horário de hoje que já passou continua em HOJE — atraso é por DIA", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    // 09:00 com agora 12:00 do mesmo dia.
    await compromisso(cenario, interesse, "2026-09-07T09:00:00.000Z");

    const visao = await equipe(cenario);
    expect(visao.resumo.hoje).toBe(1);
    expect(visao.resumo.atrasadas).toBe(0);
  });

  test("VISIT e FOLLOW_UP contam igual — a Fase 19 não é desfeita", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await compromisso(cenario, interesse, "2026-09-04T10:00:00.000Z", { tipo: "VISIT" });
    await compromisso(cenario, interesse, "2026-09-04T11:00:00.000Z", { tipo: "FOLLOW_UP" });

    const visao = await equipe(cenario);
    expect(visao.resumo.atrasadas).toBe(2);
    expect(visao.membros[0].atrasadas).toBe(2);
    expect(visao.atrasadasDaEquipe.itens.map((i) => i.tipo).sort()).toEqual([
      "FOLLOW_UP",
      "VISIT",
    ]);
  });

  test.each(["COMPLETED", "CANCELLED"] as const)("compromisso %s fica de fora", async (status) => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await compromisso(cenario, interesse, "2026-09-04T10:00:00.000Z", { status });
    await compromisso(cenario, interesse, "2026-09-07T09:00:00.000Z", { status });

    const visao = await equipe(cenario);
    expect(visao.resumo.atrasadas).toBe(0);
    expect(visao.resumo.hoje).toBe(0);
  });
});

// -----------------------------------------------------------------------
// 14-17. Negociações
// -----------------------------------------------------------------------
describe("negociações", () => {
  test("só estágios abertos entram na contagem", async () => {
    const cenario = await novoCenario();
    await negociacao(cenario, { stage: "INTERESTED" });
    await negociacao(cenario, { stage: "WON" });
    await negociacao(cenario, { stage: "REJECTED" });

    const visao = await equipe(cenario);
    expect(visao.resumo.negociacoesAbertas).toBe(1);
    expect(visao.membros[0].negociacoesAbertas).toBe(1);
  });

  test("sem responsável é um FATO contado à parte, nunca somado a alguém", async () => {
    const cenario = await novoCenario();
    await negociacao(cenario, { responsavelId: cenario.membro.id });
    await negociacao(cenario, { responsavelId: null });
    await negociacao(cenario, { responsavelId: null });

    const visao = await equipe(cenario);
    expect(visao.resumo.semResponsavel).toBe(2);
    expect(visao.resumo.negociacoesAbertas).toBe(3);

    const balde = visao.membros.find((m) => m.memberId === null)!;
    expect(balde.nome).toBe("Sem responsável");
    expect(balde.negociacoesAbertas).toBe(2);
  });

  test("negociação fechada sem responsável não conta", async () => {
    const cenario = await novoCenario();
    await negociacao(cenario, { responsavelId: null, stage: "WON" });
    const visao = await equipe(cenario);
    expect(visao.resumo.semResponsavel).toBe(0);
  });
});

// -----------------------------------------------------------------------
// 18-19. Responsável ativo e inativo
// -----------------------------------------------------------------------
describe("responsável", () => {
  test("membro suspenso mantém o nome e ganha a marca — nunca vira 'Sem responsável'", async () => {
    const cenario = await novoCenario();
    const suspenso = await outroMembro(cenario, "Ana Suspensa", "SUSPENDED");
    const interesse = await negociacao(cenario, { responsavelId: suspenso.id });
    await compromisso(cenario, interesse, "2026-09-04T10:00:00.000Z");

    const visao = await equipe(cenario);
    const linha = visao.membros.find((m) => m.memberId === suspenso.id)!;
    expect(linha.nome).toBe("Ana Suspensa");
    expect(linha.inativo).toBe(true);
    // Trabalho aberto de inativo CONTINUA visível: esconder seria pior.
    expect(linha.atrasadas).toBe(1);
    expect(linha.negociacoesAbertas).toBe(1);
    expect(visao.atrasadasDaEquipe.itens[0].responsavel).toEqual({
      nome: "Ana Suspensa",
      inativo: true,
    });
  });

  test("transferir a negociação move o trabalho de pessoa na visão", async () => {
    const cenario = await novoCenario();
    const bruno = await outroMembro(cenario, "Bruno Novo");
    const interesse = await negociacao(cenario, { responsavelId: cenario.membro.id });
    await compromisso(cenario, interesse, "2026-09-04T10:00:00.000Z");

    const antes = await equipe(cenario);
    expect(antes.membros.find((m) => m.memberId === cenario.membro.id)!.atrasadas).toBe(1);

    await prisma.propertyInterest.update({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      data: { responsibleMemberId: bruno.id },
    });

    const depois = await equipe(cenario);
    expect(depois.membros.find((m) => m.memberId === bruno.id)!.atrasadas).toBe(1);
    expect(depois.membros.find((m) => m.memberId === cenario.membro.id)).toBeUndefined();
  });

  test("ownership vem da NEGOCIAÇÃO, nunca de createdByMemberId", async () => {
    const cenario = await novoCenario();
    const criador = await outroMembro(cenario, "Bruno Criador");
    const interesse = await negociacao(cenario, { responsavelId: cenario.membro.id });
    await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: interesse.personId,
        propertyId: interesse.propertyId,
        propertyInterestId: interesse.id,
        type: "VISIT",
        status: "SCHEDULED",
        scheduledAt: new Date("2026-09-04T10:00:00.000Z"),
        createdByMemberId: criador.id,
      },
    });

    const visao = await equipe(cenario);
    expect(visao.membros.find((m) => m.memberId === cenario.membro.id)!.atrasadas).toBe(1);
    // Quem criou não recebe o trabalho.
    expect(visao.membros.find((m) => m.memberId === criador.id)).toBeUndefined();
  });

  test("compromisso sem negociação é declarado à parte, não atribuído a ninguém", async () => {
    const cenario = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await compromisso(cenario, null, "2026-09-04T10:00:00.000Z", { pessoaId: pessoa.id });

    const visao = await equipe(cenario);
    // Entra no total da organização...
    expect(visao.resumo.atrasadas).toBe(1);
    // ... é declarado...
    expect(visao.resumo.semNegociacao).toBe(1);
    // ... e não vira trabalho de ninguém.
    expect(visao.membros).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// 20. Contagem exata vs lista truncada
// -----------------------------------------------------------------------
describe("contagem e truncamento", () => {
  test("o total é count real; a lista é curta", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    for (let i = 0; i < 8; i++) {
      await compromisso(cenario, interesse, `2026-09-0${(i % 3) + 1}T1${i}:00:00.000Z`);
    }

    const visao = await equipe(cenario, "UTC", 5);
    expect(visao.resumo.atrasadas).toBe(8);
    expect(visao.atrasadasDaEquipe.total).toBe(8);
    expect(visao.atrasadasDaEquipe.itens).toHaveLength(5);
    expect(visao.membros[0].atrasadas).toBe(8);
  });

  test("a lista de atrasados vem da mais antiga para a mais recente", async () => {
    const cenario = await novoCenario();
    const interesse = await negociacao(cenario);
    await compromisso(cenario, interesse, "2026-09-03T10:00:00.000Z");
    await compromisso(cenario, interesse, "2026-09-01T10:00:00.000Z");
    await compromisso(cenario, interesse, "2026-09-02T10:00:00.000Z");

    const visao = await equipe(cenario);
    const datas = visao.atrasadasDaEquipe.itens.map((i) => i.scheduledAtISO);
    expect(datas).toEqual([...datas].sort());
  });
});

// -----------------------------------------------------------------------
// 21-22. Timezone
// -----------------------------------------------------------------------
describe("timezone da organização", () => {
  test("a borda do dia é a da organização, não a do UTC", async () => {
    const cenario = await novoCenario(SP);
    const interesse = await negociacao(cenario);
    // 07/09 23:00 em São Paulo = 08/09 02:00 UTC.
    await compromisso(cenario, interesse, "2026-09-08T02:00:00.000Z");

    const agora = new Date("2026-09-07T23:30:00.000Z"); // 20:30 em SP
    const emSaoPaulo = await buscarVisaoEquipe(cenario.organization.id, SP, { agora });
    const emUtc = await buscarVisaoEquipe(cenario.organization.id, "UTC", { agora });

    expect(emSaoPaulo.resumo.hoje).toBe(1);
    expect(emSaoPaulo.resumo.proximas).toBe(0);
    expect(emUtc.resumo.hoje).toBe(0);
    expect(emUtc.resumo.proximas).toBe(1);
  });

  test("organização sem fuso configurado usa o fallback UTC sem quebrar", async () => {
    const cenario = await novoCenario(null);
    const interesse = await negociacao(cenario);
    await compromisso(cenario, interesse, "2026-09-07T09:00:00.000Z");

    const visao = await buscarVisaoEquipe(cenario.organization.id, "UTC", { agora: AGORA });
    expect(visao.resumo.hoje).toBe(1);
  });

  test("a equipe concorda com a Agenda sobre o que é hoje e o que está atrasado", async () => {
    const cenario = await novoCenario(SP);
    const interesse = await negociacao(cenario);
    for (const quando of [
      "2026-09-05T12:00:00.000Z",
      "2026-09-07T12:00:00.000Z",
      "2026-09-08T02:00:00.000Z",
      "2026-09-20T12:00:00.000Z",
    ]) {
      await compromisso(cenario, interesse, quando);
    }

    const agora = new Date("2026-09-07T23:30:00.000Z");
    const [visao, contadores] = await Promise.all([
      buscarVisaoEquipe(cenario.organization.id, SP, { agora }),
      contarAgenda(cenario.organization.id, SP, { agora }),
    ]);
    expect(visao.resumo.hoje).toBe(contadores.hoje);
    expect(visao.resumo.atrasadas).toBe(contadores.atrasadas);
    expect(visao.resumo.proximas).toBe(contadores.proximas);
  });
});

// -----------------------------------------------------------------------
// 23-25. Consistência e não-regressão
// -----------------------------------------------------------------------
describe("consistência", () => {
  test("nenhum compromisso é contado em dois baldes", async () => {
    const cenario = await novoCenario(SP);
    const interesse = await negociacao(cenario);
    for (const quando of [
      "2026-09-01T10:00:00.000Z",
      "2026-09-07T09:00:00.000Z",
      "2026-09-07T23:00:00.000Z",
      "2026-09-10T10:00:00.000Z",
    ]) {
      await compromisso(cenario, interesse, quando);
    }

    const visao = await equipe(cenario, SP);
    expect(visao.resumo.atrasadas + visao.resumo.hoje + visao.resumo.proximas).toBe(4);
  });

  test("a soma por membro bate com o total quando todo trabalho tem dono", async () => {
    const cenario = await novoCenario();
    const bruno = await outroMembro(cenario, "Bruno Equipe");
    const meu = await negociacao(cenario, { responsavelId: cenario.membro.id });
    const dele = await negociacao(cenario, { responsavelId: bruno.id });
    await compromisso(cenario, meu, "2026-09-04T10:00:00.000Z");
    await compromisso(cenario, dele, "2026-09-04T11:00:00.000Z");
    await compromisso(cenario, dele, "2026-09-07T09:00:00.000Z");

    const visao = await equipe(cenario);
    const somaAtrasadas = visao.membros.reduce((t, m) => t + m.atrasadas, 0);
    const somaHoje = visao.membros.reduce((t, m) => t + m.hoje, 0);
    expect(somaAtrasadas).toBe(visao.resumo.atrasadas);
    expect(somaHoje).toBe(visao.resumo.hoje);
    expect(visao.resumo.semNegociacao).toBe(0);
  });

  test("ordenação alfabética, com 'Sem responsável' por último — nunca por número de atrasos", async () => {
    const cenario = await novoCenario();
    const zeca = await outroMembro(cenario, "Zeca Ultimo");
    const ana = await outroMembro(cenario, "Ana Primeira");
    await prisma.organizationMember.update({
      where: { id: cenario.membro.id, organizationId: cenario.organization.id },
      data: {},
    });
    // Zeca tem MUITO mais atraso que Ana. Se houvesse ranking, ele viria
    // primeiro; a ordem tem de continuar alfabética.
    const doZeca = await negociacao(cenario, { responsavelId: zeca.id });
    const daAna = await negociacao(cenario, { responsavelId: ana.id });
    await negociacao(cenario, { responsavelId: null });
    for (let i = 0; i < 4; i++) {
      await compromisso(cenario, doZeca, `2026-09-0${i + 1}T10:00:00.000Z`);
    }
    await compromisso(cenario, daAna, "2026-09-01T10:00:00.000Z");

    const visao = await equipe(cenario);
    const nomes = visao.membros.map((m) => m.nome);
    expect(nomes.indexOf("Ana Primeira")).toBeLessThan(nomes.indexOf("Zeca Ultimo"));
    expect(nomes[nomes.length - 1]).toBe("Sem responsável");
  });

  test("a Central PESSOAL continua respondendo o que sempre respondeu", async () => {
    const cenario = await novoCenario();
    const bruno = await outroMembro(cenario, "Bruno Outro");
    const meu = await negociacao(cenario, { responsavelId: cenario.membro.id });
    const dele = await negociacao(cenario, { responsavelId: bruno.id });
    await compromisso(cenario, meu, "2026-09-07T09:00:00.000Z");
    await compromisso(cenario, dele, "2026-09-07T10:00:00.000Z");

    const pessoal = await buscarCentralTrabalho(
      cenario.organization.id,
      cenario.membro.id,
      "UTC",
      { agora: AGORA }
    );
    // Pessoal continua PESSOAL: vê só o próprio compromisso.
    expect(pessoal.hoje.total).toBe(1);
    expect(pessoal.negociacoes.total).toBe(1);

    // ... enquanto a equipe vê os dois.
    const visao = await equipe(cenario);
    expect(visao.resumo.hoje).toBe(2);
    expect(visao.resumo.negociacoesAbertas).toBe(2);
  });
});
