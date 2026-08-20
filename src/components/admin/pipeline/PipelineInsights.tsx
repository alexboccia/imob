import type { AnalyticsHistoricoPipeline as TipoAnalytics } from "@/lib/pipeline";
import { formatarDuracao } from "@/lib/pipeline";
import { AnalyticsHistoricoPipeline } from "@/components/admin/AnalyticsHistoricoPipeline";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";

const COLUNA_LABEL: Record<string, string> = {
  INTERESTED: "Interessado",
  VISIT_SCHEDULED: "Visita agendada",
  VISITED: "Visitou",
  PROPOSAL: "Proposta",
};

function texto(ms: number | null): string {
  return formatarDuracao(ms) ?? "—";
}

// Redesenho do Pipeline (item 14/15 do pedido) — reorganiza a "Análise
// histórica" (Fase P.7) como seção secundária, recolhível, atrás do
// Kanban: um resumo sempre visível (3 números já calculados, sem nenhuma
// métrica nova) e o conteúdo completo — INTOCADO, o mesmo
// AnalyticsHistoricoPipeline de sempre, só composto aqui dentro de um
// <details> nativo (sem biblioteca nova, focável/expansível por teclado
// de graça) — atrás de "Ver análise completa". Nenhum dado histórico é
// removido, só reordenado visualmente: operação (Kanban) primeiro,
// analytics depois.
export function PipelineInsights({ analytics }: { analytics: TipoAnalytics }) {
  const totalTransicoes = analytics.transicoesObservadas.reduce((soma, t) => soma + t.quantidade, 0);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Gargalo atual</p>
            {analytics.gargalo ? (
              <p className="text-sm font-medium">
                {COLUNA_LABEL[analytics.gargalo.stage]}
                <span className="font-normal text-muted-foreground"> — {texto(analytics.gargalo.agingMedioMs)} em média</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Dados insuficientes</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tempo médio até fechamento</p>
            <p className="text-sm font-medium">{texto(analytics.tempoAteFechamento.todos)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Transições no período</p>
            <p className="text-sm font-medium">{totalTransicoes}</p>
          </div>
        </div>

        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
            Ver análise completa
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 border-t pt-3">
            <AnalyticsHistoricoPipeline analytics={analytics} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
