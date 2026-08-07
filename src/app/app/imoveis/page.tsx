import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarCodigoImovel, STATUS_IMOVEL_LABEL } from "@/lib/format";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
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
import { FiltroDropdown } from "@/components/admin/data-table/FiltroDropdown";
import { imovelColumns, type ImovelRow } from "./columns";

// Coluna (id no DataTable) -> campo aceito pelo Prisma no `orderBy`. Só
// esses campos podem ser ordenados — evita orderBy em campo arbitrário
// sem índice de suporte.
const SORT_MAP: Record<string, string> = {
  codigo: "code",
  titulo: "title",
  cidade: "city",
  preco: "price",
  status: "status",
};
const CAMPOS_ORDENAVEIS = Object.values(SORT_MAP);

const STATUS_VALIDOS = new Set(Object.keys(STATUS_IMOVEL_LABEL));

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
  const filtros = interpretarFiltros(params.filters, ["status"] as const);
  const statusFiltro = filtros.status && STATUS_VALIDOS.has(filtros.status) ? filtros.status : undefined;
  const ordenacao = interpretarOrdenacao(params.sort, CAMPOS_ORDENAVEIS, {
    campo: "createdAt",
    direcao: "desc",
  });

  const where = construirWhereImoveis({ organizationId, busca, statusFiltro });

  const [imoveis, totalCount, configContato] = await withOrganization(organizationId, () =>
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
          city: true,
          state: true,
          price: true,
          rentPrice: true,
          status: true,
          responsibleMember: { select: { user: { select: { name: true } } } },
        },
      }),
      prisma.property.count({ where }),
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
    cidade: imovel.city,
    estado: imovel.state,
    preco: imovel.price != null ? Number(imovel.price) : null,
    precoAluguel: imovel.rentPrice != null ? Number(imovel.rentPrice) : null,
    status: imovel.status,
    corretor: imovel.responsibleMember?.user.name ?? "-",
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Imóveis</h1>
        <Button render={<Link href="/app/imoveis/novo" />}>
          + Novo imóvel
        </Button>
      </div>

      <div className="mb-3">
        <FiltroDropdown
          chave="status"
          label="Status"
          opcoes={Object.entries(STATUS_IMOVEL_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <DataTable
        columns={imovelColumns}
        data={linhas}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortableColumns={SORT_MAP}
        searchPlaceholder="Buscar por código, título, tipo, cidade..."
        emptyMessage="Nenhum imóvel cadastrado ainda."
      />
    </div>
  );
}
