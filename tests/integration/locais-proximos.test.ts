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
import { criarCenario, criarImovel as criarImovelDireto } from "@/test/fixtures";
import { criarImovel, atualizarImovel } from "@/app/app/imoveis/actions";
import type { ActionState } from "@/lib/action-result";

// =======================================================================
// O que tem por perto (Fase 42) — o que o formulário do imóvel grava
// =======================================================================
// Pelas actions reais: a lista inteira viaja a cada "Salvar imóvel", e a
// edição preserva a identidade de cada local (mesmo id), respeitando a
// organização em toda escrita.

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

function formImovel(locais: unknown) {
  const fd = new FormData();
  fd.set("titulo", "Imóvel com vizinhança");
  fd.set("tipo", "Apartamento");
  fd.set("finalidade", "SALE");
  fd.set("status", "AVAILABLE");
  fd.set("bairro", "Centro");
  fd.set("cidade", "São Paulo");
  fd.set("estado", "SP");
  fd.set("midiasJson", "[]");
  fd.set("locaisProximosJson", typeof locais === "string" ? locais : JSON.stringify(locais));
  return fd;
}

// Salvar com sucesso redireciona — o mock transforma isso em exceção.
async function executar(acao: () => Promise<ActionState>): Promise<ActionState | "redirecionou"> {
  try {
    return await acao();
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.startsWith("redirect:")) throw erro;
    return "redirecionou";
  }
}

const salvar = (imovelId: string, locais: unknown) =>
  executar(() => atualizarImovel(imovelId, { success: false }, formImovel(locais)));

async function gravados(organizationId: string, propertyId: string) {
  return prisma.nearbyPlace.findMany({
    where: { organizationId, propertyId },
    orderBy: { order: "asc" },
    select: { id: true, category: true, name: true, distance: true, distanceUnit: true, order: true },
  });
}

const farmacia = { categoria: "PHARMACY", nome: "Drogasil", distancia: 350, unidade: "METERS" };
const parque = { categoria: "PARK", nome: "Parque Ibirapuera", distancia: 1.2, unidade: "KILOMETERS" };
const escola = { categoria: "SCHOOL", nome: "Colégio Bandeirantes", distancia: null, unidade: null };

describe("criação", () => {
  test("o novo imóvel nasce com os locais, na ordem da lista", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    const r = await executar(() => criarImovel({ success: false }, formImovel([farmacia, parque, escola])));
    expect(r).toBe("redirecionou");

    const imovel = await prisma.property.findFirstOrThrow({ where: { organizationId: c.organization.id } });
    const lista = await gravados(c.organization.id, imovel.id);
    expect(lista.map((l) => [l.category, l.name, l.distance, l.distanceUnit, l.order])).toEqual([
      ["PHARMACY", "Drogasil", 350, "METERS", 0],
      ["PARK", "Parque Ibirapuera", 1.2, "KILOMETERS", 1],
      ["SCHOOL", "Colégio Bandeirantes", null, null, 2],
    ]);
  });

  test("lista inválida não cria o imóvel", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    const r = await executar(() =>
      criarImovel({ success: false }, formImovel([{ ...farmacia, unidade: null }]))
    );
    expect(r).not.toBe("redirecionou");
    expect((r as ActionState).success).toBe(false);
    expect((r as ActionState).fieldErrors?.locaisProximos?.[0]).toContain("juntas");
    expect(await prisma.property.count({ where: { organizationId: c.organization.id } })).toBe(0);
  });
});

describe("edição", () => {
  test("editar, limpar a distância, reordenar e remover preservam a identidade", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const imovel = await criarImovelDireto({ organizationId: c.organization.id });

    expect(await salvar(imovel.id, [farmacia, parque, escola])).toBe("redirecionou");
    const [a, b, e] = await gravados(c.organization.id, imovel.id);

    // Editar nome/categoria mantém o id.
    expect(
      await salvar(imovel.id, [
        { ...farmacia, id: a.id, nome: "Droga Raia", categoria: "HEALTH" },
        { ...parque, id: b.id },
        { ...escola, id: e.id },
      ])
    ).toBe("redirecionou");
    let lista = await gravados(c.organization.id, imovel.id);
    expect(lista.map((l) => [l.id, l.name, l.category])).toEqual([
      [a.id, "Droga Raia", "HEALTH"],
      [b.id, "Parque Ibirapuera", "PARK"],
      [e.id, "Colégio Bandeirantes", "SCHOOL"],
    ]);

    // Limpar SÓ a distância: o local continua, com o par nulo.
    expect(
      await salvar(imovel.id, [
        { ...farmacia, id: a.id, nome: "Droga Raia", categoria: "HEALTH" },
        { ...parque, id: b.id, distancia: null, unidade: null },
        { ...escola, id: e.id },
      ])
    ).toBe("redirecionou");
    lista = await gravados(c.organization.id, imovel.id);
    expect(lista).toHaveLength(3);
    expect(lista[1]).toMatchObject({ id: b.id, distance: null, distanceUnit: null });

    // Reordenar: mesmos ids, nova ordem.
    expect(
      await salvar(imovel.id, [
        { ...escola, id: e.id },
        { ...farmacia, id: a.id, nome: "Droga Raia", categoria: "HEALTH" },
        { ...parque, id: b.id, distancia: null, unidade: null },
      ])
    ).toBe("redirecionou");
    lista = await gravados(c.organization.id, imovel.id);
    expect(lista.map((l) => [l.id, l.order])).toEqual([
      [e.id, 0],
      [a.id, 1],
      [b.id, 2],
    ]);

    // Remover é omitir da lista; os demais ficam intactos.
    expect(
      await salvar(imovel.id, [
        { ...escola, id: e.id },
        { ...parque, id: b.id, distancia: null, unidade: null },
      ])
    ).toBe("redirecionou");
    lista = await gravados(c.organization.id, imovel.id);
    expect(lista.map((l) => [l.id, l.order])).toEqual([
      [e.id, 0],
      [b.id, 1],
    ]);

    // Lista vazia remove tudo.
    expect(await salvar(imovel.id, [])).toBe("redirecionou");
    expect(await gravados(c.organization.id, imovel.id)).toEqual([]);
  });

  test("id desconhecido vira local novo, sem erro", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const imovel = await criarImovelDireto({ organizationId: c.organization.id });

    expect(await salvar(imovel.id, [{ ...farmacia, id: "inexistente" }])).toBe("redirecionou");
    const lista = await gravados(c.organization.id, imovel.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].id).not.toBe("inexistente");
  });

  test("id de local de OUTRO imóvel da mesma organização não é roubado", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const origem = await criarImovelDireto({ organizationId: c.organization.id });
    const destino = await criarImovelDireto({ organizationId: c.organization.id });

    expect(await salvar(origem.id, [farmacia])).toBe("redirecionou");
    const [daOrigem] = await gravados(c.organization.id, origem.id);

    expect(await salvar(destino.id, [{ ...parque, id: daOrigem.id }])).toBe("redirecionou");

    // A origem não mudou; o destino ganhou um local NOVO.
    expect(await gravados(c.organization.id, origem.id)).toEqual([daOrigem]);
    const doDestino = await gravados(c.organization.id, destino.id);
    expect(doDestino).toHaveLength(1);
    expect(doDestino[0].id).not.toBe(daOrigem.id);
    expect(doDestino[0].name).toBe("Parque Ibirapuera");
  });

  test("id de local de OUTRA organização nunca é tocado", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const imovelA = await criarImovelDireto({ organizationId: a.organization.id });
    const imovelB = await criarImovelDireto({ organizationId: b.organization.id });

    autenticarComo(b);
    expect(await salvar(imovelB.id, [farmacia])).toBe("redirecionou");
    const [deB] = await gravados(b.organization.id, imovelB.id);

    autenticarComo(a);
    expect(await salvar(imovelA.id, [{ ...parque, id: deB.id }])).toBe("redirecionou");

    expect(await gravados(b.organization.id, imovelB.id)).toEqual([deB]);
    const deA = await gravados(a.organization.id, imovelA.id);
    expect(deA).toHaveLength(1);
    expect(deA[0].id).not.toBe(deB.id);
  });

  test("imóvel de outra organização: nenhum local gravado nem apagado", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const imovelB = await criarImovelDireto({ organizationId: b.organization.id });

    autenticarComo(b);
    expect(await salvar(imovelB.id, [farmacia])).toBe("redirecionou");
    const antes = await gravados(b.organization.id, imovelB.id);

    autenticarComo(a);
    await salvar(imovelB.id, []).catch(() => undefined);
    await salvar(imovelB.id, [parque]).catch(() => undefined);

    expect(await gravados(b.organization.id, imovelB.id)).toEqual(antes);
    expect(await prisma.nearbyPlace.count({ where: { organizationId: a.organization.id } })).toBe(0);
  });

  test.each([
    ["JSON malformado", "[{"],
    ["par incompleto", [{ ...farmacia, distancia: null }]],
    ["metros fracionados", [{ ...farmacia, distancia: 3.5 }]],
    ["categoria inventada", [{ ...farmacia, categoria: "CASINO" }]],
  ])("lista inválida (%s) não altera nada", async (_nome, locais) => {
    const c = await novoCenario();
    autenticarComo(c);
    const imovel = await criarImovelDireto({ organizationId: c.organization.id });
    expect(await salvar(imovel.id, [farmacia])).toBe("redirecionou");
    const antes = await gravados(c.organization.id, imovel.id);

    const r = await salvar(imovel.id, locais);
    expect(r).not.toBe("redirecionou");
    expect((r as ActionState).fieldErrors?.locaisProximos).toHaveLength(1);
    expect(await gravados(c.organization.id, imovel.id)).toEqual(antes);
  });
});

test("guarda de tenant: consulta sem organizationId é recusada", async () => {
  await expect(prisma.nearbyPlace.findMany({ where: { propertyId: "x" } })).rejects.toThrow();
});
