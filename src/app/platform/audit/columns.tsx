"use client";

import { Badge } from "@/components/ui/badge";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";

export type AuditRow = {
  id: string;
  createdAt: string;
  operadorNome: string;
  action: string;
  entity: string;
  entityId: string | null;
  organizationId: string | null;
};

export const auditColumns: DataTableColumn<AuditRow>[] = [
  {
    accessorKey: "createdAt",
    header: "Quando",
    cell: ({ row }) =>
      new Date(row.original.createdAt).toLocaleString("pt-BR"),
  },
  {
    accessorKey: "operadorNome",
    header: "Operador",
  },
  {
    accessorKey: "action",
    header: "Ação",
    cell: ({ row }) => <Badge variant="secondary">{row.original.action}</Badge>,
  },
  {
    accessorKey: "entity",
    header: "Entidade",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.entity}
        {row.original.entityId ? ` · ${row.original.entityId.slice(0, 8)}…` : ""}
      </span>
    ),
  },
  {
    accessorKey: "organizationId",
    header: "Organization",
    cell: ({ row }) =>
      row.original.organizationId ? (
        <span className="text-muted-foreground">
          {row.original.organizationId.slice(0, 8)}…
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];
