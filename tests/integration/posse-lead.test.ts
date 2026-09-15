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
import { assumirContato, atribuirContato } from "@/app/app/clientes/actions";
import { wherePessoa, whereNegociacao } from "@/lib/escopo-comercial";

// =======================================================================
// Posse do lead (Fase 36) — contra o banco
// =======================================================================
// A pergunta que estes testes respondem não é "a coluna grava". É se a
// posse permanece SEPARADA de tudo o que ela não é: atendimento,
// negociação, compromisso, autoria e visibilidade. E se, no caminho,
// ninguém rouba o lead de ninguém nem enxerga o que não é seu.

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
  return { ...m, userId: usuario.id, role };
}

// A sessão é SEMPRE a do servidor. Nenhuma action desta fase aceita
// memberId, organizationId ou role vindos do cliente.
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

const assumir = (personId: string) =>
  assumirContato(personId, { success: false }, new FormData());

function atribuir(personId: string, responsavelId: string) {
  const form = new FormData();
  form.set("responsavelId", responsavelId);
  return atribuirContato(personId, { success: false }, form);
}

const posseDe = async (cenario: Cenario, personId: string) =>
  (
    await prisma.person.findFirstOrThrow({
      where: { id: personId, organizationId: cenario.organization.id },
      select: { responsibleMemberId: true },
    })
  ).responsibleMemberId;

const lead = (cenario: Cenario, nome: string) =>
  criarPessoa({ organizationId: cenario.organization.id, name: nome });

// -----------------------------------------------------------------------
// Assumir
// -----------------------------------------------------------------------
describe("assumir", () => {
  test("um lead sem dono ganha dono, e quem assume é a sessão", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, ana);

    const pessoa = await lead(cenario, "Lead Sem Dono");
    const r = await assumir(pessoa.id);

    expect(r.success).toBe(true);
    expect(await posseDe(cenario, pessoa.id)).toBe(ana.id);
  });

  test("ASSUMIR NUNCA ROUBA: o segundo membro recebe recusa, o primeiro continua dono", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");

    const pessoa = await lead(cenario, "Disputado");

    autenticarComo(cenario, ana);
    expect((await assumir(pessoa.id)).success).toBe(true);

    autenticarComo(cenario, bruno);
    const segundo = await assumir(pessoa.id);
    expect(segundo.success).toBe(false);
    expect(segundo.message).toContain("já foi assumido");

    expect(await posseDe(cenario, pessoa.id)).toBe(ana.id);
  });

  test("assumir de novo o que já é meu não é erro, e não muda nada", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, ana);
    const pessoa = await lead(cenario, "Meu");

    await assumir(pessoa.id);
    const r = await assumir(pessoa.id);
    expect(r.success).toBe(true);
    expect(r.message).toContain("já é o responsável");
    expect(await posseDe(cenario, pessoa.id)).toBe(ana.id);
  });

  // O ponto da fase: o lead que não tem imóvel nenhum também tem dono.
  test("contato SEM IMÓVEL pode ser assumido — sem inventar negociação", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, ana);
    const pessoa = await lead(cenario, "Contato Generico");

    expect((await assumir(pessoa.id)).success).toBe(true);
    expect(await posseDe(cenario, pessoa.id)).toBe(ana.id);
    expect(
      await prisma.propertyInterest.count({
        where: { organizationId: cenario.organization.id, personId: pessoa.id },
      })
    ).toBe(0);
  });
});

// -----------------------------------------------------------------------
// Concorrência real
// -----------------------------------------------------------------------
describe("concorrência", () => {
  test("dois brokers assumindo ao mesmo tempo: um vence, o outro é informado", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const pessoa = await lead(cenario, "Corrida");

    // A action lê a sessão no início, então as duas tentativas precisam
    // de sessões distintas resolvidas em paralelo. `mockImplementation`
    // alterna por chamada — é o que permite disparar as duas de verdade.
    let chamada = 0;
    vi.mocked(auth).mockImplementation((async () => {
      const quem = chamada++ % 2 === 0 ? ana : bruno;
      return {
        user: {
          id: quem.userId,
          organizationId: cenario.organization.id,
          organizationMemberId: quem.id,
          role: "BROKER",
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const [a, b] = await Promise.all([assumir(pessoa.id), assumir(pessoa.id)]);

    // Exatamente um sucesso — nunca dois, nunca zero.
    expect([a.success, b.success].filter(Boolean)).toHaveLength(1);
    const dono = await posseDe(cenario, pessoa.id);
    expect([ana.id, bruno.id]).toContain(dono);
    const perdedor = a.success ? b : a;
    expect(perdedor.message).toContain("já foi assumido");
  });

  test("corrida assumir vs atribuir: o estado final é único e de um dos dois", async () => {
    const cenario = await novoCenario();
    const gestora = await membro(cenario, "Gestora", "MANAGER");
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const pessoa = await lead(cenario, "Disputa Gestor");

    let chamada = 0;
    vi.mocked(auth).mockImplementation((async () => {
      const par = chamada++ % 2 === 0;
      const quem = par ? ana : gestora;
      return {
        user: {
          id: quem.userId,
          organizationId: cenario.organization.id,
          organizationMemberId: quem.id,
          role: par ? "BROKER" : "MANAGER",
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    await Promise.all([assumir(pessoa.id), atribuir(pessoa.id, bruno.id)]);

    // Nada de meio-termo: o dono final é o de uma das duas operações, e
    // nenhuma delas deixou a linha num estado que ninguém pediu.
    const dono = await posseDe(cenario, pessoa.id);
    expect([ana.id, bruno.id]).toContain(dono);
  });
});

// -----------------------------------------------------------------------
// Atribuir e transferir
// -----------------------------------------------------------------------
describe("atribuir", () => {
  test.each(["OWNER", "ADMIN", "MANAGER"])(
    "%s atribui um lead sem dono a um corretor",
    async (papel) => {
      const cenario = await novoCenario();
      const gestor = await membro(cenario, "Gestor", papel);
      const ana = await membro(cenario, "Ana");
      autenticarComo(cenario, gestor, papel);

      const pessoa = await lead(cenario, "Para Distribuir");
      expect((await atribuir(pessoa.id, ana.id)).success).toBe(true);
      expect(await posseDe(cenario, pessoa.id)).toBe(ana.id);
    }
  );

  test.each(["BROKER", "ASSISTANT"])("%s NÃO pode atribuir para outro", async (papel) => {
    const cenario = await novoCenario();
    const quem = await membro(cenario, "Quem", papel);
    const outro = await membro(cenario, "Outro");
    autenticarComo(cenario, quem, papel);

    const pessoa = await lead(cenario, "Alheio");
    const r = await atribuir(pessoa.id, outro.id);
    expect(r.success).toBe(false);
    expect(r.message).toContain("permissão");
    expect(await posseDe(cenario, pessoa.id)).toBeNull();
  });

  test("TRANSFERÊNCIA: atribuição gerencial pode sobrescrever um dono existente", async () => {
    const cenario = await novoCenario();
    const gestora = await membro(cenario, "Gestora", "MANAGER");
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const pessoa = await lead(cenario, "Transferido");

    autenticarComo(cenario, ana);
    await assumir(pessoa.id);
    expect(await posseDe(cenario, pessoa.id)).toBe(ana.id);

    // É a diferença deliberada entre as duas ações: assumir tem a guarda
    // `responsibleMemberId: null`, atribuir não tem.
    autenticarComo(cenario, gestora, "MANAGER");
    expect((await atribuir(pessoa.id, bruno.id)).success).toBe(true);
    expect(await posseDe(cenario, pessoa.id)).toBe(bruno.id);
  });

  test("string vazia devolve o lead para a fila, sem responsável", async () => {
    const cenario = await novoCenario();
    const gestora = await membro(cenario, "Gestora", "MANAGER");
    const ana = await membro(cenario, "Ana");
    const pessoa = await lead(cenario, "Devolvido");

    autenticarComo(cenario, ana);
    await assumir(pessoa.id);
    autenticarComo(cenario, gestora, "MANAGER");
    expect((await atribuir(pessoa.id, "")).success).toBe(true);
    expect(await posseDe(cenario, pessoa.id)).toBeNull();
  });

  test("membro INATIVO não pode receber contato", async () => {
    const cenario = await novoCenario();
    const gestora = await membro(cenario, "Gestora", "MANAGER");
    const inativo = await membro(cenario, "Inativo");
    await prisma.organizationMember.update({
      where: { id: inativo.id },
      data: { status: "SUSPENDED" },
    });
    autenticarComo(cenario, gestora, "MANAGER");

    const pessoa = await lead(cenario, "Alvo");
    const r = await atribuir(pessoa.id, inativo.id);
    expect(r.success).toBe(false);
    expect(await posseDe(cenario, pessoa.id)).toBeNull();
  });

  test("membro inexistente é recusado", async () => {
    const cenario = await novoCenario();
    const gestora = await membro(cenario, "Gestora", "MANAGER");
    autenticarComo(cenario, gestora, "MANAGER");
    const pessoa = await lead(cenario, "Alvo");

    expect((await atribuir(pessoa.id, "membro-que-nao-existe")).success).toBe(false);
    expect(await posseDe(cenario, pessoa.id)).toBeNull();
  });

  test("pessoa inexistente é recusada", async () => {
    const cenario = await novoCenario();
    const gestora = await membro(cenario, "Gestora", "MANAGER");
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, gestora, "MANAGER");

    expect((await atribuir("pessoa-que-nao-existe", ana.id)).success).toBe(false);
  });
});

// -----------------------------------------------------------------------
// Tenant e IDOR
// -----------------------------------------------------------------------
describe("tenant e IDOR", () => {
  test("broker da Org A não assume pessoa da Org B", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const ana = await membro(orgA, "Ana");
    autenticarComo(orgA, ana);

    const pessoaB = await lead(orgB, "Pessoa da Outra Org");
    const r = await assumir(pessoaB.id);
    expect(r.success).toBe(false);
    expect(await posseDe(orgB, pessoaB.id)).toBeNull();
  });

  test("gestor da Org A não atribui pessoa sua para membro da Org B", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const gestora = await membro(orgA, "Gestora", "MANAGER");
    const membroB = await membro(orgB, "De Fora");
    autenticarComo(orgA, gestora, "MANAGER");

    const pessoaA = await lead(orgA, "Pessoa da Org A");
    const r = await atribuir(pessoaA.id, membroB.id);
    expect(r.success).toBe(false);
    expect(await posseDe(orgA, pessoaA.id)).toBeNull();
  });

  // organizationId nunca vem do cliente: a action o resolve por
  // requireOrganizationId a partir da sessão. Injetá-lo no FormData não
  // muda nada — o campo simplesmente não é lido.
  test("injetar organizationId/memberId no formulário não tem efeito", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const ana = await membro(orgA, "Ana");
    const bruno = await membro(orgA, "Bruno");
    autenticarComo(orgA, ana);

    const pessoa = await lead(orgA, "Injetado");
    const form = new FormData();
    form.set("organizationId", orgB.organization.id);
    form.set("memberId", bruno.id);
    form.set("responsavelId", bruno.id);
    const r = await assumirContato(pessoa.id, { success: false }, form);

    expect(r.success).toBe(true);
    // Quem assumiu foi a SESSÃO, não o memberId injetado.
    expect(await posseDe(orgA, pessoa.id)).toBe(ana.id);
  });
});

// -----------------------------------------------------------------------
// Matriz de visibilidade — RESTRICTED
// -----------------------------------------------------------------------
// Uma pessoa pode ser visível por mais de um motivo, e ver a PESSOA nunca
// é ver as NEGOCIAÇÕES dela. Estes testes provam as duas coisas com o
// mesmo dado.
describe("matriz de visibilidade (RESTRICTED)", () => {
  async function montar() {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    return { cenario, ana, bruno, imovel };
  }

  const vePessoa = (cenario: Cenario, memberId: string, personId: string) =>
    prisma.person.count({
      where: {
        id: personId,
        organizationId: cenario.organization.id,
        ...wherePessoa({ tipo: "MEMBRO", memberId }),
      },
    });

  const veNegociacao = (cenario: Cenario, memberId: string, interesseId: string) =>
    prisma.propertyInterest.count({
      where: {
        id: interesseId,
        organizationId: cenario.organization.id,
        ...whereNegociacao({ tipo: "MEMBRO", memberId }),
      },
    });

  async function negociacaoDe(
    cenario: Cenario,
    personId: string,
    propertyId: string,
    responsavelId: string
  ) {
    return prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId,
        propertyId,
        responsibleMemberId: responsavelId,
      },
      select: { id: true },
    });
  }

  // A — sem responsável e sem negociação: fora da carteira de todos.
  test("A: pessoa sem dono e sem negociação não está na carteira de ninguém", async () => {
    const { cenario, ana, bruno } = await montar();
    const pessoa = await lead(cenario, "Orfa");
    expect(await vePessoa(cenario, ana.id, pessoa.id)).toBe(0);
    expect(await vePessoa(cenario, bruno.id, pessoa.id)).toBe(0);
    // Mas a gestão a alcança — é ela que distribui.
    expect(
      await prisma.person.count({
        where: { id: pessoa.id, organizationId: cenario.organization.id, ...wherePessoa({ tipo: "ORGANIZACAO" }) },
      })
    ).toBe(1);
  });

  // B — dono A, sem negociação: só A vê.
  test("B: pessoa de A, sem negociação — B não vê", async () => {
    const { cenario, ana, bruno } = await montar();
    const pessoa = await lead(cenario, "Da Ana");
    autenticarComo(cenario, ana);
    await assumir(pessoa.id);

    expect(await vePessoa(cenario, ana.id, pessoa.id)).toBe(1);
    expect(await vePessoa(cenario, bruno.id, pessoa.id)).toBe(0);
  });

  // C — dono A + negociação de B: os dois veem a PESSOA, por motivos
  // diferentes, e NENHUM ganha a negociação do outro.
  test("C: dono A + negociação de B — ambos veem a pessoa, nenhum vê o negócio do outro", async () => {
    const { cenario, ana, bruno, imovel } = await montar();
    const pessoa = await lead(cenario, "Compartilhada");
    autenticarComo(cenario, ana);
    await assumir(pessoa.id);
    const negocioDoBruno = await negociacaoDe(cenario, pessoa.id, imovel.id, bruno.id);

    // Ana vê a pessoa pela POSSE; Bruno vê pela NEGOCIAÇÃO.
    expect(await vePessoa(cenario, ana.id, pessoa.id)).toBe(1);
    expect(await vePessoa(cenario, bruno.id, pessoa.id)).toBe(1);

    // A posse da pessoa NÃO entregou o negócio do Bruno para a Ana.
    expect(await veNegociacao(cenario, ana.id, negocioDoBruno.id)).toBe(0);
    expect(await veNegociacao(cenario, bruno.id, negocioDoBruno.id)).toBe(1);
  });

  // D — sem dono + negociação de A: A continua vendo pelo mecanismo antigo.
  test("D: sem dono + negociação de A — nada regrediu", async () => {
    const { cenario, ana, bruno, imovel } = await montar();
    const pessoa = await lead(cenario, "Negociada");
    await negociacaoDe(cenario, pessoa.id, imovel.id, ana.id);

    expect(await vePessoa(cenario, ana.id, pessoa.id)).toBe(1);
    expect(await vePessoa(cenario, bruno.id, pessoa.id)).toBe(0);
  });

  // E — dono B + negociação de A: espelho de C.
  test("E: dono B + negociação de A — cada um mantém o que é seu", async () => {
    const { cenario, ana, bruno, imovel } = await montar();
    const pessoa = await lead(cenario, "Cruzada");
    autenticarComo(cenario, bruno);
    await assumir(pessoa.id);
    const negocioDaAna = await negociacaoDe(cenario, pessoa.id, imovel.id, ana.id);

    expect(await vePessoa(cenario, ana.id, pessoa.id)).toBe(1);
    expect(await vePessoa(cenario, bruno.id, pessoa.id)).toBe(1);
    expect(await veNegociacao(cenario, bruno.id, negocioDaAna.id)).toBe(0);
    expect(await veNegociacao(cenario, ana.id, negocioDaAna.id)).toBe(1);
  });

  // A autoria continua sendo o que sempre foi — e a fase não a promoveu.
  test("autoria (assignedMemberId) continua não sendo posse", async () => {
    const { cenario, ana, bruno, imovel } = await montar();
    const pessoa = await prisma.person.create({
      data: {
        organizationId: cenario.organization.id,
        name: "Cadastrada Pela Ana",
        roles: ["LEAD"],
        assignedMemberId: ana.id,
      },
      select: { id: true },
    });

    // Enquanto ninguém conduz nada, a ponte de autoria vale.
    expect(await vePessoa(cenario, ana.id, pessoa.id)).toBe(1);

    // Assim que existe negociação de outro, a ponte fecha — e a autoria
    // NÃO virou posse por causa desta fase.
    await negociacaoDe(cenario, pessoa.id, imovel.id, bruno.id);
    expect(await vePessoa(cenario, ana.id, pessoa.id)).toBe(0);
    expect(await posseDe(cenario, pessoa.id)).toBeNull();
  });
});

// -----------------------------------------------------------------------
// COLLABORATIVE não vira RESTRICTED
// -----------------------------------------------------------------------
describe("COLLABORATIVE", () => {
  test("ter dono não tira a pessoa da vista dos colegas", async () => {
    const cenario = await novoCenario("COLLABORATIVE");
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const pessoa = await lead(cenario, "De Todos");

    autenticarComo(cenario, ana);
    expect((await assumir(pessoa.id)).success).toBe(true);

    // Em política colaborativa o escopo é o da ORGANIZAÇÃO para todos —
    // a posse responde "quem conduz", nunca "quem pode ver".
    for (const quem of [ana, bruno]) {
      const escopo = { tipo: "ORGANIZACAO" as const };
      void quem;
      expect(
        await prisma.person.count({
          where: { id: pessoa.id, organizationId: cenario.organization.id, ...wherePessoa(escopo) },
        })
      ).toBe(1);
    }
    // E o responsável continua sendo um só.
    expect(await posseDe(cenario, pessoa.id)).toBe(ana.id);
  });
});

// -----------------------------------------------------------------------
// Posse não é trabalho
// -----------------------------------------------------------------------
describe("posse não contamina nenhum outro fato", () => {
  test("assumir não cria Interaction, PropertyInterest nem ScheduledActivity", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, ana);
    const pessoa = await lead(cenario, "Intocada");

    await assumir(pessoa.id);

    const where = { organizationId: cenario.organization.id, personId: pessoa.id };
    expect(await prisma.interaction.count({ where })).toBe(0);
    expect(await prisma.propertyInterest.count({ where })).toBe(0);
    expect(await prisma.scheduledActivity.count({ where })).toBe(0);
  });

  test("atribuir também não cria nada além do rastro de auditoria", async () => {
    const cenario = await novoCenario();
    const gestora = await membro(cenario, "Gestora", "MANAGER");
    const ana = await membro(cenario, "Ana");
    autenticarComo(cenario, gestora, "MANAGER");
    const pessoa = await lead(cenario, "Distribuida");

    await atribuir(pessoa.id, ana.id);

    const where = { organizationId: cenario.organization.id, personId: pessoa.id };
    expect(await prisma.interaction.count({ where })).toBe(0);
    expect(await prisma.propertyInterest.count({ where })).toBe(0);
    // O rastro existe, e é o único efeito colateral.
    expect(
      await prisma.activityLog.count({
        where: {
          organizationId: cenario.organization.id,
          entity: "Person",
          entityId: pessoa.id,
          action: "person_owner_assigned",
        },
      })
    ).toBe(1);
  });

  test("criar negociação não muda o dono da pessoa, e vice-versa", async () => {
    const cenario = await novoCenario();
    const ana = await membro(cenario, "Ana");
    const bruno = await membro(cenario, "Bruno");
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoa = await lead(cenario, "Independente");

    autenticarComo(cenario, ana);
    await assumir(pessoa.id);

    // Negociação conduzida por OUTRO membro.
    await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        responsibleMemberId: bruno.id,
      },
    });

    // Nenhuma sincronização nos dois sentidos.
    expect(await posseDe(cenario, pessoa.id)).toBe(ana.id);
  });
});
