import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  PERIODOS_ANALYTICS_OPCOES,
  PERIODO_ANALYTICS_CHIP,
  PERIODO_ANALYTICS_LABEL,
  type PeriodoAnalytics,
} from "@/lib/analytics-comercial";

// Filtro de período — URL-driven (?periodo=), mesmo tratamento visual de
// pill de PipelinePrioridadeChips/PipelineTabs. <Link> e não <form>: é o
// único filtro da tela, então um GET direto já preserva tudo, sobrevive
// ao refresh e é compartilhável por URL, sem estado de cliente nenhum.
//
// aria-current="page" (não só a cor de fundo): o período ativo precisa ser
// anunciado por leitor de tela e ser perceptível sem depender de cor —
// mesma regra usada nos chips do Pipeline.
export function AnalyticsPeriodoChips({ periodo }: { periodo: PeriodoAnalytics }) {
  return (
    <nav aria-label="Período de análise" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Período:</span>
      {PERIODOS_ANALYTICS_OPCOES.map((opcao) => {
        const ativo = opcao === periodo;
        return (
          <Link
            key={opcao}
            href={opcao === "30d" ? "/app/analytics" : `/app/analytics?periodo=${opcao}`}
            aria-current={ativo ? "page" : undefined}
            aria-label={PERIODO_ANALYTICS_LABEL[opcao]}
            className={cn(
              // inline-flex items-center justify-center: <a> é inline por
              // padrão, height sozinho não centraliza o texto.
              "inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              ativo
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-muted"
            )}
          >
            {PERIODO_ANALYTICS_CHIP[opcao]}
          </Link>
        );
      })}
    </nav>
  );
}
