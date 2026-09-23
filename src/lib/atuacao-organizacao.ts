import { prisma } from "@/lib/prisma";
import { filtroFichaPublica } from "@/lib/visibilidade-imovel";

// Onde a imobiliária ATUA, para a faixa institucional da página de
// anúncio (Fase 60).
//
// NÃO existe campo de endereço em Organization nem em
// OrganizationSettings — conferido no schema. Em vez de inventar um
// campo (migration) ou fixar uma cidade no código (o produto é
// multi-tenant), a informação é DERIVADA de um fato que o tenant já
// mantém: onde estão os imóveis que ele publica.
//
// É a cidade mais frequente entre as fichas públicas da organização.
// Sem imóvel publicado não há resposta possível, e a resposta é null —
// quem renderiza simplesmente não mostra o item, nunca um placeholder.
export type AtuacaoOrganizacao = { cidade: string; estado: string } | null;

export async function buscarAtuacaoOrganizacao(
  organizationId: string
): Promise<AtuacaoOrganizacao> {
  const grupos = await prisma.property.groupBy({
    by: ["city", "state"],
    where: filtroFichaPublica(organizationId),
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });
  const principal = grupos[0];
  if (!principal?.city?.trim()) return null;
  return { cidade: principal.city.trim(), estado: (principal.state ?? "").trim() };
}

/** "São Paulo - SP", ou só a cidade quando o estado não foi preenchido. */
export function formatarAtuacao(atuacao: AtuacaoOrganizacao): string | null {
  if (!atuacao) return null;
  return atuacao.estado ? `${atuacao.cidade} - ${atuacao.estado}` : atuacao.cidade;
}
