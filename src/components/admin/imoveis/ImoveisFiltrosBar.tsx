"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
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
  // Contador de reset da busca — ver comentário em `limpar` e a prop
  // `resetToken` de TableSearchInput.
  const [resetBusca, setResetBusca] = useState(0);

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
    // Sinaliza o reset ao campo de busca ANTES de navegar: sem isto, uma
    // busca digitada há menos de 400ms continuaria no campo e o debounce
    // pendente a reaplicaria logo depois de limpar (bug reproduzido).
    setResetBusca((n) => n + 1);
    const novo = new URLSearchParams(searchParams.toString());
    novo.delete("filters");
    novo.delete("search");
    novo.delete("page");
    router.push(`${pathname}?${novo.toString()}`);
  }

  // Rótulo legível de cada filtro ativo — traduzido pelas MESMAS listas
  // de opções que os selects usam, nunca o valor cru da URL.
  const chipsAtivos = [
    {
      chave: "status" as const,
      valor: statusAtual,
      rotulo: statusOpcoes.find((o) => o.value === statusAtual)?.label,
    },
    { chave: "tipo" as const, valor: tipoAtual, rotulo: tipoAtual },
    {
      chave: "finalidade" as const,
      valor: finalidadeAtual,
      rotulo: finalidadeOpcoes.find((o) => o.value === finalidadeAtual)?.label,
    },
  ].flatMap((f) =>
    f.valor !== TODOS && f.rotulo ? [{ chave: f.chave, rotulo: f.rotulo }] : []
  );

  const classeSelect =
    "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
  const classeLabel = "block text-xs text-muted-foreground";

  return (
    <Card size="sm" className="min-w-0">
      <CardContent className="min-w-0 space-y-3">
        {/* Fase 67 — a BUSCA subiu para a primeira linha e ganhou peso: é
            o controle que o corretor usa para achar um imóvel específico,
            e estava embaixo dos três selects categóricos. Altura h-9 (os
            selects acompanham) e largura cheia.

            O MECANISMO NÃO MUDOU: não há botão de aplicar porque não há
            submit — os selects navegam no `onChange` e a busca tem
            debounce de 400ms, os dois escrevendo na URL (`filters` em
            JSON e `search`). Nenhum parâmetro novo, nenhum contrato
            alterado. */}
        <div className="min-w-0 space-y-1">
          <label htmlFor="imoveis-busca" className={classeLabel}>
            Buscar imóveis
          </label>
          <div className="relative min-w-0">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <TableSearchInput
              resetToken={resetBusca}
              id="imoveis-busca"
              placeholder="Buscar por código, título, tipo, cidade ou bairro..."
              className="h-9 w-full pl-8"
            />
          </div>
        </div>

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

        {/* FILTROS ATIVOS — nenhuma lógica nova: cada chip chama o MESMO
            `aplicar(chave, TODOS)` que o select já usa para voltar a
            "Todos". Só os três filtros categóricos entram; a busca não,
            porque o texto dela já está visível no próprio campo acima.
            O rótulo vai junto do "×" para o chip não depender de cor. */}
        {chipsAtivos.length > 0 && (
          <div
            data-filtros-ativos
            className="flex min-w-0 flex-wrap items-center gap-2 border-t pt-3"
          >
            <span className="shrink-0 text-xs text-muted-foreground">Filtros ativos:</span>
            {chipsAtivos.map((chip) => (
              <button
                key={chip.chave}
                type="button"
                onClick={() => aplicar(chip.chave, TODOS)}
                aria-label={`Remover filtro ${chip.rotulo}`}
                className="inline-flex min-w-0 items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 truncate">{chip.rotulo}</span>
                <X aria-hidden className="size-3 shrink-0 text-muted-foreground" />
              </button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limpar}
              className="min-w-0 shrink-0 whitespace-normal"
            >
              Limpar filtros
            </Button>
          </div>
        )}

        {/* Busca ativa SEM filtro categórico: o "Limpar filtros" continua
            alcançável, como antes desta fase. */}
        {chipsAtivos.length === 0 && temFiltroOuBuscaAtivo && (
          <div className="flex min-w-0 flex-wrap border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limpar}
              className="min-w-0 shrink-0 whitespace-normal"
            >
              Limpar filtros
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
