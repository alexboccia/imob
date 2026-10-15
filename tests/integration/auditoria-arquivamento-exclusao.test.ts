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
  arquivarImovel,
  restaurarImovel,
  excluirImovelDefinitivamente,
} from "@/app/app/imoveis/actions";
import {
  arquivarCliente,
  restaurarCliente,
  excluirClienteDefinitivamente,
} from "@/app/app/clientes/actions";
import { construirWhereImoveis, construirWhereClientes } from "@/lib/listagens-admin-query";
import { verificarLimiteImoveis } from "@/lib/entitlements";

// =======================================================================
// Logs de Auditoria — Etapas 4 e 5: arquivamento reversível e exclusão
// definitiva restrita, para Imóveis e Clientes.
// =======================================================================

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const membrosAvulsos: string[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  for (const id of membrosAvulsos.splice(0)) {
    const m = await prisma.organizationMember.findUnique({ where: { id } });
    await prisma.organizationMember.deleteMany({ where: { id } });
    if (m) await prisma.user.deleteMany({ where: { id: m.userId } });
  }
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

function autenticarComo(cenario: Cenario, role = "OWNER") {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function membroComPapel(cenario: Cenario, role: string) {
  const usuario = await criarUsuario({ name: `Membro ${role}` });
  const m = await criarMembro({ organizationId: cenario.organization.id, userId: usuario.id, role: role as "BROKER" });
  membrosAvulsos.push(m.id);
  return { id: m.id, userId: usuario.id };
}

async function ultimoLog(organizationId: string, entity: string, entityId: string) {
  return prisma.activityLog.findFirst({
    where: { organizationId, entity, entityId },
    orderBy: { createdAt: "desc" },
  });
}

describe("Arquivamento de Imóveis", () => {
  test("OWNER arquiva com sucesso, log gravado com action 'archived'", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });

    const resultado = await arquivarImovel(imovel.id, { success: false }, new FormData());
    expect(resultado.success).toBe(true);

    const atualizado = await prisma.property.findUnique({
      where: { id: imovel.id, organizationId: cenario.organization.id },
    });
    expect(atualizado!.archivedAt).not.toBeNull();
    expect(atualizado!.archivedByMemberId).toBe(cenario.membro.id);
    // Arquivar NUNCA mexe em status — ortogonal, conforme decisão de produto.
    expect(atualizado!.status).toBe("AVAILABLE");

    const log = await ultimoLog(cenario.organization.id, "Property", imovel.id);
    expect(log!.action).toBe("archived");
  });

  test("BROKER não pode arquivar (precisa de PAPEIS_ARQUIVAMENTO)", async () => {
    const cenario = await novoCenario();
    const broker = await membroComPapel(cenario, "BROKER");
    autenticarComo(cenario, "BROKER");
    vi.mocked(auth).mockResolvedValue({
      user: { id: broker.userId, organizationId: cenario.organization.id, organizationMemberId: broker.id, role: "BROKER" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });

    const resultado = await arquivarImovel(imovel.id, { success: false }, new FormData());
    expect(resultado.success).toBe(false);
    const aindaAtivo = await prisma.property.findUnique({
      where: { id: imovel.id, organizationId: cenario.organization.id },
    });
    expect(aindaAtivo!.archivedAt).toBeNull();
  });

  test("arquivar duas vezes é recusado na segunda (sem erro, mensagem clara)", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });

    expect((await arquivarImovel(imovel.id, { success: false }, new FormData())).success).toBe(true);
    const segunda = await arquivarImovel(imovel.id, { success: false }, new FormData());
    expect(segunda.success).toBe(false);
    expect(segunda.message).toContain("já está arquivado");
  });

  test("restaurar devolve o imóvel à listagem padrão, log 'restored'", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await arquivarImovel(imovel.id, { success: false }, new FormData());

    const resultado = await restaurarImovel(imovel.id, { success: false }, new FormData());
    expect(resultado.success).toBe(true);

    const atualizado = await prisma.property.findUnique({
      where: { id: imovel.id, organizationId: cenario.organization.id },
    });
    expect(atualizado!.archivedAt).toBeNull();
    expect(atualizado!.archivedByMemberId).toBeNull();

    const log = await ultimoLog(cenario.organization.id, "Property", imovel.id);
    expect(log!.action).toBe("restored");
  });

  test("cross-tenant: não é possível arquivar imóvel de outra organização", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const imovelB = await criarImovel({ organizationId: orgB.organization.id, status: "AVAILABLE" });
    autenticarComo(orgA);

    const resultado = await arquivarImovel(imovelB.id, { success: false }, new FormData());
    expect(resultado.success).toBe(false);
    const aindaAtivo = await prisma.property.findUnique({
      where: { id: imovelB.id, organizationId: orgB.organization.id },
    });
    expect(aindaAtivo!.archivedAt).toBeNull();
  });
});

describe("Listagem e limites comerciais excluem imóveis arquivados", () => {
  test("construirWhereImoveis exclui arquivados por padrão, inclui com incluirArquivados", async () => {
    const cenario = await novoCenario();
    const ativo = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const arquivado = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await prisma.property.updateMany({
      where: { id: arquivado.id, organizationId: cenario.organization.id },
      data: { archivedAt: new Date() },
    });

    const wherePadrao = construirWhereImoveis({ organizationId: cenario.organization.id, busca: "" });
    const listaPadrao = await prisma.property.findMany({ where: wherePadrao });
    expect(listaPadrao.map((p) => p.id)).toEqual([ativo.id]);

    const whereComArquivados = construirWhereImoveis({
      organizationId: cenario.organization.id,
      busca: "",
      incluirArquivados: true,
    });
    const listaCompleta = await prisma.property.findMany({ where: whereComArquivados });
    expect(listaCompleta.map((p) => p.id).sort()).toEqual([ativo.id, arquivado.id].sort());
  });

  test("imóvel arquivado não conta contra o limite comercial de imóveis ativos", async () => {
    const cenario = await criarCenario({ modulos: ["core", "properties", "crm"], limites: { PROPERTIES: 1 } });
    cenarios.push(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await prisma.property.updateMany({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      data: { archivedAt: new Date() },
    });

    // Limite é 1, já existe 1 imóvel — mas arquivado. Não deve lançar.
    await expect(verificarLimiteImoveis(cenario.organization.id)).resolves.toBeUndefined();
  });
});

describe("Exclusão definitiva de Imóveis", () => {
  test("OWNER exclui definitivamente com confirmação correta (título exato)", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE", title: "Casa Única" });

    const fd = new FormData();
    fd.set("confirmacao", "Casa Única");
    const resultado = await excluirImovelDefinitivamente(imovel.id, { success: false }, fd);
    expect(resultado.success).toBe(true);

    expect(
      await prisma.property.findUnique({ where: { id: imovel.id, organizationId: cenario.organization.id } })
    ).toBeNull();
  });

  test("confirmação incorreta recusa a exclusão, registro sobrevive", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE", title: "Casa Protegida" });

    const fd = new FormData();
    fd.set("confirmacao", "nome errado");
    const resultado = await excluirImovelDefinitivamente(imovel.id, { success: false }, fd);
    expect(resultado.success).toBe(false);
    expect(
      await prisma.property.findUnique({ where: { id: imovel.id, organizationId: cenario.organization.id } })
    ).not.toBeNull();
  });

  test("MANAGER (pode arquivar) NÃO pode excluir definitivamente", async () => {
    const cenario = await novoCenario();
    const manager = await membroComPapel(cenario, "MANAGER");
    vi.mocked(auth).mockResolvedValue({
      user: { id: manager.userId, organizationId: cenario.organization.id, organizationMemberId: manager.id, role: "MANAGER" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE", title: "Protegido do Manager" });

    const fd = new FormData();
    fd.set("confirmacao", "Protegido do Manager");
    const resultado = await excluirImovelDefinitivamente(imovel.id, { success: false }, fd);
    expect(resultado.success).toBe(false);
    expect(
      await prisma.property.findUnique({ where: { id: imovel.id, organizationId: cenario.organization.id } })
    ).not.toBeNull();
  });

  test("negociação vinculada bloqueia a exclusão definitiva (FK RESTRICT real), com mensagem clara", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE", title: "Com Negociação" });
    const pessoa = await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Interessado" },
    });
    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, propertyId: imovel.id, personId: pessoa.id },
    });

    const fd = new FormData();
    fd.set("confirmacao", "Com Negociação");
    const resultado = await excluirImovelDefinitivamente(imovel.id, { success: false }, fd);
    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain("negociações");
    expect(
      await prisma.property.findUnique({ where: { id: imovel.id, organizationId: cenario.organization.id } })
    ).not.toBeNull();
  });
});

describe("Arquivamento e exclusão definitiva de Clientes", () => {
  test("arquivar e restaurar cliente, com log correto", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await prisma.person.create({ data: { organizationId: cenario.organization.id, name: "Cliente Teste" } });

    const arquivado = await arquivarCliente(pessoa.id, { success: false }, new FormData());
    expect(arquivado.success).toBe(true);
    let atual = await prisma.person.findUnique({ where: { id: pessoa.id, organizationId: cenario.organization.id } });
    expect(atual!.archivedAt).not.toBeNull();

    const restaurado = await restaurarCliente(pessoa.id, { success: false }, new FormData());
    expect(restaurado.success).toBe(true);
    atual = await prisma.person.findUnique({ where: { id: pessoa.id, organizationId: cenario.organization.id } });
    expect(atual!.archivedAt).toBeNull();
  });

  test("construirWhereClientes exclui arquivados por padrão", async () => {
    const cenario = await novoCenario();
    const ativo = await prisma.person.create({ data: { organizationId: cenario.organization.id, name: "Ativo" } });
    const arquivado = await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Arquivado", archivedAt: new Date() },
    });

    const where = construirWhereClientes({ organizationId: cenario.organization.id, busca: "" });
    const lista = await prisma.person.findMany({ where });
    expect(lista.map((p) => p.id)).toEqual([ativo.id]);
    expect(lista.map((p) => p.id)).not.toContain(arquivado.id);
  });

  test("cliente com negociação vinculada NÃO pode ser excluído definitivamente (bloqueio manual, evita cascade indiscriminado)", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await prisma.person.create({ data: { organizationId: cenario.organization.id, name: "Com Negócio" } });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, propertyId: imovel.id, personId: pessoa.id },
    });

    const fd = new FormData();
    fd.set("confirmacao", "Com Negócio");
    const resultado = await excluirClienteDefinitivamente(pessoa.id, { success: false }, fd);
    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain("negocia");

    // O cliente E a negociação sobrevivem intactos — prova direta de que
    // não houve cascade silencioso.
    expect(
      await prisma.person.findUnique({ where: { id: pessoa.id, organizationId: cenario.organization.id } })
    ).not.toBeNull();
    expect(
      await prisma.propertyInterest.count({ where: { personId: pessoa.id, organizationId: cenario.organization.id } })
    ).toBe(1);
  });

  test("cliente sem nenhuma negociação é excluído definitivamente com sucesso", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await prisma.person.create({ data: { organizationId: cenario.organization.id, name: "Sem Vínculo" } });

    const fd = new FormData();
    fd.set("confirmacao", "Sem Vínculo");
    const resultado = await excluirClienteDefinitivamente(pessoa.id, { success: false }, fd);
    expect(resultado.success).toBe(true);
    expect(
      await prisma.person.findUnique({ where: { id: pessoa.id, organizationId: cenario.organization.id } })
    ).toBeNull();
  });

  // Homologação final — o cross-tenant de Imóvel já era testado (acima);
  // para Cliente o mecanismo é idêntico (mesmo where: { id, organizationId }
  // dentro do mesmo withOrganization fail-closed), mas não havia uma
  // segunda prova direta e dedicada. Cobre arquivar, restaurar E excluir
  // definitivamente — as 3 ações, não só uma — e confirma que nenhum
  // evento de auditoria falso é gravado na organização atacante.
  test("cross-tenant: nenhuma das 3 ações alcança cliente de outra organização", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const clienteA = await prisma.person.create({
      data: { organizationId: orgA.organization.id, name: "Cliente Org A" },
    });
    autenticarComo(orgB);

    const tentativaArquivar = await arquivarCliente(clienteA.id, { success: false }, new FormData());
    expect(tentativaArquivar.success).toBe(false);

    const fdExclusao = new FormData();
    fdExclusao.set("confirmacao", "Cliente Org A");
    const tentativaExcluir = await excluirClienteDefinitivamente(clienteA.id, { success: false }, fdExclusao);
    expect(tentativaExcluir.success).toBe(false);

    // Cliente intacto, nenhum evento de auditoria gravado na organização
    // atacante (B) — nem sucesso fantasma, nem vazamento de rastro.
    const aindaIntacto = await prisma.person.findUnique({
      where: { id: clienteA.id, organizationId: orgA.organization.id },
    });
    expect(aindaIntacto).not.toBeNull();
    expect(aindaIntacto!.archivedAt).toBeNull();
    const logsEmB = await prisma.activityLog.findMany({
      where: { organizationId: orgB.organization.id, entity: "Person", entityId: clienteA.id },
    });
    expect(logsEmB).toHaveLength(0);

    // Restaurar um cliente que nunca foi arquivado (e que nem pertence à
    // organização atacante) também precisa ser recusado, não só ignorado.
    const tentativaRestaurar = await restaurarCliente(clienteA.id, { success: false }, new FormData());
    expect(tentativaRestaurar.success).toBe(false);
  });

  // Mesmo usuário com vínculo ACTIVE em duas organizações diferentes —
  // cenário mais rigoroso pedido na homologação final: a troca de
  // organização ativa na sessão não deve, por si só, abrir acesso ao
  // cliente da outra organização.
  test("cross-tenant: usuário com membership em duas organizações não alcança cliente da outra organização pela sessão trocada", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const clienteA = await prisma.person.create({
      data: { organizationId: orgA.organization.id, name: "Cliente Multi-Org" },
    });

    // Mesmo usuário (orgA.usuario), membership também em B. O usuário em
    // si pertence ao cenário A (removido por cenario.destruir()) — aqui só
    // o VÍNCULO extra em B precisa de limpeza manual, nunca o usuário.
    const membroEmB = await criarMembro({ organizationId: orgB.organization.id, userId: orgA.usuario.id, role: "OWNER" });

    // Sessão ativa aponta para B (mesmo userId, organizationId diferente).
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: orgA.usuario.id,
        organizationId: orgB.organization.id,
        organizationMemberId: membroEmB.id,
        role: "OWNER",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const resultado = await arquivarCliente(clienteA.id, { success: false }, new FormData());
    expect(resultado.success).toBe(false);
    const aindaIntacto = await prisma.person.findUnique({
      where: { id: clienteA.id, organizationId: orgA.organization.id },
    });
    expect(aindaIntacto!.archivedAt).toBeNull();
  });
});
