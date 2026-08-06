"use client";

import { useTable, flexRender, type ColumnDef } from "@tanstack/react-table";
import { tableFeaturesUsadas, type TableFeaturesUsadas } from "./table-features";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

const TAMANHOS_PAGINA = [10, 50, 100, 200];

export type DataTableColumn<TData extends Record<string, unknown>> = ColumnDef<
  TableFeaturesUsadas,
  TData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

export function DataTable<TData extends Record<string, unknown>>({
  columns,
  data,
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum registro encontrado.",
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const table = useTable({
    features: tableFeaturesUsadas,
    columns,
    data,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });

  const linhas = table.getRowModel().rows;

  return (
    <div className="space-y-3">
      <Input
        placeholder={searchPlaceholder}
        value={(table.state.globalFilter as string) ?? ""}
        onChange={(e) => table.setGlobalFilter(e.target.value)}
        className="max-w-xs"
      />
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <ArrowUpDown className="size-3.5 text-muted-foreground" />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {linhas.length > 0 ? (
              linhas.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <p>
            Página {table.state.pagination.pageIndex + 1} de{" "}
            {table.getPageCount() || 1} ·{" "}
            {table.getFilteredRowModel().rows.length} registro(s)
          </p>
          <div className="flex items-center gap-1.5">
            <span>Itens por página</span>
            <Select
              value={String(table.state.pagination.pageSize)}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
                table.setPageIndex(0);
              }}
            >
              <SelectTrigger size="sm" className="w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAMANHOS_PAGINA.map((tamanho) => (
                  <SelectItem key={tamanho} value={String(tamanho)}>
                    {tamanho}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Próxima <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
