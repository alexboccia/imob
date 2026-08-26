import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  formatarCodigoImovel,
  FINALIDADE_LABEL,
  STATUS_IMOVEL_LABEL,
} from "@/lib/format";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { buscarOpcoesTiposImovel } from "@/lib/tipos-imovel";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import {
  interpretarPaginacao,
  interpretarOrdenacao,
  interpretarFiltros,
  normalizarBusca,
} from "@/lib/pagination";
import { construirWhereImoveis } from "@/lib/listagens-admin-query";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { ImoveisKpiCards } from "@/components/admin/imoveis/ImoveisKpiCards";
import { ImoveisFiltrosBar } from "@/components/admin/imoveis/ImoveisFiltrosBar";
import { ImovelCardMobile } from "@/components/admin/imoveis/ImovelCardMobile";
import { imovelColumns, type ImovelRow } from "./columns";

// Coluna (id no DataTable) -> campo aceito pelo Prisma no `orderBy`. Só
// "localizacao"/"preco"/"status" passam por aqui — "code"/"title" ficam
// FORA de propósito (mesma razão de "nome" em Usuários): a coluna
// "Imóvel" tem cabeçalho próprio com dois alvos de ordenação
// independentes (ImovelColunaOrdenacao), não o botão automático do
// DataTable.
const SORT_MAP: Record<string, string> = {
  localizacao: "city",
  preco: "price",
  status: "status",
};
// Allowlist completa de campos ordenáveis (inclui code/title, tratados
// pelo cabeçalho custom acima, além dos 3 que passam pelo SORT_MAP) —
// mesmo padrão de CAMPOS_ORDENAVEIS em usuarios/page.tsx.
const CAMPOS_ORDENAVEIS = ["code", "title", "city", "price", "status"] as const;

const STATUS_VALIDOS = new Set(Object.keys(STATUS_IMOVEL_LABEL));
const FINALIDADE_VALIDOS = new Set(Object.keys(FINALIDADE_LABEL));

type SearchParams = {
  page?: string;
  pageSize?: string;
  search?: string;
  sort?: string;
  filters?: string;
};

export default async function AdminImoveisPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const organizationId = await requireOrganizationId();

  const { page, pageSize, skip, take } = interpretarPaginacao(params);
  const busca = normalizarBusca(params.search);
  const filtros = interpretarFiltros(params.filters, ["status", "tipo", "finalidade"] as const);
  const statusFiltro = filtros.status && STATUS_VALIDOS.has(filtros.status) ? filtros.status : undefined;
  const finalidadeFiltro =
    filtros.finalidade && FINALIDADE_VALIDOS.has(filtros.finalidade) ? filtros.finalidade : undefined;
  const ordenacao = interpretarOrdenacao(params.sort, CAMPOS_ORDENAVEIS, {
    campo: "createdAt",
    direcao: "desc",
  });

  // Opções de Tipo são por organização (PropertyTypeOption, configurável —
  // mesma fonte de verdade já usada em Novo/Editar imóvel), nunca uma
  // lista fixa: reaproveita buscarOpcoesTiposImovel em vez de duplicar.
  const { opcoesResidencial, opcoesComercial } = await buscarOpcoesTiposImovel(organizationId);
  const tipoOpcoes = [...new Set([...opcoesResidencial, ...opcoesComercial])];
  const TIPO_VALIDOS = new Set(tipoOpcoes);
  const tipoFiltro = filtros.tipo && TIPO_VALIDOS.has(filtros.tipo) ? filtros.tipo : undefined;

  const where = construirWhereImoveis({ organizationId, busca, statusFiltro, tipoFiltro, finalidadeFiltro });

  // Listagem da página atual + total filtrado + os 4 KPIs (sempre GLOBAIS,
  // não aplicam busca/filtro — mesmo racional de Clientes/Usuários) + a
  // configuração de prefixo do código, tudo num único Promise.all — 6
  // queries baratas (1 findMany enxuto + 5 count), nenhuma delas em loop
  // por linha.
  const [imoveis, totalCount, total, disponiveis, oportunidades, destaques, configContato] =
    await withOrganization(organizationId, () =>
      Promise.all([
        prisma.property.findMany({
          where,
          orderBy: { [ordenacao.campo]: ordenacao.direcao },
          skip,
          take,
          select: {
            id: true,
            code: true,
            title: true,
            isLaunch: true,
            isFeatured: true,
            isOpportunity: true,
            hasSlideshow: true,
            type: true,
            purpose: true,
            neighborhood: true,
            city: true,
            state: true,
            price: true,
            rentPrice: true,
            status: true,
          },
        }),
        prisma.property.count({ where }),
        prisma.property.count({ where: { organizationId } }),
        prisma.property.count({ where: { organizationId, status: "AVAILABLE" } }),
        prisma.property.count({ where: { organizationId, isOpportunity: true } }),
        prisma.property.count({ where: { organizationId, isFeatured: true } }),
        buscarConfiguracaoContato(organizationId),
      ])
    );

  const linhas: ImovelRow[] = imoveis.map((imovel) => ({
    id: imovel.id,
    codigo: imovel.code,
    codigoFormatado: formatarCodigoImovel(
      imovel.code,
      configContato.codigoImovelPrefixo
    ),
    titulo: imovel.title,
    lancamento: imovel.isLaunch,
    destaque: imovel.isFeatured,
    oportunidade: imovel.isOpportunity,
    slideshow: imovel.hasSlideshow,
    tipo: imovel.type,
    finalidade: imovel.purpose,
    bairro: imovel.neighborhood || null,
    cidade: imovel.city,
    estado: imovel.state,
    preco: imovel.price != null ? Number(imovel.price) : null,
    precoAluguel: imovel.rentPrice != null ? Number(imovel.rentPrice) : null,
    status: imovel.status,
  }));

  const temFiltroOuBuscaAtivo = Boolean(busca || statusFiltro || tipoFiltro || finalidadeFiltro);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Imóveis</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seu portfólio de imóveis e acompanhe disponibilidade, finalidade e oportunidades.
          </p>
        </div>
        {/* min-w-0 shrink whitespace-normal: mesma correção do Finding #2
            da auditoria de Usuários (aplicada aqui em vez de reproduzida) —
            "+ Novo imóvel" é 2 caracteres mais longo que "Novo usuário", o
            suficiente pra estourar os mesmos ~2px de sobra que a versão
            shrink-0 padrão do design system já deixava por pouco em
            Usuários a 360px (medido: scrollWidth 362 vs innerWidth 360
            antes desta correção). */}
        <Button
          nativeButton={false}
          render={<Link href="/app/imoveis/novo" />}
          className="min-w-0 shrink whitespace-normal"
        >
          + Novo imóvel
        </Button>
      </div>

      <ImoveisKpiCards
        total={total}
        disponiveis={disponiveis}
        oportunidades={oportunidades}
        destaques={destaques}
      />

      <ImoveisFiltrosBar
        statusOpcoes={Object.entries(STATUS_IMOVEL_LABEL).map(([value, label]) => ({ value, label }))}
        tipoOpcoes={tipoOpcoes}
        finalidadeOpcoes={Object.entries(FINALIDADE_LABEL).map(([value, label]) => ({ value, label }))}
      />

      <DataTable
        columns={imovelColumns}
        data={linhas}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortableColumns={SORT_MAP}
        hideSearchBar
        emptyMessage={
          temFiltroOuBuscaAtivo
            ? "Nenhum imóvel encontrado com esses filtros."
            : "Nenhum imóvel cadastrado ainda."
        }
        cards={linhas.map((imovel) => (
          <ImovelCardMobile key={imovel.id} imovel={imovel} />
        ))}
      />
    </div>
  );
}
