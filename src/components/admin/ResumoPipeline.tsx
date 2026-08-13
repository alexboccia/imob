import type { MetricasPipeline } from "@/lib/pipeline";
import { COLUNAS_ABERTAS, formatarPercentual, PERIODO_PIPELINE_LABEL } from "@/lib/pipeline";
import { Card, CardContent } from "@/components/ui/card";

// Resumo gerencial do Pipeline (Fase P.5) — componente burro: só recebe
// MetricasPipeline já calculado (buscarMetricasPipeline, src/lib/pipeline.ts)
// e renderiza. Sem Prisma, sem fetch próprio, sem lógica de tenant. Duas
// seções deliberadamente distintas visualmente:
//   - estatísticas compactas (Em andamento é GLOBAL; Ganhos/Perdidos/Taxa
//     são do período selecionado — rotulados explicitamente, nunca
//     misturados sem indicação);
//   - distribuição atual das 4 etapas abertas, sempre GLOBAL, nunca
//     afetada pelo período ou pela busca do Kanban.

const COLUNA_LABEL: Record<(typeof COLUNAS_ABERTAS)[number], string> = {
  INTERESTED: "Interessado",
  VISIT_SCHEDULED: "Visita agendada",
  VISITED: "Visitou",
  PROPOSAL: "Proposta",
};

export function ResumoPipeline({ metricas }: { metricas: MetricasPipeline }) {
  const periodoLabel = PERIODO_PIPELINE_LABEL[metricas.periodo];
  const maiorContagem = Math.max(1, ...COLUNAS_ABERTAS.map((c) => metricas.porStage[c]));

  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Em andamento</p>
            <p className="text-2xl font-semibold">{metricas.emAndamento}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Ganhos ({periodoLabel})</p>
            <p className="text-2xl font-semibold">{metricas.ganhos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Perdidos ({periodoLabel})</p>
            <p className="text-2xl font-semibold">{metricas.perdidos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Taxa de ganho ({periodoLabel})</p>
            <p className="text-2xl font-semibold">{formatarPercentual(metricas.taxaGanho)}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Distribuição atual do Pipeline — negociações em andamento por etapa, agora
        </p>
        <div className="space-y-1.5">
          {COLUNAS_ABERTAS.map((coluna) => {
            const valor = metricas.porStage[coluna];
            const percentualBarra = (valor / maiorContagem) * 100;
            return (
              <div key={coluna} className="flex items-center gap-2 text-sm">
                <span className="w-32 shrink-0 text-muted-foreground">{COLUNA_LABEL[coluna]}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${valor === 0 ? 0 : Math.max(percentualBarra, 4)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-medium tabular-nums">{valor}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
