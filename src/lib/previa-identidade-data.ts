import { prisma } from "@/lib/prisma";
import { SELECT_IMOVEL_CARD, paraImovelCard } from "@/lib/imovel-card";
import { filtroFichaPublica } from "@/lib/visibilidade-imovel";
import { formatarPreco, FINALIDADE_LABEL } from "@/lib/format";

// Imóveis REAIS para a prévia da identidade visual (Fase 62).
//
// A prévia antiga desenhava três cartões fictícios (retângulos cinza e
// barrinhas no lugar do texto). O administrador via cores certas numa
// maquete que não era o site dele. Aqui o card do preview passa a mostrar
// a foto de capa, o título, o bairro/cidade e o preço dos imóveis que
// estão publicados AGORA.
//
// Reaproveita o que a listagem pública já usa, sem consulta nova inventada:
//   - filtroFichaPublica: a MESMA regra de elegibilidade pública (e o
//     escopo de tenant, pelo organizationId);
//   - SELECT_IMOVEL_CARD / paraImovelCard: as MESMAS colunas e o mesmo DTO
//     do ImovelCard público;
//   - formatarPreco / FINALIDADE_LABEL: a MESMA formatação de preço e
//     rótulo de finalidade.
//
// Três imóveis porque é o que cabe na largura da coluna do preview. A
// ordem é a mesma da vitrine (destaque primeiro, depois os mais recentes),
// então a prévia tende a mostrar o que o visitante veria no topo da Home.
export type ImovelPrevia = {
  id: string;
  titulo: string;
  local: string;
  preco: string;
  finalidade: string;
  foto: string | null;
};

export async function buscarImoveisPrevia(organizationId: string): Promise<ImovelPrevia[]> {
  const linhas = await prisma.property.findMany({
    where: filtroFichaPublica(organizationId),
    select: SELECT_IMOVEL_CARD,
    orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
    take: 3,
  });

  return linhas.map((linha) => {
    const card = paraImovelCard(linha);
    // Aluguel usa rentPrice; venda usa price — a mesma decisão que o card
    // público toma, e é o que evita mostrar "R$ 0" num imóvel de locação.
    const aluguel = card.finalidade === "RENT";
    const valor = aluguel ? card.precoAluguel : card.preco;
    return {
      id: card.id,
      titulo: card.titulo,
      local: `${card.bairro}, ${card.cidade}`,
      preco: valor ? formatarPreco(valor) : "Consulte",
      finalidade: FINALIDADE_LABEL[card.finalidade] ?? card.finalidade,
      foto: card.midias[0]?.url ?? null,
    };
  });
}
