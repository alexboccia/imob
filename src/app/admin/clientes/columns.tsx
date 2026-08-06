"use client";

import Link from "next/link";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";

const ESTAGIO_LABEL: Record<string, string> = {
  NOVO_LEAD: "Novo lead",
  CONTATO_FEITO: "Contato feito",
  VISITA_AGENDADA: "Visita agendada",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

export type ClienteRow = {
  id: string;
  nome: string;
  contato: string;
  papeis: string;
  estagioFunil: string;
  origem: string;
  corretor: string;
};

export const clienteColumns: DataTableColumn<ClienteRow>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => (
      <Link
        href={`/admin/clientes/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.nome}
      </Link>
    ),
  },
  {
    accessorKey: "contato",
    header: "Contato",
  },
  {
    accessorKey: "papeis",
    header: "Papéis",
  },
  {
    accessorKey: "estagioFunil",
    header: "Estágio",
    cell: ({ row }) =>
      ESTAGIO_LABEL[row.original.estagioFunil] ?? row.original.estagioFunil,
  },
  {
    accessorKey: "origem",
    header: "Origem",
  },
  {
    accessorKey: "corretor",
    header: "Corretor",
  },
];
