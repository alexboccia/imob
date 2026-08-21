"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import { STATUS_MEMBRO_LABEL } from "./usuarios-visual";

const TODOS = "__todos__";

// Redesenho de Usuários — papel e status agrupados numa única barra
// visual (antes: só "papel" existia como filtro, isolado num dropdown
// solto acima da tabela, dissociado da busca). Mesmo mecanismo de
// ClientesFiltrosAvancados: escreve no MESMO parâmetro `filters` (JSON)
// já interpretado por interpretarFiltros/construirWhereUsuarios em
// page.tsx — nenhum contrato de URL novo, só a allowlist de chaves
// ganhou "status" além de "papel".
//
// <select> nativo (não o componente Select/SelectValue) de propósito:
// achado real durante esta implementação — Select/SelectValue (Base UI)
// em modo controlado (value+onValueChange) mostra o VALOR bruto da opção
// selecionada em vez do rótulo (ex.: "__todos__" em vez de "Todos os
// papéis") — bug pré-existente, reproduzido também no já publicado
// ClientesFiltrosAvancados.tsx (fora de escopo desta tarefa, documentado
// no relatório final, não corrigido aqui). <select> nativo, mesmo padrão
// já usado e validado em AgendaFiltrosBar.tsx, não tem esse problema.
//
// A busca por nome/e-mail continua no campo já existente dentro do
// DataTable (searchPlaceholder) — não duplicada aqui. Reposicionar essa
// busca para dentro desta barra exigiria alterar o DataTable
// compartilhado (usado também por Imóveis e pelas listagens do Platform
// Admin), risco desproporcional ao ganho puramente visual; ver relatório
// final.
//
// Correção do Finding #3 (auditoria pré-commit) — o servidor
// (page.tsx/construirWhereUsuarios) já validava tudo antes de tocar o
// Prisma, mas este componente confiava cegamente no shape do JSON: um
// `filters` manipulado na URL com `status`/`papel` não-string (array,
// objeto, número) chegava direto ao `value` do <select> controlado,
// causando o warning do React "value prop must be a scalar value" —
// nunca um crash nem dado incorreto no servidor, mas um estado
// visualmente incoerente no client. `sanitizarValor` só aceita o valor
// quando ele é string E pertence à allowlist real (PAPEL_USUARIO_LABEL,
// já importado; `statusValidos`, já recebido via prop) — qualquer outra
// coisa cai no sentinela TODOS, o mesmo estado "neutro" já usado quando o
// parâmetro simplesmente não existe.
const PAPEIS_VALIDOS_CLIENTE = new Set(Object.keys(PAPEL_USUARIO_LABEL));

function sanitizarValor(valor: unknown, permitidos: ReadonlySet<string>): string {
  return typeof valor === "string" && permitidos.has(valor) ? valor : TODOS;
}

export function UsuariosFiltrosBar({ statusValidos }: { statusValidos: readonly string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusValidosSet = new Set(statusValidos);

  let filtrosBrutos: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(searchParams.get("filters") ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      filtrosBrutos = parsed as Record<string, unknown>;
    }
  } catch {
    filtrosBrutos = {};
  }

  const papelAtual = sanitizarValor(filtrosBrutos.papel, PAPEIS_VALIDOS_CLIENTE);
  const statusAtual = sanitizarValor(filtrosBrutos.status, statusValidosSet);
  const temFiltroAtivo = papelAtual !== TODOS || statusAtual !== TODOS;

  // Reconstrói `filters` só a partir dos valores JÁ sanitizados acima —
  // nunca re-espalha `filtrosBrutos` cru, senão um valor inválido
  // injetado na URL (ex.: status como array) sobreviveria de volta pra
  // URL só por estar presente no objeto original, mesmo sem nunca ter
  // sido de fato usado/exibido por este componente.
  function aplicar(chave: "papel" | "status", valor: string) {
    const novosFiltros: Record<string, string> = {};
    const proximoPapel = chave === "papel" ? valor : papelAtual;
    const proximoStatus = chave === "status" ? valor : statusAtual;
    if (proximoPapel !== TODOS) novosFiltros.papel = proximoPapel;
    if (proximoStatus !== TODOS) novosFiltros.status = proximoStatus;

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
    novo.delete("page");
    router.push(`${pathname}?${novo.toString()}`);
  }

  const classeSelect =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-40";

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-sm">
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="usuarios-papel" className="text-xs text-muted-foreground">
          Papel
        </label>
        <select
          id="usuarios-papel"
          value={papelAtual}
          onChange={(e) => aplicar("papel", e.target.value)}
          className={classeSelect}
        >
          <option value={TODOS}>Todos os papéis</option>
          {Object.entries(PAPEL_USUARIO_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="usuarios-status" className="text-xs text-muted-foreground">
          Status
        </label>
        <select
          id="usuarios-status"
          value={statusAtual}
          onChange={(e) => aplicar("status", e.target.value)}
          className={classeSelect}
        >
          <option value={TODOS}>Todos os status</option>
          {statusValidos.map((valor) => (
            <option key={valor} value={valor}>
              {STATUS_MEMBRO_LABEL[valor] ?? valor}
            </option>
          ))}
        </select>
      </div>
      {temFiltroAtivo && (
        // min-w-0 shrink whitespace-normal: correção do Finding #2
        // (auditoria pré-commit) — em 360px a coluna real de conteúdo
        // (atrás da sidebar fixa) é mais estreita que a largura mínima
        // intrínseca deste botão com o shrink-0 padrão do design system,
        // vazando ~3px pro scrollWidth do documento assim que um filtro
        // fica ativo (só então este botão aparece). Mesmo mecanismo já
        // usado em NovoUsuarioSheet.tsx: nunca reduz o espaço em telas
        // largas (sobra espaço de sobra), só permite ao próprio botão
        // encolher/quebrar em duas linhas quando realmente precisa.
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
