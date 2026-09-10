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
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { criarCenario, criarUsuario, criarMembro } from "@/test/fixtures";
import type { OrganizationRole } from "@/generated/prisma/client";
import { atualizarUsuario } from "@/app/app/usuarios/actions";
import { contatosPublicosDoCorretor } from "@/lib/perfil-publico-corretor";

// =======================================================================
// Contatos públicos do corretor — o que a action grava e o que ela recusa
// =======================================================================
// A regra central desta fase: contato público é campo PRÓPRIO. Nada em
// publicPhone/publicEmail vem de whatsapp/contactEmail/User.email, nem na
// criação, nem por padrão de formulário, nem por migration.

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

async function autenticarComo(cenario: Cenario, role: OrganizationRole = "OWNER") {
  await prisma.organizationMember.updateMany({
    where: { id: cenario.membro.id, organizationId: cenario.organization.id },
    data: { role },
  });
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role,
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  fd.set("nome", "Corretor de Teste");
  fd.set("email", campos.email ?? "corretor-teste@e2e.test");
  fd.set("papel", "BROKER");
  fd.set("ativo", "on");
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

async function salvar(membroId: string, campos: Record<string, string>) {
  try {
    return await atualizarUsuario(membroId, { success: false }, formData(campos));
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (mensagem.startsWith("redirect:")) return { success: true };
    throw erro;
  }
}

async function lerMembro(id: string) {
  return prisma.organizationMember.findUniqueOrThrow({
    where: { id },
    select: {
      publicProfileEnabled: true,
      publicPhone: true,
      publicEmail: true,
      publicWhatsapp: true,
      whatsapp: true,
      contactEmail: true,
    },
  });
}

describe("gravação dos contatos públicos", () => {
  test("preencher telefone e e-mail públicos publica exatamente o que foi digitado", async () => {
    const c = await novoCenario();
    await autenticarComo(c);

    await salvar(c.membro.id, {
      email: c.usuario.email,
      papel: "OWNER",
      perfilPublicoAtivo: "on",
      perfilPublicoTelefone: "(11) 93333-2222",
      perfilPublicoEmail: "Maria.Silva@imobiliaria.test",
    });

    const membro = await lerMembro(c.membro.id);
    expect(membro.publicProfileEnabled).toBe(true);
    // Telefone guarda dígitos locais; e-mail guarda como digitado (o
    // produto não baixa caixa em e-mail armazenado — ver contactEmail).
    expect(membro.publicPhone).toBe("11933332222");
    expect(membro.publicEmail).toBe("Maria.Silva@imobiliaria.test");
  });

  test("limpar os campos remove os contatos — e é isso que apaga os botões", async () => {
    const c = await novoCenario();
    await autenticarComo(c);
    await salvar(c.membro.id, {
      email: c.usuario.email,
      papel: "OWNER",
      perfilPublicoAtivo: "on",
      perfilPublicoTelefone: "11933332222",
      perfilPublicoEmail: "maria@imobiliaria.test",
    });

    await salvar(c.membro.id, {
      email: c.usuario.email,
      papel: "OWNER",
      perfilPublicoAtivo: "on",
      perfilPublicoTelefone: "",
      perfilPublicoEmail: "",
    });

    const membro = await lerMembro(c.membro.id);
    expect(membro.publicPhone).toBeNull();
    expect(membro.publicEmail).toBeNull();
    expect(contatosPublicosDoCorretor({ ...membro, publicCreci: null, publicPhotoUrl: null, publicBio: null, user: { name: "x" } })).toEqual({
      telefone: null,
      email: null,
      whatsapp: null,
    });
  });

  test("telefone inválido é recusado, sem gravar nada", async () => {
    const c = await novoCenario();
    await autenticarComo(c);
    const resultado = await salvar(c.membro.id, {
      email: c.usuario.email,
      papel: "OWNER",
      perfilPublicoAtivo: "on",
      perfilPublicoTelefone: "1234",
    });
    expect(resultado.success).toBe(false);
    expect((await lerMembro(c.membro.id)).publicPhone).toBeNull();
  });

  test("e-mail inválido é recusado, sem gravar nada", async () => {
    const c = await novoCenario();
    await autenticarComo(c);
    const resultado = await salvar(c.membro.id, {
      email: c.usuario.email,
      papel: "OWNER",
      perfilPublicoAtivo: "on",
      perfilPublicoEmail: "isso-nao-e-email",
    });
    expect(resultado.success).toBe(false);
    expect((await lerMembro(c.membro.id)).publicEmail).toBeNull();
  });
});

describe("nenhuma promoção silenciosa de dado privado", () => {
  test("whatsapp e e-mail OPERACIONAIS não viram contatos públicos", async () => {
    const c = await novoCenario();
    await autenticarComo(c);

    await salvar(c.membro.id, {
      email: c.usuario.email,
      papel: "OWNER",
      whatsapp: "11988887777",
      emailContato: "operacional@imobiliaria.test",
      perfilPublicoAtivo: "on",
      // Nada preenchido nos campos públicos.
      perfilPublicoTelefone: "",
      perfilPublicoEmail: "",
    });

    const membro = await lerMembro(c.membro.id);
    expect(membro.whatsapp).toBe("11988887777");
    expect(membro.contactEmail).toBe("operacional@imobiliaria.test");
    // O ponto do teste: os operacionais existem e os públicos continuam
    // vazios. Nenhum backfill, nenhuma cópia por conveniência.
    expect(membro.publicPhone).toBeNull();
    expect(membro.publicEmail).toBeNull();
    expect(membro.publicWhatsapp).toBeNull();
  });

  test("membro existente nasce sem contatos públicos", async () => {
    const c = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membro = await criarMembro({
      organizationId: c.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    const lido = await lerMembro(membro.id);
    expect(lido.publicPhone).toBeNull();
    expect(lido.publicEmail).toBeNull();
    expect(lido.publicProfileEnabled).toBe(false);
  });
});

describe("autorização", () => {
  test("papel sem gestão de usuários não altera o perfil público de ninguém", async () => {
    const c = await novoCenario();
    // Um corretor comum tentando editar o próprio vínculo.
    await autenticarComo(c, "BROKER");

    const resultado = await salvar(c.membro.id, {
      email: c.usuario.email,
      papel: "BROKER",
      perfilPublicoAtivo: "on",
      perfilPublicoTelefone: "11933332222",
    });

    expect(resultado.success).toBe(false);
    const membro = await lerMembro(c.membro.id);
    expect(membro.publicProfileEnabled).toBe(false);
    expect(membro.publicPhone).toBeNull();
  });

  test("IDOR: administrador não alcança membro de OUTRA organização", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    await autenticarComo(a, "OWNER");

    const resultado = await salvar(b.membro.id, {
      email: b.usuario.email,
      papel: "OWNER",
      perfilPublicoAtivo: "on",
      perfilPublicoTelefone: "11933332222",
      perfilPublicoEmail: "invasor@imobiliaria.test",
    });

    expect(resultado.success).toBe(false);
    const alvo = await lerMembro(b.membro.id);
    expect(alvo.publicProfileEnabled).toBe(false);
    expect(alvo.publicPhone).toBeNull();
    expect(alvo.publicEmail).toBeNull();
  });
});
