import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarImovel } from "@/test/fixtures";
import { buscarVizinhosPublicos } from "@/lib/navegacao-imoveis-data";
import { ORDEM_PUBLICA_PADRAO, visibilidadePublica } from "@/lib/navegacao-imoveis";

// =======================================================================
// Imóvel anterior / próximo imóvel (Fase 48), contra o banco de verdade
// =======================================================================
// A sequência tem de ser a da listagem pública padrão: mesma
// visibilidade, mesma ordem, mesmo desempate — e nunca atravessar
// organizações.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novaOrganizacao() {
  const c = await criarCenario();
  cenarios.push(c);
  return c.organization.id;
}

async function imovel(
  organizationId: string,
  publishedAt: Date | null,
  status: "AVAILABLE" | "DRAFT" | "INACTIVE" | "RESERVED" | "SOLD" = "AVAILABLE"
) {
  const { id } = await criarImovel({ organizationId, status });
  await prisma.property.update({ where: { id, organizationId }, data: { publishedAt } });
  return { id, publishedAt };
}

const dia = (d: number) => new Date(Date.UTC(2026, 0, d, 12));

async function vizinhos(organizationId: string, p: { id: string; publishedAt: Date | null }) {
  return buscarVizinhosPublicos(organizationId, p);
}

// A ordem REAL da listagem pública (mesmo where e orderBy da página).
async function ordemDaListagem(organizationId: string) {
  const lista = await prisma.property.findMany({
    where: visibilidadePublica(organizationId),
    orderBy: ORDEM_PUBLICA_PADRAO,
    select: { id: true },
  });
  return lista.map((i) => i.id);
}

describe("buscarVizinhosPublicos", () => {
  test("A, B, C: o meio tem os dois lados; as pontas, um só", async () => {
    const org = await novaOrganizacao();
    // Listagem: C (mais recente), B, A.
    const a = await imovel(org, dia(1));
    const b = await imovel(org, dia(2));
    const c = await imovel(org, dia(3));
    expect(await ordemDaListagem(org)).toEqual([c.id, b.id, a.id]);

    expect(await vizinhos(org, c)).toEqual({ anteriorId: null, proximoId: b.id });
    expect(await vizinhos(org, b)).toEqual({ anteriorId: c.id, proximoId: a.id });
    expect(await vizinhos(org, a)).toEqual({ anteriorId: b.id, proximoId: null });
  });

  test("um imóvel só: sem anterior e sem próximo (sem loop)", async () => {
    const org = await novaOrganizacao();
    const unico = await imovel(org, dia(1));
    expect(await vizinhos(org, unico)).toEqual({ anteriorId: null, proximoId: null });
  });

  test("empate no instante de publicação e datas nulas: percorre a listagem inteira, sem pular nem repetir", async () => {
    const org = await novaOrganizacao();
    await imovel(org, dia(5));
    await imovel(org, dia(5));
    await imovel(org, dia(5));
    await imovel(org, null);
    await imovel(org, null);
    await imovel(org, dia(2));
    const ordem = await ordemDaListagem(org);
    expect(ordem).toHaveLength(6);

    const posicoes = new Map(
      (await prisma.property.findMany({ where: { organizationId: org }, select: { id: true, publishedAt: true } })).map(
        (p) => [p.id, p]
      )
    );
    // Seguindo "próximo" a partir do primeiro, a sequência é a listagem.
    const percorrida = [ordem[0]];
    for (;;) {
      const { proximoId } = await vizinhos(org, posicoes.get(percorrida.at(-1)!)!);
      if (!proximoId) break;
      percorrida.push(proximoId);
    }
    expect(percorrida).toEqual(ordem);
    // E "anterior", a partir do último, é a listagem ao contrário.
    const volta = [ordem.at(-1)!];
    for (;;) {
      const { anteriorId } = await vizinhos(org, posicoes.get(volta.at(-1)!)!);
      if (!anteriorId) break;
      volta.push(anteriorId);
    }
    expect(volta).toEqual([...ordem].reverse());
  });

  test("tenant: A1 e A2 só se enxergam entre si; B1 fica sozinho", async () => {
    const orgA = await novaOrganizacao();
    const orgB = await novaOrganizacao();
    const a1 = await imovel(orgA, dia(1));
    const a2 = await imovel(orgA, dia(3));
    // B1 publicado ENTRE A2 e A1 — se a organização vazasse, apareceria.
    const b1 = await imovel(orgB, dia(2));

    expect(await vizinhos(orgA, a2)).toEqual({ anteriorId: null, proximoId: a1.id });
    expect(await vizinhos(orgA, a1)).toEqual({ anteriorId: a2.id, proximoId: null });
    expect(await vizinhos(orgB, b1)).toEqual({ anteriorId: null, proximoId: null });
  });

  test("visibilidade: rascunho, inativo, reservado e vendido nunca são vizinhos", async () => {
    const org = await novaOrganizacao();
    const antigo = await imovel(org, dia(1));
    for (const [d, status] of [
      [2, "DRAFT"],
      [3, "INACTIVE"],
      [4, "RESERVED"],
      [5, "SOLD"],
    ] as const) {
      await imovel(org, dia(d), status);
    }
    const recente = await imovel(org, dia(6));

    expect(await ordemDaListagem(org)).toEqual([recente.id, antigo.id]);
    expect(await vizinhos(org, recente)).toEqual({ anteriorId: null, proximoId: antigo.id });
    expect(await vizinhos(org, antigo)).toEqual({ anteriorId: recente.id, proximoId: null });
  });

  test("ficha pública fora da listagem (reservado) navega a partir de onde estaria", async () => {
    const org = await novaOrganizacao();
    const antigo = await imovel(org, dia(1));
    const reservado = await imovel(org, dia(2), "RESERVED");
    const recente = await imovel(org, dia(3));
    expect(await vizinhos(org, reservado)).toEqual({ anteriorId: recente.id, proximoId: antigo.id });
  });
});
