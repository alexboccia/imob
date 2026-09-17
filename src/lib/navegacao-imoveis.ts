import type { Prisma } from "@/generated/prisma/client";

// =======================================================================
// Imóvel anterior / próximo imóvel (Fase 48)
// =======================================================================
// A sequência é a da LISTAGEM PÚBLICA (/imoveis) sem filtro nenhum:
// mesmos critérios de visibilidade e mesma ordem padrão. Ordem de
// filtros ou de outra ordenação escolhida pelo visitante NÃO é
// preservada — decisão do MVP: a ficha não sabe de onde o visitante
// veio, e carregar esse contexto na URL fica para quando houver
// necessidade real.
//
// Ordem padrão: publicados mais recentes primeiro. O Postgres ordena
// NULL antes em DESC — o `nulls: "first"` só torna isso explícito — e o
// `id` desempata: sem ele, dois imóveis publicados no mesmo instante
// não teriam ordem definida, e "próximo" poderia devolver o anterior. A
// listagem usa exatamente esta mesma lista (ORDEM_PUBLICA_PADRAO), então
// o desempate é a ordem real, não uma invenção da navegação.
// =======================================================================

export const ORDEM_PUBLICA_PADRAO = [
  { publishedAt: { sort: "desc", nulls: "first" } },
  { id: "desc" },
] satisfies Prisma.PropertyOrderByWithRelationInput[];

// A ordem inversa (para achar o ANTERIOR com take 1).
const ORDEM_PUBLICA_INVERSA = [
  { publishedAt: { sort: "asc", nulls: "last" } },
  { id: "asc" },
] satisfies Prisma.PropertyOrderByWithRelationInput[];

/** Quem aparece na listagem pública sem filtro. */
export function visibilidadePublica(organizationId: string) {
  return { organizationId, status: "AVAILABLE" } satisfies Prisma.PropertyWhereInput;
}

export type PosicaoNaOrdem = { id: string; publishedAt: Date | null };

/**
 * As duas consultas (take 1 cada) que acham os vizinhos de uma posição
 * na ordem pública. Não exigem que a posição esteja na listagem: um
 * imóvel RESERVADO ou VENDIDO — cuja ficha continua pública — navega a
 * partir de onde estaria, e nunca aparece como vizinho de ninguém.
 */
export function consultasVizinhos(organizationId: string, posicao: PosicaoNaOrdem) {
  const { id, publishedAt } = posicao;
  const base = visibilidadePublica(organizationId);

  // Depois da posição na ordem (publishedAt DESC NULLS FIRST, id DESC).
  const depois: Prisma.PropertyWhereInput =
    publishedAt === null
      ? { OR: [{ publishedAt: null, id: { lt: id } }, { publishedAt: { not: null } }] }
      : { OR: [{ publishedAt, id: { lt: id } }, { publishedAt: { lt: publishedAt } }] };

  // Antes da posição.
  const antes: Prisma.PropertyWhereInput =
    publishedAt === null
      ? { publishedAt: null, id: { gt: id } }
      : {
          OR: [
            { publishedAt, id: { gt: id } },
            { publishedAt: { gt: publishedAt } },
            { publishedAt: null },
          ],
        };

  // organizationId no nível de cima do where: é onde a guarda de tenant
  // do cliente Prisma (src/lib/prisma.ts) procura.
  return {
    anterior: { where: { ...base, AND: [antes] }, orderBy: ORDEM_PUBLICA_INVERSA },
    proximo: { where: { ...base, AND: [depois] }, orderBy: ORDEM_PUBLICA_PADRAO },
  };
}

/** A mesma comparação das consultas acima, para listas em memória. */
export function compararOrdemPublica(a: PosicaoNaOrdem, b: PosicaoNaOrdem): number {
  if (a.publishedAt === null || b.publishedAt === null) {
    if (a.publishedAt !== b.publishedAt) return a.publishedAt === null ? -1 : 1;
  } else if (a.publishedAt.getTime() !== b.publishedAt.getTime()) {
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function hrefDoImovel(basePath: string, id: string): string {
  return `${basePath}/imoveis/${encodeURIComponent(id)}`;
}
