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

// redirect() do Next lança. Substituído por um erro reconhecível para
// que o teste possa afirmar PARA ONDE a sessão foi mandada.
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

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { criarCenario, criarUsuario, criarMembro } from "@/test/fixtures";
import { requireOrganizationId } from "@/lib/tenant";

// =======================================================================
// Revalidação de sessão por requisição (Fase 25)
// =======================================================================
// A sessão é JWT: não existe tabela de sessões para apagar. Sem esta
// revalidação, suspender um membro não o expulsava e trocar a senha não
// derrubava quem estivesse dentro com a senha antiga.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const usuariosAvulsos: string[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (usuariosAvulsos.length) {
    const id = usuariosAvulsos.pop()!;
    await prisma.organizationMember.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function cenarioComMembro() {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  const usuario = await criarUsuario();
  usuariosAvulsos.push(usuario.id);
  const membro = await criarMembro({
    organizationId: cenario.organization.id,
    userId: usuario.id,
    role: "BROKER",
  });
  return { cenario, usuario, membro };
}

// `emitidaEm` é o `iat` do JWT, em SEGUNDOS.
function sessaoDe(
  cenario: Cenario,
  usuarioId: string,
  membroId: string,
  emitidaEm = Math.floor(Date.now() / 1000)
) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: usuarioId,
      organizationId: cenario.organization.id,
      organizationMemberId: membroId,
      role: "BROKER",
      emitidaEm,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function destinoDoRedirect(): Promise<string | null> {
  try {
    await requireOrganizationId();
    return null;
  } catch (erro) {
    if (erro instanceof RedirecionouError) return erro.destino;
    throw erro;
  }
}

describe("revalidação da sessão", () => {
  test("membro ativo passa — nada muda para quem está trabalhando", async () => {
    const { cenario, usuario, membro } = await cenarioComMembro();
    sessaoDe(cenario, usuario.id, membro.id);
    await expect(requireOrganizationId()).resolves.toBe(cenario.organization.id);
  });

  test("suspender o vínculo expulsa na navegação seguinte", async () => {
    const { cenario, usuario, membro } = await cenarioComMembro();
    sessaoDe(cenario, usuario.id, membro.id);
    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { status: "SUSPENDED" },
    });

    // Antes da Fase 25 isto passava: o JWT continuava valendo por dias.
    expect(await destinoDoRedirect()).toBe("/app/login");
  });

  test("remover o vínculo expulsa", async () => {
    const { cenario, usuario, membro } = await cenarioComMembro();
    sessaoDe(cenario, usuario.id, membro.id);
    await prisma.organizationMember.delete({ where: { id: membro.id } });

    expect(await destinoDoRedirect()).toBe("/app/login");
  });

  test("desativar a identidade global expulsa", async () => {
    const { cenario, usuario, membro } = await cenarioComMembro();
    sessaoDe(cenario, usuario.id, membro.id);
    await prisma.user.update({ where: { id: usuario.id }, data: { active: false } });

    expect(await destinoDoRedirect()).toBe("/app/login");
  });

  test("sessão anterior à troca de senha morre; sessão posterior sobrevive", async () => {
    const { cenario, usuario, membro } = await cenarioComMembro();
    const trocaEm = new Date();
    await prisma.user.update({
      where: { id: usuario.id },
      data: { passwordChangedAt: trocaEm },
    });

    // Emitida 1 minuto ANTES da troca: é a sessão de quem tinha a senha
    // antiga — inclusive de quem a roubou.
    sessaoDe(cenario, usuario.id, membro.id, Math.floor(trocaEm.getTime() / 1000) - 60);
    expect(await destinoDoRedirect()).toBe("/app/login");

    // Emitida DEPOIS: é a sessão de quem acabou de redefinir e entrou.
    sessaoDe(cenario, usuario.id, membro.id, Math.floor(trocaEm.getTime() / 1000) + 60);
    await expect(requireOrganizationId()).resolves.toBe(cenario.organization.id);
  });

  test("usuário que NUNCA trocou senha não é afetado — compatibilidade do deploy", async () => {
    const { cenario, usuario, membro } = await cenarioComMembro();
    // passwordChangedAt null é o estado de todo usuário existente no dia
    // do deploy. Nenhuma sessão em curso pode ser derrubada por isso.
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } })).passwordChangedAt
    ).toBeNull();

    sessaoDe(cenario, usuario.id, membro.id, 0); // sessão antiquíssima
    await expect(requireOrganizationId()).resolves.toBe(cenario.organization.id);
  });

  test("vínculo de OUTRA organização não serve para entrar nesta", async () => {
    const { cenario, usuario, membro } = await cenarioComMembro();
    const outra = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(outra);

    // Sessão diz pertencer à outra organização, mas o vínculo é aqui.
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: usuario.id,
        organizationId: outra.organization.id,
        organizationMemberId: membro.id,
        role: "BROKER",
        emitidaEm: Math.floor(Date.now() / 1000),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(await destinoDoRedirect()).toBe("/app/login");
    expect(cenario.organization.id).not.toBe(outra.organization.id);
  });
});
