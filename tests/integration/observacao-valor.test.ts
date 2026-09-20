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
import { LIMITE_OBSERVACAO_VALOR } from "@/lib/property-mapper";
import type { ActionState } from "@/lib/action-result";

// =======================================================================
// Observação sobre o valor (Fase 54) — pelas actions reais
// =======================================================================
// Texto editorial do anunciante, gravado em Property.priceNote. O que se
// protege: cadastrar, editar e LIMPAR pelo mesmo formulário; vazio vira
// NULL (nunca string vazia); o limite é do servidor, não do navegador; e
// nada disso atravessa organização.

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

function formImovel(observacao?: string, extras: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("titulo", "Apartamento com observação");
  fd.set("tipo", "Apartamento");
  fd.set("finalidade", "SALE");
  fd.set("status", "AVAILABLE");
  fd.set("bairro", "Santana");
  fd.set("cidade", "São Paulo");
  fd.set("estado", "SP");
  fd.set("preco", "820000");
  if (observacao !== undefined) fd.set("observacaoValor", observacao);
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

async function gravado(organizationId: string) {
  return prisma.property.findFirstOrThrow({
    where: { organizationId },
    select: { id: true, priceNote: true, price: true },
  });
}

const OBSERVACAO = "Previsão de valorização: +25% até a entrega";

describe("criação", () => {
  test("nasce com a observação, sem tocar no preço", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    expect(await executar(() => criarImovel({ success: false }, formImovel(OBSERVACAO)))).toBe(
      "salvou"
    );
    const imovel = await gravado(c.organization.id);
    expect(imovel.priceNote).toBe(OBSERVACAO);
    expect(Number(imovel.price)).toBe(820000);
  });

  test("sem o campo, nasce NULL — nenhum texto é inventado", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await executar(() => criarImovel({ success: false }, formImovel()));
    expect((await gravado(c.organization.id)).priceNote).toBeNull();
  });

  test("só espaços viram NULL, nunca string vazia", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await executar(() => criarImovel({ success: false }, formImovel("    ")));
    expect((await gravado(c.organization.id)).priceNote).toBeNull();
  });
});

describe("edição", () => {
  async function comImovel(observacao?: string) {
    const c = await novoCenario();
    autenticarComo(c);
    await executar(() => criarImovel({ success: false }, formImovel(observacao)));
    return { c, imovel: await gravado(c.organization.id) };
  }

  test("edita o texto", async () => {
    const { c, imovel } = await comImovel(OBSERVACAO);
    expect(
      await executar(() =>
        atualizarImovel(imovel.id, { success: false }, formImovel("Entrada facilitada no lançamento"))
      )
    ).toBe("salvou");
    expect((await gravado(c.organization.id)).priceNote).toBe("Entrada facilitada no lançamento");
  });

  test("limpar o campo grava NULL e apaga o texto", async () => {
    const { c, imovel } = await comImovel(OBSERVACAO);
    expect(
      await executar(() => atualizarImovel(imovel.id, { success: false }, formImovel("")))
    ).toBe("salvou");
    expect((await gravado(c.organization.id)).priceNote).toBeNull();
  });

  test("acrescentar a observação a um imóvel que não tinha", async () => {
    const { c, imovel } = await comImovel();
    await executar(() => atualizarImovel(imovel.id, { success: false }, formImovel(OBSERVACAO)));
    expect((await gravado(c.organization.id)).priceNote).toBe(OBSERVACAO);
  });
});

describe("limite e normalização", () => {
  test("acima do limite a action recusa e nada é gravado", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const resultado = await executar(() =>
      criarImovel({ success: false }, formImovel("a".repeat(LIMITE_OBSERVACAO_VALOR + 1)))
    );
    expect(resultado).not.toBe("salvou");
    expect(
      (resultado as ActionState).fieldErrors?.observacaoValor?.[0] ?? ""
    ).toContain(String(LIMITE_OBSERVACAO_VALOR));
    expect(await prisma.property.count({ where: { organizationId: c.organization.id } })).toBe(0);
  });

  test("exatamente no limite passa; quebras de linha viram uma linha só", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await executar(() =>
      criarImovel({ success: false }, formImovel("a".repeat(LIMITE_OBSERVACAO_VALOR)))
    );
    const imovel = await gravado(c.organization.id);
    expect(imovel.priceNote).toHaveLength(LIMITE_OBSERVACAO_VALOR);

    await executar(() =>
      atualizarImovel(imovel.id, { success: false }, formImovel("Valor sujeito\n\n  a alteração"))
    );
    expect((await gravado(c.organization.id)).priceNote).toBe("Valor sujeito a alteração");
  });
});

describe("tenant", () => {
  test("a organização B não edita a observação de um imóvel da A", async () => {
    const a = await novoCenario();
    autenticarComo(a);
    await executar(() => criarImovel({ success: false }, formImovel(OBSERVACAO)));
    const imovelDeA = await gravado(a.organization.id);

    const b = await novoCenario();
    autenticarComo(b);
    // A consulta da action nasce escopada na organização de quem está
    // logado: o imóvel da A simplesmente não existe para a B, e a action
    // rejeita antes de qualquer escrita.
    await expect(
      atualizarImovel(imovelDeA.id, { success: false }, formImovel("Texto de outra imobiliária"))
    ).rejects.toThrow();
    expect(
      await prisma.property.findFirstOrThrow({
        where: { id: imovelDeA.id, organizationId: a.organization.id },
        select: { priceNote: true },
      })
    ).toEqual({ priceNote: OBSERVACAO });
  });
});
