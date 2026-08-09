"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  planName: string;
  active: boolean;
  membersCount: number;
  propertiesCount: number;
  createdAt: string;
  siteUrl: string;
};

export const organizationColumns: DataTableColumn<OrganizationRow>[] = [
  {
    accessorKey: "name",
    header: "Nome",
    cell: ({ row }) => (
      <Link
        href={`/platform/organizations/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "slug",
    header: "Slug",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.slug}</span>
    ),
  },
  {
    accessorKey: "planName",
    header: "Plano",
  },
  {
    accessorKey: "active",
    header: "Status",
    cell: ({ row }) =>
      row.original.active ? (
        <Badge className="bg-green-600 text-white">Ativa</Badge>
      ) : (
        <Badge variant="destructive">Suspensa</Badge>
      ),
  },
  {
    accessorKey: "membersCount",
    header: "Usuários",
  },
  {
    accessorKey: "propertiesCount",
    header: "Imóveis",
  },
  {
    accessorKey: "createdAt",
    header: "Criada em",
    cell: ({ row }) =>
      new Date(row.original.createdAt).toLocaleDateString("pt-BR"),
  },
  {
    accessorKey: "siteUrl",
    header: "Ver site",
    cell: ({ row }) => (
      <a
        href={row.original.siteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Ver
      </a>
    ),
  },
];
