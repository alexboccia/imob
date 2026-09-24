import { ListTodo, Trophy, XCircle, Target } from "lucide-react";
import {
  CartaoEstatistica,
  GradeEstatisticas,
} from "@/components/admin/ui/CartaoEstatistica";
import type { MetricasPipeline } from "@/lib/pipeline";
import { formatarPercentual } from "@/lib/pipeline";

// KPIs do Pipeline.
//
// Fase 66 — migrados para o cartão compartilhado do backoffice
// (CartaoEstatistica), o mesmo do Dashboard. Puramente apresentacional:
// `metricas` já vem calculado por buscarMetricasPipeline
// (src/lib/pipeline.ts) — sem Prisma, sem fetch próprio, sem query nova.
// Nenhum cálculo mudou; `formatarPercentual` continua devolvendo "—"
// quando a taxa não é calculável, nunca 0%.
//
// Ganho colateral da migração: o cartão compartilhado empilha o ícone
// acima do texto abaixo de `sm`, o que evita o colapso do rótulo em
// colunas estreitas que este componente tinha (ele usava `flex items-start`
// fixo, sem a variante empilhada).
export function PipelineKpiCards({
  metricas,
  periodoLabel,
}: {
  metricas: MetricasPipeline;
  periodoLabel: string;
}) {
  return (
    <GradeEstatisticas>
      <CartaoEstatistica
        icone={ListTodo}
        tom="marca"
        rotulo="Em andamento"
        valor={metricas.emAndamento}
        contexto={
          metricas.emAndamento === 1
            ? "1 negociação ativa"
            : `${metricas.emAndamento} negociações ativas`
        }
      />
      <CartaoEstatistica
        icone={Trophy}
        tom="positivo"
        rotulo="Ganhos"
        valor={metricas.ganhos}
        contexto={periodoLabel}
      />
      <CartaoEstatistica
        icone={XCircle}
        // Resultado adverso consumado — aqui o vermelho é a semântica
        // correta, ao contrário do atraso operacional dos cards.
        tom="negativo"
        rotulo="Perdidos"
        valor={metricas.perdidos}
        contexto={periodoLabel}
      />
      <CartaoEstatistica
        icone={Target}
        tom="info"
        rotulo="Taxa de ganho"
        valor={formatarPercentual(metricas.taxaGanho)}
        contexto={periodoLabel}
      />
    </GradeEstatisticas>
  );
}
