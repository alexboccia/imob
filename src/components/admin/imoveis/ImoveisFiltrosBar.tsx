"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

const TODOS = "__todos__";

// Redesenho de Imóveis — status/tipo/finalidade unificados numa única
// barra visual (antes: só "status" existia, como um dropdown solto acima
// da tabela). Mesmo mecanismo de UsuariosFiltrosBar.tsx/
// ClientesFiltrosAvancados.tsx: escreve no MESMO parâmetro `filters`
// (JSON) já interpretado por interpretarFiltros/construirWhereImoveis em
// page.tsx — nenhum contrato de URL novo, só a allowlist de chaves ganhou
// "tipo"/"finalidade" além de "status".
//
// <select> nativo de propósito (não Select/SelectValue) — mesmo achado
// documentado em UsuariosFiltrosBar.tsx: Select/SelectValue (Base UI) em
// modo controlado mostra o VALOR bruto da opção selecionada em vez do
// rótulo. Não reproduzido aqui desde o início.
//
// "Limpar filtros" remove filtros E busca (diferente de UsuariosFiltrosBar,
// que só remove `filters` — decisão deliberada: o prompt deste redesenho
// pede explicitamente pra investigar o comportamento das outras telas e
// decidir conscientemente o que preservar; friso persistir só a
// ordenação, igual às outras 4 telas, mas UNINDO busca+filtro num único
// botão — mais previsível para o usuário do que precisar apagar o campo
// de busca manualmente depois de já ter clicado "Limpar filtros"). Ver
// relatório final.
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
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-40";

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-sm">
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="imoveis-status" className="text-xs text-muted-foreground">
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
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="imoveis-tipo" className="text-xs text-muted-foreground">
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
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="imoveis-finalidade" className="text-xs text-muted-foreground">
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
      {temFiltroOuBuscaAtivo && (
        // min-w-0 shrink whitespace-normal: mesma correção do Finding #2
        // da auditoria de Usuários — em 360px a coluna real de conteúdo é
        // mais estreita que a largura mínima intrínseca deste botão com o
        // shrink-0 padrão do design system.
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={limpar}
          className="min-w-0 shrink whitespace-normal"
        >
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
