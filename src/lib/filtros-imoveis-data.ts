import { prisma } from "@/lib/prisma";

export type TipoComCategoria = {
  nome: string;
  categoria: "RESIDENTIAL" | "COMMERCIAL" | null;
};

export async function buscarDadosFiltros(organizationId: string) {
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
