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
  adicionarParticipante,
  atualizarParticipante,
  removerParticipante,
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
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
  autenticarComo(cenario, cenario.membro.id);
  return cenario;
}

function autenticarComo(cenario: Cenario, membroId: string | undefined) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: membroId,
      role: "OWNER",
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

// Cria um negócio GANHO com valor e comissão — o cenário em que a divisão
// faz sentido.
async function negocioGanho(
  cenario: Cenario,
  opcoes: { comissao?: string; responsavelId?: string } = {}
) {
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
  if (opcoes.comissao !== undefined) {
    await marcarInteresseComoGanho(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "800000", valorComissao: opcoes.comissao })
    );
  }
  return { interesseId: interesse.id, personId: pessoa.id, propertyId: imovel.id };
}

const adicionar = (interesseId: string, memberId: string, valor?: string) =>
  adicionarParticipante(
    interesseId,
    ESTADO_INICIAL_ACAO,
    form(valor === undefined ? { memberId } : { memberId, valorParticipacao: valor })
  );

async function participantesDe(interesseId: string, organizationId: string) {
  return prisma.propertyInterestParticipant.findMany({
    where: { organizationId, propertyInterestId: interesseId },
    select: { id: true, memberId: true, allocationValue: true },
    orderBy: { createdAt: "asc" },
  });
}

describe("inclusão de participantes", () => {
  test("adiciona participante com parcela e a divisão fica registrada", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");

    expect((await adicionar(interesseId, c.membro.id, "20000")).success).toBe(true);
    expect((await adicionar(interesseId, bruno.id, "20000")).success).toBe(true);

    const linhas = await participantesDe(interesseId, c.organization.id);
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => Number(l.allocationValue))).toEqual([20000, 20000]);
  });

  test("participar SEM parcela é permitido — quem participou pode ser conhecido antes de quanto", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });

    expect((await adicionar(interesseId, c.membro.id)).success).toBe(true);
    const [linha] = await participantesDe(interesseId, c.organization.id);
    // null = ainda não definida. Nunca 0.
    expect(linha.allocationValue).toBeNull();
  });

  test("NENHUM participante é criado automaticamente ao fechar com comissão", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    // O negócio tem responsável (o membro logado) e comissão registrada —
    // e mesmo assim a divisão nasce vazia.
    expect(await participantesDe(interesseId, c.organization.id)).toHaveLength(0);
  });

  test("sem comissão registrada: participar sim, atribuir valor não", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c);

    expect((await adicionar(interesseId, c.membro.id)).success).toBe(true);

    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");
    const comValor = await adicionar(interesseId, bruno.id, "1000");
    expect(comValor.success).toBe(false);
    expect(comValor.message).toContain("Registre a comissão");
  });

  test("participante duplicado é recusado", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });

    expect((await adicionar(interesseId, c.membro.id, "1000")).success).toBe(true);
    const segundo = await adicionar(interesseId, c.membro.id, "1000");
    expect(segundo.success).toBe(false);
    expect(segundo.message).toContain("já participa");
    expect(await participantesDe(interesseId, c.organization.id)).toHaveLength(1);
  });

  test("participante vazio é recusado", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    expect((await adicionar(interesseId, "")).success).toBe(false);
  });
});

describe("teto da comissão", () => {
  test("soma acima da comissão é bloqueada e nada é gravado", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");

    expect((await adicionar(interesseId, c.membro.id, "30000")).success).toBe(true);
    const excesso = await adicionar(interesseId, bruno.id, "15000");
    expect(excesso.success).toBe(false);
    expect(excesso.message).toContain("não pode ultrapassar");

    const linhas = await participantesDe(interesseId, c.organization.id);
    expect(linhas).toHaveLength(1);
  });

  test("distribuição completa é permitida (soma exata)", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");

    expect((await adicionar(interesseId, c.membro.id, "25000")).success).toBe(true);
    expect((await adicionar(interesseId, bruno.id, "15000")).success).toBe(true);

    const linhas = await participantesDe(interesseId, c.organization.id);
    const soma = linhas.reduce((s, l) => s + Number(l.allocationValue), 0);
    expect(soma).toBe(40000);
  });

  test("editar a própria parcela não compete consigo mesma no teto", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    expect((await adicionar(interesseId, c.membro.id, "40000")).success).toBe(true);
    const [linha] = await participantesDe(interesseId, c.organization.id);

    // Reenviar o mesmo teto para a MESMA linha precisa passar.
    const igual = await atualizarParticipante(
      linha.id,
      ESTADO_INICIAL_ACAO,
      form({ valorParticipacao: "40000" })
    );
    expect(igual.success).toBe(true);
  });

  test("CONCORRÊNCIA: duas inclusões simultâneas nunca ultrapassam a comissão", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");
    const carla = await outroMembro(c.organization.id, "Carla Corretora");

    // Cada uma cabe sozinha (25.000 <= 40.000), mas juntas somam 50.000.
    // Sem a trava por negociação, as duas leriam "0 distribuído" e
    // passariam — este é exatamente o teste da invariante entre linhas.
    const [a, b] = await Promise.all([
      adicionar(interesseId, bruno.id, "25000"),
      adicionar(interesseId, carla.id, "25000"),
    ]);

    const sucessos = [a, b].filter((r) => r.success).length;
    expect(sucessos).toBe(1);

    const linhas = await participantesDe(interesseId, c.organization.id);
    const soma = linhas.reduce((s, l) => s + Number(l.allocationValue ?? 0), 0);
    expect(soma).toBeLessThanOrEqual(40000);
  });

  test("CONCORRÊNCIA: duas edições simultâneas também respeitam o teto", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");
    // Os dois entram SEM parcela: assim cada edição isolada cabe
    // (25.000 <= 40.000) e só a soma das duas estoura. É essa a corrida
    // real — com duas parcelas já gravadas, as duas edições seriam
    // recusadas por mérito próprio e o teste não provaria nada.
    await adicionar(interesseId, c.membro.id);
    await adicionar(interesseId, bruno.id);
    const linhas = await participantesDe(interesseId, c.organization.id);

    const [a, b] = await Promise.all([
      atualizarParticipante(linhas[0].id, ESTADO_INICIAL_ACAO, form({ valorParticipacao: "25000" })),
      atualizarParticipante(linhas[1].id, ESTADO_INICIAL_ACAO, form({ valorParticipacao: "25000" })),
    ]);
    expect([a, b].filter((r) => r.success).length).toBe(1);

    const depois = await participantesDe(interesseId, c.organization.id);
    const soma = depois.reduce((s, l) => s + Number(l.allocationValue ?? 0), 0);
    expect(soma).toBeLessThanOrEqual(40000);
  });
});

describe("alteração e remoção", () => {
  test("alterar parcela grava ActivityLog com de/para", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    await adicionar(interesseId, c.membro.id, "10000");
    const [linha] = await participantesDe(interesseId, c.organization.id);

    const r = await atualizarParticipante(
      linha.id,
      ESTADO_INICIAL_ACAO,
      form({ valorParticipacao: "20000" })
    );
    expect(r.success).toBe(true);

    const log = await prisma.activityLog.findFirstOrThrow({
      where: {
        organizationId: c.organization.id,
        entityId: interesseId,
        action: "property_interest_participant_updated",
      },
      select: { payload: true, userId: true },
    });
    expect(log.payload).toEqual({
      participantId: linha.id,
      memberId: c.membro.id,
      valorDe: 10000,
      valorPara: 20000,
    });
    expect(log.userId).toBe(c.usuario.id);
  });

  test("limpar a parcela devolve o valor ao saldo não distribuído", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    await adicionar(interesseId, c.membro.id, "10000");
    const [linha] = await participantesDe(interesseId, c.organization.id);

    expect(
      (await atualizarParticipante(linha.id, ESTADO_INICIAL_ACAO, form({ valorParticipacao: "" })))
        .success
    ).toBe(true);
    const [depois] = await participantesDe(interesseId, c.organization.id);
    // null = não definida. O participante continua na divisão.
    expect(depois.allocationValue).toBeNull();
  });

  test("valor idêntico não gera log — nada mudou", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    await adicionar(interesseId, c.membro.id, "10000");
    const [linha] = await participantesDe(interesseId, c.organization.id);

    await atualizarParticipante(linha.id, ESTADO_INICIAL_ACAO, form({ valorParticipacao: "10000" }));
    const logs = await prisma.activityLog.count({
      where: {
        organizationId: c.organization.id,
        entityId: interesseId,
        action: "property_interest_participant_updated",
      },
    });
    expect(logs).toBe(0);
  });

  test("remover participante loga e NÃO redistribui a parcela", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");
    await adicionar(interesseId, c.membro.id, "10000");
    await adicionar(interesseId, bruno.id, "10000");
    const linhas = await participantesDe(interesseId, c.organization.id);

    expect(
      (await removerParticipante(linhas[0].id, ESTADO_INICIAL_ACAO, new FormData())).success
    ).toBe(true);

    const depois = await participantesDe(interesseId, c.organization.id);
    expect(depois).toHaveLength(1);
    // O que sobrou continua exatamente igual — nada foi redistribuído.
    expect(Number(depois[0].allocationValue)).toBe(10000);

    const log = await prisma.activityLog.findFirstOrThrow({
      where: {
        organizationId: c.organization.id,
        entityId: interesseId,
        action: "property_interest_participant_removed",
      },
      select: { payload: true },
    });
    expect(log.payload).toEqual({
      participantId: linhas[0].id,
      memberId: c.membro.id,
      valor: 10000,
    });
  });

  test("inclusão também é auditada", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    await adicionar(interesseId, c.membro.id, "10000");
    const log = await prisma.activityLog.findFirstOrThrow({
      where: {
        organizationId: c.organization.id,
        entityId: interesseId,
        action: "property_interest_participant_added",
      },
      select: { payload: true },
    });
    expect(log.payload).toMatchObject({ memberId: c.membro.id, valor: 10000 });
  });
});

describe("estágio da negociação", () => {
  test("negócio ABERTO aceita participantes — a divisão não depende do fechamento", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    await criarInteressePessoa(pessoa.id, ESTADO_INICIAL_ACAO, form({ propertyId: imovel.id }));
    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId, personId: pessoa.id },
      select: { id: true, stage: true },
    });
    expect(interesse.stage).toBe("INTERESTED");

    expect((await adicionar(interesse.id, c.membro.id)).success).toBe(true);
  });

  test("negócio GANHO continua editável — a comissão costuma vir depois do fechamento", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    expect((await adicionar(interesseId, c.membro.id, "10000")).success).toBe(true);
    const [linha] = await participantesDe(interesseId, c.organization.id);
    expect(
      (await atualizarParticipante(linha.id, ESTADO_INICIAL_ACAO, form({ valorParticipacao: "20000" })))
        .success
    ).toBe(true);
  });

  test("negócio PERDIDO não tem comissão, então não aceita valor", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    await criarInteressePessoa(pessoa.id, ESTADO_INICIAL_ACAO, form({ propertyId: imovel.id }));
    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId, personId: pessoa.id },
      select: { id: true },
    });
    await marcarInteresseComoPerdido(interesse.id, ESTADO_INICIAL_ACAO, new FormData());

    const r = await adicionar(interesse.id, c.membro.id, "1000");
    expect(r.success).toBe(false);
    expect(r.message).toContain("Registre a comissão");
  });
});

describe("membros", () => {
  test("membro suspenso não pode ser incluído em divisão nova", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    const inativo = await outroMembro(c.organization.id, "Carla Inativa");
    await prisma.organizationMember.update({
      where: { id: inativo.id },
      data: { status: "SUSPENDED" },
    });

    const r = await adicionar(interesseId, inativo.id, "1000");
    expect(r.success).toBe(false);
    expect(r.message).toContain("inativo");
  });

  test("membro suspenso DEPOIS de participar mantém nome e parcela", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    const membro = await outroMembro(c.organization.id, "Dina Corretora");
    await adicionar(interesseId, membro.id, "12000");
    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { status: "SUSPENDED" },
    });

    const [linha] = await participantesDe(interesseId, c.organization.id);
    // A parcela NÃO é apagada nem redistribuída.
    expect(Number(linha.allocationValue)).toBe(12000);

    const analytics = await buscarAnalyticsComercial(c.organization.id);
    const dela = analytics.participacao.participantes.find((p) => p.nome === "Dina Corretora");
    expect(dela?.inativo).toBe(true);
    expect(dela?.comissaoAtribuida).toBe(12000);
  });

  test("responsável e participante são pessoas independentes", async () => {
    const c = await novoCenario();
    const ana = await outroMembro(c.organization.id, "Ana Responsavel");
    const bruno = await outroMembro(c.organization.id, "Bruno Participante");
    const { interesseId } = await negocioGanho(c, { comissao: "40000", responsavelId: ana.id });

    // Quem recebe parcela é o Bruno; a responsável é a Ana e não entra.
    expect((await adicionar(interesseId, bruno.id, "40000")).success).toBe(true);

    const interesse = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesseId, organizationId: c.organization.id },
      select: { responsibleMemberId: true },
    });
    expect(interesse.responsibleMemberId).toBe(ana.id);

    const linhas = await participantesDe(interesseId, c.organization.id);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].memberId).toBe(bruno.id);
  });
});

describe("fronteira de tenant", () => {
  test("membro de OUTRA organização é recusado", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);
    autenticarComo(a, a.membro.id);

    const { interesseId } = await negocioGanho(a, { comissao: "40000" });
    const r = await adicionar(interesseId, b.membro.id, "1000");
    expect(r.success).toBe(false);
    expect(r.message).toContain("não encontrado nesta organização");
    expect(await participantesDe(interesseId, a.organization.id)).toHaveLength(0);
  });

  test("negociação de OUTRA organização não recebe participante", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);

    autenticarComo(b, b.membro.id);
    const alvo = await negocioGanho(b, { comissao: "40000" });

    autenticarComo(a, a.membro.id);
    const r = await adicionar(alvo.interesseId, a.membro.id, "1000");
    expect(r.success).toBe(false);
    expect(await participantesDe(alvo.interesseId, b.organization.id)).toHaveLength(0);
  });

  test("participação de outra organização não é editável nem removível", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);

    autenticarComo(b, b.membro.id);
    const alvo = await negocioGanho(b, { comissao: "40000" });
    await adicionar(alvo.interesseId, b.membro.id, "10000");
    const [linha] = await participantesDe(alvo.interesseId, b.organization.id);

    autenticarComo(a, a.membro.id);
    expect(
      (await atualizarParticipante(linha.id, ESTADO_INICIAL_ACAO, form({ valorParticipacao: "1" })))
        .success
    ).toBe(false);
    expect(
      (await removerParticipante(linha.id, ESTADO_INICIAL_ACAO, new FormData())).success
    ).toBe(false);

    const [intacta] = await participantesDe(alvo.interesseId, b.organization.id);
    expect(Number(intacta.allocationValue)).toBe(10000);
  });
});

describe("analytics da participação", () => {
  test("distribuição parcial: atribuída e não distribuída convivem", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    await adicionar(interesseId, c.membro.id, "25000");

    const analytics = await buscarAnalyticsComercial(c.organization.id);
    expect(analytics.participacao.comissaoAtribuida).toBe(25000);
    expect(analytics.participacao.comissaoNaoDistribuida).toBe(15000);
    expect(analytics.participacao.semDivisao).toBe(false);
    expect(analytics.participacao.ganhosComDivisao).toBe(1);
  });

  test("ganho com comissão e SEM participantes é declarado, não atribuído", async () => {
    const c = await novoCenario();
    await negocioGanho(c, { comissao: "40000" });

    const analytics = await buscarAnalyticsComercial(c.organization.id);
    expect(analytics.participacao.comissaoAtribuida).toBe(0);
    expect(analytics.participacao.comissaoNaoDistribuida).toBe(40000);
    expect(analytics.participacao.ganhosComComissaoSemDivisao).toBe(1);
    expect(analytics.participacao.participantes).toHaveLength(0);
    expect(analytics.participacao.semDivisao).toBe(true);
  });

  test("ganho SEM comissão não gera saldo — ausência não é R$ 0", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    await prisma.propertyInterest.create({
      data: {
        organizationId,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "WON",
        closedAt: new Date(),
        closedValue: 500000,
        commissionValue: null,
      },
    });

    const analytics = await buscarAnalyticsComercial(organizationId);
    expect(analytics.participacao.comissaoNaoDistribuida).toBe(0);
    expect(analytics.participacao.ganhosComComissaoSemDivisao).toBe(0);
  });

  test("performance por responsável (Fase 11) continua intacta ao lado da participação", async () => {
    const c = await novoCenario();
    const ana = await outroMembro(c.organization.id, "Ana Responsavel");
    const bruno = await outroMembro(c.organization.id, "Bruno Participante");
    const { interesseId } = await negocioGanho(c, { comissao: "40000", responsavelId: ana.id });
    await adicionar(interesseId, bruno.id, "40000");

    const analytics = await buscarAnalyticsComercial(c.organization.id);
    // Dimensões diferentes, números diferentes, ambas corretas.
    const responsavel = analytics.responsaveis.find((l) => l.nome === "Ana Responsavel");
    expect(responsavel?.ganhos).toBe(1);
    expect(responsavel?.comissao).toBe(40000);

    const participante = analytics.participacao.participantes.find(
      (p) => p.nome === "Bruno Participante"
    );
    expect(participante?.comissaoAtribuida).toBe(40000);
    expect(analytics.participacao.participantes.some((p) => p.nome === "Ana Responsavel")).toBe(
      false
    );
  });

  test("oportunidade criada a partir de um CONTATO também aceita divisão", async () => {
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
    await marcarInteresseComoGanho(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "800000", valorComissao: "40000" })
    );

    expect((await adicionar(interesse.id, c.membro.id, "40000")).success).toBe(true);
    const analytics = await buscarAnalyticsComercial(organizationId);
    expect(analytics.participacao.comissaoAtribuida).toBe(40000);
  });

  test("participante sem parcela conta o negócio mas não vira R$ 0", async () => {
    const c = await novoCenario();
    const { interesseId } = await negocioGanho(c, { comissao: "40000" });
    await adicionar(interesseId, c.membro.id);

    const analytics = await buscarAnalyticsComercial(c.organization.id);
    const linha = analytics.participacao.participantes[0];
    expect(linha.negocios).toBe(1);
    expect(linha.comissaoAtribuida).toBe(0);
    expect(linha.semParcela).toBe(1);
    // Nada foi atribuído, então o total inteiro segue não distribuído.
    expect(analytics.participacao.comissaoNaoDistribuida).toBe(40000);
  });
});
