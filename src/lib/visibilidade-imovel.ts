import type { Prisma } from "@/generated/prisma/client";

// =======================================================================
// Quem o site público mostra — dois recortes, uma fonte
// =======================================================================
// LISTAGEM (/imoveis, anterior/próximo da ficha): só o que está à venda
// ou para alugar agora.
//
// FICHA (/imoveis/[id], favoritos): tudo que não é rascunho nem inativo.
// Reservado, vendido e alugado continuam com ficha pública — é assim que
// /vendidos e links antigos continuam funcionando.
// =======================================================================

/** Quem aparece na listagem pública sem filtro. */
export function visibilidadePublica(organizationId: string) {
  return { organizationId, status: "AVAILABLE" } satisfies Prisma.PropertyWhereInput;
}

export const STATUS_SEM_FICHA_PUBLICA = ["DRAFT", "INACTIVE"] as const;

export function fichaEhPublica(status: string): boolean {
  return !(STATUS_SEM_FICHA_PUBLICA as readonly string[]).includes(status);
}

/** Quem tem ficha pública (a mesma regra de fichaEhPublica, no banco). */
export function filtroFichaPublica(organizationId: string) {
  return {
    organizationId,
    status: { notIn: [...STATUS_SEM_FICHA_PUBLICA] },
  } satisfies Prisma.PropertyWhereInput;
}
