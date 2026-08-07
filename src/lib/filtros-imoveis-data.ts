import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tagFacetas } from "@/lib/cache-tags";

export type TipoComCategoria = {
  nome: string;
  categoria: "RESIDENTIAL" | "COMMERCIAL" | null;
};

async function buscarDadosFiltrosSemCache(organizationId: string) {
  const [bairrosDisponiveis, tiposDisponiveis, imoveisComCaracteristicas, catalogoTipos] =
    await Promise.all([
      prisma.property.findMany({
        where: { organizationId, status: "AVAILABLE" },
        select: { neighborhood: true },
        distinct: ["neighborhood"],
        orderBy: { neighborhood: "asc" },
      }),
      prisma.property.findMany({
        where: { organizationId, status: "AVAILABLE" },
        select: { type: true },
        distinct: ["type"],
        orderBy: { type: "asc" },
      }),
      prisma.property.findMany({
        where: { organizationId, status: "AVAILABLE" },
        select: { propertyFeatures: true, condoFeatures: true },
      }),
      prisma.propertyTypeOption.findMany({ where: { organizationId } }),
    ]);

  const categoriaPorNome = new Map(
    catalogoTipos.map((t) => [t.name, t.category] as const)
  );

  const tipos: TipoComCategoria[] = tiposDisponiveis.map((t) => ({
    nome: t.type,
    categoria: categoriaPorNome.get(t.type) ?? null,
  }));

  const caracteristicasEmUso = new Set<string>();
  for (const imovel of imoveisComCaracteristicas) {
    imovel.propertyFeatures.forEach((c) => caracteristicasEmUso.add(c));
    imovel.condoFeatures.forEach((c) => caracteristicasEmUso.add(c));
  }

  return {
    bairros: bairrosDisponiveis.map((b) => b.neighborhood),
    tipos,
    caracteristicas: Array.from(caracteristicasEmUso).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    ),
  };
}

// Facetas de filtro (bairros/tipos/características em uso) — recalculadas
// hoje em toda visita à home e à listagem pública, varrendo todos os
// imóveis disponíveis. Cacheadas por organização, com dupla garantia de
// atualização: invalidação explícita (updateTag) sempre que um imóvel
// ou o catálogo de tipos/características muda, e um TTL de 5 minutos como
// rede de segurança caso algum ponto de mutação futuro esqueça de invalidar.
export async function buscarDadosFiltros(organizationId: string) {
  return unstable_cache(
    buscarDadosFiltrosSemCache,
    ["dados-filtros-imoveis", organizationId],
    { tags: [tagFacetas(organizationId)], revalidate: 300 }
  )(organizationId);
}
