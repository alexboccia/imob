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
import { resumirInteresse, resumirUltimoContato, resumirProximaAcao } from "@/lib/crm-listagem";
import { ESTAGIOS_PIPELINE, ORIGEM_LABEL, PAPEL_LABEL, sanitizarFiltro } from "@/lib/crm-labels";
import { ClientesTabelaComDrawer } from "@/components/admin/clientes/ClientesTabelaComDrawer";
import { ClientesKpiCards } from "@/components/admin/clientes/ClientesKpiCards";
import { ClientesFiltrosEstagio } from "@/components/admin/clientes/ClientesFiltrosEstagio";
import { ClientesFiltrosAvancados } from "@/components/admin/clientes/ClientesFiltrosAvancados";
import { NovoClienteSheet } from "@/components/admin/clientes/NovoClienteSheet";
import { clienteColumns, type ClienteRow } from "./columns";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";

const SORT_MAP: Record<string, string> = {
  nome: "name",
  estagioFunil: "pipelineStage",
};
const CAMPOS_ORDENAVEIS = Object.values(SORT_MAP);

// Allowlists dos 3 filtros de URL desta tela — derivadas das fontes
// centrais já existentes (ESTAGIOS_PIPELINE/ORIGEM_LABEL/PAPEL_LABEL),
// nunca uma lista de valores duplicada à mão. Sanitizados via
// sanitizarFiltro (crm-labels.ts): valor fora da allowlist nunca chega ao
// Prisma como enum inválido (PrismaClientValidationError/HTTP 500).
const ESTAGIOS_VALIDOS = new Set<string>(ESTAGIOS_PIPELINE);
const ORIGENS_VALIDAS = new Set<string>(Object.keys(ORIGEM_LABEL));
const PAPEIS_VALIDOS = new Set<string>(Object.keys(PAPEL_LABEL));
const ESTAGIOS_EM_ATENDIMENTO = ["CONTACTED", "VISIT_SCHEDULED", "PROPOSAL"] as const;
const PROPERTY_INTEREST_ENCERRADOS = ["WON", "REJECTED"] as const;

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
  const filtros = interpretarFiltros(params.filters, ["estagioFunil", "origem", "papel"] as const);
  const estagioFiltro = sanitizarFiltro(filtros.estagioFunil, ESTAGIOS_VALIDOS);
  const origemFiltro = sanitizarFiltro(filtros.origem, ORIGENS_VALIDAS);
  const papelFiltro = sanitizarFiltro(filtros.papel, PAPEIS_VALIDOS);
  const ordenacao = interpretarOrdenacao(params.sort, CAMPOS_ORDENAVEIS, {
    campo: "createdAt",
    direcao: "desc",
  });

  const where = construirWhereClientes({
    organizationId,
    busca,
    estagioFiltro,
    origemFiltro,
    papelFiltro,
  });

  const agora = new Date();
  const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const seteDiasNaFrente = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Todas as contagens e a página atual da listagem num único Promise.all
  // — nenhuma delas depende do resultado de outra, e nenhuma roda em loop
  // por linha (mesmo padrão já usado em src/app/app/page.tsx e
  // src/lib/pipeline.ts).
  const [pessoas, totalCount, totalGeral, novosLeads, novosLeadsSemana, emAtendimento, visitasProximos7Dias] =
    await withOrganization(organizationId, () =>
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
            pipelineStage: true,
            assignedMember: { select: { user: { select: { name: true } } } },
            preference: {
              select: {
                propertyTypes: true,
                transactionType: true,
                neighborhoods: true,
                cities: true,
                minPrice: true,
                maxPrice: true,
                minBedrooms: true,
              },
            },
            interactions: {
              orderBy: { occurredAt: "desc" },
              take: 1,
              select: { occurredAt: true, type: true },
            },
            scheduledActivities: {
              where: { status: "SCHEDULED", scheduledAt: { gte: agora } },
              orderBy: { scheduledAt: "asc" },
              take: 1,
              select: { scheduledAt: true },
            },
            propertyInterests: {
              where: { stage: { notIn: [...PROPERTY_INTEREST_ENCERRADOS] } },
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: { stage: true, property: { select: { status: true } } },
            },
          },
        }),
        prisma.person.count({ where }),
        prisma.person.count({ where: { organizationId } }),
        prisma.person.count({ where: { organizationId, pipelineStage: "NEW_LEAD" } }),
        prisma.person.count({
          where: { organizationId, pipelineStage: "NEW_LEAD", createdAt: { gte: seteDiasAtras } },
        }),
        prisma.person.count({
          where: { organizationId, pipelineStage: { in: [...ESTAGIOS_EM_ATENDIMENTO] } },
        }),
        prisma.scheduledActivity.count({
          where: {
            organizationId,
            status: "SCHEDULED",
            scheduledAt: { gte: agora, lte: seteDiasNaFrente },
          },
        }),
      ])
    );

  const linhas: ClienteRow[] = pessoas.map((pessoa) => {
    const interesseAberto = pessoa.propertyInterests[0]
      ? { stage: pessoa.propertyInterests[0].stage, propertyStatus: pessoa.propertyInterests[0].property.status }
      : null;

    return {
      id: pessoa.id,
      nome: pessoa.name,
      telefone: pessoa.phone,
      email: pessoa.email,
      estagio: pessoa.pipelineStage,
      interesseLinhas: resumirInteresse(pessoa.preference),
      ultimoContato: resumirUltimoContato(pessoa.interactions[0] ?? null),
      proximaAcao: resumirProximaAcao({
        proximaVisita: pessoa.scheduledActivities[0] ?? null,
        interesseAberto,
      }),
      corretorNome: pessoa.assignedMember?.user.name ?? null,
    };
  });

  const temFiltroOuBuscaAtivo = Boolean(busca || estagioFiltro || origemFiltro || papelFiltro);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gerencie leads e clientes do funil de vendas.</p>
        </div>
        <NovoClienteSheet />
      </div>

      <ClientesKpiCards
        total={totalGeral}
        novosLeads={novosLeads}
        novosLeadsSemana={novosLeadsSemana}
        emAtendimento={emAtendimento}
        visitasProximos7Dias={visitasProximos7Dias}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClientesFiltrosEstagio />
        <ClientesFiltrosAvancados />
      </div>

      <ClientesTabelaComDrawer
        columns={clienteColumns}
        data={linhas}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortableColumns={SORT_MAP}
        temFiltroOuBuscaAtivo={temFiltroOuBuscaAtivo}
      />
    </div>
  );
}
