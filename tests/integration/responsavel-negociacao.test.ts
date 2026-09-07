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
  transferirResponsavelNegociacao,
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
  corrigirDadosFechamento,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { buscarAnalyticsComercial } from "@/lib/analytics-comercial";
import { buscarPipelineAberto } from "@/lib/pipeline";
import { buscarMembrosAtribuiveis } from "@/lib/membros-organizacao";
import { SEM_RESPONSAVEL_CHAVE } from "@/lib/responsavel-negociacao";

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

// Cria um segundo membro ATIVO na mesma organização.
async function outroMembro(organizationId: string, nome: string) {
  const usuario = await criarUsuario({ name: nome });
  const membro = await criarMembro({ organizationId, userId: usuario.id, role: "BROKER" });
  return { ...membro, userId: usuario.id, nome };
}

async function oportunidadeManual(
  organizationId: string,
  personId: string,
  propertyId: string,
  campos: Record<string, string> = {}
) {
  const resultado = await criarInteressePessoa(
    personId,
    ESTADO_INICIAL_ACAO,
    form({ propertyId, ...campos })
  );
  const interesse = await prisma.propertyInterest.findFirst({
    where: { organizationId, personId, propertyId },
    select: { id: true, responsibleMemberId: true },
  });
  return { resultado, interesse };
}

const transferir = (id: string, responsavelId: string) =>
  transferirResponsavelNegociacao(id, ESTADO_INICIAL_ACAO, form({ responsavelId }));

describe("atribuição na criação", () => {
  test("oportunidade manual nasce com o membro logado como responsável", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });

    const { resultado, interesse } = await oportunidadeManual(
      c.organization.id,
      pessoa.id,
      imovel.id
    );
    expect(resultado.success).toBe(true);
    expect(interesse?.responsibleMemberId).toBe(c.membro.id);
  });

  test("o formulário pode escolher OUTRO membro ativo antes de salvar", async () => {
    const c = await novoCenario();
    const outro = await outroMembro(c.organization.id, "Bruno Corretor");
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });

    const { resultado, interesse } = await oportunidadeManual(
      c.organization.id,
      pessoa.id,
      imovel.id,
      { responsavelId: outro.id }
    );
    expect(resultado.success).toBe(true);
    expect(interesse?.responsibleMemberId).toBe(outro.id);
  });

  test("responsável em branco é escolha legítima: nasce sem responsável", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });

    const { resultado, interesse } = await oportunidadeManual(
      c.organization.id,
      pessoa.id,
      imovel.id,
      { responsavelId: "" }
    );
    expect(resultado.success).toBe(true);
    expect(interesse?.responsibleMemberId).toBeNull();
  });

  test("sessão sem vínculo de organização cria sem responsável, sem quebrar", async () => {
    const c = await novoCenario();
    autenticarComo(c, undefined);
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });

    const { resultado, interesse } = await oportunidadeManual(
      c.organization.id,
      pessoa.id,
      imovel.id
    );
    expect(resultado.success).toBe(true);
    expect(interesse?.responsibleMemberId).toBeNull();
  });

  test("oportunidade criada a partir de um CONTATO também nasce com o membro logado", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const contato = await prisma.interaction.create({
      data: {
        organizationId: c.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        type: "MESSAGE",
        origin: "IMOVEL",
        utmSource: "google",
        utmMedium: "cpc",
      },
      select: { id: true },
    });

    const resultado = await criarOportunidadeDoContato(
      contato.id,
      ESTADO_INICIAL_ACAO,
      new FormData()
    );
    expect(resultado.success).toBe(true);

    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId: c.organization.id, personId: pessoa.id },
      select: { responsibleMemberId: true, sourceInteractionId: true },
    });
    // Ownership e origem de aquisição são INDEPENDENTES: o negócio tem os
    // dois, e um não deriva do outro.
    expect(interesse.responsibleMemberId).toBe(c.membro.id);
    expect(interesse.sourceInteractionId).toBe(contato.id);
  });
});

describe("fronteira de tenant", () => {
  test("membro de OUTRA organização é recusado na criação", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);
    autenticarComo(a, a.membro.id);

    const pessoa = await criarPessoa({ organizationId: a.organization.id });
    const imovel = await criarImovel({ organizationId: a.organization.id });

    const { resultado, interesse } = await oportunidadeManual(
      a.organization.id,
      pessoa.id,
      imovel.id,
      { responsavelId: b.membro.id }
    );
    expect(resultado.success).toBe(false);
    // Mensagem genérica: não revela que o membro existe em outro tenant.
    expect(resultado.message).toContain("não encontrado nesta organização");
    // E nada foi criado.
    expect(interesse).toBeNull();
  });

  test("membro de OUTRA organização é recusado na transferência", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);
    autenticarComo(a, a.membro.id);

    const pessoa = await criarPessoa({ organizationId: a.organization.id });
    const imovel = await criarImovel({ organizationId: a.organization.id });
    const { interesse } = await oportunidadeManual(a.organization.id, pessoa.id, imovel.id);

    const resultado = await transferir(interesse!.id, b.membro.id);
    expect(resultado.success).toBe(false);

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse!.id, organizationId: a.organization.id },
      select: { responsibleMemberId: true },
    });
    // Continua com o responsável original — nunca ficou com o de outro tenant.
    expect(depois.responsibleMemberId).toBe(a.membro.id);
  });

  test("negociação de outra organização não é transferível nem visível", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);

    const pessoaB = await criarPessoa({ organizationId: b.organization.id });
    const imovelB = await criarImovel({ organizationId: b.organization.id });
    const interesseB = await prisma.propertyInterest.create({
      data: {
        organizationId: b.organization.id,
        personId: pessoaB.id,
        propertyId: imovelB.id,
        responsibleMemberId: b.membro.id,
      },
      select: { id: true },
    });

    autenticarComo(a, a.membro.id);
    const resultado = await transferir(interesseB.id, a.membro.id);
    expect(resultado.success).toBe(false);

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesseB.id, organizationId: b.organization.id },
      select: { responsibleMemberId: true },
    });
    expect(depois.responsibleMemberId).toBe(b.membro.id);
  });
});

describe("membro inativo", () => {
  test("não pode receber atribuição nova, nem na criação nem na transferência", async () => {
    const c = await novoCenario();
    const inativo = await outroMembro(c.organization.id, "Carla Inativa");
    await prisma.organizationMember.update({
      where: { id: inativo.id },
      data: { status: "SUSPENDED" },
    });

    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });

    const criacao = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id, {
      responsavelId: inativo.id,
    });
    expect(criacao.resultado.success).toBe(false);
    expect(criacao.resultado.message).toContain("inativo");

    // Agora cria normalmente e tenta transferir PARA o inativo.
    const { interesse } = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id);
    const transferencia = await transferir(interesse!.id, inativo.id);
    expect(transferencia.success).toBe(false);
    expect(transferencia.message).toContain("inativo");
  });

  test("continua sendo o responsável HISTÓRICO e não sai da lista da tela", async () => {
    const c = await novoCenario();
    const membro = await outroMembro(c.organization.id, "Dina Corretora");
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const { interesse } = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id, {
      responsavelId: membro.id,
    });

    // Só DEPOIS de assumir a negociação é que o membro é desativado.
    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { status: "SUSPENDED" },
    });

    const colunas = await buscarPipelineAberto(c.organization.id, "UTC");
    const card = colunas.INTERESTED.find((i) => i.id === interesse!.id);
    // Nome preservado + marca de inativo. NUNCA "sem responsável".
    expect(card?.responsavel?.nome).toBe("Dina Corretora");
    expect(card?.responsavel?.inativo).toBe(true);

    // E some da lista de quem pode RECEBER negociação nova.
    const atribuiveis = await buscarMembrosAtribuiveis(c.organization.id);
    expect(atribuiveis.some((m) => m.memberId === membro.id)).toBe(false);
  });
});

describe("transferência", () => {
  test("troca o responsável e registra ActivityLog com de/para", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const { interesse } = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id);

    expect((await transferir(interesse!.id, bruno.id)).success).toBe(true);

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse!.id, organizationId: c.organization.id },
      select: { responsibleMemberId: true, stage: true },
    });
    expect(depois.responsibleMemberId).toBe(bruno.id);
    // Transferir NÃO mexe no estágio.
    expect(depois.stage).toBe("INTERESTED");

    const log = await prisma.activityLog.findFirstOrThrow({
      where: {
        organizationId: c.organization.id,
        entity: "PropertyInterest",
        entityId: interesse!.id,
        action: "property_interest_reassigned",
      },
      select: { payload: true, userId: true },
    });
    expect(log.payload).toEqual({ deMemberId: c.membro.id, paraMemberId: bruno.id });
    expect(log.userId).toBe(c.usuario.id);
  });

  test("primeira atribuição de uma negociação legada registra de:null", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    // Legada: criada direto no banco, sem responsável (como todas as
    // anteriores a esta fase).
    const legada = await prisma.propertyInterest.create({
      data: {
        organizationId: c.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
      },
      select: { id: true },
    });

    expect((await transferir(legada.id, c.membro.id)).success).toBe(true);

    const log = await prisma.activityLog.findFirstOrThrow({
      where: {
        organizationId: c.organization.id,
        entityId: legada.id,
        action: "property_interest_reassigned",
      },
      select: { payload: true },
    });
    expect(log.payload).toEqual({ deMemberId: null, paraMemberId: c.membro.id });
  });

  test("pode deixar SEM responsável, e isso também é registrado", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const { interesse } = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id);

    expect((await transferir(interesse!.id, "")).success).toBe(true);
    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse!.id, organizationId: c.organization.id },
      select: { responsibleMemberId: true },
    });
    expect(depois.responsibleMemberId).toBeNull();
  });

  test("transferir para o MESMO responsável não gera log — nada mudou", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const { interesse } = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id);

    const resultado = await transferir(interesse!.id, c.membro.id);
    expect(resultado.success).toBe(true);
    const logs = await prisma.activityLog.count({
      where: {
        organizationId: c.organization.id,
        entityId: interesse!.id,
        action: "property_interest_reassigned",
      },
    });
    expect(logs).toBe(0);
  });

  test("BLOQUEADA depois de WON — o resultado do período não é reescrito", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const { interesse } = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id);

    await marcarInteresseComoGanho(
      interesse!.id,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "500000", valorComissao: "25000" })
    );

    const resultado = await transferir(interesse!.id, bruno.id);
    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain("encerrada");

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse!.id, organizationId: c.organization.id },
      select: { responsibleMemberId: true },
    });
    expect(depois.responsibleMemberId).toBe(c.membro.id);
  });

  test("BLOQUEADA depois de REJECTED, pelo mesmo motivo", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const { interesse } = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id);

    await marcarInteresseComoPerdido(interesse!.id, ESTADO_INICIAL_ACAO, new FormData());
    expect((await transferir(interesse!.id, bruno.id)).success).toBe(false);
  });

  test("corrigir valores do fechamento NÃO altera o responsável", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const { interesse } = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id);

    await marcarInteresseComoGanho(
      interesse!.id,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "500000" })
    );
    await corrigirDadosFechamento(
      interesse!.id,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "600000", valorComissao: "30000" })
    );

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse!.id, organizationId: c.organization.id },
      select: { responsibleMemberId: true, closedValue: true, commissionValue: true },
    });
    expect(depois.responsibleMemberId).toBe(c.membro.id);
    expect(Number(depois.closedValue)).toBe(600000);
    expect(Number(depois.commissionValue)).toBe(30000);
  });
});

describe("WON preserva ownership e alimenta o Analytics", () => {
  test("ganho com valor e comissão aparece na linha do responsável correto", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const { interesse } = await oportunidadeManual(c.organization.id, pessoa.id, imovel.id, {
      responsavelId: bruno.id,
    });

    await marcarInteresseComoGanho(
      interesse!.id,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "800000", valorComissao: "40000" })
    );

    const analytics = await buscarAnalyticsComercial(c.organization.id, "UTC");
    const linha = analytics.responsaveis.find((l) => l.nome === "Bruno Corretor");
    expect(linha).toBeDefined();
    expect(linha?.oportunidades).toBe(1);
    expect(linha?.ganhos).toBe(1);
    expect(linha?.perdidos).toBe(0);
    expect(linha?.valorFechado).toBe(800000);
    expect(linha?.comissao).toBe(40000);
    // 1 ganho / 1 encerrado.
    expect(linha?.taxaGanho).toBe(100);
    expect(analytics.semOwnership).toBe(false);
  });

  test("negociação legada sem responsável cai em 'Sem responsável', sem atribuição retroativa", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const legada = await prisma.propertyInterest.create({
      data: {
        organizationId: c.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "WON",
        closedAt: new Date(),
        closedValue: 300000,
      },
      select: { id: true },
    });
    expect(legada.id).toBeTruthy();

    const analytics = await buscarAnalyticsComercial(c.organization.id, "UTC");
    const semDono = analytics.responsaveis.find((l) => l.chave === SEM_RESPONSAVEL_CHAVE);
    expect(semDono?.ganhos).toBe(1);
    expect(semDono?.valorFechado).toBe(300000);
    // A comissão não foi registrada e NÃO virou R$ 0 na soma.
    expect(semDono?.comissao).toBe(0);
    expect(semDono?.ganhosSemComissao).toBe(1);
    // Nenhuma outra linha foi inventada para "adotar" este negócio.
    expect(analytics.responsaveis).toHaveLength(1);
  });

  test("organização sem nenhum ownership é declarada como tal, não como equipe improdutiva", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await prisma.propertyInterest.create({
      data: {
        organizationId: c.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
      },
    });

    const analytics = await buscarAnalyticsComercial(c.organization.id, "UTC");
    expect(analytics.semOwnership).toBe(true);
  });

  test("perdido conta como encerrado do responsável e derruba a taxa de ganho", async () => {
    const c = await novoCenario();
    const pessoa1 = await criarPessoa({ organizationId: c.organization.id });
    const pessoa2 = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    const a = await oportunidadeManual(c.organization.id, pessoa1.id, imovel.id);
    const b = await oportunidadeManual(c.organization.id, pessoa2.id, imovel.id);

    await marcarInteresseComoGanho(
      a.interesse!.id,
      ESTADO_INICIAL_ACAO,
      form({ valorFechamento: "100000" })
    );
    await marcarInteresseComoPerdido(b.interesse!.id, ESTADO_INICIAL_ACAO, new FormData());

    const analytics = await buscarAnalyticsComercial(c.organization.id, "UTC");
    const linha = analytics.responsaveis[0];
    expect(linha.ganhos).toBe(1);
    expect(linha.perdidos).toBe(1);
    expect(linha.taxaGanho).toBe(50);
  });
});

describe("filtro do pipeline", () => {
  test("filtra por membro, por 'sem responsável' e ignora id inexistente com segurança", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno Corretor");
    const pessoa1 = await criarPessoa({ organizationId: c.organization.id });
    const pessoa2 = await criarPessoa({ organizationId: c.organization.id });
    const pessoa3 = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });

    const meu = await oportunidadeManual(c.organization.id, pessoa1.id, imovel.id);
    const dele = await oportunidadeManual(c.organization.id, pessoa2.id, imovel.id, {
      responsavelId: bruno.id,
    });
    const semDono = await oportunidadeManual(c.organization.id, pessoa3.id, imovel.id, {
      responsavelId: "",
    });

    const meus = await buscarPipelineAberto(c.organization.id, "UTC", { responsavel: c.membro.id });
    expect(meus.INTERESTED.map((i) => i.id)).toEqual([meu.interesse!.id]);

    const dobruno = await buscarPipelineAberto(c.organization.id, "UTC", { responsavel: bruno.id });
    expect(dobruno.INTERESTED.map((i) => i.id)).toEqual([dele.interesse!.id]);

    const orfaos = await buscarPipelineAberto(c.organization.id, "UTC", { responsavel: "SEM" });
    expect(orfaos.INTERESTED.map((i) => i.id)).toEqual([semDono.interesse!.id]);

    const todos = await buscarPipelineAberto(c.organization.id, "UTC");
    expect(todos.INTERESTED).toHaveLength(3);

    // Id que não existe nesta organização: nenhum resultado, nunca um erro
    // e nunca a lista inteira.
    const nenhum = await buscarPipelineAberto(c.organization.id, "UTC", { responsavel: "membro-inexistente" });
    expect(nenhum.INTERESTED).toHaveLength(0);
  });

  test("id de membro de OUTRA organização não casa nada", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);
    autenticarComo(a, a.membro.id);

    const pessoa = await criarPessoa({ organizationId: a.organization.id });
    const imovel = await criarImovel({ organizationId: a.organization.id });
    await oportunidadeManual(a.organization.id, pessoa.id, imovel.id);

    const resultado = await buscarPipelineAberto(a.organization.id, "UTC", { responsavel: b.membro.id });
    expect(resultado.INTERESTED).toHaveLength(0);
  });
});

describe("membros atribuíveis", () => {
  test("lista só os ativos da PRÓPRIA organização", async () => {
    const a = await novoCenario();
    const b = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(b);

    const ativo = await outroMembro(a.organization.id, "Bruno Corretor");
    const suspenso = await outroMembro(a.organization.id, "Carla Inativa");
    await prisma.organizationMember.update({
      where: { id: suspenso.id },
      data: { status: "SUSPENDED" },
    });

    const lista = await buscarMembrosAtribuiveis(a.organization.id);
    const ids = lista.map((m) => m.memberId);
    expect(ids).toContain(a.membro.id);
    expect(ids).toContain(ativo.id);
    expect(ids).not.toContain(suspenso.id);
    expect(ids).not.toContain(b.membro.id);
  });
});
