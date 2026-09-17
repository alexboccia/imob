import { describe, test, expect, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarImovel } from "@/test/fixtures";
import { buscarImoveisFavoritos } from "@/lib/favoritos-data";
import { LIMITE_FAVORITOS } from "@/lib/favoritos";
import { POST } from "@/app/api/imoveis/favoritos/route";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

// =======================================================================
// Central de favoritos (Fase 49), contra o banco de verdade
// =======================================================================
// Os ids vêm do navegador e não autorizam nada: a resposta é a
// interseção com "ficha pública desta organização".

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novaOrganizacao() {
  const c = await criarCenario();
  cenarios.push(c);
  return c.organization;
}

type Status = "AVAILABLE" | "DRAFT" | "INACTIVE" | "RESERVED" | "SOLD" | "RENTED";
const imovel = async (organizationId: string, title: string, status: Status = "AVAILABLE") =>
  (await criarImovel({ organizationId, title, status })).id;

function pedir(corpo: unknown, bruto?: string) {
  const requisicao = new Request("http://localhost/api/imoveis/favoritos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bruto ?? JSON.stringify(corpo),
  });
  // O handler só lê o corpo: um Request comum basta.
  return POST(requisicao as NextRequest);
}

describe("buscarImoveisFavoritos", () => {
  test("devolve na ordem pedida, só o que é da organização e tem ficha pública", async () => {
    const orgA = await novaOrganizacao();
    const orgB = await novaOrganizacao();
    const a1 = await imovel(orgA.id, "A1");
    const a2 = await imovel(orgA.id, "A2");
    const vendido = await imovel(orgA.id, "A vendido", "SOLD");
    const reservado = await imovel(orgA.id, "A reservado", "RESERVED");
    const rascunho = await imovel(orgA.id, "A rascunho", "DRAFT");
    const inativo = await imovel(orgA.id, "A inativo", "INACTIVE");
    const b1 = await imovel(orgB.id, "B1");

    const resultado = await buscarImoveisFavoritos(orgA.id, [
      a2,
      b1,
      "nao-existe",
      rascunho,
      vendido,
      inativo,
      a1,
      reservado,
    ]);
    expect(resultado.map((i) => i.id)).toEqual([a2, vendido, a1, reservado]);
    // A situação só aparece quando o imóvel não está mais disponível.
    expect(resultado.map((i) => i.situacao)).toEqual([null, "Vendido", null, "Reservado"]);

    // Org B nunca vê os de A, nem com os ids em mãos.
    expect(await buscarImoveisFavoritos(orgB.id, [a1, a2, b1])).toEqual([
      expect.objectContaining({ id: b1 }),
    ]);
  });

  test("só dados públicos do card: nada administrativo atravessa", async () => {
    const org = await novaOrganizacao();
    const id = await imovel(org.id, "Com dados internos");
    const [resultado] = await buscarImoveisFavoritos(org.id, [id]);
    expect(Object.keys(resultado).sort()).toEqual(
      [
        "areaTotal",
        "bairro",
        "banheiros",
        "cidade",
        "destaque",
        "estado",
        "finalidade",
        "id",
        "lancamento",
        "midias",
        "oportunidade",
        "preco",
        "precoAluguel",
        "quartos",
        "situacao",
        "tipo",
        "titulo",
        "vagasGaragem",
      ].sort()
    );
  });
});

describe("POST /api/imoveis/favoritos", () => {
  test("resolve pelo slug, sem cache compartilhado", async () => {
    const org = await novaOrganizacao();
    const id = await imovel(org.id, "Salvo");
    const resposta = await pedir({ orgSlug: org.slug, ids: [id, "nao-existe"] });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const corpo = await resposta.json();
    expect(corpo.imoveis.map((i: { id: string }) => i.id)).toEqual([id]);
  });

  test("tenant: o slug de B com ids de A devolve vazio — a mesma resposta de ids inexistentes", async () => {
    const orgA = await novaOrganizacao();
    const orgB = await novaOrganizacao();
    const a1 = await imovel(orgA.id, "A1");
    const deOutro = await (await pedir({ orgSlug: orgB.slug, ids: [a1] })).json();
    const inexistente = await (await pedir({ orgSlug: orgB.slug, ids: ["nao-existe"] })).json();
    expect(deOutro).toEqual({ imoveis: [] });
    expect(deOutro).toEqual(inexistente);
  });

  test("organização inexistente ou suspensa: lista vazia, não 404", async () => {
    const org = await novaOrganizacao();
    const id = await imovel(org.id, "Salvo");
    expect(await (await pedir({ orgSlug: "nao-existe-org", ids: [id] })).json()).toEqual({ imoveis: [] });
    await prisma.organization.update({ where: { id: org.id }, data: { active: false } });
    expect(await (await pedir({ orgSlug: org.slug, ids: [id] })).json()).toEqual({ imoveis: [] });
  });

  test("payload inválido ou grande demais: 400, sem detalhe interno", async () => {
    const muitos = Array.from({ length: LIMITE_FAVORITOS + 1 }, (_, i) => `id-${i}`);
    for (const resposta of [
      await pedir(null, "{não é json"),
      await pedir({ orgSlug: "x", ids: "a" }),
      await pedir({ orgSlug: "x", ids: ["a b"] }),
      await pedir({ orgSlug: "x", ids: muitos }),
      await pedir({ orgSlug: "x", ids: [], organizationId: "forjado" }),
    ]) {
      expect(resposta.status).toBe(400);
      expect(resposta.headers.get("cache-control")).toBe("no-store");
      expect(await resposta.json()).toEqual({ erro: "Pedido inválido." });
    }
  });
});
