import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { STATUS_IMOVEL_LABEL } from "@/lib/format";
import { filtroFichaPublica } from "@/lib/visibilidade-imovel";
import type { ImovelComparado } from "@/lib/comparador";

// Os imóveis de uma comparação, em UMA consulta (Fase 59).
//
// Mesma doutrina de buscarImoveisFavoritos, e pela mesma razão: os ids
// vêm do navegador e não autorizam nada. A consulta é escopada na
// organização e na regra de ficha pública, então id inexistente, de
// outra organização, rascunho ou inativo têm todos a MESMA resposta —
// ausência. O endpoint não é oráculo de existência.
//
// Select próprio, e não SELECT_IMOVEL_CARD: a comparação precisa de
// campos que o card não usa (condomínio, IPTU, suítes, área privativa,
// características, empreendimento). Estender o select do card faria a
// listagem e os favoritos carregarem colunas que nunca mostram.
const SELECT_COMPARACAO = {
  id: true,
  title: true,
  code: true,
  type: true,
  purpose: true,
  status: true,
  neighborhood: true,
  city: true,
  state: true,
  price: true,
  rentPrice: true,
  condoFee: true,
  propertyTax: true,
  totalArea: true,
  privateArea: true,
  bedrooms: true,
  suites: true,
  bathrooms: true,
  parkingSpots: true,
  propertyFeatures: true,
  condoFeatures: true,
  isLaunch: true,
  development: { select: { name: true } },
  media: {
    where: { type: "PHOTO" },
    orderBy: [{ isCover: "desc" }, { order: "asc" }],
    take: 1,
    select: { url: true },
  },
} satisfies Prisma.PropertySelect;

/** Decimal do Prisma -> número, preservando "não informado" como null. */
function numero(valor: { toString(): string } | null): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor.toString());
  return Number.isFinite(n) ? n : null;
}

export async function buscarImoveisComparacao(
  organizationId: string,
  ids: string[]
): Promise<ImovelComparado[]> {
  if (ids.length === 0) return [];
  const linhas = await prisma.property.findMany({
    where: { ...filtroFichaPublica(organizationId), id: { in: ids } },
    select: SELECT_COMPARACAO,
  });
  const porId = new Map(linhas.map((l) => [l.id, l]));
  // Devolve na ordem pedida: a coluna que o visitante vê primeiro é a
  // que ele selecionou primeiro.
  return ids.flatMap((id) => {
    const l = porId.get(id);
    if (!l) return [];
    return [
      {
        id: l.id,
        titulo: l.title,
        codigo: l.code,
        tipo: l.type,
        finalidade: l.purpose,
        situacao: l.status === "AVAILABLE" ? null : (STATUS_IMOVEL_LABEL[l.status] ?? null),
        bairro: l.neighborhood,
        cidade: l.city,
        estado: l.state,
        preco: numero(l.price),
        precoAluguel: numero(l.rentPrice),
        condominio: numero(l.condoFee),
        iptu: numero(l.propertyTax),
        areaTotal: l.totalArea,
        areaPrivativa: l.privateArea,
        quartos: l.bedrooms,
        suites: l.suites,
        banheiros: l.bathrooms,
        vagas: l.parkingSpots,
        // Unidade e condomínio juntas: para quem compara, "tem piscina"
        // é a mesma pergunta. A distinção de origem continua na ficha.
        caracteristicas: [...l.propertyFeatures, ...l.condoFeatures],
        empreendimento: l.development?.name ?? null,
        lancamento: l.isLaunch,
        foto: l.media[0]?.url ?? null,
      } satisfies ImovelComparado,
    ];
  });
}
