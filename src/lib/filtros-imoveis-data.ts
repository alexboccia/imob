import { prisma } from "@/lib/prisma";

export type TipoComCategoria = {
  nome: string;
  categoria: "RESIDENCIAL" | "COMERCIAL" | null;
};

export async function buscarDadosFiltros() {
  const [bairrosDisponiveis, tiposDisponiveis, imoveisComCaracteristicas, catalogoTipos] =
    await Promise.all([
      prisma.imovel.findMany({
        where: { status: "DISPONIVEL" },
        select: { bairro: true },
        distinct: ["bairro"],
        orderBy: { bairro: "asc" },
      }),
      prisma.imovel.findMany({
        where: { status: "DISPONIVEL" },
        select: { tipo: true },
        distinct: ["tipo"],
        orderBy: { tipo: "asc" },
      }),
      prisma.imovel.findMany({
        where: { status: "DISPONIVEL" },
        select: { caracteristicasImovel: true, caracteristicasCondominio: true },
      }),
      prisma.tipoImovelOpcao.findMany(),
    ]);

  const categoriaPorNome = new Map(
    catalogoTipos.map((t) => [t.nome, t.categoria] as const)
  );

  const tipos: TipoComCategoria[] = tiposDisponiveis.map((t) => ({
    nome: t.tipo,
    categoria: categoriaPorNome.get(t.tipo) ?? null,
  }));

  const caracteristicasEmUso = new Set<string>();
  for (const imovel of imoveisComCaracteristicas) {
    imovel.caracteristicasImovel.forEach((c) => caracteristicasEmUso.add(c));
    imovel.caracteristicasCondominio.forEach((c) => caracteristicasEmUso.add(c));
  }

  return {
    bairros: bairrosDisponiveis.map((b) => b.bairro),
    tipos,
    caracteristicas: Array.from(caracteristicasEmUso).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    ),
  };
}
