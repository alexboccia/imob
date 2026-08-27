"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table/DataTable";
import { ESTAGIO_LABEL, ESTAGIO_BADGE_CLASSE } from "@/lib/crm-labels";
import { ClienteDrawer } from "./ClienteDrawer";
import { NovoClienteSheet } from "./NovoClienteSheet";
import type { ClienteRow } from "@/app/app/clientes/columns";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

// Responsividade do painel administrativo — card usado abaixo de `md`
// (DataTable.tsx, prop `cards`), mesma causa raiz de ImovelCardMobile/
// UsuarioCardMobile: a tabela de Clientes tem 7 colunas, larga demais
// pra 360-375px sem rolagem horizontal dentro do próprio wrapper. Fica
// aqui (não em columns.tsx) porque precisa do MESMO onClick que abre o
// ClienteDrawer nas linhas da tabela — este arquivo já é o único ponto
// que conhece tanto a listagem quanto o drawer.
function ClienteCardMobile({ cliente, onClick }: { cliente: ClienteRow; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="size-9 shrink-0">
          <AvatarFallback>{iniciais(cliente.nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{cliente.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {cliente.telefone ?? cliente.email ?? "Sem contato cadastrado"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={ESTAGIO_BADGE_CLASSE[cliente.estagio] ?? ""} variant="outline">
          {ESTAGIO_LABEL[cliente.estagio] ?? cliente.estagio}
        </Badge>
        {cliente.corretorNome && (
          <span className="text-xs text-muted-foreground">{cliente.corretorNome}</span>
        )}
      </div>
      {cliente.interesseLinhas && (
        <p className="min-w-0 truncate text-xs text-muted-foreground">{cliente.interesseLinhas[0]}</p>
      )}
      {cliente.proximaAcao && (
        <p className="min-w-0 truncate text-xs">
          <span className="font-medium">Próxima ação:</span> {cliente.proximaAcao.texto}
        </p>
      )}
    </div>
  );
}

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

  function abrirCliente(cliente: ClienteRow) {
    setClienteAberto(cliente);
    setDrawerAberto(true);
  }

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
        onRowClick={abrirCliente}
        cards={data.map((cliente) => (
          <ClienteCardMobile key={cliente.id} cliente={cliente} onClick={() => abrirCliente(cliente)} />
        ))}
      />
      <ClienteDrawer cliente={clienteAberto} open={drawerAberto} onOpenChange={setDrawerAberto} />
    </>
  );
}
