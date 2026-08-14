import type { AnalyticsHistoricoPipeline as TipoAnalytics } from "@/lib/pipeline";
import { COLUNAS_ABERTAS, formatarDuracao } from "@/lib/pipeline";
import { ESTAGIO_INTERESSE_LABEL } from "@/lib/property-interest-schema";
import { Card, CardContent } from "@/components/ui/card";

// Análise histórica do Pipeline (Fase P.7) — componente burro: só recebe
// AnalyticsHistoricoPipeline já calculado (buscarAnalyticsHistoricoPipeline,
// src/lib/pipeline.ts) e renderiza. Sem Prisma, sem fetch próprio, sem
// Server Action, sem write, sem timer/useEffect (todos os valores já
// vêm prontos do servidor). Nunca mostra "0 dias"/"0%" quando o dado é
// null — sempre "—" ou uma mensagem explícita de insuficiência.

const COLUNA_LABEL: Record<(typeof COLUNAS_ABERTAS)[number], string> = {
  INTERESTED: "Interessado",
  VISIT_SCHEDULED: "Visita agendada",
  VISITED: "Visitou",
  PROPOSAL: "Proposta",
};

function textoDuracao(ms: number | null): string {
  const texto = formatarDuracao(ms);
  return texto ?? "—";
}

function BarraPorEtapa({
  valores,
  formatar,
}: {
  valores: Record<(typeof COLUNAS_ABERTAS)[number], number | null>;
  formatar: (v: number | null) => string;
}) {
  const maior = Math.max(1, ...COLUNAS_ABERTAS.map((c) => valores[c] ?? 0));
  return (
    <div className="space-y-1.5">
      {COLUNAS_ABERTAS.map((coluna) => {
        const valor = valores[coluna];
        const percentualBarra = valor === null ? 0 : (valor / maior) * 100;
        return (
          <div key={coluna} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 text-muted-foreground">{COLUNA_LABEL[coluna]}</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${valor === null ? 0 : Math.max(percentualBarra, 4)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-medium tabular-nums">{formatar(valor)}</span>
          </div>
        );
      })}
    </div>
  );
}

function labelEstagioOuNovo(stage: string | null): string {
  if (stage === null) return "Novo interesse";
  return ESTAGIO_INTERESSE_LABEL[stage] ?? stage;
}

export function AnalyticsHistoricoPipeline({ analytics }: { analytics: TipoAnalytics }) {
  const semNenhumEpisodio = COLUNAS_ABERTAS.every((c) => analytics.agingAgregado[c] === null);
  const semNenhumTempoMedio = COLUNAS_ABERTAS.every((c) => analytics.tempoMedioHistorico[c] === null);
  const semTransicoes = analytics.transicoesObservadas.length === 0;
  const semTempoFechamento =
    analytics.tempoAteFechamento.ganho === null &&
    analytics.tempoAteFechamento.perdido === null &&
    analytics.tempoAteFechamento.todos === null;

  return (
    <div className="mb-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Análise histórica</h2>
        <p className="text-xs text-muted-foreground">
          Baseada exclusivamente no histórico de mudanças de etapa registrado — negociações sem histórico
          disponível (anteriores a esta funcionalidade) não entram nestas métricas.
          {analytics.amostraLimitada && (
            <> Considerando as 500 negociações mais recentemente atualizadas — pode não refletir o total histórico.</>
          )}
        </p>
      </div>

      {/* A. Gargalo atual */}
      <Card>
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Gargalo atual (maior aging médio agora)</p>
          {analytics.gargalo ? (
            <p className="text-lg font-semibold">
              {COLUNA_LABEL[analytics.gargalo.stage]}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                — {textoDuracao(analytics.gargalo.agingMedioMs)} em média
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Dados históricos insuficientes.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* B. Aging médio atual por etapa */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Aging médio atual por etapa — negociações abertas, agora
          </p>
          {semNenhumEpisodio ? (
            <p className="text-sm text-muted-foreground">Dados históricos insuficientes.</p>
          ) : (
            <BarraPorEtapa valores={analytics.agingAgregado} formatar={textoDuracao} />
          )}
        </div>

        {/* C. Tempo médio histórico por etapa */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Tempo médio histórico por etapa — episódios já concluídos, {analytics.periodo === "TODOS" ? "todo o período" : "no período"}
          </p>
          {semNenhumTempoMedio ? (
            <p className="text-sm text-muted-foreground">Dados históricos insuficientes.</p>
          ) : (
            <BarraPorEtapa valores={analytics.tempoMedioHistorico} formatar={textoDuracao} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* D. Entradas por etapa no período */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Entradas por etapa no período — transições registradas, não negócios únicos
          </p>
          <div className="space-y-1 text-sm">
            {COLUNAS_ABERTAS.map((coluna) => (
              <div key={coluna} className="flex items-center justify-between">
                <span className="text-muted-foreground">{COLUNA_LABEL[coluna]}</span>
                <span className="font-medium tabular-nums">{analytics.entradasPorEtapa[coluna]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* E. Transições observadas */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Transições observadas no período — contagem factual, não taxa de conversão
          </p>
          {semTransicoes ? (
            <p className="text-sm text-muted-foreground">Dados históricos insuficientes.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {analytics.transicoesObservadas.map((t) => (
                <li key={`${t.de ?? "novo"}->${t.para}`} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground truncate">
                    {labelEstagioOuNovo(t.de)} → {labelEstagioOuNovo(t.para)}
                  </span>
                  <span className="font-medium tabular-nums shrink-0">{t.quantidade}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* F. Tempo médio até fechamento — só quando há dado (histórico completo + encerrado) */}
      {!semTempoFechamento && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Tempo médio até fechamento — só negociações com histórico completo desde a criação
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Ganhas</p>
                <p className="text-base font-semibold">{textoDuracao(analytics.tempoAteFechamento.ganho)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Perdidas</p>
                <p className="text-base font-semibold">{textoDuracao(analytics.tempoAteFechamento.perdido)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Todas encerradas</p>
                <p className="text-base font-semibold">{textoDuracao(analytics.tempoAteFechamento.todos)}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
