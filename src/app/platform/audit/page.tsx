import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import { interpretarPaginacao, interpretarFiltros, normalizarBusca } from "@/lib/pagination";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { FiltroDropdown } from "@/components/admin/data-table/FiltroDropdown";
import { auditColumns, type AuditRow } from "./columns";
import type { Prisma } from "@/generated/prisma/client";

type SearchParams = {
  page?: string;
  pageSize?: string;
  search?: string;
  filters?: string;
};

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlatformOperator();
  const params = await searchParams;

  const { page, pageSize, skip, take } = interpretarPaginacao(params);
  const busca = normalizarBusca(params.search);
  const filtros = interpretarFiltros(params.filters, ["action", "platformOperatorId"] as const);

  const where: Prisma.PlatformAuditLogWhereInput = {
    ...(busca
      ? {
          OR: [
            { action: { contains: busca, mode: "insensitive" } },
            { entity: { contains: busca, mode: "insensitive" } },
            { entityId: { contains: busca, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filtros.action ? { action: filtros.action } : {}),
    ...(filtros.platformOperatorId ? { platformOperatorId: filtros.platformOperatorId } : {}),
  };

  const [logs, totalCount, operadores, acoesDistintas] = await Promise.all([
    prisma.platformAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { platformOperator: { select: { name: true } } },
    }),
    prisma.platformAuditLog.count({ where }),
    prisma.platformOperator.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.platformAuditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    }),
  ]);

  const linhas: AuditRow[] = logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    operadorNome: log.platformOperator.name,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    organizationId: log.organizationId,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Audit</h1>

      <div className="mb-3 flex gap-2">
        <FiltroDropdown
          chave="action"
          label="Ação"
          opcoes={acoesDistintas.map((a) => ({ value: a.action, label: a.action }))}
        />
        <FiltroDropdown
          chave="platformOperatorId"
          label="Operador"
          opcoes={operadores.map((o) => ({ value: o.id, label: o.name }))}
        />
      </div>

      <DataTable
        columns={auditColumns}
        data={linhas}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Buscar por ação, entidade ou ID..."
        emptyMessage="Nenhuma ação registrada ainda."
      />
    </div>
  );
}
