"use client";

import Link from "next/link";
import {
  FINALIDADE_LABEL,
  STATUS_IMOVEL_LABEL,
  formatarPreco,
  rotulosAtivos,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";

export type ImovelRow = {
  id: string;
  codigo: number;
  codigoFormatado: string;
  titulo: string;
  lancamento: boolean;
  destaque: boolean;
  oportunidade: boolean;
  slideshow: boolean;
  tipo: string;
  finalidade: string;
  cidade: string;
  estado: string;
  preco: number | null;
  precoAluguel: number | null;
  status: string;
  corretor: string;
};

export const imovelColumns: DataTableColumn<ImovelRow>[] = [
  {
    accessorKey: "codigo",
    header: "Código",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.codigoFormatado}
      </span>
    ),
  },
  {
    accessorKey: "titulo",
    header: "Título",
    cell: ({ row }) => (
      <div>
        <Link
          href={`/admin/imoveis/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.titulo}
        </Link>
        {rotulosAtivos(row.original).map((rotulo) => (
          <Badge key={rotulo.chave} className={`ml-2 ${rotulo.className}`}>
            {rotulo.label}
          </Badge>
        ))}
        {row.original.slideshow && (
          <Badge className="ml-2 bg-purple-600 text-white">Slideshow</Badge>
        )}
      </div>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
  },
  {
    accessorKey: "finalidade",
    header: "Finalidade",
    cell: ({ row }) =>
      FINALIDADE_LABEL[
        row.original.finalidade as keyof typeof FINALIDADE_LABEL
      ] ?? row.original.finalidade,
  },
  {
    accessorKey: "cidade",
    header: "Cidade",
    cell: ({ row }) => `${row.original.cidade} - ${row.original.estado}`,
  },
  {
    id: "preco",
    accessorFn: (row) => row.preco ?? row.precoAluguel ?? null,
    header: "Preço",
    cell: ({ row }) => {
      const { preco, precoAluguel } = row.original;
      if (preco == null && precoAluguel == null) return "-";
      return (
        <>
          {preco != null && formatarPreco(preco)}
          {preco != null && precoAluguel != null && " · "}
          {precoAluguel != null && `${formatarPreco(precoAluguel)}/mês`}
        </>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="secondary">
        {STATUS_IMOVEL_LABEL[
          row.original.status as keyof typeof STATUS_IMOVEL_LABEL
        ] ?? row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "corretor",
    header: "Corretor",
  },
];
