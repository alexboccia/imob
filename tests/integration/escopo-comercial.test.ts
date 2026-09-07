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
import { escopoComercialDaSessao } from "@/lib/escopo-comercial-sessao";
import { wherePessoa, whereNegociacao, whereAtividade } from "@/lib/escopo-comercial";
import { buscarVisibilidadeComercial } from "@/lib/visibilidade-comercial";
import {
  atualizarEstagioFunil,
  atualizarEstagioInteresse,
  transferirResponsavelNegociacao,
  buscarResumoClienteCrm,
  registrarInteracao,
} from "@/app/app/clientes/actions";
import { criarAgendamentoVisita, criarFollowUp } from "@/app/app/agendamentos/actions";
import { buscarAgendaHoje, contarAgenda } from "@/lib/agenda";
import { buscarPipelineAberto } from "@/lib/pipeline";

// =======================================================================
// Fase 22 — política de visibilidade comercial, contra o banco
// =======================================================================
// TENANT é a primeira fronteira e continua provado nos testes das fases
// anteriores. Aqui prova-se a SEGUNDA: dentro do mesmo tenant, quem
// alcança o quê — em LEITURA e em ESCRITA.

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

function autenticarComo(
  cenario: Cenario,
  m: { id: string; userId: string },
  role = "BROKER"
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

async function negociacao(
  cenario: Cenario,
  opcoes: { responsavelId?: string | null; pessoaId?: string; nome?: string } = {}
) {
  const organizationId = cenario.organization.id;
  const pessoaId =
    opcoes.pessoaId ?? (await criarPessoa({ organizationId, name: opcoes.nome })).id;
  const imovel = await criarImovel({ organizationId, status: "AVAILABLE" });
  const interesse = await prisma.propertyInterest.create({
    data: {
      organizationId,
      personId: pessoaId,
      propertyId: imovel.id,
      stage: "INTERESTED",
      responsibleMemberId: opcoes.responsavelId === undefined ? null : opcoes.responsavelId,
    },
    select: { id: true, personId: true, propertyId: true },
  });
  return interesse;
}

const fd = (campos: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

// -----------------------------------------------------------------------
// Política e compatibilidade
// -----------------------------------------------------------------------
describe("política", () => {
  test("organização nova nasce COLLABORATIVE — nenhum tenant perde acesso no deploy", async () => {
    const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(cenario);
    expect(await buscarVisibilidadeComercial(cenario.organization.id)).toBe("COLLABORATIVE");
  });

  test("organização inexistente falha FECHADA (RESTRICTED), nunca abrindo acesso", async () => {
    expect(await buscarVisibilidadeComercial("org-que-nao-existe")).toBe("RESTRICTED");
  });

  test("trocar a política não reescreve nenhum ownership", async () => {
    const cenario = await novoCenario("COLLABORATIVE");
    const ana = await membro(cenario, "Ana");
    const comDono = await negociacao(cenario, { responsavelId: ana.id });
    const semDono = await negociacao(cenario, { responsavelId: null });

    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { commercialVisibility: "RESTRICTED" },
    });

    const linhas = await prisma.propertyInterest.findMany({
      where: { organizationId: cenario.organization.id, id: { in: [comDono.id, semDono.id] } },
      select: { id: true, responsibleMemberId: true },
    });
    expect(linhas.find((l) => l.id === comDono.id)!.responsibleMemberId).toBe(ana.id);
    expect(linhas.find((l) => l.id === semDono.id)!.responsibleMemberId).toBeNull();
  });
});

// -----------------------------------------------------------------------
// Leitura — negociações
// -----------------------------------------------------------------------
describe("leitura de negociações", () => {
  test("COLLABORATIVE: corretor vê a negociação de outro (comportamento histórico)", async () => {
    const cenario = await novoCenario("COLLABORATIVE");
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    await negociacao(cenario, { responsavelId: bruno.id });

    autenticarComo(cenario, ana);
    const escopo = await escopoComercialDaSessao(cenario.organization.id);
    const colunas = await buscarPipelineAberto(
      cenario.organization.id,
      whereNegociacao(escopo),
      "UTC"
    );
    expect(colunas.INTERESTED).toHaveLength(1);
  });

  test("RESTRICTED: corretor vê a própria e NÃO a de outro", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    await negociacao(cenario, { responsavelId: ana.id, nome: "Cliente da Ana" });
    await negociacao(cenario, { responsavelId: bruno.id, nome: "Cliente do Bruno" });

    autenticarComo(cenario, ana);
    const escopo = await escopoComercialDaSessao(cenario.organization.id);
    const colunas = await buscarPipelineAberto(
      cenario.organization.id,
      whereNegociacao(escopo),
      "UTC"
    );
    expect(colunas.INTERESTED).toHaveLength(1);
    expect(colunas.INTERESTED[0].person?.name).toBe("Cliente da Ana");
  });

  test("RESTRICTED: negociação SEM RESPONSÁVEL não aparece para o corretor", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    await negociacao(cenario, { responsavelId: null });

    autenticarComo(cenario, ana);
    const escopo = await escopoComercialDaSessao(cenario.organization.id);
    const colunas = await buscarPipelineAberto(
      cenario.organization.id,
      whereNegociacao(escopo),
      "UTC"
    );
    expect(colunas.INTERESTED).toHaveLength(0);
  });

  test.each(["OWNER", "ADMIN", "MANAGER"])(
    "RESTRICTED: %s continua vendo a organização inteira, inclusive sem responsável",
    async (role) => {
      const cenario = await novoCenario();
      const gestor = await membro(cenario, `Gestor ${role}`, role);
      const bruno = await membro(cenario, "Bruno");
      await negociacao(cenario, { responsavelId: bruno.id });
      await negociacao(cenario, { responsavelId: null });

      autenticarComo(cenario, gestor, role);
      const escopo = await escopoComercialDaSessao(cenario.organization.id);
      const colunas = await buscarPipelineAberto(
        cenario.organization.id,
        whereNegociacao(escopo),
        "UTC"
      );
      expect(colunas.INTERESTED).toHaveLength(2);
    }
  );

  test("RESTRICTED: o filtro ?responsavel de outro membro NÃO expande o escopo", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    await negociacao(cenario, { responsavelId: bruno.id });

    autenticarComo(cenario, ana);
    const escopo = await escopoComercialDaSessao(cenario.organization.id);
    // Ana tenta filtrar pelo id do Bruno: o AND intersecta, não expande.
    const colunas = await buscarPipelineAberto(
      cenario.organization.id,
      whereNegociacao(escopo),
      "UTC",
      { responsavel: bruno.id }
    );
    expect(colunas.INTERESTED).toHaveLength(0);
  });

  test("RESTRICTED: ?responsavel=SEM não revela a fila gerencial", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    await negociacao(cenario, { responsavelId: null });

    autenticarComo(cenario, ana);
    const escopo = await escopoComercialDaSessao(cenario.organization.id);
    const colunas = await buscarPipelineAberto(
      cenario.organization.id,
      whereNegociacao(escopo),
      "UTC",
      { responsavel: "SEM" }
    );
    expect(colunas.INTERESTED).toHaveLength(0);
  });

  test("RESTRICTED: transferir move o acesso — Ana perde, Bruno ganha", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const interesse = await negociacao(cenario, { responsavelId: ana.id });

    const veAgora = async (m: { id: string; userId: string }) => {
      autenticarComo(cenario, m);
      const escopo = await escopoComercialDaSessao(cenario.organization.id);
      const colunas = await buscarPipelineAberto(
        cenario.organization.id,
        whereNegociacao(escopo),
        "UTC"
      );
      return colunas.INTERESTED.length;
    };

    expect(await veAgora(ana)).toBe(1);
    expect(await veAgora(bruno)).toBe(0);

    await prisma.propertyInterest.update({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      data: { responsibleMemberId: bruno.id },
    });

    expect(await veAgora(ana)).toBe(0);
    expect(await veAgora(bruno)).toBe(1);
  });
});

// -----------------------------------------------------------------------
// Leitura — pessoas e PII
// -----------------------------------------------------------------------
describe("leitura de pessoas e PII", () => {
  const pessoasVisiveis = async (cenario: Cenario) => {
    const escopo = await escopoComercialDaSessao(cenario.organization.id);
    return prisma.person.findMany({
      where: { ...wherePessoa(escopo), organizationId: cenario.organization.id },
      select: { id: true, name: true },
    });
  };

  test("RESTRICTED: cliente de outro corretor não aparece na listagem", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    await negociacao(cenario, { responsavelId: ana.id, nome: "Cliente da Ana" });
    await negociacao(cenario, { responsavelId: bruno.id, nome: "Cliente do Bruno" });

    autenticarComo(cenario, ana);
    const nomes = (await pessoasVisiveis(cenario)).map((p) => p.name);
    expect(nomes).toContain("Cliente da Ana");
    expect(nomes).not.toContain("Cliente do Bruno");
  });

  test("RESTRICTED: lead público (sem negociação e sem assignedMemberId) não vaza", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    await criarPessoa({ organizationId: cenario.organization.id, name: "Lead Publico" });

    autenticarComo(cenario, ana);
    const nomes = (await pessoasVisiveis(cenario)).map((p) => p.name);
    expect(nomes).not.toContain("Lead Publico");
  });

  // A ponte estreita: quem cadastrou uma pessoa que ainda não tem
  // negociação continua vendo o próprio registro.
  test("RESTRICTED: o registro que eu criei e ainda não tem negociação continua visível", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    await prisma.person.create({
      data: {
        organizationId: cenario.organization.id,
        name: "Cadastrado pela Ana",
        assignedMemberId: ana.id,
      },
    });

    autenticarComo(cenario, ana);
    expect((await pessoasVisiveis(cenario)).map((p) => p.name)).toContain("Cadastrado pela Ana");
  });

  // ... mas autoria sozinha não é posse: quando a pessoa passa a ter
  // negociação de outro, quem a criou deixa de alcançá-la.
  test("RESTRICTED: assignedMemberId não sustenta acesso depois que a pessoa ganha negociação de outro", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const pessoa = await prisma.person.create({
      data: {
        organizationId: cenario.organization.id,
        name: "Criado pela Ana",
        assignedMemberId: ana.id,
      },
      select: { id: true },
    });
    await negociacao(cenario, { responsavelId: bruno.id, pessoaId: pessoa.id });

    autenticarComo(cenario, ana);
    expect((await pessoasVisiveis(cenario)).map((p) => p.name)).not.toContain("Criado pela Ana");
  });

  // Cenário obrigatório do enunciado.
  test("CLIENTE COMPARTILHADO: PII visível para os dois; negociações separadas", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const joao = await criarPessoa({ organizationId: cenario.organization.id, name: "Joao" });
    const daAna = await negociacao(cenario, { responsavelId: ana.id, pessoaId: joao.id });
    const doBruno = await negociacao(cenario, { responsavelId: bruno.id, pessoaId: joao.id });

    for (const [quem, meu, alheio] of [
      [ana, daAna, doBruno],
      [bruno, doBruno, daAna],
    ] as const) {
      autenticarComo(cenario, quem);
      const escopo = await escopoComercialDaSessao(cenario.organization.id);

      // A PESSOA é visível para os dois — o telefone dela não pode
      // existir em duas versões.
      const pessoas = await pessoasVisiveis(cenario);
      expect(pessoas.map((p) => p.name)).toContain("Joao");

      // As NEGOCIAÇÕES ficam separadas.
      const interesses = await prisma.propertyInterest.findMany({
        where: {
          ...whereNegociacao(escopo),
          organizationId: cenario.organization.id,
          personId: joao.id,
        },
        select: { id: true },
      });
      expect(interesses.map((i) => i.id)).toEqual([meu.id]);
      expect(interesses.map((i) => i.id)).not.toContain(alheio.id);
    }
  });

  test("RESTRICTED: buscarResumoClienteCrm (PII por id) recusa cliente fora do escopo", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const interesseDoBruno = await negociacao(cenario, {
      responsavelId: bruno.id,
      nome: "Cliente do Bruno",
    });

    autenticarComo(cenario, ana);
    // Ana chama a action diretamente com o id — o caminho que a listagem
    // filtrada não protegeria sozinha.
    expect(await buscarResumoClienteCrm(interesseDoBruno.personId)).toBeNull();

    autenticarComo(cenario, bruno);
    expect(await buscarResumoClienteCrm(interesseDoBruno.personId)).not.toBeNull();
  });
});

// -----------------------------------------------------------------------
// Leitura — agenda
// -----------------------------------------------------------------------
describe("leitura de compromissos", () => {
  const AGORA = new Date("2026-09-07T12:00:00.000Z");

  async function compromisso(
    cenario: Cenario,
    interesse: { id: string; personId: string; propertyId: string } | null,
    tipo: "VISIT" | "FOLLOW_UP",
    pessoaId?: string
  ) {
    return prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: interesse?.personId ?? pessoaId!,
        propertyId: interesse?.propertyId ?? null,
        propertyInterestId: interesse?.id ?? null,
        type: tipo,
        subject: tipo === "FOLLOW_UP" ? "Enviar proposta" : null,
        status: "SCHEDULED",
        scheduledAt: new Date("2026-09-07T09:00:00.000Z"),
      },
      select: { id: true },
    });
  }

  test.each(["VISIT", "FOLLOW_UP"] as const)(
    "RESTRICTED: %s de outro corretor não aparece na Agenda nem nos contadores",
    async (tipo) => {
      const cenario = await novoCenario();
      const ana = await membro(cenario, "Ana");
      const bruno = await membro(cenario, "Bruno");
      const daAna = await negociacao(cenario, { responsavelId: ana.id });
      const doBruno = await negociacao(cenario, { responsavelId: bruno.id });
      await compromisso(cenario, daAna, tipo);
      await compromisso(cenario, doBruno, tipo);

      autenticarComo(cenario, ana);
      const escopo = whereAtividade(await escopoComercialDaSessao(cenario.organization.id));
      const [hoje, contadores] = await Promise.all([
        buscarAgendaHoje(cenario.organization.id, "UTC", escopo, { agora: AGORA }),
        contarAgenda(cenario.organization.id, "UTC", escopo, { agora: AGORA }),
      ]);
      expect(hoje).toHaveLength(1);
      // O contador também é escopado: volume alheio é vazamento.
      expect(contadores.hoje).toBe(1);
    }
  );

  test("RESTRICTED: compromisso SEM negociação fica fora do escopo do membro", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await compromisso(cenario, null, "VISIT", pessoa.id);

    autenticarComo(cenario, ana);
    const escopo = whereAtividade(await escopoComercialDaSessao(cenario.organization.id));
    const hoje = await buscarAgendaHoje(cenario.organization.id, "UTC", escopo, { agora: AGORA });
    expect(hoje).toHaveLength(0);

    // ... e a camada gerencial continua enxergando.
    const gestor = await membro(cenario, "Gestora", "MANAGER");
    autenticarComo(cenario, gestor, "MANAGER");
    const escopoGestor = whereAtividade(await escopoComercialDaSessao(cenario.organization.id));
    expect(
      await buscarAgendaHoje(cenario.organization.id, "UTC", escopoGestor, { agora: AGORA })
    ).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------
// ESCRITAS — IDOR
// -----------------------------------------------------------------------
describe("escritas fora do escopo (IDOR)", () => {
  test("RESTRICTED: mover o stage da negociação de outro não altera nada", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const doBruno = await negociacao(cenario, { responsavelId: bruno.id });

    autenticarComo(cenario, ana);
    const estado = await atualizarEstagioInteresse(
      doBruno.id,
      { success: false, message: "" },
      fd({ stage: "PROPOSAL" })
    );
    expect(estado.success).toBe(false);

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: doBruno.id, organizationId: cenario.organization.id },
      select: { stage: true },
    });
    expect(depois.stage).toBe("INTERESTED");
  });

  test("RESTRICTED: transferir a negociação de outro para si mesmo é recusado", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const doBruno = await negociacao(cenario, { responsavelId: bruno.id });

    autenticarComo(cenario, ana);
    const estado = await transferirResponsavelNegociacao(
      doBruno.id,
      { success: false, message: "" },
      fd({ responsavelId: ana.id })
    );
    expect(estado.success).toBe(false);

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: doBruno.id, organizationId: cenario.organization.id },
      select: { responsibleMemberId: true },
    });
    expect(depois.responsibleMemberId).toBe(bruno.id);
  });

  test("RESTRICTED: alterar o estágio de funil de cliente fora do escopo não escreve", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const doBruno = await negociacao(cenario, { responsavelId: bruno.id });

    autenticarComo(cenario, ana);
    await atualizarEstagioFunil(doBruno.personId, fd({ estagioFunil: "CONTACTED" }));

    const depois = await prisma.person.findUniqueOrThrow({
      where: { id: doBruno.personId, organizationId: cenario.organization.id },
      select: { pipelineStage: true },
    });
    expect(depois.pipelineStage).not.toBe("CONTACTED");
  });

  test("RESTRICTED: registrar interação em cliente fora do escopo não cria nada", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const doBruno = await negociacao(cenario, { responsavelId: bruno.id });

    autenticarComo(cenario, ana);
    await registrarInteracao(doBruno.personId, fd({ tipo: "CALL", notas: "invasao" }));

    expect(
      await prisma.interaction.count({ where: { organizationId: cenario.organization.id } })
    ).toBe(0);
  });

  test.each([
    ["visita", criarAgendamentoVisita],
    ["follow-up", criarFollowUp],
  ] as const)(
    "RESTRICTED: criar %s em negociação de outro é recusado",
    async (_rotulo, action) => {
      const cenario = await novoCenario();
      const ana = await membro(cenario, "Ana");
      const bruno = await membro(cenario, "Bruno");
      const doBruno = await negociacao(cenario, { responsavelId: bruno.id });

      autenticarComo(cenario, ana);
      const amanha = new Date(Date.now() + 26 * 3_600_000).toISOString().slice(0, 16);
      const estado = await action(
        doBruno.id,
        { success: false, message: "" },
        fd({ scheduledAt: amanha, subject: "Enviar proposta", notes: "" })
      );
      expect(estado.success).toBe(false);
      expect(
        await prisma.scheduledActivity.count({
          where: { organizationId: cenario.organization.id },
        })
      ).toBe(0);
    }
  );

  test("COLLABORATIVE: as mesmas escritas continuam permitidas (nada regride)", async () => {
    const cenario = await novoCenario("COLLABORATIVE");
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const doBruno = await negociacao(cenario, { responsavelId: bruno.id });

    autenticarComo(cenario, ana);
    const estado = await atualizarEstagioInteresse(
      doBruno.id,
      { success: false, message: "" },
      fd({ stage: "PROPOSAL" })
    );
    expect(estado.success).toBe(true);
  });

  test("RESTRICTED: gestor continua escrevendo em qualquer negociação", async () => {
    const cenario = await novoCenario();
    const gestor = await membro(cenario, "Gestora", "MANAGER");
    const bruno = await membro(cenario, "Bruno");
    const doBruno = await negociacao(cenario, { responsavelId: bruno.id });

    autenticarComo(cenario, gestor, "MANAGER");
    const estado = await atualizarEstagioInteresse(
      doBruno.id,
      { success: false, message: "" },
      fd({ stage: "PROPOSAL" })
    );
    expect(estado.success).toBe(true);
  });
});

// -----------------------------------------------------------------------
// Tenant continua sendo a primeira fronteira
// -----------------------------------------------------------------------
describe("tenant", () => {
  test("COLLABORATIVE não afrouxa o isolamento entre organizações", async () => {
    const a = await novoCenario("COLLABORATIVE");
    const b = await novoCenario("COLLABORATIVE");
    const anaA = await membro(a, "Ana A");
    await negociacao(b, { responsavelId: null, nome: "Cliente de B" });

    autenticarComo(a, anaA);
    const escopo = await escopoComercialDaSessao(a.organization.id);
    const colunas = await buscarPipelineAberto(a.organization.id, whereNegociacao(escopo), "UTC");
    expect(colunas.INTERESTED).toHaveLength(0);
  });
});
