import Link from "next/link";
import {
  BarraSegmentada,
  classesItemSegmentado,
} from "@/components/admin/ui/BarraSegmentada";
import type { FiltroPrioridadePipeline } from "@/lib/pipeline";

const PRIORIDADE_LABEL: Record<Exclude<FiltroPrioridadePipeline, "TODAS">, string> = {
  ALTA: "Alta",
  MEDIA: "Média",
  NORMAL: "Normal",
};

// Redesenho do Pipeline — mesmos chips de prioridade de sempre (Fase P.8,
// URL-driven via ?prioridade=), só com o mesmo tratamento visual de pill
// usado em PipelineTabs/ClientesFiltrosEstagio, em vez do botão genérico
// de antes. Nenhuma lógica nova: `total` e `contagem` já vêm calculados
// em page.tsx (classificarPrioridadePipeline, in-memory, zero I/O extra).
export function PipelinePrioridadeChips({
  filtroAtual,
  total,
  contagem,
  href,
}: {
  filtroAtual: FiltroPrioridadePipeline;
  total: number;
  contagem: Record<Exclude<FiltroPrioridadePipeline, "TODAS">, number>;
  href: (nivel: FiltroPrioridadePipeline) => string;
}) {
  const niveis: FiltroPrioridadePipeline[] = ["TODAS", "ALTA", "MEDIA", "NORMAL"];

  return (
    // Fase 66 — mesma moldura segmentada do resto do backoffice, mas
    // CLARAMENTE secundária: rótulo "Prioridade:" ao lado e altura menor
    // que a barra Em andamento/Encerradas, que é a navegação principal.
    // Semântica inalterada: são LINKS URL-driven (?prioridade=), com
    // aria-current — nunca abas.
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <span id="rotulo-prioridade" className="shrink-0 text-muted-foreground">
        Prioridade:
      </span>
      <BarraSegmentada role="navigation" aria-labelledby="rotulo-prioridade">
        {niveis.map((nivel) => {
          const ativo = filtroAtual === nivel;
          return (
            <Link
              key={nivel}
              href={href(nivel)}
              aria-current={ativo ? "page" : undefined}
              className={classesItemSegmentado(ativo, "h-8 text-xs")}
            >
              {nivel === "TODAS" ? "Todas" : PRIORIDADE_LABEL[nivel]} (
              {nivel === "TODAS" ? total : contagem[nivel]})
              {/* O filtro ativo é dito em texto, não só pelo fundo. */}
              {ativo && <span className="sr-only"> (filtro ativo)</span>}
            </Link>
          );
        })}
      </BarraSegmentada>
    </div>
  );
}
