"use client";

import { type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTable, flexRender, type ColumnDef } from "@tanstack/react-table";
import { tableFeaturesUsadas, type TableFeaturesUsadas } from "./table-features";
import { PAGE_SIZE_MAXIMO, totalDePaginas } from "@/lib/pagination";
import { TableSearchInput } from "./TableSearchInput";
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
  hideSearchBar = false,
  emptyMessage = "Nenhum registro encontrado.",
  onRowClick,
  cards,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  totalCount: number;
  page: number;
  pageSize: number;
  /** Mapa "id da coluna" -> "campo aceito pelo servidor no parâmetro sort". */
  sortableColumns?: Record<string, string>;
  searchPlaceholder?: string;
  /** Opcional — quando true, suprime a busca própria deste componente
   * (mesma lógica, agora em TableSearchInput.tsx, continua sendo a
   * padrão aqui embaixo). Usado só por Imóveis (redesenho dos filtros),
   * que renderiza seu próprio <TableSearchInput> dentro do card de
   * Status/Tipo/Finalidade em vez de deixá-lo aqui. Default `false`
   * preserva exatamente o comportamento/posição atuais nas outras 4
   * telas que usam DataTable (Usuários, Clientes, Organizations, Audit) —
   * nenhuma delas passa esta prop, então nada muda para elas. */
  hideSearchBar?: boolean;
  /** Aceita ReactNode (não só texto) desde o redesenho de Clientes — a
   * tela de Clientes usa isso pra incluir um botão "Adicionar primeiro
   * cliente" no estado vazio, mas continua funcionando com string simples
   * nas outras 4 telas que já usam DataTable (nenhuma delas muda). */
  emptyMessage?: ReactNode;
  /** Opcional — quando presente, a linha vira clicável (cursor-pointer +
   * onClick). Nenhuma das 5 telas que já usam DataTable passa isso hoje,
   * então o comportamento delas não muda (aditivo, ver Fase de redesenho
   * de Clientes). Cliques em elementos interativos dentro da linha (link,
   * botão) continuam funcionando normalmente — o clique só propagaria até
   * aqui se não for capturado antes por eles. */
  onRowClick?: (row: TData) => void;
  /** Opcional — quando presente, `<table>` fica restrita a `md:` e acima
   * (`hidden md:block` no wrapper) e esta lista (um card JÁ RENDERIZADO
   * por linha de `data`, na mesma ordem) aparece abaixo de `md`
   * (redesenho de Imóveis, primeira tela a precisar de layout mobile !=
   * tabela espremida). ReactNode pré-renderizado, não uma função — este
   * componente é "use client" e page.tsx (Server Component) não pode
   * passar uma função como prop através da fronteira Server->Client (RSC
   * serialization error, achado real ao implementar isto: "Functions
   * cannot be passed directly to Client Components"); um array de
   * elementos já renderizados no servidor cruza essa fronteira
   * normalmente, mesma categoria de `emptyMessage`/`children`. Nenhuma
   * das outras 4 telas que usam DataTable passa isso hoje — sem a prop, o
   * wrapper da tabela mantém exatamente a mesma className de sempre, em
   * todos os breakpoints, então o comportamento delas não muda em nada
   * (aditivo, mesmo racional de onRowClick acima). Busca e paginação
   * continuam únicas e compartilhadas entre os dois layouts. */
  cards?: ReactNode[];
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

  function navegarCom(alteracoes: Record<string, string | null>) {
    const novo = new URLSearchParams(searchParams.toString());
    for (const [chave, valor] of Object.entries(alteracoes)) {
      if (valor === null || valor === "") novo.delete(chave);
      else novo.set(chave, valor);
    }
    router.push(`${pathname}?${novo.toString()}`);
  }

  function alternarOrdenacao(campo: string) {
    const proximaDirecao = sortCampoAtual === campo && sortDirecaoAtual === "asc" ? "desc" : "asc";
    navegarCom({ sort: `${campo}:${proximaDirecao}`, page: null });
  }

  return (
    <div className="space-y-3">
      {!hideSearchBar && (
        <TableSearchInput placeholder={searchPlaceholder} className="max-w-xs" />
      )}
      <div className={cards ? "hidden rounded-lg border md:block md:overflow-x-auto" : "border rounded-lg overflow-x-auto"}>
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
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  // tabIndex/onKeyDown só quando a linha é interativa
                  // (onRowClick presente) — nas outras 4 telas que usam
                  // DataTable sem essa prop, a linha continua um <tr>
                  // comum, sem foco/handler novo algum.
                  //
                  // Sem role="button": a linha já contém elementos
                  // interativos aninhados (Link do nome, menu de ações) —
                  // sobrescrever pra role="button" criaria um antipadrão
                  // ARIA (interativo dentro de interativo) e destruiria a
                  // semântica nativa de linha de tabela pra leitores de
                  // tela. Em vez disso, a PRÓPRIA linha vira um parada de
                  // Tab (tabIndex=0) com Enter/Espaço ativando o mesmo
                  // comportamento do clique, preservando role="row" nativo.
                  //
                  // `event.target === event.currentTarget`: só ativa quando
                  // o evento de teclado se origina na própria <tr> (linha
                  // com foco direto), nunca quando ele borbulha de um
                  // descendente focável (Link do nome, botão do menu) —
                  // mesmo racional do stopPropagation já usado no clique
                  // desses elementos, aplicado ao teclado.
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter") {
                            onRowClick(row.original);
                          } else if (e.key === " ") {
                            // Previne rolagem da página (comportamento
                            // padrão do navegador pra Espaço) antes de
                            // ativar a linha.
                            e.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  className={
                    onRowClick
                      ? "cursor-pointer focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      : undefined
                  }
                >
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
      {cards && (
        <div className="space-y-3 md:hidden">
          {linhas.length > 0 ? (
            linhas.map((row, index) => <div key={row.id}>{cards[index]}</div>)
          ) : (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <p>
            Página {page} de {paginas} · {totalCount} registro(s)
          </p>
          {/* flex-wrap: mesmo achado/correção do grupo Anterior/Próxima
              logo abaixo — "Itens por página" + o Select de tamanho é um
              único item do flex-wrap pai, então só quebra linha por
              dentro se ele MESMO também puder quebrar. */}
          <div className="flex flex-wrap items-center gap-1.5">
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
        {/* flex-wrap (achado direto durante o redesenho de Usuários,
            reproduzido também em /app/imoveis — pré-existente, não
            introduzido por esta tarefa): sem isso, "Anterior"/"Próxima"
            nunca quebravam linha entre si, e num container com pouco
            espaço real (ex: coluna estreita atrás da sidebar em 375px)
            isso empurrava scrollWidth do DOCUMENTO inteiro, não só deste
            rodapé — mesmo mecanismo de min-w-0/flex-wrap já corrigido
            várias vezes nas telas de Agenda/Pipeline. Correção mínima e
            só aditiva: nunca reduz o espaço disponível em telas largas,
            onde os dois botões continuam lado a lado normalmente. */}
        <div className="flex flex-wrap gap-2">
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
