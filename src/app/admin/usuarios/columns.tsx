"use client";

import Link from "next/link";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";

const PAPEL_BADGE_CLASS: Record<string, string> = {
  ADMINISTRADOR: "bg-black text-white",
  GESTOR: "bg-blue-600 text-white",
  CORRETOR: "bg-secondary text-secondary-foreground",
};

export type UsuarioRow = {
  id: string;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
  ehVoceMesmo: boolean;
};

export const usuarioColumns: DataTableColumn<UsuarioRow>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => (
      <Link
        href={`/admin/usuarios/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.nome}
        {row.original.ehVoceMesmo && (
          <span className="ml-2 text-xs text-muted-foreground">(você)</span>
        )}
      </Link>
    ),
  },
  {
    accessorKey: "email",
    header: "E-mail",
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
    id: "ativo",
    accessorFn: (row) => (row.ativo ? "Ativo" : "Inativo"),
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.ativo ? "secondary" : "destructive"}>
        {row.original.ativo ? "Ativo" : "Inativo"}
      </Badge>
    ),
  },
];
