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
import { auth } from "@/lib/auth";
import { criarCenario, criarUsuario, criarMembro } from "@/test/fixtures";
import type { OrganizationRole } from "@/generated/prisma/client";
import { salvarMeuPerfilPublico } from "@/app/app/meu-perfil/actions";

// =======================================================================
// Autoatendimento do perfil público
// =======================================================================
// O princípio que estes testes fixam: manter o próprio perfil não é
// administrar usuários. A action não recebe id de membro — o vínculo sai
// da sessão — e o que ela escreve é apenas o conjunto fechado de colunas
// public*.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const usuariosAvulsos: string[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  for (const id of usuariosAvulsos.splice(0)) {
    await prisma.organizationMember.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

async function autenticarComo(
  cenario: Cenario,
  role: OrganizationRole,
  membershipId = cenario.membro.id,
  userId = cenario.usuario.id
) {
  await prisma.organizationMember.updateMany({
    where: { id: membershipId },
    data: { role },
  });
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: userId,
      organizationId: cenario.organization.id,
      organizationMemberId: membershipId,
      role,
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function formData(campos: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("perfilPublicoCreci", "");
  fd.set("perfilPublicoBio", "");
  fd.set("perfilPublicoWhatsapp", "");
  fd.set("perfilPublicoTelefone", "");
  fd.set("perfilPublicoEmail", "");
  fd.set("perfilPublicoFoto", "");
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

async function lerMembro(id: string) {
  return prisma.organizationMember.findUniqueOrThrow({
    where: { id },
    select: {
      role: true,
      status: true,
      publicProfileEnabled: true,
      publicCreci: true,
      publicBio: true,
      publicWhatsapp: true,
      publicPhone: true,
      publicEmail: true,
      publicPhotoUrl: true,
      user: { select: { email: true } },
    },
  });
}

describe("um corretor mantém o próprio perfil", () => {
  test("publica e preenche todos os campos públicos", async () => {
    const c = await novoCenario();
    await autenticarComo(c, "BROKER");

    const resultado = await salvarMeuPerfilPublico(
      { success: false },
      formData({
        perfilPublicoAtivo: "on",
        perfilPublicoCreci: "CRECI 12.345-F",
        perfilPublicoBio: "Atendo a zona sul.",
        perfilPublicoWhatsapp: "5511955551111",
        perfilPublicoTelefone: "(11) 93333-2222",
        perfilPublicoEmail: "corretor@imobiliaria.test",
      })
    );

    expect(resultado.success).toBe(true);
    const membro = await lerMembro(c.membro.id);
    expect(membro.publicProfileEnabled).toBe(true);
    expect(membro.publicCreci).toBe("CRECI 12.345-F");
    expect(membro.publicBio).toBe("Atendo a zona sul.");
    expect(membro.publicWhatsapp).toBe("5511955551111");
    expect(membro.publicPhone).toBe("11933332222");
    expect(membro.publicEmail).toBe("corretor@imobiliaria.test");
  });

  test("despublicar NÃO apaga o que foi escrito", async () => {
    const c = await novoCenario();
    await autenticarComo(c, "BROKER");
    await salvarMeuPerfilPublico(
      { success: false },
      formData({ perfilPublicoAtivo: "on", perfilPublicoCreci: "CRECI 9-F", perfilPublicoBio: "Bio." })
    );

    await salvarMeuPerfilPublico(
      { success: false },
      formData({ perfilPublicoCreci: "CRECI 9-F", perfilPublicoBio: "Bio." })
    );

    const membro = await lerMembro(c.membro.id);
    expect(membro.publicProfileEnabled).toBe(false);
    expect(membro.publicCreci).toBe("CRECI 9-F");
    expect(membro.publicBio).toBe("Bio.");
  });

  test("limpar um contato remove só ele", async () => {
    const c = await novoCenario();
    await autenticarComo(c, "BROKER");
    await salvarMeuPerfilPublico(
      { success: false },
      formData({
        perfilPublicoAtivo: "on",
        perfilPublicoTelefone: "11933332222",
        perfilPublicoEmail: "a@b.test",
      })
    );
    await salvarMeuPerfilPublico(
      { success: false },
      formData({ perfilPublicoAtivo: "on", perfilPublicoEmail: "a@b.test" })
    );

    const membro = await lerMembro(c.membro.id);
    expect(membro.publicPhone).toBeNull();
    expect(membro.publicEmail).toBe("a@b.test");
  });

  test("validação é a MESMA da tela de gestão", async () => {
    const c = await novoCenario();
    await autenticarComo(c, "BROKER");
    const resultado = await salvarMeuPerfilPublico(
      { success: false },
      formData({ perfilPublicoAtivo: "on", perfilPublicoTelefone: "1234" })
    );
    expect(resultado.success).toBe(false);
    expect((await lerMembro(c.membro.id)).publicPhone).toBeNull();
  });
});

describe("autoatendimento NÃO é gestão de usuários", () => {
  test("papel, status e e-mail de login são inalcançáveis, mesmo enviados no payload", async () => {
    const c = await novoCenario();
    await autenticarComo(c, "BROKER");
    const antes = await lerMembro(c.membro.id);

    await salvarMeuPerfilPublico(
      { success: false },
      formData({
        perfilPublicoAtivo: "on",
        // Campos administrativos injetados de propósito: a action nem os
        // lê, porque o schema é a lista fechada do perfil público.
        papel: "OWNER",
        role: "OWNER",
        ativo: "off",
        status: "SUSPENDED",
        email: "novo-login@invasor.test",
      })
    );

    const depois = await lerMembro(c.membro.id);
    expect(depois.role).toBe(antes.role);
    expect(depois.status).toBe(antes.status);
    expect(depois.user.email).toBe(antes.user.email);
  });

  test("não existe alvo: id de outro membro no payload não muda nada nele", async () => {
    const c = await novoCenario();
    const outroUsuario = await criarUsuario();
    usuariosAvulsos.push(outroUsuario.id);
    const outro = await criarMembro({
      organizationId: c.organization.id,
      userId: outroUsuario.id,
      role: "BROKER",
    });

    await autenticarComo(c, "BROKER");
    await salvarMeuPerfilPublico(
      { success: false },
      formData({
        perfilPublicoAtivo: "on",
        perfilPublicoCreci: "CRECI do invasor",
        // Todas as formas plausíveis de nomear um alvo.
        id: outro.id,
        membershipId: outro.id,
        memberId: outro.id,
        organizationMemberId: outro.id,
      })
    );

    // O perfil do OUTRO continua intacto...
    const alvo = await lerMembro(outro.id);
    expect(alvo.publicProfileEnabled).toBe(false);
    expect(alvo.publicCreci).toBeNull();
    // ...e quem foi alterado é quem estava na sessão.
    expect((await lerMembro(c.membro.id)).publicCreci).toBe("CRECI do invasor");
  });

  test("papel sem perfil público (ASSISTANT) é recusado", async () => {
    const c = await novoCenario();
    await autenticarComo(c, "ASSISTANT");

    const resultado = await salvarMeuPerfilPublico(
      { success: false },
      formData({ perfilPublicoAtivo: "on", perfilPublicoCreci: "CRECI 1-F" })
    );

    expect(resultado.success).toBe(false);
    const membro = await lerMembro(c.membro.id);
    expect(membro.publicProfileEnabled).toBe(false);
    expect(membro.publicCreci).toBeNull();
  });

  test("sem sessão não salva nada", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(null as any);
    const resultado = await salvarMeuPerfilPublico({ success: false }, formData({ perfilPublicoAtivo: "on" }));
    expect(resultado.success).toBe(false);
  });
});

describe("foto: só a própria, e só do próprio tenant", () => {
  test("URL de objeto de OUTRA organização é recusada", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    await autenticarComo(a, "BROKER");
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.exemplo.test");

    const resultado = await salvarMeuPerfilPublico(
      { success: false },
      formData({
        perfilPublicoAtivo: "on",
        perfilPublicoFoto: `https://cdn.exemplo.test/${b.organization.id}/perfil/11111111-2222-4333-8444-555555555555.png`,
      })
    );

    expect(resultado.success).toBe(false);
    expect((await lerMembro(a.membro.id)).publicPhotoUrl).toBeNull();
    vi.unstubAllEnvs();
  });

  test("URL de domínio externo é recusada", async () => {
    const c = await novoCenario();
    await autenticarComo(c, "BROKER");
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.exemplo.test");

    const resultado = await salvarMeuPerfilPublico(
      { success: false },
      formData({
        perfilPublicoAtivo: "on",
        perfilPublicoFoto: "https://evil.test/foto.png",
      })
    );

    expect(resultado.success).toBe(false);
    expect((await lerMembro(c.membro.id)).publicPhotoUrl).toBeNull();
    vi.unstubAllEnvs();
  });

  test("a própria foto, no próprio prefixo, é aceita", async () => {
    const c = await novoCenario();
    await autenticarComo(c, "BROKER");
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.exemplo.test");
    const url = `https://cdn.exemplo.test/${c.organization.id}/perfil/11111111-2222-4333-8444-555555555555.png`;

    const resultado = await salvarMeuPerfilPublico(
      { success: false },
      formData({ perfilPublicoAtivo: "on", perfilPublicoFoto: url })
    );

    expect(resultado.success).toBe(true);
    expect((await lerMembro(c.membro.id)).publicPhotoUrl).toBe(url);
    vi.unstubAllEnvs();
  });
});
