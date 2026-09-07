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
  criarOportunidadeDoContato,
  atualizarEstagioInteresse,
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
} from "@/app/app/clientes/actions";
import {
  criarAgendamentoVisita,
  concluirAgendamentoVisita,
} from "@/app/app/agendamentos/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { buscarPipelineAberto, buscarPipelineEncerrado } from "@/lib/pipeline";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  autenticarComo(cenario, cenario.membro.id);
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

async function outroMembro(organizationId: string, nome: string) {
  const usuario = await criarUsuario({ name: nome });
  const membro = await criarMembro({ organizationId, userId: usuario.id, role: "BROKER" });
  return { ...membro, nome };
}

// Histórico da negociação, do mais antigo para o mais novo.
async function historico(interesseId: string, organizationId: string) {
  return prisma.propertyInterestStageHistory.findMany({
    where: { organizationId, propertyInterestId: interesseId },
    select: {
      previousStage: true,
      newStage: true,
      changedByMemberId: true,
    },
    orderBy: { changedAt: "asc" },
  });
}

async function novaOportunidade(cenario: Cenario, opcoes: { responsavelId?: string } = {}) {
  const organizationId = cenario.organization.id;
  const pessoa = await criarPessoa({ organizationId });
  const imovel = await criarImovel({ organizationId });
  await criarInteressePessoa(
    pessoa.id,
    ESTADO_INICIAL_ACAO,
    form(
      opcoes.responsavelId === undefined
        ? { propertyId: imovel.id }
        : { propertyId: imovel.id, responsavelId: opcoes.responsavelId }
    )
  );
  const interesse = await prisma.propertyInterest.findFirstOrThrow({
    where: { organizationId, personId: pessoa.id, propertyId: imovel.id },
    select: { id: true },
  });
  return { interesseId: interesse.id, personId: pessoa.id, propertyId: imovel.id };
}

const mover = (interesseId: string, stage: string) =>
  atualizarEstagioInteresse(interesseId, ESTADO_INICIAL_ACAO, form({ stage }));

describe("criação — entrada em INTERESTED", () => {
  test("criar oportunidade manual registra o ator", async () => {
    const c = await novoCenario();
    const { interesseId } = await novaOportunidade(c);

    const linhas = await historico(interesseId, c.organization.id);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      previousStage: null,
      newStage: "INTERESTED",
      changedByMemberId: c.membro.id,
    });
  });

  test("oportunidade criada a partir de um CONTATO também registra o ator", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const contato = await prisma.interaction.create({
      data: {
        organizationId,
        personId: pessoa.id,
        propertyId: imovel.id,
        type: "MESSAGE",
        origin: "IMOVEL",
      },
      select: { id: true },
    });
    await criarOportunidadeDoContato(contato.id, ESTADO_INICIAL_ACAO, new FormData());

    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId, personId: pessoa.id },
      select: { id: true },
    });
    const linhas = await historico(interesse.id, organizationId);
    expect(linhas[0].changedByMemberId).toBe(c.membro.id);
  });
});

describe("movimentação manual do funil", () => {
  test("cada transição registra o membro que a executou", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Gerente");
    const { interesseId } = await novaOportunidade(c);

    // A criação foi do owner; a movimentação seguinte é do Bruno.
    autenticarComo(c, bruno.id);
    expect((await mover(interesseId, "VISITED")).success).toBe(true);
    expect((await mover(interesseId, "PROPOSAL")).success).toBe(true);

    const linhas = await historico(interesseId, c.organization.id);
    expect(linhas.map((l) => [l.previousStage, l.newStage, l.changedByMemberId])).toEqual([
      [null, "INTERESTED", c.membro.id],
      ["INTERESTED", "VISITED", bruno.id],
      ["VISITED", "PROPOSAL", bruno.id],
    ]);
  });

  test("no-op não cria linha — nada mudou, ninguém moveu", async () => {
    const c = await novoCenario();
    const { interesseId } = await novaOportunidade(c);

    expect((await mover(interesseId, "INTERESTED")).success).toBe(true);
    expect(await historico(interesseId, c.organization.id)).toHaveLength(1);
  });
});

describe("fechamento", () => {
  test("WON registra quem fechou, e NÃO altera o responsável", async () => {
    const c = await novoCenario();
    const ana = await outroMembro(c.organization.id, "Ana Responsavel");
    const bruno = await outroMembro(c.organization.id, "Bruno Gerente");
    const { interesseId } = await novaOportunidade(c, { responsavelId: ana.id });

    // Quem fecha é o Bruno; a responsável continua sendo a Ana.
    autenticarComo(c, bruno.id);
    expect(
      (await marcarInteresseComoGanho(
        interesseId,
        ESTADO_INICIAL_ACAO,
        form({ valorFechamento: "500000" })
      )).success
    ).toBe(true);

    const linhas = await historico(interesseId, c.organization.id);
    const fechamento = linhas.at(-1)!;
    expect(fechamento.newStage).toBe("WON");
    expect(fechamento.changedByMemberId).toBe(bruno.id);

    const interesse = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesseId, organizationId: c.organization.id },
      select: { responsibleMemberId: true },
    });
    // O ponto central da fase: ator != responsável.
    expect(interesse.responsibleMemberId).toBe(ana.id);
    expect(interesse.responsibleMemberId).not.toBe(fechamento.changedByMemberId);
  });

  test("REJECTED registra quem perdeu o negócio", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Gerente");
    const { interesseId } = await novaOportunidade(c);

    autenticarComo(c, bruno.id);
    expect(
      (await marcarInteresseComoPerdido(interesseId, ESTADO_INICIAL_ACAO, new FormData())).success
    ).toBe(true);

    const linhas = await historico(interesseId, c.organization.id);
    expect(linhas.at(-1)).toMatchObject({ newStage: "REJECTED", changedByMemberId: bruno.id });
  });
});

describe("transições vindas da agenda", () => {
  test("agendar visita avança para VISIT_SCHEDULED com o ator do agendamento", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Gerente");
    const { interesseId } = await novaOportunidade(c);

    autenticarComo(c, bruno.id);
    const amanha = new Date(Date.now() + 24 * 3600 * 1000);
    const data = amanha.toISOString().slice(0, 10);
    const r = await criarAgendamentoVisita(
      interesseId,
      ESTADO_INICIAL_ACAO,
      form({ scheduledAt: `${data}T10:00` })
    );
    expect(r.success).toBe(true);

    const linhas = await historico(interesseId, c.organization.id);
    expect(linhas.at(-1)).toMatchObject({
      previousStage: "INTERESTED",
      newStage: "VISIT_SCHEDULED",
      // NÃO é transição automática: é consequência de um ato humano
      // autenticado, então tem ator.
      changedByMemberId: bruno.id,
    });
  });

  test("concluir visita avança para VISITED com o ator da conclusão", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Gerente");
    const carla = await outroMembro(c.organization.id, "Carla Corretora");
    const { interesseId } = await novaOportunidade(c);

    autenticarComo(c, bruno.id);
    const amanha = new Date(Date.now() + 24 * 3600 * 1000);
    await criarAgendamentoVisita(
      interesseId,
      ESTADO_INICIAL_ACAO,
      form({ scheduledAt: `${amanha.toISOString().slice(0, 10)}T10:00` })
    );
    const atividade = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: c.organization.id, propertyInterestId: interesseId },
      select: { id: true },
    });

    // Quem conclui é outra pessoa — e é ela que fica no histórico.
    autenticarComo(c, carla.id);
    expect(
      (await concluirAgendamentoVisita(atividade.id, ESTADO_INICIAL_ACAO, new FormData())).success
    ).toBe(true);

    const linhas = await historico(interesseId, c.organization.id);
    expect(linhas.at(-1)).toMatchObject({
      previousStage: "VISIT_SCHEDULED",
      newStage: "VISITED",
      changedByMemberId: carla.id,
    });
    // As duas transições da agenda têm atores diferentes, cada uma a sua.
    expect(linhas.at(-2)?.changedByMemberId).toBe(bruno.id);
  });
});

describe("sessão e tenant", () => {
  test("sessão sem vínculo de organização grava null — a transição NÃO é bloqueada", async () => {
    const c = await novoCenario();
    autenticarComo(c, undefined);

    const { interesseId } = await novaOportunidade(c);
    expect((await mover(interesseId, "VISITED")).success).toBe(true);

    const linhas = await historico(interesseId, c.organization.id);
    // null = "ator não registrado", e o movimento aconteceu do mesmo jeito.
    expect(linhas.every((l) => l.changedByMemberId === null)).toBe(true);
    expect(linhas.at(-1)?.newStage).toBe("VISITED");
  });

  test("membro de OUTRA organização na sessão nunca vira FK cross-tenant", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);

    // Sessão inconsistente: organização A, mas memberId da organização B.
    autenticarComo(a, b.membro.id);
    const { interesseId } = await novaOportunidade(a);
    expect((await mover(interesseId, "VISITED")).success).toBe(true);

    const linhas = await historico(interesseId, a.organization.id);
    // Redigido para null em vez de gravar o membro do outro tenant.
    expect(linhas.every((l) => l.changedByMemberId === null)).toBe(true);
    expect(linhas.some((l) => l.changedByMemberId === b.membro.id)).toBe(false);
  });
});

describe("legado e leitura", () => {
  test("histórico anterior a esta fase permanece sem ator — zero backfill", async () => {
    const c = await novoCenario();
    const { interesseId } = await novaOportunidade(c);
    // Simula o legado: linha gravada sem ator, como todas as anteriores.
    await prisma.propertyInterestStageHistory.create({
      data: {
        organizationId: c.organization.id,
        propertyInterestId: interesseId,
        previousStage: "INTERESTED",
        newStage: "VISITED",
        changedAt: new Date(),
      },
    });
    await prisma.propertyInterest.update({
      where: { id: interesseId, organizationId: c.organization.id },
      data: { stage: "VISITED" },
    });

    const colunas = await buscarPipelineAberto(c.organization.id);
    const card = colunas.VISITED.find((i) => i.id === interesseId);
    // Nada foi inferido de ActivityLog, de quem criou nem do responsável.
    expect(card?.atorUltimaTransicao).toBeNull();
  });

  test("o pipeline expõe o ator da última transição, com nome e estado", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Gerente");
    const { interesseId } = await novaOportunidade(c);

    autenticarComo(c, bruno.id);
    await mover(interesseId, "VISITED");

    let colunas = await buscarPipelineAberto(c.organization.id);
    let card = colunas.VISITED.find((i) => i.id === interesseId);
    expect(card?.atorUltimaTransicao).toMatchObject({
      memberId: bruno.id,
      nome: "Bruno Gerente",
      inativo: false,
    });

    // Suspender o membro NÃO apaga quem moveu: nome preservado + inativo.
    await prisma.organizationMember.update({
      where: { id: bruno.id },
      data: { status: "SUSPENDED" },
    });
    colunas = await buscarPipelineAberto(c.organization.id);
    card = colunas.VISITED.find((i) => i.id === interesseId);
    expect(card?.atorUltimaTransicao).toMatchObject({ nome: "Bruno Gerente", inativo: true });
  });

  test("negócio encerrado expõe o ator do fechamento na lista de encerradas", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Gerente");
    const { interesseId } = await novaOportunidade(c);

    autenticarComo(c, bruno.id);
    await marcarInteresseComoGanho(
      interesseId,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "500000" })
    );

    const { itens } = await buscarPipelineEncerrado(c.organization.id);
    const item = itens.find((i) => i.id === interesseId);
    expect(item?.atorUltimaTransicao).toMatchObject({ nome: "Bruno Gerente" });
  });
});

describe("concorrência", () => {
  test("o ator registrado é o da transição que VENCEU a corrida", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Gerente");
    const { interesseId } = await novaOportunidade(c);

    // Duas transições simultâneas a partir de INTERESTED. O guard de
    // stage (updateMany + retry) garante que ambas terminem aplicadas em
    // sequência, e cada linha do histórico precisa ter o ator da sua
    // própria transição — nunca o da outra.
    autenticarComo(c, bruno.id);
    const [a, b] = await Promise.all([
      mover(interesseId, "VISITED"),
      mover(interesseId, "PROPOSAL"),
    ]);
    expect([a, b].filter((r) => r.success).length).toBeGreaterThanOrEqual(1);

    const linhas = await historico(interesseId, c.organization.id);
    // Nenhuma linha pode ficar sem ator por causa da corrida, e nenhuma
    // pode registrar um ator que não executou aquela transição.
    for (const linha of linhas.slice(1)) {
      expect(linha.changedByMemberId).toBe(bruno.id);
    }
    // O encadeamento continua íntegro: cada previousStage é o newStage
    // anterior — a corrida não produziu histórico inconsistente.
    for (let i = 1; i < linhas.length; i++) {
      expect(linhas[i].previousStage).toBe(linhas[i - 1].newStage);
    }
  });
});
