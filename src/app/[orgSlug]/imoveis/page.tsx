import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImovelCard } from "@/components/ImovelCard";
import { SeletorOrdenacao } from "@/components/SeletorOrdenacao";
import { FiltrosImoveis } from "@/components/FiltrosImoveis";
import { PaginacaoPublica } from "@/components/PaginacaoPublica";
import { paraImovelCard } from "@/lib/imovel-card";
import { buscarDadosFiltros, resolverCorretorDoFiltro } from "@/lib/filtros-imoveis-data";
import { campoPrecoPorFinalidade } from "@/lib/imovel-filtros";
import {
  hrefSemFiltroCorretor,
  interpretarFiltroCorretor,
  PARAM_CORRETOR,
} from "@/lib/filtro-corretor";
import { FiltroCorretorAtivo } from "@/components/FiltroCorretorAtivo";
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
  corretor?: string;
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

  // O id vem cru da URL; quem ele PODE representar é decisão do banco,
  // escopada nesta organização (ver resolverCorretorDoFiltro).
  const corretorSolicitado = interpretarFiltroCorretor(params[PARAM_CORRETOR]);

  const { imoveis, totalCount, dadosFiltros, corretor } = await withOrganization(organizationId, async () => {
    const dadosFiltros = await buscarDadosFiltros(organizationId);
    const corretor = corretorSolicitado
      ? await resolverCorretorDoFiltro(organizationId, corretorSolicitado)
      : null;

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
      // A faceta do corretor é INTERSEÇÃO como qualquer outra: entra no
      // `where`, junto de bairro, tipo, preço e do escopo público de
      // sempre (organizationId + AVAILABLE). Nunca substitui nada, e
      // nunca é aplicada em memória sobre o conjunto completo.
      //
      // Pedido mas não resolvido (id inexistente, de outro tenant, ou de
      // quem despublicou o perfil) devolve ZERO imóvel — nunca o
      // catálogo inteiro. Ignorar o filtro transformaria um id inválido
      // em mais acesso a dados do que o visitante pediu, e manter o
      // recorte sem o portão continuaria revelando "estes imóveis são
      // desta pessoa" depois do opt-out.
      ...(corretor
        ? { responsibleMemberId: corretor.id }
        : corretorSolicitado
          ? { id: { in: [] } }
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
          totalArea: true,
          bathrooms: true,
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

    return { imoveis, totalCount, dadosFiltros, corretor };
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
          // Sem isto, aplicar qualquer filtro pela barra apagaria o
          // corretor: FiltrosImoveis remonta a query do zero a cada
          // busca, e só sobrevive o que ele conhece.
          [PARAM_CORRETOR]: corretorSolicitado ?? "",
        }}
      />

      {/* flex-col sm:flex-row: achado real de responsividade — com a
          tipografia maior/mais pesada da Proposta 2 (TITULO_PAGINA), o
          título dividindo a mesma linha que "Ordenar por" não cabia mais
          em 375px sem quebrar em 3 linhas espremidas. Abaixo de `sm`,
          título e ordenação empilham; a partir daí, voltam a dividir a
          linha como antes. */}
      {/* Contexto do recorte, com o nome de quem ele é e a saída ao lado.
          Só aparece quando o corretor RESOLVE — um id que não passa pelo
          portão de publicação não ganha identidade nesta página. */}
      {corretor && (
        <FiltroCorretorAtivo
          nome={corretor.nome}
          membroId={corretor.id}
          basePath={basePath}
          hrefRemover={hrefSemFiltroCorretor(basePath, params)}
        />
      )}

      <div className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={TITULO_PAGINA}>
          {corretor
            ? `Imóveis de ${corretor.nome}`
            : params.lancamento === "1"
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
        // Filtro de corretor que não resolve: a página diz o que houve
        // sem confirmar se aquele id um dia existiu — a mensagem é a
        // mesma para um cuid inventado, para o id de outro tenant e para
        // quem despublicou o perfil. E oferece a saída, para o visitante
        // que chegou por um link compartilhado não ficar num beco.
        corretorSolicitado && !corretor ? (
          <p className="text-gray-500">
            Este corretor não está mais disponível no site.{" "}
            <Link
              href={hrefSemFiltroCorretor(basePath, params)}
              className="text-link hover:underline"
            >
              Ver imóveis sem este filtro
            </Link>
            .
          </p>
        ) : (
          <p className="text-gray-500">
            Nenhum imóvel encontrado com esses filtros.
          </p>
        )
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
