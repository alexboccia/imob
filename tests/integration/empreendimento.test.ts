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
import { criarCenario, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import {
  criarEmpreendimento,
  renomearEmpreendimento,
  removerEmpreendimento,
} from "@/app/app/empreendimentos/actions";
import {
  listarEmpreendimentos,
  listarOpcoesEmpreendimento,
  empreendimentoDaOrganizacao,
  buscarOutrasUnidades,
} from "@/lib/empreendimento-consultas";

// =======================================================================
// Empreendimento (Fase 38) — contra o banco
// =======================================================================
// O que estes testes protegem é a INTEGRIDADE DA IDENTIDADE: um
// empreendimento nunca atravessa organização, uma unidade nunca é
// vinculada a um empreendimento alheio, e "outras unidades" nunca
// devolve nada que não seja de fato do mesmo empreendimento.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

function autenticarComo(
  cenario: Cenario,
  m: { id: string; userId: string } = { id: cenario.membro.id, userId: cenario.usuario.id },
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

async function membro(cenario: Cenario, nome: string, role: string) {
  const usuario = await criarUsuario({ name: nome });
  const m = await criarMembro({
    organizationId: cenario.organization.id,
    userId: usuario.id,
    role: role as "BROKER",
  });
  return { ...m, userId: usuario.id };
}

const criar = (nome: string) =>
  criarEmpreendimento({ success: false }, formData({ nome }));

async function empreendimentoDireto(cenario: Cenario, nome: string) {
  return prisma.development.create({
    data: { organizationId: cenario.organization.id, name: nome },
    select: { id: true },
  });
}

/** Uma unidade vinculada, criada direto (o caminho de UI tem spec própria). */
async function unidade(
  cenario: Cenario,
  opcoes: { developmentId?: string | null; status?: string; titulo?: string } = {}
) {
  const imovel = await criarImovel({
    organizationId: cenario.organization.id,
    status: (opcoes.status ?? "AVAILABLE") as "AVAILABLE",
    ...(opcoes.titulo ? { title: opcoes.titulo } : {}),
  });
  if (opcoes.developmentId !== undefined) {
    await prisma.property.updateMany({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      data: { developmentId: opcoes.developmentId },
    });
  }
  return imovel;
}

// -----------------------------------------------------------------------
// A entidade
// -----------------------------------------------------------------------
describe("empreendimento pertence a uma organização", () => {
  test("criar, listar e o vínculo com a organização", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);

    expect((await criar("Residencial Alpha")).success).toBe(true);

    const lista = await listarEmpreendimentos(cenario.organization.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].nome).toBe("Residencial Alpha");
    // Nasce sem unidades: agrupar não é herdar, e criar o empreendimento
    // não mexe em imóvel nenhum.
    expect(lista[0].unidades).toBe(0);
  });

  test("nome repetido NA MESMA organização é recusado", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    expect((await criar("Alpha")).success).toBe(true);

    const segundo = await criar("Alpha");
    expect(segundo.success).toBe(false);
    expect(segundo.message).toContain("Já existe");
    expect(await listarEmpreendimentos(cenario.organization.id)).toHaveLength(1);
  });

  test("o MESMO nome em outra organização é permitido — unicidade nunca é global", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();

    autenticarComo(orgA);
    expect((await criar("Edifício Central")).success).toBe(true);
    autenticarComo(orgB);
    expect((await criar("Edifício Central")).success).toBe(true);

    expect(await listarEmpreendimentos(orgA.organization.id)).toHaveLength(1);
    expect(await listarEmpreendimentos(orgB.organization.id)).toHaveLength(1);
  });

  test("a listagem é escopada por tenant", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    await empreendimentoDireto(orgA, "Alpha A");
    await empreendimentoDireto(orgB, "Alpha B");

    const daA = await listarEmpreendimentos(orgA.organization.id);
    expect(daA.map((e) => e.nome)).toEqual(["Alpha A"]);
    expect(JSON.stringify(daA)).not.toContain("Alpha B");
  });
});

// -----------------------------------------------------------------------
// Permissões
// -----------------------------------------------------------------------
describe("quem gerencia", () => {
  test.each(["OWNER", "ADMIN", "MANAGER"])("%s cria empreendimento", async (papel) => {
    const cenario = await novoCenario();
    const gestor = await membro(cenario, `Gestor ${papel}`, papel);
    autenticarComo(cenario, gestor, papel);
    expect((await criar(`Alpha ${papel}`)).success).toBe(true);
  });

  test.each(["BROKER", "ASSISTANT"])("%s NÃO cria empreendimento", async (papel) => {
    const cenario = await novoCenario();
    const quem = await membro(cenario, `Quem ${papel}`, papel);
    autenticarComo(cenario, quem, papel);

    const r = await criar("Alpha proibido");
    expect(r.success).toBe(false);
    expect(r.message).toContain("permissão");
    expect(await listarEmpreendimentos(cenario.organization.id)).toHaveLength(0);
  });

  test("BROKER também não renomeia nem exclui", async () => {
    const cenario = await novoCenario();
    const alpha = await empreendimentoDireto(cenario, "Alpha");
    const broker = await membro(cenario, "Broker", "BROKER");
    autenticarComo(cenario, broker, "BROKER");

    expect(
      (await renomearEmpreendimento(alpha.id, { success: false }, formData({ nome: "Outro" })))
        .success
    ).toBe(false);
    expect(
      (await removerEmpreendimento(alpha.id, { success: false }, new FormData())).success
    ).toBe(false);
  });
});

// -----------------------------------------------------------------------
// Renomear e excluir
// -----------------------------------------------------------------------
describe("renomear e excluir", () => {
  test("renomear é escopado por tenant: id de outra org não muda nada", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const daB = await empreendimentoDireto(orgB, "Alpha B");
    autenticarComo(orgA);

    const r = await renomearEmpreendimento(
      daB.id,
      { success: false },
      formData({ nome: "Invadido" })
    );
    expect(r.success).toBe(false);

    const aindaB = await prisma.development.findFirstOrThrow({
      where: { id: daB.id, organizationId: orgB.organization.id },
      select: { name: true },
    });
    expect(aindaB.name).toBe("Alpha B");
  });

  test("EXCLUIR NUNCA APAGA IMÓVEL: com unidade vinculada, a exclusão é recusada", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const alpha = await empreendimentoDireto(cenario, "Alpha");
    const imovel = await unidade(cenario, { developmentId: alpha.id });

    const r = await removerEmpreendimento(alpha.id, { success: false }, new FormData());
    expect(r.success).toBe(false);
    expect(r.message).toContain("Desvincule");

    // Nem o empreendimento nem o imóvel foram tocados.
    expect(
      await prisma.development.count({
        where: { id: alpha.id, organizationId: cenario.organization.id },
      })
    ).toBe(1);
    const aindaLa = await prisma.property.findFirstOrThrow({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      select: { developmentId: true },
    });
    expect(aindaLa.developmentId).toBe(alpha.id);
  });

  test("sem unidades, exclui", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const alpha = await empreendimentoDireto(cenario, "Vazio");

    expect(
      (await removerEmpreendimento(alpha.id, { success: false }, new FormData())).success
    ).toBe(true);
    expect(await listarEmpreendimentos(cenario.organization.id)).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// O vínculo da unidade
// -----------------------------------------------------------------------
describe("vínculo unidade ↔ empreendimento", () => {
  test("uma Property pode ficar SEM empreendimento — e é o estado histórico", async () => {
    const cenario = await novoCenario();
    const avulso = await unidade(cenario);
    const lido = await prisma.property.findFirstOrThrow({
      where: { id: avulso.id, organizationId: cenario.organization.id },
      select: { developmentId: true },
    });
    expect(lido.developmentId).toBeNull();
  });

  test("empreendimentoDaOrganizacao recusa id de OUTRO tenant", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const daB = await empreendimentoDireto(orgB, "Alpha B");

    // É esta função que a action do imóvel consulta antes de gravar o
    // vínculo — é ela que impede Property Org A -> Development Org B.
    expect(await empreendimentoDaOrganizacao(orgA.organization.id, daB.id)).toBe(false);
    expect(await empreendimentoDaOrganizacao(orgB.organization.id, daB.id)).toBe(true);
  });

  test("o seletor só oferece empreendimentos da própria organização", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    await empreendimentoDireto(orgA, "Alpha A");
    await empreendimentoDireto(orgB, "Alpha B");

    const opcoes = await listarOpcoesEmpreendimento(orgA.organization.id);
    expect(opcoes.map((o) => o.nome)).toEqual(["Alpha A"]);
  });

  test("renomear o empreendimento NÃO altera nada da unidade", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const alpha = await empreendimentoDireto(cenario, "Alpha");
    const imovel = await unidade(cenario, { developmentId: alpha.id });
    const antes = await prisma.property.findFirstOrThrow({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      select: { street: true, city: true, developer: true, price: true, purpose: true },
    });

    await renomearEmpreendimento(alpha.id, { success: false }, formData({ nome: "Alpha II" }));

    // Agrupar não é herdar: endereço, construtora, preço e finalidade
    // continuam sendo da unidade, intocados.
    const depois = await prisma.property.findFirstOrThrow({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      select: { street: true, city: true, developer: true, price: true, purpose: true },
    });
    expect(depois).toEqual(antes);
  });
});

// -----------------------------------------------------------------------
// Outras unidades — a consulta pública
// -----------------------------------------------------------------------
describe("outras unidades do mesmo empreendimento", () => {
  test("traz as do mesmo empreendimento e NUNCA a unidade atual", async () => {
    const cenario = await novoCenario();
    const alpha = await empreendimentoDireto(cenario, "Alpha");
    const atual = await unidade(cenario, { developmentId: alpha.id, titulo: "Alpha 1" });
    await unidade(cenario, { developmentId: alpha.id, titulo: "Alpha 2" });
    await unidade(cenario, { developmentId: alpha.id, titulo: "Alpha 3" });

    const outras = await buscarOutrasUnidades(cenario.organization.id, alpha.id, atual.id);
    expect(outras.map((u) => u.title).sort()).toEqual(["Alpha 2", "Alpha 3"]);
    expect(outras.some((u) => u.id === atual.id)).toBe(false);
  });

  test("NUNCA traz unidade de outro empreendimento nem avulsa", async () => {
    const cenario = await novoCenario();
    const alpha = await empreendimentoDireto(cenario, "Alpha");
    const beta = await empreendimentoDireto(cenario, "Beta");
    const atual = await unidade(cenario, { developmentId: alpha.id, titulo: "Alpha 1" });
    await unidade(cenario, { developmentId: alpha.id, titulo: "Alpha 2" });
    await unidade(cenario, { developmentId: beta.id, titulo: "Beta 1" });
    await unidade(cenario, { titulo: "Avulso 1" });

    const outras = await buscarOutrasUnidades(cenario.organization.id, alpha.id, atual.id);
    expect(outras.map((u) => u.title)).toEqual(["Alpha 2"]);
  });

  test("NUNCA atravessa tenant, mesmo com o id do empreendimento em mãos", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const alphaB = await empreendimentoDireto(orgB, "Alpha B");
    const atualB = await unidade(orgB, { developmentId: alphaB.id, titulo: "B1" });
    await unidade(orgB, { developmentId: alphaB.id, titulo: "B2" });

    // Org A perguntando pelo empreendimento da Org B: vazio.
    const cruzada = await buscarOutrasUnidades(orgA.organization.id, alphaB.id, atualB.id);
    expect(cruzada).toHaveLength(0);
  });

  test("respeita a política pública: só AVAILABLE", async () => {
    const cenario = await novoCenario();
    const alpha = await empreendimentoDireto(cenario, "Alpha");
    const atual = await unidade(cenario, { developmentId: alpha.id, titulo: "Alpha 1" });
    await unidade(cenario, { developmentId: alpha.id, titulo: "Publica", status: "AVAILABLE" });
    for (const status of ["DRAFT", "INACTIVE", "SOLD", "RESERVED", "RENTED"]) {
      await unidade(cenario, {
        developmentId: alpha.id,
        titulo: `Oculta ${status}`,
        status,
      });
    }

    const outras = await buscarOutrasUnidades(cenario.organization.id, alpha.id, atual.id);
    expect(outras.map((u) => u.title)).toEqual(["Publica"]);
  });

  test("limita no banco e devolve UM a mais, para a tela saber que há mais", async () => {
    const cenario = await novoCenario();
    const alpha = await empreendimentoDireto(cenario, "Alpha");
    const atual = await unidade(cenario, { developmentId: alpha.id, titulo: "Alpha 0" });
    for (let i = 1; i <= 6; i++) {
      await unidade(cenario, { developmentId: alpha.id, titulo: `Alpha ${i}` });
    }

    // take = limite + 1 — nunca o empreendimento inteiro.
    const outras = await buscarOutrasUnidades(cenario.organization.id, alpha.id, atual.id, 4);
    expect(outras).toHaveLength(5);
  });

  test("ordenação DETERMINÍSTICA: mesma ordem em duas consultas", async () => {
    const cenario = await novoCenario();
    const alpha = await empreendimentoDireto(cenario, "Alpha");
    const atual = await unidade(cenario, { developmentId: alpha.id, titulo: "Alpha 0" });
    for (let i = 1; i <= 4; i++) {
      await unidade(cenario, { developmentId: alpha.id, titulo: `Alpha ${i}` });
    }

    const uma = await buscarOutrasUnidades(cenario.organization.id, alpha.id, atual.id);
    const outra = await buscarOutrasUnidades(cenario.organization.id, alpha.id, atual.id);
    expect(uma.map((u) => u.id)).toEqual(outra.map((u) => u.id));
    // Ordem de cadastro (code asc), nunca ordem arbitrária do banco.
    expect(uma.map((u) => u.title)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Alpha 4"]);
  });

  test("empreendimento com uma única unidade não tem 'outras'", async () => {
    const cenario = await novoCenario();
    const alpha = await empreendimentoDireto(cenario, "Solo");
    const atual = await unidade(cenario, { developmentId: alpha.id });

    expect(await buscarOutrasUnidades(cenario.organization.id, alpha.id, atual.id)).toHaveLength(0);
  });

  test("dados incompletos não quebram a consulta", async () => {
    const cenario = await novoCenario();
    const alpha = await empreendimentoDireto(cenario, "Alpha");
    const atual = await unidade(cenario, { developmentId: alpha.id, titulo: "Alpha 1" });
    const incompleta = await unidade(cenario, { developmentId: alpha.id, titulo: "Sem nada" });
    await prisma.property.updateMany({
      where: { id: incompleta.id, organizationId: cenario.organization.id },
      data: { price: null, rentPrice: null, bedrooms: null, totalArea: null },
    });

    const outras = await buscarOutrasUnidades(cenario.organization.id, alpha.id, atual.id);
    const linha = outras.find((u) => u.id === incompleta.id)!;
    expect(linha.price).toBeNull();
    expect(linha.bedrooms).toBeNull();
    expect(linha.totalArea).toBeNull();
    // Sem foto cadastrada, a lista de mídia vem vazia — nunca undefined.
    expect(linha.media).toEqual([]);
  });
});
