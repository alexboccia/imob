"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table/DataTable";
import { ClienteDrawer } from "./ClienteDrawer";
import { NovoClienteSheet } from "./NovoClienteSheet";
import type { ClienteRow } from "@/app/app/clientes/columns";

// Redesenho da tela de Clientes — único ponto que conhece TANTO a
// DataTable quanto o ClienteDrawer, pra abrir o drawer da linha clicada
// (onRowClick, aditivo em DataTable.tsx) sem acoplar esses dois
// componentes um ao outro diretamente.
export function ClientesTabelaComDrawer({
  columns,
  data,
  totalCount,
  page,
  pageSize,
  sortableColumns,
  temFiltroOuBuscaAtivo,
}: {
  columns: DataTableColumn<ClienteRow>[];
  data: ClienteRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  sortableColumns: Record<string, string>;
  /** Distingue "nenhum cliente cadastrado" (mensagem de onboarding) de
   * "busca/filtro sem resultado" (mensagem neutra) — decidido em page.tsx,
   * que já conhece busca/estagioFiltro/origemFiltro/papelFiltro. */
  temFiltroOuBuscaAtivo: boolean;
}) {
  const [clienteAberto, setClienteAberto] = useState<ClienteRow | null>(null);
  const [drawerAberto, setDrawerAberto] = useState(false);

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortableColumns={sortableColumns}
        searchPlaceholder="Buscar por nome, telefone ou e-mail..."
        emptyMessage={
          temFiltroOuBuscaAtivo ? (
            "Nenhum cliente encontrado."
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p>Nenhum cliente cadastrado ainda.</p>
              <NovoClienteSheet labelBotao="Adicionar primeiro cliente" variantBotao="outline" />
            </div>
          )
        }
        onRowClick={(row) => {
          setClienteAberto(row);
          setDrawerAberto(true);
        }}
      />
      <ClienteDrawer cliente={clienteAberto} open={drawerAberto} onOpenChange={setDrawerAberto} />
    </>
  );
}
