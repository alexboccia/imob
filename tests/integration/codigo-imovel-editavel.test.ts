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
import { criarCenario, criarImovel } from "@/test/fixtures";
import type { OrganizationRole } from "@/generated/prisma/client";
import { atualizarImovel } from "@/app/app/imoveis/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Fase 140 — ID do imóvel editável
// =======================================================================
// O código (Property.code) nasce do autoincrement do banco e sempre foi
// só-leitura. Esta fase abre edição DELIBERADAMENTE restrita à tela de
// edição (nunca na criação): quem já tem um código pode corrigi-lo, mas
// ninguém escolhe um na hora de cadastrar.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties"] });
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

function formularioImovel(
  imovel: { title: string },
  extras: Record<string, string> = {}
): FormData {
  const fd = new FormData();
  fd.set("titulo", imovel.title);
  fd.set("tipo", "Apartamento");
  fd.set("finalidade", "SALE");
  fd.set("status", "AVAILABLE");
  fd.set("bairro", "Centro");
  fd.set("cidade", "São Paulo");
  fd.set("estado", "SP");
  fd.set("midiasJson", "[]");
  for (const [chave, valor] of Object.entries(extras)) fd.set(chave, valor);
  return fd;
}

// A action redireciona para a ficha do imóvel quando salva com sucesso
// (nunca retorna um ActionState "success" nesse caminho) — mesmo padrão
// de vitrine-home.test.ts.
async function editar(
  imovelId: string,
  formData: FormData
): Promise<{ success: boolean; message?: string }> {
  try {
    return await atualizarImovel(imovelId, ESTADO_INICIAL_ACAO, formData);
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith("redirect:")) {
      return { success: !erro.message.includes("/app/login") };
    }
    throw erro;
  }
}

async function codigoAtual(organizationId: string, imovelId: string): Promise<number> {
  const imovel = await prisma.property.findUniqueOrThrow({
    where: { id: imovelId, organizationId },
    select: { code: true },
  });
  return imovel.code;
}

// Devolve id E título porque o formulário da action exige o título — o
// fixture só devolve o id (mesmo padrão de vitrine-home.test.ts).
async function novoImovel(
  organizationId: string,
  title: string
): Promise<{ id: string; title: string }> {
  const imovel = await criarImovel({ organizationId, title });
  return { id: imovel.id, title };
}

describe("ID do imóvel editável", () => {
  test("editar com um número novo e livre atualiza o código", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    const imovel = await novoImovel(cenario.organization.id, "Casa A");

    const novoCodigo = (await codigoAtual(cenario.organization.id, imovel.id)) + 100000;
    const resultado = await editar(
      imovel.id,
      formularioImovel(imovel, { codigo: String(novoCodigo) })
    );

    expect(resultado.success).toBe(true);
    expect(await codigoAtual(cenario.organization.id, imovel.id)).toBe(novoCodigo);
  });

  test("não enviar o campo preserva o código atual, não zera nem gera outro", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    const imovel = await novoImovel(cenario.organization.id, "Casa B");
    const codigoOriginal = await codigoAtual(cenario.organization.id, imovel.id);

    const resultado = await editar(imovel.id, formularioImovel(imovel));

    expect(resultado.success).toBe(true);
    expect(await codigoAtual(cenario.organization.id, imovel.id)).toBe(codigoOriginal);
  });

  test("escolher um número já usado por outro imóvel da mesma organização é recusado, nomeando o ocupante", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    const imovelA = await novoImovel(cenario.organization.id, "Ocupante");
    const imovelB = await novoImovel(cenario.organization.id, "Pretendente");
    const codigoDeA = await codigoAtual(cenario.organization.id, imovelA.id);

    const resultado = await editar(
      imovelB.id,
      formularioImovel(imovelB, { codigo: String(codigoDeA) })
    );

    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain("Ocupante");
    // Nada mudou de verdade: nem o ocupante perdeu o código, nem o
    // pretendente ficou com um duplicado por acidente.
    expect(await codigoAtual(cenario.organization.id, imovelA.id)).toBe(codigoDeA);
    expect(await codigoAtual(cenario.organization.id, imovelB.id)).not.toBe(codigoDeA);
  });

  test("reenviar o PRÓPRIO código atual do imóvel não é tratado como colisão", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    const imovel = await novoImovel(cenario.organization.id, "Casa C");
    const codigoOriginal = await codigoAtual(cenario.organization.id, imovel.id);

    const resultado = await editar(
      imovel.id,
      formularioImovel(imovel, { codigo: String(codigoOriginal) })
    );

    expect(resultado.success).toBe(true);
    expect(await codigoAtual(cenario.organization.id, imovel.id)).toBe(codigoOriginal);
  });

  test("o mesmo número em organizações DIFERENTES nunca colide — a unicidade é por organização", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    await autenticarComo(orgA, "OWNER");
    const imovelA = await novoImovel(orgA.organization.id, "Org A");
    const imovelB = await novoImovel(orgB.organization.id, "Org B");
    const codigoDeB = await codigoAtual(orgB.organization.id, imovelB.id);

    const resultado = await editar(
      imovelA.id,
      formularioImovel(imovelA, { codigo: String(codigoDeB) })
    );

    expect(resultado.success).toBe(true);
    expect(await codigoAtual(orgA.organization.id, imovelA.id)).toBe(codigoDeB);
  });

  test("número não positivo (zero ou negativo) é recusado na validação, antes de tocar o banco", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    const imovel = await novoImovel(cenario.organization.id, "Casa D");
    const codigoOriginal = await codigoAtual(cenario.organization.id, imovel.id);

    const zero = await editar(imovel.id, formularioImovel(imovel, { codigo: "0" }));
    expect(zero.success).toBe(false);

    const negativo = await editar(imovel.id, formularioImovel(imovel, { codigo: "-3" }));
    expect(negativo.success).toBe(false);

    expect(await codigoAtual(cenario.organization.id, imovel.id)).toBe(codigoOriginal);
  });
});
