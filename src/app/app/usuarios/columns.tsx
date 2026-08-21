"use client";

import Link from "next/link";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { UsuarioAcoesCell } from "@/components/admin/usuarios/UsuarioAcoesCell";
import { UsuarioColunaOrdenacao } from "@/components/admin/usuarios/UsuarioColunaOrdenacao";
import { PAPEL_BADGE_CLASS, STATUS_MEMBRO_LABEL, STATUS_MEMBRO_BADGE_VARIANT } from "@/components/admin/usuarios/usuarios-visual";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";

export type UsuarioRow = {
  id: string;
  nome: string;
  email: string;
  papel: string;
  status: string;
  ativo: boolean;
  ehVoceMesmo: boolean;
  podeGerenciar: boolean;
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase() || "?";
}

export const usuarioColumns: DataTableColumn<UsuarioRow>[] = [
  {
    accessorKey: "nome",
    header: () => <UsuarioColunaOrdenacao />,
    cell: ({ row }) => (
      <Link
        href={`/app/usuarios/${row.original.id}`}
        className="flex min-w-0 items-center gap-2.5 hover:underline"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
          {iniciais(row.original.nome)}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{row.original.nome}</span>
            {row.original.ehVoceMesmo && (
              <span className="shrink-0 text-xs font-normal text-muted-foreground">(você)</span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{row.original.email}</span>
        </span>
      </Link>
    ),
  },
  {
    accessorKey: "papel",
    header: "Papel",
    cell: ({ row }) => (
      <Badge className={PAPEL_BADGE_CLASS[row.original.papel]}>
        {PAPEL_USUARIO_LABEL[row.original.papel] ?? row.original.papel}
      </Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={STATUS_MEMBRO_BADGE_VARIANT[row.original.status] ?? "outline"}>
        {STATUS_MEMBRO_LABEL[row.original.status] ?? row.original.status}
      </Badge>
    ),
  },
  {
    id: "acoes",
    header: "Ações",
    cell: ({ row }) => (
      <UsuarioAcoesCell
        membershipId={row.original.id}
        ativo={row.original.ativo}
        ehVoceMesmo={row.original.ehVoceMesmo}
        podeGerenciar={row.original.podeGerenciar}
      />
    ),
  },
];
