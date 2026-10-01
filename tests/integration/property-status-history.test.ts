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
import { criarCenario } from "@/test/fixtures";
import { criarImovel, atualizarImovel } from "@/app/app/imoveis/actions";
import type { ActionState } from "@/lib/action-result";

// =======================================================================
// Fase 108 — autoria de PropertyStatusHistory na edição MANUAL do imóvel
// =======================================================================
// fecharInteresse (WON) já grava changedByMemberId corretamente quando o
// imóvel sai de circulação automaticamente. Este arquivo cobre a OUTRA
// via de escrita de Property.status — a edição manual do formulário do
// imóvel (atualizarImovel) — que até aqui nunca tinha teste nenhum sobre
// o histórico que ela mesma cria.

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

function autenticarComo(cenario: Cenario) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function formImovel(extras: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("titulo", "Apartamento para teste de histórico de status");
  fd.set("tipo", "Apartamento");
  fd.set("finalidade", "SALE");
  fd.set("status", "AVAILABLE");
  fd.set("bairro", "Santana");
  fd.set("cidade", "São Paulo");
  fd.set("estado", "SP");
  fd.set("preco", "820000");
  for (const [k, v] of Object.entries(extras)) fd.set(k, v);
  return fd;
}

async function executar(acao: () => Promise<ActionState>): Promise<ActionState | "salvou"> {
  try {
    return await acao();
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.startsWith("redirect:")) throw erro;
    return "salvou";
  }
}

describe("PropertyStatusHistory — edição manual do imóvel", () => {
  test("mudar o status pelo formulário grava o membro que fez a mudança", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await executar(() => criarImovel({ success: false }, formImovel()));
    const imovel = await prisma.property.findFirstOrThrow({
      where: { organizationId: c.organization.id },
      select: { id: true },
    });

    expect(
      await executar(() =>
        atualizarImovel(imovel.id, { success: false }, formImovel({ status: "SOLD" }))
      )
    ).toBe("salvou");

    // criarImovel já grava uma linha própria na criação (previousStatus
    // null); a linha desta edição é a mais recente — orderBy explícito
    // para nunca depender de qual delas o banco devolve primeiro.
    const historico = await prisma.propertyStatusHistory.findFirstOrThrow({
      where: { propertyId: imovel.id, organizationId: c.organization.id },
      orderBy: { changedAt: "desc" },
    });
    expect(historico.previousStatus).toBe("AVAILABLE");
    expect(historico.newStatus).toBe("SOLD");
    expect(historico.changedByMemberId).toBe(c.membro.id);
  });
});
