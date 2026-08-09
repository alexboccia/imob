import Link from "next/link";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import {
  interpretarPaginacao,
  interpretarFiltros,
  normalizarBusca,
} from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { FiltroDropdown } from "@/components/admin/data-table/FiltroDropdown";
import { organizationColumns, type OrganizationRow } from "./columns";
import type { Prisma } from "@/generated/prisma/client";

type SearchParams = {
  page?: string;
  pageSize?: string;
  search?: string;
  filters?: string;
};

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlatformOperator();
  const params = await searchParams;

  const { page, pageSize, skip, take } = interpretarPaginacao(params);
  const busca = normalizarBusca(params.search);
  const filtros = interpretarFiltros(params.filters, ["status", "planId"] as const);

  // Organization não é tenant-scoped — consulta direto via `prisma`, sem
  // bypass, sem withOrganization(). A paginação acontece toda no
  // Postgres (skip/take), nunca carregando a lista inteira pro front.
  const where: Prisma.OrganizationWhereInput = {
    ...(busca
      ? {
          OR: [
            { name: { contains: busca, mode: "insensitive" } },
            { slug: { contains: busca, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filtros.status === "active" ? { active: true } : {}),
    ...(filtros.status === "suspended" ? { active: false } : {}),
    ...(filtros.planId ? { planId: filtros.planId } : {}),
  };

  const [organizations, totalCount, planos] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        name: true,
        slug: true,
        active: true,
        createdAt: true,
        plan: { select: { name: true } },
        _count: { select: { members: true, properties: true } },
      },
    }),
    prisma.organization.count({ where }),
    prisma.plan.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const linhas: OrganizationRow[] = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    planName: org.plan.name,
    active: org.active,
    membersCount: org._count.members,
    propertiesCount: org._count.properties,
    createdAt: org.createdAt.toISOString(),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <Button nativeButton={false} render={<Link href="/platform/organizations/nova" />}>
          + Nova organization
        </Button>
      </div>

      <div className="mb-3 flex gap-2">
        <FiltroDropdown
          chave="status"
          label="Status"
          opcoes={[
            { value: "active", label: "Ativa" },
            { value: "suspended", label: "Suspensa" },
          ]}
        />
        <FiltroDropdown
          chave="planId"
          label="Plano"
          opcoes={planos.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>

      <DataTable
        columns={organizationColumns}
        data={linhas}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Buscar por nome ou slug..."
        emptyMessage="Nenhuma organization cadastrada ainda."
      />
    </div>
  );
}
