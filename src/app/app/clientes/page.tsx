import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import {
  interpretarPaginacao,
  interpretarOrdenacao,
  interpretarFiltros,
  normalizarBusca,
} from "@/lib/pagination";
import { construirWhereClientes } from "@/lib/listagens-admin-query";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { FiltroDropdown } from "@/components/admin/data-table/FiltroDropdown";
import { clienteColumns, ESTAGIO_LABEL, type ClienteRow } from "./columns";
import { CriarClienteForm } from "@/components/admin/CriarClienteForm";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";

const SORT_MAP: Record<string, string> = {
  nome: "name",
  estagioFunil: "pipelineStage",
};
const CAMPOS_ORDENAVEIS = Object.values(SORT_MAP);

const ESTAGIOS_VALIDOS = new Set(Object.keys(ESTAGIO_LABEL));

type SearchParams = {
  page?: string;
  pageSize?: string;
  search?: string;
  sort?: string;
  filters?: string;
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const organizationId = await requireOrganizationId();

  if (!(await hasModule(organizationId, "crm"))) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-6">Clientes</h1>
        <ModuloBloqueado
          titulo="CRM não incluído no seu plano"
          descricao="Gerencie leads, clientes e o funil de vendas em um só lugar."
        />
      </div>
    );
  }

  const params = await searchParams;
  const { page, pageSize, skip, take } = interpretarPaginacao(params);
  const busca = normalizarBusca(params.search);
  const filtros = interpretarFiltros(params.filters, ["estagioFunil"] as const);
  const estagioFiltro =
    filtros.estagioFunil && ESTAGIOS_VALIDOS.has(filtros.estagioFunil)
      ? filtros.estagioFunil
      : undefined;
  const ordenacao = interpretarOrdenacao(params.sort, CAMPOS_ORDENAVEIS, {
    campo: "createdAt",
    direcao: "desc",
  });

  const where = construirWhereClientes({ organizationId, busca, estagioFiltro });

  const [pessoas, totalCount] = await withOrganization(organizationId, () =>
    Promise.all([
      prisma.person.findMany({
        where,
        orderBy: { [ordenacao.campo]: ordenacao.direcao },
        skip,
        take,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          roles: true,
          pipelineStage: true,
          source: true,
          assignedMember: { select: { user: { select: { name: true } } } },
        },
      }),
      prisma.person.count({ where }),
    ])
  );

  const linhas: ClienteRow[] = pessoas.map((pessoa) => ({
    id: pessoa.id,
    nome: pessoa.name,
    contato: pessoa.phone ?? pessoa.email ?? "-",
    papeis: pessoa.roles.join(", "),
    estagioFunil: pessoa.pipelineStage,
    origem: pessoa.source ?? "-",
    corretor: pessoa.assignedMember?.user.name ?? "-",
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Clientes</h1>

      <CriarClienteForm />

      <div className="mb-3">
        <FiltroDropdown
          chave="estagioFunil"
          label="Estágio"
          opcoes={Object.entries(ESTAGIO_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <DataTable
        columns={clienteColumns}
        data={linhas}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortableColumns={SORT_MAP}
        searchPlaceholder="Buscar por nome, telefone ou e-mail..."
        emptyMessage="Nenhum cliente cadastrado ainda."
      />
    </div>
  );
}
