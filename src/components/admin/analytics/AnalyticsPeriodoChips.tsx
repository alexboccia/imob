import Link from "next/link";
import {
  BarraSegmentada,
  classesItemSegmentado,
} from "@/components/admin/ui/BarraSegmentada";
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
export function AnalyticsPeriodoChips({
  periodo,
  // Fase 68 — parâmetros a PRESERVAR no href. Até aqui o componente
  // escrevia `/app/analytics?periodo=X` do zero e descartava tudo o mais
  // que estivesse na URL. Isso não incomodava porque o período era o único
  // parâmetro da tela; agora que o domínio (?tab=) também vive na URL,
  // trocar de período apagaria a aba aberta. Passar os extras aqui é o que
  // mantém as duas escolhas independentes.
  extras,
}: {
  periodo: PeriodoAnalytics;
  extras?: Record<string, string | undefined>;
}) {
  function href(opcao: PeriodoAnalytics): string {
    const params = new URLSearchParams();
    // O padrão (30d) continua sendo a URL limpa, sem ?periodo=.
    if (opcao !== "30d") params.set("periodo", opcao);
    for (const [chave, valor] of Object.entries(extras ?? {})) {
      if (valor) params.set(chave, valor);
    }
    const query = params.toString();
    return query ? `/app/analytics?${query}` : "/app/analytics";
  }

  return (
    // Fase 68 — só a moldura passou a ser a barra segmentada do
    // backoffice. A semântica é a MESMA e é a correta: são <Link>
    // URL-driven (?periodo=), resolvidos no servidor, com aria-current —
    // nunca abas, porque não há painel alternado no cliente aqui.
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span id="rotulo-periodo-analytics" className="shrink-0 text-sm text-muted-foreground">
        Período:
      </span>
      <BarraSegmentada role="navigation" aria-labelledby="rotulo-periodo-analytics">
        {PERIODOS_ANALYTICS_OPCOES.map((opcao) => {
          const ativo = opcao === periodo;
          return (
            <Link
              key={opcao}
              href={href(opcao)}
              aria-current={ativo ? "page" : undefined}
              aria-label={PERIODO_ANALYTICS_LABEL[opcao]}
              className={classesItemSegmentado(ativo)}
            >
              {PERIODO_ANALYTICS_CHIP[opcao]}
              {/* Estado em TEXTO, não só em cor. */}
              {ativo && <span className="sr-only"> (período atual)</span>}
            </Link>
          );
        })}
      </BarraSegmentada>
    </div>
  );
}
