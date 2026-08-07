"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTable, flexRender, type ColumnDef } from "@tanstack/react-table";
import { tableFeaturesUsadas, type TableFeaturesUsadas } from "./table-features";
import { PAGE_SIZE_MAXIMO, totalDePaginas } from "@/lib/pagination";
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

const TAMANHOS_PAGINA = [10, 20, 50, 100].filter((n) => n <= PAGE_SIZE_MAXIMO);

export type DataTableColumn<TData extends Record<string, unknown>> = ColumnDef<
  TableFeaturesUsadas,
  TData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

// Paginação, ordenação e busca acontecem no servidor (Prisma/PostgreSQL) —
// este componente só renderiza a página atual e navega alterando
// searchParams (page/pageSize/search/sort), nunca processa a listagem
// inteira no navegador.
export function DataTable<TData extends Record<string, unknown>>({
  columns,
  data,
  totalCount,
  page,
  pageSize,
  sortableColumns = {},
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum registro encontrado.",
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  totalCount: number;
  page: number;
  pageSize: number;
  /** Mapa "id da coluna" -> "campo aceito pelo servidor no parâmetro sort". */
  sortableColumns?: Record<string, string>;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const table = useTable({
    features: tableFeaturesUsadas,
    columns,
    data,
  });

  const linhas = table.getRowModel().rows;
  const paginas = totalDePaginas(totalCount, pageSize);
  const sortAtual = searchParams.get("sort") ?? "";
  const [sortCampoAtual, sortDirecaoAtual] = sortAtual.split(":");

  // Reseta buscaLocal quando o `search` da URL muda por fora deste
  // componente (voltar no navegador, clicar num link que limpa filtros).
  // Ajustado durante o render (padrão recomendado pelo React pra "resetar
  // estado quando uma prop muda"), não num useEffect — evita o
  // cascading-render de um setState síncrono dentro de efeito.
  const searchNaUrl = searchParams.get("search") ?? "";
  const [buscaLocal, setBuscaLocal] = useState(searchNaUrl);
  const [ultimoSearchNaUrl, setUltimoSearchNaUrl] = useState(searchNaUrl);
  if (searchNaUrl !== ultimoSearchNaUrl) {
    setUltimoSearchNaUrl(searchNaUrl);
    setBuscaLocal(searchNaUrl);
  }

  function navegarCom(alteracoes: Record<string, string | null>) {
    const novo = new URLSearchParams(searchParams.toString());
    for (const [chave, valor] of Object.entries(alteracoes)) {
      if (valor === null || valor === "") novo.delete(chave);
      else novo.set(chave, valor);
    }
    router.push(`${pathname}?${novo.toString()}`);
  }

  // Debounce simples: só atualiza a URL (e refaz a consulta no servidor)
  // 400ms depois da última tecla, pra não disparar uma query por caractere.
  useEffect(() => {
    const atual = searchParams.get("search") ?? "";
    if (buscaLocal === atual) return;
    const id = setTimeout(() => {
      navegarCom({ search: buscaLocal || null, page: null });
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaLocal]);

  function alternarOrdenacao(campo: string) {
    const proximaDirecao = sortCampoAtual === campo && sortDirecaoAtual === "asc" ? "desc" : "asc";
    navegarCom({ sort: `${campo}:${proximaDirecao}`, page: null });
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder={searchPlaceholder}
        value={buscaLocal}
        onChange={(e) => setBuscaLocal(e.target.value)}
        className="max-w-xs"
      />
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const campoOrdenacao = sortableColumns[header.column.id];
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : campoOrdenacao ? (
                        <button
                          type="button"
                          onClick={() => alternarOrdenacao(campoOrdenacao)}
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
                  );
                })}
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
            Página {page} de {paginas} · {totalCount} registro(s)
          </p>
          <div className="flex items-center gap-1.5">
            <span>Itens por página</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => navegarCom({ pageSize: value, page: null })}
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
            onClick={() => navegarCom({ page: String(page - 1) })}
            disabled={page <= 1}
          >
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navegarCom({ page: String(page + 1) })}
            disabled={page >= paginas}
          >
            Próxima <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
