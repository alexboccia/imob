import type { MetricasPipeline } from "@/lib/pipeline";
import { formatarPercentual } from "@/lib/pipeline";
import { Card, CardContent } from "@/components/ui/card";
import { ListTodo, Trophy, XCircle, Target } from "lucide-react";

// Redesenho do Pipeline — mesmo padrão visual dos 4 cards de KPI de
// ClientesKpiCards (ícone colorido + número + legenda), substituindo os
// cards genéricos de ResumoPipeline. Puramente apresentacional: `metricas`
// já vem calculado por buscarMetricasPipeline (src/lib/pipeline.ts) — sem
// Prisma, sem fetch próprio, sem lógica de tenant, sem query nova (mesmos
// 2 `groupBy` que já existiam antes do redesenho).
export function PipelineKpiCards({
  metricas,
  periodoLabel,
}: {
  metricas: MetricasPipeline;
  periodoLabel: string;
}) {
  const cards = [
    {
      icone: ListTodo,
      corIcone: "bg-primary/10 text-primary",
      titulo: "Em andamento",
      valor: metricas.emAndamento,
      legenda: metricas.emAndamento === 1 ? "1 negociação ativa" : `${metricas.emAndamento} negociações ativas`,
    },
    {
      icone: Trophy,
      corIcone: "bg-success-muted text-success-muted-foreground",
      titulo: "Ganhos",
      valor: metricas.ganhos,
      legenda: periodoLabel,
    },
    {
      icone: XCircle,
      corIcone: "bg-destructive/10 text-destructive",
      titulo: "Perdidos",
      valor: metricas.perdidos,
      legenda: periodoLabel,
    },
    {
      icone: Target,
      corIcone: "bg-violet-100 text-violet-700",
      titulo: "Taxa de ganho",
      valor: formatarPercentual(metricas.taxaGanho),
      legenda: periodoLabel,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.titulo} size="sm" className="min-w-0">
          <CardContent className="flex items-start gap-3">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${card.corIcone}`}>
              <card.icone className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{card.titulo}</p>
              <p className="text-2xl font-semibold leading-tight">{card.valor}</p>
              <p className="text-xs text-muted-foreground truncate">{card.legenda}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
