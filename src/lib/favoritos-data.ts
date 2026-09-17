import { prisma } from "@/lib/prisma";
import { STATUS_IMOVEL_LABEL } from "@/lib/format";
import { SELECT_IMOVEL_CARD, paraImovelCard } from "@/lib/imovel-card";
import { filtroFichaPublica } from "@/lib/visibilidade-imovel";

export type ImovelFavorito = ReturnType<typeof paraImovelCard> & {
  /** Rótulo da situação quando o imóvel não está mais disponível. */
  situacao: string | null;
};

/**
 * Os imóveis de uma lista de favoritos, em UMA consulta (Fase 49).
 *
 * O localStorage não autoriza nada: a consulta é escopada na
 * organização e na regra de ficha pública, e o que não passa por ambas
 * simplesmente não volta — id inexistente, de outra organização,
 * rascunho ou inativo têm a mesma resposta (ausência). Devolve na ordem
 * pedida.
 */
export async function buscarImoveisFavoritos(
  organizationId: string,
  ids: string[]
): Promise<ImovelFavorito[]> {
  if (ids.length === 0) return [];
  const linhas = await prisma.property.findMany({
    where: { ...filtroFichaPublica(organizationId), id: { in: ids } },
    select: { ...SELECT_IMOVEL_CARD, status: true },
  });
  const porId = new Map(linhas.map((l) => [l.id, l]));
  return ids.flatMap((id) => {
    const linha = porId.get(id);
    if (!linha) return [];
    return [
      {
        ...paraImovelCard(linha),
        situacao: linha.status === "AVAILABLE" ? null : (STATUS_IMOVEL_LABEL[linha.status] ?? null),
      },
    ];
  });
}
