import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImovelCard } from "@/components/ImovelCard";
import { SeletorOrdenacao } from "@/components/SeletorOrdenacao";
import { FiltrosImoveis } from "@/components/FiltrosImoveis";
import { PaginacaoPublica } from "@/components/PaginacaoPublica";
import { paraImovelCard } from "@/lib/imovel-card";
import { buscarDadosFiltros } from "@/lib/filtros-imoveis-data";
import { campoPrecoPorFinalidade } from "@/lib/imovel-filtros";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { withOrganization } from "@/lib/tenant-context";
import { interpretarPaginacao, normalizarBusca, totalDePaginas } from "@/lib/pagination";
import { metadataPaginaPublica } from "@/lib/seo";
import { TITULO_PAGINA } from "@/lib/site-typography";
import type { Prisma } from "@/generated/prisma/client";

// Canonical aponta sempre pra URL base, sem os parâmetros de
// busca/filtro/página — evita conteúdo duplicado no Google entre as
// várias combinações de filtro que renderizam a mesma "página" do ponto
// de vista de SEO. org padrão sem prefixo, demais orgs com prefixo — ver
// plano, decisão #4.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  const basePath = resolverBasePath(orgSlug);
  return metadataPaginaPublica({
    title: "Imóveis disponíveis",
    description:
      "Busque apartamentos, casas e imóveis comerciais para comprar ou alugar, com filtros por localização, preço e características.",
    path: `${basePath}/imoveis`,
    siteName: organization?.name,
  });
}

// Grade de 3 colunas — 12 é um múltiplo redondo de linhas completas.
const PAGE_SIZE_PADRAO_PUBLICO = 12;
const PAGE_SIZE_MAXIMO_PUBLICO = 24;

type SearchParams = {
  page?: string;
  busca?: string;
  finalidade?: string;
  tipo?: string | string[];
  cidade?: string;
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
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { orgSlug } = await routeParams;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) notFound();
  const organizationId = organization.id;
  const basePath = resolverBasePath(orgSlug);
  const params = await searchParams;

  const { page, skip, take } = interpretarPaginacao(params, {
    pageSizePadrao: PAGE_SIZE_PADRAO_PUBLICO,
    pageSizeMaximo: PAGE_SIZE_MAXIMO_PUBLICO,
  });

  const tipos = paraArray(params.tipo);
  const bairros = paraArray(params.bairro);
  const caracteristicas = paraArray(params.caracteristicas);

  const buscaTexto = normalizarBusca(params.busca);
  // "".replace(/\D/g,"") -> "" -> Number("") é 0, não NaN — sem o
  // dígitos ? ... : NaN, uma busca só de texto incluiria por engano a
  // cláusula { code: 0 } no OR.
  const digitosBusca = buscaTexto.replace(/\D/g, "");
  const buscaCodigo = digitosBusca ? Number(digitosBusca) : NaN;

  const precoMin = params.precoMin ? Number(params.precoMin) : undefined;
  const precoMax = params.precoMax ? Number(params.precoMax) : undefined;
  const areaMin = params.areaMin ? Number(params.areaMin) : undefined;
  const areaMax = params.areaMax ? Number(params.areaMax) : undefined;

  const { imoveis, totalCount, dadosFiltros } = await withOrganization(organizationId, async () => {
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
      ...(params.cidade ? { city: { equals: params.cidade, mode: "insensitive" } } : {}),
      ...(bairros.length > 0
        ? { neighborhood: { in: bairros, mode: "insensitive" } }
        : {}),
      // "Comprar" filtra por `price` (venda); "Alugar" filtra por
      // `rentPrice` — nunca o preço de venda pra uma busca de aluguel
      // (ver campoPrecoPorFinalidade, imovel-filtros.ts).
      ...(precoMin !== undefined || precoMax !== undefined
        ? {
            [campoPrecoPorFinalidade(params.finalidade)]: {
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

    const [imoveis, totalCount] = await Promise.all([
      prisma.property.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          title: true,
          type: true,
          purpose: true,
          neighborhood: true,
          city: true,
          state: true,
          price: true,
          rentPrice: true,
          bedrooms: true,
          parkingSpots: true,
          isLaunch: true,
          isFeatured: true,
          isOpportunity: true,
          media: {
            where: { type: "PHOTO" },
            orderBy: [{ isCover: "desc" }, { order: "asc" }],
            take: 5,
            select: { url: true },
          },
        },
      }),
      prisma.property.count({ where }),
    ]);

    return { imoveis, totalCount, dadosFiltros };
  });

  const paginas = totalDePaginas(totalCount, take);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <FiltrosImoveis
        tipos={dadosFiltros.tipos.map((t) => t.nome)}
        bairros={dadosFiltros.bairros.map((b) => b.nome)}
        caracteristicas={dadosFiltros.caracteristicas}
        orgSlug={orgSlug}
        basePath={basePath}
        inicial={{
          tipo: tipos,
          finalidade: params.finalidade ?? "",
          bairro: bairros,
          precoMin: params.precoMin ?? "",
          precoMax: params.precoMax ?? "",
          caracteristicas,
          busca: params.busca ?? "",
        }}
        paramsExtras={{
          cidade: params.cidade ?? "",
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

      {/* flex-col sm:flex-row: achado real de responsividade — com a
          tipografia maior/mais pesada da Proposta 2 (TITULO_PAGINA), o
          título dividindo a mesma linha que "Ordenar por" não cabia mais
          em 375px sem quebrar em 3 linhas espremidas. Abaixo de `sm`,
          título e ordenação empilham; a partir daí, voltam a dividir a
          linha como antes. */}
      <div className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={TITULO_PAGINA}>
          {params.lancamento === "1"
            ? "Lançamentos"
            : params.destaque === "1"
              ? "Destaques"
              : params.oportunidade === "1"
                ? "Oportunidades"
                : "Resultados da busca"}{" "}
          <span className="text-gray-400 font-normal text-lg">
            {totalCount} {totalCount === 1 ? "imóvel encontrado" : "imóveis encontrados"}
          </span>
        </h1>
        <SeletorOrdenacao valorAtual={params.ordenar ?? "relevantes"} />
      </div>

      {imoveis.length === 0 ? (
        <p className="text-gray-500">
          Nenhum imóvel encontrado com esses filtros.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {imoveis.map((imovel) => (
              <ImovelCard
                key={imovel.id}
                imovel={paraImovelCard(imovel)}
                basePath={basePath}
              />
            ))}
          </div>
          <PaginacaoPublica
            basePath={`${basePath}/imoveis`}
            paginaAtual={page}
            totalPaginas={paginas}
            searchParams={params}
          />
        </>
      )}
    </div>
  );
}
