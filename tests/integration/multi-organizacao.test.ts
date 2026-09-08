import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

class RedirecionouError extends Error {
  constructor(public destino: string) {
    super(`redirect:${destino}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new RedirecionouError(destino);
  },
}));

// A troca reescreve o JWT via unstable_update. O mock captura o que a
// action MANDA gravar — é exatamente o que precisa ser verificado: quais
// claims a sessão passa a carregar.
const atualizacoes: { organizationId?: string; organizationMemberId?: string; role?: string }[] =
  [];
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unstable_update: vi.fn(async (dados: any) => {
    atualizacoes.push(dados.user);
    return null;
  }),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { criarCenario, criarUsuario, criarMembro } from "@/test/fixtures";
import { listarOrganizacoesAcessiveis } from "@/lib/organizacoes-do-usuario";
import { trocarOrganizacao } from "@/app/app/trocar-organizacao/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Multi-organização (Fase 26) — contra o banco
// =======================================================================

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const usuariosAvulsos: string[] = [];

afterEach(async () => {
  atualizacoes.length = 0;
  vi.mocked(auth).mockReset();
  for (const id of usuariosAvulsos.splice(0)) {
    await prisma.organizationMember.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(timezone: string | null = "UTC"): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"], timezone });
  cenarios.push(cenario);
  return cenario;
}

function sessaoDe(cenario: Cenario, userId: string, membroId: string, role = "BROKER") {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: userId,
      organizationId: cenario.organization.id,
      organizationMemberId: membroId,
      role,
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("organizações acessíveis", () => {
  test("uma única membership: uma opção", async () => {
    const cenario = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    await criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });

    const lista = await listarOrganizacoesAcessiveis(usuario.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].organizationId).toBe(cenario.organization.id);
    expect(lista[0].papel).toBe("BROKER");
  });

  test("duas ACTIVE: as duas aparecem, mais antiga primeiro", async () => {
    const primeira = await novoCenario();
    const segunda = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    await criarMembro({
      organizationId: primeira.organization.id,
      userId: usuario.id,
      role: "OWNER",
    });
    await criarMembro({
      organizationId: segunda.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });

    const lista = await listarOrganizacoesAcessiveis(usuario.id);
    expect(lista.map((o) => o.organizationId)).toEqual([
      primeira.organization.id,
      segunda.organization.id,
    ]);
    // A ordem é a MESMA do login (auth.ts): o topo da lista é onde a
    // pessoa entra por padrão.
    expect(lista[0].papel).toBe("OWNER");
    expect(lista[1].papel).toBe("BROKER");
  });

  test("membership SUSPENDED não é opção", async () => {
    const ativa = await novoCenario();
    const suspensa = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    await criarMembro({ organizationId: ativa.organization.id, userId: usuario.id, role: "BROKER" });
    const vinculo = await criarMembro({
      organizationId: suspensa.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    await prisma.organizationMember.update({
      where: { id: vinculo.id },
      data: { status: "SUSPENDED" },
    });

    const lista = await listarOrganizacoesAcessiveis(usuario.id);
    expect(lista.map((o) => o.organizationId)).toEqual([ativa.organization.id]);
  });

  test("membership INVITED não é opção — ainda não foi aceita", async () => {
    const ativa = await novoCenario();
    const convidada = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    await criarMembro({ organizationId: ativa.organization.id, userId: usuario.id, role: "BROKER" });
    const vinculo = await criarMembro({
      organizationId: convidada.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    await prisma.organizationMember.update({
      where: { id: vinculo.id },
      data: { status: "INVITED" },
    });

    expect(await listarOrganizacoesAcessiveis(usuario.id)).toHaveLength(1);
  });

  test("organização desativada pela plataforma não é opção", async () => {
    const ativa = await novoCenario();
    const inativa = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    await criarMembro({ organizationId: ativa.organization.id, userId: usuario.id, role: "BROKER" });
    await criarMembro({ organizationId: inativa.organization.id, userId: usuario.id, role: "BROKER" });
    await prisma.organization.update({
      where: { id: inativa.organization.id },
      data: { active: false },
    });

    // Oferecer uma organização suspensa só levaria à tela de suspensão.
    const lista = await listarOrganizacoesAcessiveis(usuario.id);
    expect(lista.map((o) => o.organizationId)).toEqual([ativa.organization.id]);
  });
});

describe("troca de organização", () => {
  async function comDuasOrganizacoes() {
    const orgA = await novoCenario("America/Sao_Paulo");
    const orgB = await novoCenario("UTC");
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membroA = await criarMembro({
      organizationId: orgA.organization.id,
      userId: usuario.id,
      role: "OWNER",
    });
    const membroB = await criarMembro({
      organizationId: orgB.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    return { orgA, orgB, usuario, membroA, membroB };
  }

  // Sucesso termina em redirect (que o Next implementa lançando); recusa
  // volta um ActionState. O tipo unificado deixa o teste falar dos dois.
  async function trocar(
    organizationId: string
  ): Promise<{ success: boolean; message?: string; destino?: string }> {
    try {
      return await trocarOrganizacao(organizationId, ESTADO_INICIAL_ACAO, new FormData());
    } catch (erro) {
      if (erro instanceof RedirecionouError) return { success: true, destino: erro.destino };
      throw erro;
    }
  }

  test("trocar reescreve organização, vínculo e PAPEL juntos", async () => {
    const { orgA, orgB, usuario, membroA, membroB } = await comDuasOrganizacoes();
    sessaoDe(orgA, usuario.id, membroA.id, "OWNER");

    const estado = await trocar(orgB.organization.id);
    expect(estado.success).toBe(true);

    expect(atualizacoes).toHaveLength(1);
    // Os três campos viajam juntos: é o que impede operar no tenant B
    // com o papel de OWNER que a pessoa tem no tenant A.
    expect(atualizacoes[0]).toEqual({
      organizationId: orgB.organization.id,
      organizationMemberId: membroB.id,
      role: "BROKER",
    });
  });

  test("trocar para organização sem membership é recusado", async () => {
    const { orgA, usuario, membroA } = await comDuasOrganizacoes();
    const alheia = await novoCenario();
    sessaoDe(orgA, usuario.id, membroA.id, "OWNER");

    const estado = await trocar(alheia.organization.id);

    expect(estado.success).toBe(false);
    expect(atualizacoes).toHaveLength(0);
  });

  test("trocar para membership SUSPENDED é recusado", async () => {
    const { orgA, orgB, usuario, membroA, membroB } = await comDuasOrganizacoes();
    await prisma.organizationMember.update({
      where: { id: membroB.id },
      data: { status: "SUSPENDED" },
    });
    sessaoDe(orgA, usuario.id, membroA.id, "OWNER");

    const estado = await trocar(orgB.organization.id);

    expect(estado.success).toBe(false);
    expect(atualizacoes).toHaveLength(0);
  });

  test("trocar para organização desativada é recusado", async () => {
    const { orgA, orgB, usuario, membroA } = await comDuasOrganizacoes();
    await prisma.organization.update({
      where: { id: orgB.organization.id },
      data: { active: false },
    });
    sessaoDe(orgA, usuario.id, membroA.id, "OWNER");

    expect((await trocar(orgB.organization.id)).success).toBe(false);
    expect(atualizacoes).toHaveLength(0);
  });

  test("a mensagem de recusa é a MESMA para inexistente, suspensa e desativada", async () => {
    const { orgA, orgB, usuario, membroA, membroB } = await comDuasOrganizacoes();
    const alheia = await novoCenario();
    sessaoDe(orgA, usuario.id, membroA.id, "OWNER");

    const inexistente = await trocar(alheia.organization.id);
    await prisma.organizationMember.update({
      where: { id: membroB.id },
      data: { status: "SUSPENDED" },
    });
    const suspensa = await trocar(orgB.organization.id);

    // Distinguir os casos contaria a quem tentou se a organização existe
    // e se ele já teve acesso a ela.
    expect(suspensa.message).toBe(inexistente.message);
  });

  test("o vínculo do outro tenant não vaza: cada organização tem o seu", async () => {
    const { orgA, orgB, usuario, membroA, membroB } = await comDuasOrganizacoes();
    sessaoDe(orgA, usuario.id, membroA.id, "OWNER");
    await trocar(orgB.organization.id);

    expect(atualizacoes[0].organizationMemberId).toBe(membroB.id);
    expect(atualizacoes[0].organizationMemberId).not.toBe(membroA.id);

    // E o vínculo em A continua intacto — trocar de contexto não mexe em
    // dado nenhum das organizações.
    const aDepois = await prisma.organizationMember.findUniqueOrThrow({
      where: { id: membroA.id },
    });
    expect(aDepois.status).toBe("ACTIVE");
    expect(aDepois.role).toBe("OWNER");
  });

  test("fusos diferentes: cada organização mantém o seu", async () => {
    const { orgA, orgB } = await comDuasOrganizacoes();
    const a = await prisma.organization.findUniqueOrThrow({
      where: { id: orgA.organization.id },
      select: { timezone: true },
    });
    const b = await prisma.organization.findUniqueOrThrow({
      where: { id: orgB.organization.id },
      select: { timezone: true },
    });
    // O fuso pertence à ORGANIZAÇÃO, nunca ao User — trocar de contexto
    // muda o calendário porque muda o tenant, não porque alguém guardou
    // preferência na identidade.
    expect(a.timezone).toBe("America/Sao_Paulo");
    expect(b.timezone).toBe("UTC");
  });

  test("visibilidade comercial é por organização, não por identidade", async () => {
    const { orgA, orgB } = await comDuasOrganizacoes();
    await prisma.organization.update({
      where: { id: orgB.organization.id },
      data: { commercialVisibility: "RESTRICTED" },
    });

    const a = await prisma.organization.findUniqueOrThrow({
      where: { id: orgA.organization.id },
      select: { commercialVisibility: true },
    });
    const b = await prisma.organization.findUniqueOrThrow({
      where: { id: orgB.organization.id },
      select: { commercialVisibility: true },
    });
    expect(a.commercialVisibility).toBe("COLLABORATIVE");
    expect(b.commercialVisibility).toBe("RESTRICTED");
  });
});
