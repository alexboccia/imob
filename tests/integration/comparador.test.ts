import { describe, test, expect, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarImovel } from "@/test/fixtures";
import { POST } from "@/app/api/imoveis/comparar/route";
import { montarComparacao, apenasDiferencas } from "@/lib/comparador";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

// =======================================================================
// Comparador — a rota pública (Fase 59)
// =======================================================================
// Os ids vêm do navegador e NÃO autorizam nada: a consulta é escopada na
// organização e na regra de ficha pública. Id inexistente, de outro
// tenant ou sem ficha pública têm a mesma resposta — ausência.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario() {
  const c = await criarCenario();
  cenarios.push(c);
  return c;
}

function pedir(corpo: unknown) {
  return POST({ json: async () => corpo } as unknown as NextRequest);
}

async function imoveisDe(corpo: unknown) {
  const resposta = await pedir(corpo);
  const dados = await resposta.json();
  return { status: resposta.status, imoveis: dados.imoveis ?? [] };
}

describe("escopo e segurança", () => {
  test("devolve só os imóveis com ficha pública daquela organização", async () => {
    const c = await novoCenario();
    const publico = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    const rascunho = await criarImovel({ organizationId: c.organization.id, status: "DRAFT" });

    const { imoveis } = await imoveisDe({
      orgSlug: c.organization.slug,
      ids: [publico.id, rascunho.id],
    });
    expect(imoveis.map((i: { id: string }) => i.id)).toEqual([publico.id]);
  });

  test("imóvel de OUTRA organização não vem, mesmo com o id correto", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const alheio = await criarImovel({ organizationId: b.organization.id, status: "AVAILABLE" });

    const { imoveis } = await imoveisDe({ orgSlug: a.organization.slug, ids: [alheio.id] });
    expect(imoveis).toHaveLength(0);
  });

  test("id inexistente tem a MESMA resposta de um id proibido — sem oráculo", async () => {
    const c = await novoCenario();
    const inexistente = await imoveisDe({ orgSlug: c.organization.slug, ids: ["naoexiste123"] });
    const rascunho = await criarImovel({ organizationId: c.organization.id, status: "DRAFT" });
    const proibido = await imoveisDe({ orgSlug: c.organization.slug, ids: [rascunho.id] });

    expect(inexistente.status).toBe(proibido.status);
    expect(inexistente.imoveis).toEqual(proibido.imoveis);
  });

  test("organizationId do corpo é ignorado — o slug é re-resolvido", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const alheio = await criarImovel({ organizationId: b.organization.id, status: "AVAILABLE" });

    // `strict()` no schema: campo desconhecido invalida o pedido inteiro.
    const resposta = await pedir({
      orgSlug: a.organization.slug,
      ids: [alheio.id],
      organizationId: b.organization.id,
    });
    expect(resposta.status).toBe(400);
  });

  test("organização inexistente devolve lista vazia, não 404", async () => {
    const { status, imoveis } = await imoveisDe({ orgSlug: "nao-existe", ids: ["x"] });
    expect(status).toBe(200);
    expect(imoveis).toHaveLength(0);
  });

  test("corpo inválido é recusado", async () => {
    expect((await pedir({ ids: [] })).status).toBe(400);
    expect((await pedir({ orgSlug: "x", ids: "nao-e-lista" })).status).toBe(400);
  });

  test("nada é gravado no banco", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    const antes = await prisma.propertyAnalyticsEvent.count({ where: { organizationId: c.organization.id } });
    await imoveisDe({ orgSlug: c.organization.slug, ids: [imovel.id] });
    const depois = await prisma.propertyAnalyticsEvent.count({ where: { organizationId: c.organization.id } });
    expect(depois).toBe(antes);
  });

  test("a resposta não leva cache compartilhado", async () => {
    const c = await novoCenario();
    const resposta = await pedir({ orgSlug: c.organization.slug, ids: [] });
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("dados da comparação", () => {
  test("preserva a ordem pedida", async () => {
    const c = await novoCenario();
    const a = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    const b = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });

    const { imoveis } = await imoveisDe({ orgSlug: c.organization.slug, ids: [b.id, a.id] });
    expect(imoveis.map((i: { id: string }) => i.id)).toEqual([b.id, a.id]);
  });

  test("traz os campos que o card não tem, e alimenta a comparação", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    await prisma.property.update({
      where: { id: imovel.id, organizationId: c.organization.id },
      data: {
        price: 320000,
        totalArea: 80,
        condoFee: 900,
        propertyTax: 300,
        suites: 1,
        privateArea: 64,
        propertyFeatures: ["Varanda"],
        condoFeatures: ["Piscina"],
      },
    });
    const outro = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });

    const { imoveis } = await imoveisDe({
      orgSlug: c.organization.slug,
      ids: [imovel.id, outro.id],
    });
    const alvo = imoveis.find((i: { id: string }) => i.id === imovel.id);
    expect(alvo.condominio).toBe(900);
    expect(alvo.iptu).toBe(300);
    expect(alvo.suites).toBe(1);
    expect(alvo.areaPrivativa).toBe(64);
    // Unidade e condomínio chegam juntas.
    expect(alvo.caracteristicas).toEqual(expect.arrayContaining(["Varanda", "Piscina"]));

    // E o resultado é comparável de ponta a ponta.
    const grupos = montarComparacao(imoveis);
    const precoM2 = grupos.flatMap((g) => g.linhas).find((l) => l.chave === "preco-m2")!;
    expect(precoM2.valores[0].bruto).toBe(4000);
    expect(apenasDiferencas(grupos).length).toBeGreaterThan(0);
  });

  test("um imóvel só devolve um resultado — a tela é que decide o que fazer", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    const { imoveis } = await imoveisDe({ orgSlug: c.organization.slug, ids: [imovel.id] });
    expect(imoveis).toHaveLength(1);
  });

  test("lista vazia não consulta nada", async () => {
    const c = await novoCenario();
    const { imoveis } = await imoveisDe({ orgSlug: c.organization.slug, ids: [] });
    expect(imoveis).toHaveLength(0);
  });
});
