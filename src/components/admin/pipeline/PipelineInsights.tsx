import type { AnalyticsHistoricoPipeline as TipoAnalytics } from "@/lib/pipeline";
import { formatarDuracao } from "@/lib/pipeline";
import { AnalyticsHistoricoPipeline } from "@/components/admin/AnalyticsHistoricoPipeline";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  ChevronDown,
  Hourglass,
  Timer,
} from "lucide-react";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { CartaoEstatistica } from "@/components/admin/ui/CartaoEstatistica";

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
    // Fase 66 — virou uma SEÇÃO com cabeçalho próprio, no padrão do
    // backoffice, e os três números passaram a usar o cartão
    // compartilhado. Nenhuma métrica nova, nenhum cálculo alterado: tudo
    // continua vindo pronto de buscarAnalyticsHistoricoPipeline.
    //
    // Continua na MESMA página, atrás do Kanban — não virou aba nem
    // página nova: a análise complementa o trabalho operacional, e
    // escondê-la atrás de navegação faria perder o contexto.
    <section className="min-w-0 space-y-4">
      <CabecalhoSecao
        icone={ChartNoAxesCombined}
        titulo="Análise do pipeline"
        descricao="Indicadores sobre movimentação e tempo das negociações."
      />

      {/* 3 colunas, não 4: são três indicadores. GradeEstatisticas é
          calibrada para quatro KPIs, então aqui a grade é própria — usar
          a compartilhada deixaria um buraco na quarta coluna. */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoEstatistica
          icone={Hourglass}
          // Gargalo é algo a observar, não um erro: âmbar, nunca vermelho.
          tom="atencao"
          rotulo="Gargalo atual"
          valor={analytics.gargalo ? COLUNA_LABEL[analytics.gargalo.stage] : "—"}
          contexto={
            analytics.gargalo
              ? `${texto(analytics.gargalo.agingMedioMs)} em média`
              : "Dados insuficientes"
          }
        />
        <CartaoEstatistica
          icone={Timer}
          tom="marca"
          rotulo="Tempo médio até fechamento"
          // `texto()` devolve "—" quando não há o que calcular — nunca
          // zero, que afirmaria um fechamento instantâneo.
          valor={texto(analytics.tempoAteFechamento.todos)}
          contexto={
            analytics.tempoAteFechamento.todos === null
              ? "Sem negociações fechadas no período selecionado."
              : undefined
          }
        />
        <CartaoEstatistica
          icone={ArrowLeftRight}
          tom="info"
          rotulo="Transições no período"
          valor={totalTransicoes}
          contexto="Movimentações entre etapas"
        />
      </div>

      <Card>
        <CardContent>
          {/* <details> nativo PRESERVADO: expande na própria página,
              focável e operável por teclado sem biblioteca. Não virou
              link nem página nova. */}
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              Ver análise completa
              <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 border-t pt-3">
              <AnalyticsHistoricoPipeline analytics={analytics} />
            </div>
          </details>
        </CardContent>
      </Card>
    </section>
  );
}
