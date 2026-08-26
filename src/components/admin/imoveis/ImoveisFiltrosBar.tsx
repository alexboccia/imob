"use client";

import { Search } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableSearchInput } from "@/components/admin/data-table/TableSearchInput";

const TODOS = "__todos__";

// Redesenho visual dos filtros de Imóveis — mesmo mecanismo/contrato de
// URL de sempre (status/tipo/finalidade no parâmetro `filters`, JSON, já
// interpretado por interpretarFiltros/construirWhereImoveis em page.tsx;
// busca no parâmetro `search`, mesmo debounce de 400ms), só reorganizado
// visualmente num único card: Status/Tipo/Finalidade em 3 colunas
// equilibradas na primeira linha, "Buscar imóveis" + "Limpar filtros" na
// segunda. Nenhuma regra de negócio muda — ver relatório final.
//
// <select> nativo de propósito (não Select/SelectValue) — mesmo achado
// documentado em UsuariosFiltrosBar.tsx: Select/SelectValue (Base UI) em
// modo controlado mostra o VALOR bruto da opção selecionada em vez do
// rótulo. Não reproduzido aqui desde o início.
//
// Busca agora vem de TableSearchInput (extraído de DataTable.tsx) em vez
// do campo que DataTable renderizava sozinho acima da tabela — mesma
// lógica de debounce/URL/reset de página, só relocada pra dentro deste
// card (DataTable recebe `hideSearchBar` pra não duplicar o campo; as
// outras 4 telas que usam DataTable continuam com o campo delas no lugar
// de sempre, sem essa prop).
//
// "Limpar filtros" remove filtros E busca (diferente de UsuariosFiltrosBar,
// que só remove `filters`) — decisão preservada do redesenho original
// desta tela: um único botão cobre os dois, mais previsível do que exigir
// apagar a busca manualmente depois de já ter limpado os filtros.
function sanitizarValor(valor: unknown, permitidos: ReadonlySet<string>): string {
  return typeof valor === "string" && permitidos.has(valor) ? valor : TODOS;
}

export function ImoveisFiltrosBar({
  statusOpcoes,
  tipoOpcoes,
  finalidadeOpcoes,
}: {
  statusOpcoes: { value: string; label: string }[];
  tipoOpcoes: string[];
  finalidadeOpcoes: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusValidos = new Set(statusOpcoes.map((o) => o.value));
  const tipoValidos = new Set(tipoOpcoes);
  const finalidadeValidos = new Set(finalidadeOpcoes.map((o) => o.value));

  let filtrosBrutos: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(searchParams.get("filters") ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      filtrosBrutos = parsed as Record<string, unknown>;
    }
  } catch {
    filtrosBrutos = {};
  }

  const statusAtual = sanitizarValor(filtrosBrutos.status, statusValidos);
  const tipoAtual = sanitizarValor(filtrosBrutos.tipo, tipoValidos);
  const finalidadeAtual = sanitizarValor(filtrosBrutos.finalidade, finalidadeValidos);
  const buscaAtiva = Boolean(searchParams.get("search"));
  const temFiltroOuBuscaAtivo =
    statusAtual !== TODOS || tipoAtual !== TODOS || finalidadeAtual !== TODOS || buscaAtiva;

  function aplicar(chave: "status" | "tipo" | "finalidade", valor: string) {
    const novosFiltros: Record<string, string> = {};
    const proximoStatus = chave === "status" ? valor : statusAtual;
    const proximoTipo = chave === "tipo" ? valor : tipoAtual;
    const proximaFinalidade = chave === "finalidade" ? valor : finalidadeAtual;
    if (proximoStatus !== TODOS) novosFiltros.status = proximoStatus;
    if (proximoTipo !== TODOS) novosFiltros.tipo = proximoTipo;
    if (proximaFinalidade !== TODOS) novosFiltros.finalidade = proximaFinalidade;

    const novo = new URLSearchParams(searchParams.toString());
    if (Object.keys(novosFiltros).length > 0) {
      novo.set("filters", JSON.stringify(novosFiltros));
    } else {
      novo.delete("filters");
    }
    novo.delete("page");
    router.push(`${pathname}?${novo.toString()}`);
  }

  function limpar() {
    const novo = new URLSearchParams(searchParams.toString());
    novo.delete("filters");
    novo.delete("search");
    novo.delete("page");
    router.push(`${pathname}?${novo.toString()}`);
  }

  const classeSelect =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
  const classeLabel = "block text-xs text-muted-foreground";

  return (
    <Card size="sm" className="min-w-0">
      <CardContent className="min-w-0 space-y-3">
        {/* grid-cols-1 sm:grid-cols-3: 3 colunas equilibradas em desktop
            (cada select ocupa a largura da própria coluna, sem largura
            fixa), empilhado em mobile — mesmo padrão de grid já usado em
            Características/Tipos de imóvel, aplicado aqui a campos de
            filtro em vez de cards de grupo. */}
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0 space-y-1">
            <label htmlFor="imoveis-status" className={classeLabel}>
              Status
            </label>
            <select
              id="imoveis-status"
              value={statusAtual}
              onChange={(e) => aplicar("status", e.target.value)}
              className={classeSelect}
            >
              <option value={TODOS}>Todos os status</option>
              {statusOpcoes.map((opcao) => (
                <option key={opcao.value} value={opcao.value}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-1">
            <label htmlFor="imoveis-tipo" className={classeLabel}>
              Tipo
            </label>
            <select
              id="imoveis-tipo"
              value={tipoAtual}
              onChange={(e) => aplicar("tipo", e.target.value)}
              className={classeSelect}
            >
              <option value={TODOS}>Todos os tipos</option>
              {tipoOpcoes.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-1">
            <label htmlFor="imoveis-finalidade" className={classeLabel}>
              Finalidade
            </label>
            <select
              id="imoveis-finalidade"
              value={finalidadeAtual}
              onChange={(e) => aplicar("finalidade", e.target.value)}
              className={classeSelect}
            >
              <option value={TODOS}>Todas as finalidades</option>
              {finalidadeOpcoes.map((opcao) => (
                <option key={opcao.value} value={opcao.value}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* flex-col no mobile (busca full-width, botão empilha abaixo) e
            sm:flex-row sm:items-end no desktop (busca ocupa o espaço
            sobrando via flex-1, botão alinhado à base do campo). */}
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="imoveis-busca" className={classeLabel}>
              Buscar imóveis
            </label>
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <TableSearchInput
                id="imoveis-busca"
                placeholder="Buscar por código, título, tipo, cidade ou bairro..."
                className="h-8 w-full pl-8"
              />
            </div>
          </div>
          {temFiltroOuBuscaAtivo && (
            // min-w-0 shrink whitespace-normal: mesma correção do Finding
            // #2 da auditoria de Usuários — em 360px a coluna real de
            // conteúdo é mais estreita que a largura mínima intrínseca
            // deste botão com o shrink-0 padrão do design system.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limpar}
              className="min-w-0 shrink-0 whitespace-normal self-start sm:self-auto"
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
