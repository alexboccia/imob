import Link from "next/link";
import { cn } from "@/lib/utils";
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
    <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Prioridades das negociações abertas">
      <span className="text-muted-foreground">Prioridade:</span>
      {niveis.map((nivel) => (
        <Link
          key={nivel}
          href={href(nivel)}
          aria-current={filtroAtual === nivel ? "page" : undefined}
          className={cn(
            "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
            filtroAtual === nivel
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-muted"
          )}
        >
          {nivel === "TODAS" ? "Todas" : PRIORIDADE_LABEL[nivel]} ({nivel === "TODAS" ? total : contagem[nivel]})
        </Link>
      ))}
    </div>
  );
}
