import { requireOrganizationId } from "@/lib/tenant";
import { hasModule } from "@/lib/entitlements";
import { interpretarPaginacao } from "@/lib/pagination";
import {
  buscarPipelineAberto,
  buscarPipelineEncerrado,
  buscarMetricasPipeline,
  buscarAnalyticsHistoricoPipeline,
  interpretarFiltrosPipeline,
  interpretarPeriodoPipeline,
  interpretarFiltroPrioridade,
  classificarPrioridadePipeline,
  PERIODO_PIPELINE_LABEL,
  COLUNAS_ABERTAS,
  type ColunaAberta,
  type PrioridadePipeline,
} from "@/lib/pipeline";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";
import { CardPipeline } from "@/components/admin/CardPipeline";
import { PipelineKpiCards } from "@/components/admin/pipeline/PipelineKpiCards";
import { PipelineTabs } from "@/components/admin/pipeline/PipelineTabs";
import { PipelineFiltrosBar } from "@/components/admin/pipeline/PipelineFiltrosBar";
import { PipelinePrioridadeChips } from "@/components/admin/pipeline/PipelinePrioridadeChips";
import { PipelineInsights } from "@/components/admin/pipeline/PipelineInsights";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

// Pipeline (Fase P.4, redesenhado pra seguir o mesmo padrão visual/UX do
// CRM de Clientes) — projeção operacional de PropertyInterest (nunca uma
// segunda fonte de verdade — ver src/lib/pipeline.ts). Mesmo padrão
// estrutural de src/app/app/agenda: filtros URL-driven, refresh preserva
// estado, sem estado client-side escondido na página em si (só os cards
// individuais guardam o estado local do próprio drawer).

const COLUNA_LABEL: Record<ColunaAberta, string> = {
  INTERESTED: "Interessado",
  VISIT_SCHEDULED: "Visita agendada",
  VISITED: "Visitou",
  PROPOSAL: "Proposta",
};

type SearchParams = {
  q?: string;
  visao?: string;
  resultado?: string;
  page?: string;
  periodo?: string;
  prioridade?: string;
};

// Mesmo racional de construirHref em agenda/page.tsx — preserva os
// filtros ativos em qualquer navegação (troca de visão, paginação, troca
// de período), nunca "esquece" um filtro que o corretor já tinha
// aplicado. `periodo` é só mais um parâmetro preservado aqui — nunca
// influencia q/visao/resultado/page, e vice-versa.
function construirHref(params: SearchParams, overrides: Partial<SearchParams>, resetarPage: boolean): string {
  const efetivos: SearchParams = { ...params, ...overrides };
  if (resetarPage) delete efetivos.page;

  const busca = new URLSearchParams();
  if (efetivos.q) busca.set("q", efetivos.q);
  if (efetivos.visao && efetivos.visao.toUpperCase() === "ENCERRADA") busca.set("visao", efetivos.visao);
  if (efetivos.resultado && efetivos.resultado.toUpperCase() !== "TODOS") busca.set("resultado", efetivos.resultado);
  if (efetivos.page) busca.set("page", efetivos.page);
  if (efetivos.periodo && efetivos.periodo.toUpperCase() !== "30D") busca.set("periodo", efetivos.periodo);
  if (efetivos.prioridade && efetivos.prioridade.toUpperCase() !== "TODAS") busca.set("prioridade", efetivos.prioridade);

  const query = busca.toString();
  return query ? `/app/pipeline?${query}` : "/app/pipeline";
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const organizationId = await requireOrganizationId();

  if (!(await hasModule(organizationId, "crm"))) {
    return (
      <div className="max-w-3xl">
        <ModuloBloqueado
          titulo="CRM não incluído no seu plano"
          descricao="Acompanhe o funil de negociações em um só lugar."
        />
      </div>
    );
  }

  const filtros = interpretarFiltrosPipeline(params);
  // Período é deliberadamente independente de q/visao/resultado — só
  // afeta o resumo gerencial (KPIs/Insights), nunca o Kanban/lista abaixo.
  // buscarMetricasPipeline nunca reaproveita os itens já carregados de
  // buscarPipelineAberto/Encerrado (que têm teto de exibição) — 2 queries
  // `groupBy` estruturais próprias, sempre GLOBAIS na parte de estoque atual.
  const periodo = interpretarPeriodoPipeline(params);
  const metricas = await buscarMetricasPipeline(organizationId, { periodo });
  // Leitura independente, própria (nunca reaproveita os itens de
  // buscarPipelineAberto/Encerrado, que têm teto de exibição).
  const analyticsHistorico = await buscarAnalyticsHistoricoPipeline(organizationId, { periodo });

  const Cabecalho = (
    <div>
      <h1 className="text-2xl font-semibold">Pipeline</h1>
      <p className="text-sm text-muted-foreground">
        {filtros.visao === "ABERTA"
          ? "Negociações em andamento, agrupadas por etapa."
          : "Negociações encerradas — ganhas ou perdidas."}
      </p>
    </div>
  );

  const Kpis = <PipelineKpiCards metricas={metricas} periodoLabel={PERIODO_PIPELINE_LABEL[periodo]} />;

  const Tabs = (
    <PipelineTabs
      visao={filtros.visao}
      emAndamento={metricas.emAndamento}
      hrefAberta={construirHref(params, { visao: "aberta" }, true)}
      hrefEncerrada={construirHref(params, { visao: "encerrada" }, true)}
    />
  );

  const FiltrosBar = (
    <PipelineFiltrosBar
      params={params}
      filtros={filtros}
      periodo={periodo}
      visao={filtros.visao}
      construirHref={construirHref}
    />
  );

  const Insights = <PipelineInsights analytics={analyticsHistorico} />;

  if (filtros.visao === "ABERTA") {
    const colunas = await buscarPipelineAberto(organizationId, { busca: filtros.busca });

    // Classificação pura, in-memory, zero I/O adicional — reusa os itens
    // já carregados por buscarPipelineAberto e a média por etapa já
    // carregada por buscarAnalyticsHistoricoPipeline, ambos buscados
    // acima antes desta ramificação.
    const agora = new Date();
    const prioridadesPorItem = new Map<string, PrioridadePipeline>();
    for (const coluna of COLUNAS_ABERTAS) {
      for (const item of colunas[coluna]) {
        prioridadesPorItem.set(
          item.id,
          classificarPrioridadePipeline(item, analyticsHistorico.tempoMedioHistorico[coluna], agora)
        );
      }
    }
    const contagemPrioridade = { ALTA: 0, MEDIA: 0, NORMAL: 0 };
    for (const prioridade of prioridadesPorItem.values()) {
      contagemPrioridade[prioridade.nivel] += 1;
    }

    // Filtro ?prioridade= (opcional) — afeta SÓ quais cards aparecem em
    // cada coluna, nunca a ordenação e nunca KPIs/Insights (já resolvidos
    // acima, antes deste filtro).
    const filtroPrioridade = interpretarFiltroPrioridade(params);
    const colunasExibidas =
      filtroPrioridade === "TODAS"
        ? colunas
        : (Object.fromEntries(
            COLUNAS_ABERTAS.map((c) => [
              c,
              colunas[c].filter((item) => prioridadesPorItem.get(item.id)?.nivel === filtroPrioridade),
            ])
          ) as Record<ColunaAberta, (typeof colunas)[ColunaAberta]>);

    const totalAberto = COLUNAS_ABERTAS.reduce((soma, coluna) => soma + colunasExibidas[coluna].length, 0);
    const semResultadoPorFiltro = totalAberto === 0 && (filtros.busca !== "" || filtroPrioridade !== "TODAS");

    return (
      <div className="space-y-5">
        {Cabecalho}
        {Kpis}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {Tabs}
          <PipelinePrioridadeChips
            filtroAtual={filtroPrioridade}
            total={prioridadesPorItem.size}
            contagem={contagemPrioridade}
            href={(nivel) => construirHref(params, { prioridade: nivel }, true)}
          />
        </div>

        {FiltrosBar}

        {totalAberto === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {semResultadoPorFiltro
                ? "Nenhuma negociação encontrada com estes filtros."
                : "Nenhuma negociação em andamento."}
            </p>
          </div>
        ) : (
          // Desktop: colunas lado a lado, scroll horizontal CONTIDO neste
          // container (nunca no documento inteiro). Mobile: empilhadas
          // (flex-col), scroll só vertical, sem nenhum overflow horizontal
          // novo — mesmo mecanismo já validado antes do redesenho, só
          // restilizado.
          <div className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-2">
            {COLUNAS_ABERTAS.map((coluna) => (
              <div key={coluna} className="space-y-2 md:w-72 md:shrink-0">
                <h2 className="flex items-center justify-between text-sm font-medium">
                  {COLUNA_LABEL[coluna]}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {colunasExibidas[coluna].length}
                  </span>
                </h2>
                {colunasExibidas[coluna].length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <p className="text-xs text-muted-foreground">Nenhuma negociação nesta etapa.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {colunasExibidas[coluna].map((item) => (
                      <CardPipeline key={item.id} item={item} prioridade={prioridadesPorItem.get(item.id)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {Insights}
      </div>
    );
  }

  // Visão "Encerradas" — lista paginada (WON/REJECTED), mesmo
  // PAGE_SIZE_PADRAO/interpretarPaginacao de toda listagem administrativa.
  const { page, take } = interpretarPaginacao(params, { pageSizePadrao: 20, pageSizeMaximo: 50 });
  const skip = (page - 1) * take;
  const { itens, total } = await buscarPipelineEncerrado(organizationId, {
    busca: filtros.busca,
    resultado: filtros.resultado,
    skip,
    take,
  });
  const temFiltroAtivo = filtros.busca !== "" || filtros.resultado !== "TODOS";
  const temProximaPagina = skip + itens.length < total;

  return (
    <div className="space-y-5">
      {Cabecalho}
      {Kpis}
      {Tabs}
      {FiltrosBar}

      {itens.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {temFiltroAtivo ? "Nenhuma negociação encontrada com estes filtros." : "Nenhuma negociação encerrada."}
          </p>
        </div>
      ) : (
        <div className="grid max-w-2xl grid-cols-1 gap-2">
          {itens.map((item) => (
            <CardPipeline key={item.id} item={item} />
          ))}
        </div>
      )}

      {(page > 1 || temProximaPagina) && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={construirHref(params, { page: String(page - 1) }, false)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Anterior
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
              Anterior
            </span>
          )}
          {temProximaPagina ? (
            <Link
              href={construirHref(params, { page: String(page + 1) }, false)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Próxima
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
              Próxima
            </span>
          )}
        </div>
      )}

      {Insights}
    </div>
  );
}
