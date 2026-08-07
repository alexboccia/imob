import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ImovelCard } from "@/components/ImovelCard";
import { SeletorOrdenacao } from "@/components/SeletorOrdenacao";
import { FiltrosImoveis } from "@/components/FiltrosImoveis";
import { paraImovelCard } from "@/lib/imovel-card";
import { buscarDadosFiltros } from "@/lib/filtros-imoveis-data";
import { getPublicOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Imóveis disponíveis",
  description:
    "Busque apartamentos, casas e imóveis comerciais para comprar ou alugar, com filtros por localização, preço e características.",
};

type SearchParams = {
  busca?: string;
  finalidade?: string;
  tipo?: string | string[];
  bairro?: string | string[];
  caracteristicas?: string | string[];
  precoMin?: string;
  precoMax?: string;
  areaMin?: string;
  areaMax?: string;
  quartos?: string;
  suites?: string;
  vagas?: string;
  categoriaTipo?: string;
  lancamento?: string;
  destaque?: string;
  oportunidade?: string;
  ordenar?: string;
};

function paraArray(valor: string | string[] | undefined): string[] {
  if (!valor) return [];
  return Array.isArray(valor) ? valor : [valor];
}

const ORDENACOES: Record<string, Prisma.PropertyOrderByWithRelationInput> = {
  menor_valor: { price: { sort: "asc", nulls: "last" } },
  maior_valor: { price: { sort: "desc", nulls: "last" } },
  menor_metragem: { totalArea: { sort: "asc", nulls: "last" } },
  maior_metragem: { totalArea: { sort: "desc", nulls: "last" } },
};

export default async function ListaImoveisPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const organizationId = await getPublicOrganizationId();

  const tipos = paraArray(params.tipo);
  const bairros = paraArray(params.bairro);
  const caracteristicas = paraArray(params.caracteristicas);

  const buscaTexto = params.busca?.trim();
  const buscaCodigo = buscaTexto ? Number(buscaTexto.replace(/\D/g, "")) : NaN;

  const precoMin = params.precoMin ? Number(params.precoMin) : undefined;
  const precoMax = params.precoMax ? Number(params.precoMax) : undefined;
  const areaMin = params.areaMin ? Number(params.areaMin) : undefined;
  const areaMax = params.areaMax ? Number(params.areaMax) : undefined;

  const { imoveis, dadosFiltros } = await withOrganization(organizationId, async () => {
    const dadosFiltros = await buscarDadosFiltros(organizationId);

    const tiposDaCategoria =
      tipos.length === 0 && params.categoriaTipo
        ? dadosFiltros.tipos
            .filter((t) => t.categoria === params.categoriaTipo)
            .map((t) => t.nome)
        : [];

    const where: Prisma.PropertyWhereInput = {
      organizationId,
      status: "AVAILABLE",
      ...(buscaTexto
        ? {
            OR: [
              { title: { contains: buscaTexto, mode: "insensitive" } },
              { neighborhood: { contains: buscaTexto, mode: "insensitive" } },
              ...(Number.isInteger(buscaCodigo) ? [{ code: buscaCodigo }] : []),
            ],
          }
        : {}),
      ...(params.finalidade ? { purpose: params.finalidade as never } : {}),
      ...(tipos.length > 0
        ? { type: { in: tipos } }
        : tiposDaCategoria.length > 0
          ? { type: { in: tiposDaCategoria } }
          : {}),
      ...(bairros.length > 0
        ? { neighborhood: { in: bairros, mode: "insensitive" } }
        : {}),
      ...(precoMin !== undefined || precoMax !== undefined
        ? {
            price: {
              ...(precoMin !== undefined ? { gte: precoMin } : {}),
              ...(precoMax !== undefined ? { lte: precoMax } : {}),
            },
          }
        : {}),
      ...(areaMin !== undefined || areaMax !== undefined
        ? {
            totalArea: {
              ...(areaMin !== undefined ? { gte: areaMin } : {}),
              ...(areaMax !== undefined ? { lte: areaMax } : {}),
            },
          }
        : {}),
      ...(params.quartos ? { bedrooms: { gte: Number(params.quartos) } } : {}),
      ...(params.suites ? { suites: { gte: Number(params.suites) } } : {}),
      ...(params.vagas ? { parkingSpots: { gte: Number(params.vagas) } } : {}),
      ...(caracteristicas.length > 0
        ? {
            OR: [
              { propertyFeatures: { hasSome: caracteristicas } },
              { condoFeatures: { hasSome: caracteristicas } },
            ],
          }
        : {}),
      ...(params.lancamento === "1" ? { isLaunch: true } : {}),
      ...(params.destaque === "1" ? { isFeatured: true } : {}),
      ...(params.oportunidade === "1" ? { isOpportunity: true } : {}),
    };

    const orderBy = ORDENACOES[params.ordenar ?? ""] ?? { publishedAt: "desc" };

    const imoveis = await prisma.property.findMany({
      where,
      orderBy,
      include: {
        media: {
          where: { type: "PHOTO" },
          orderBy: [{ isCover: "desc" }, { order: "asc" }],
          take: 5,
        },
      },
    });

    return { imoveis, dadosFiltros };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <FiltrosImoveis
        tipos={dadosFiltros.tipos.map((t) => t.nome)}
        bairros={dadosFiltros.bairros}
        caracteristicas={dadosFiltros.caracteristicas}
        inicial={{
          tipo: tipos,
          finalidade: params.finalidade ?? "",
          bairro: bairros,
          precoMin: params.precoMin ?? "",
          precoMax: params.precoMax ?? "",
          caracteristicas,
        }}
        paramsExtras={{
          busca: params.busca ?? "",
          areaMin: params.areaMin ?? "",
          areaMax: params.areaMax ?? "",
          quartos: params.quartos ?? "",
          suites: params.suites ?? "",
          vagas: params.vagas ?? "",
          categoriaTipo: params.categoriaTipo ?? "",
          lancamento: params.lancamento ?? "",
          destaque: params.destaque ?? "",
          oportunidade: params.oportunidade ?? "",
          ordenar: params.ordenar ?? "",
        }}
      />

      <div className="flex items-center justify-between mb-4 mt-6">
        <h1 className="text-2xl font-semibold">
          {params.lancamento === "1"
            ? "Lançamentos"
            : params.destaque === "1"
              ? "Destaques"
              : params.oportunidade === "1"
                ? "Oportunidades"
                : "Resultados da busca"}{" "}
          <span className="text-gray-400 font-normal text-lg">
            {imoveis.length}{" "}
            {imoveis.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}
          </span>
        </h1>
        <SeletorOrdenacao valorAtual={params.ordenar ?? "relevantes"} />
      </div>

      {imoveis.length === 0 ? (
        <p className="text-gray-500">
          Nenhum imóvel encontrado com esses filtros.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {imoveis.map((imovel) => (
            <ImovelCard key={imovel.id} imovel={paraImovelCard(imovel)} />
          ))}
        </div>
      )}
    </div>
  );
}
