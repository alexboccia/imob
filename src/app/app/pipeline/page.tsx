import Link from "next/link";
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
  type PeriodoPipeline,
  type FiltroPrioridadePipeline,
  type PrioridadePipeline,
} from "@/lib/pipeline";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";
import { CardPipeline } from "@/components/admin/CardPipeline";
import { ResumoPipeline } from "@/components/admin/ResumoPipeline";
import { AnalyticsHistoricoPipeline } from "@/components/admin/AnalyticsHistoricoPipeline";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PERIODOS_PIPELINE_OPCOES: readonly PeriodoPipeline[] = ["30d", "90d", "ANO", "TODOS"];

// Pipeline (Fase P.4) — primeira tela oficial do Kanban, projeção
// operacional de PropertyInterest (nunca uma segunda fonte de verdade —
// ver src/lib/pipeline.ts). Mesmo padrão estrutural de src/app/app/agenda
// (Fase H.3/H.4): filtros URL-driven, refresh preserva estado, sem estado
// client-side escondido.

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

const PRIORIDADE_LABEL: Record<Exclude<FiltroPrioridadePipeline, "TODAS">, string> = {
  ALTA: "Alta",
  MEDIA: "Média",
  NORMAL: "Normal",
};

// Mesmo racional de construirHref em agenda/page.tsx — preserva os
// filtros ativos em qualquer navegação (troca de visão, paginação, troca
// de período), nunca "esquece" um filtro que o corretor já tinha
// aplicado. `periodo` (Fase P.5) é só mais um parâmetro preservado aqui —
// nunca influencia q/visao/resultado/page, e vice-versa (seção 28/53 do
// pedido: busca do Kanban e período gerencial são independentes).
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
  // Período (Fase P.5) é deliberadamente independente de q/visao/resultado
  // — só afeta o resumo gerencial (ResumoPipeline), nunca o Kanban/lista
  // abaixo (seção 28/29 do pedido). buscarMetricasPipeline nunca reaproveita
  // os itens já carregados de buscarPipelineAberto/Encerrado (que têm teto
  // de exibição) — 2 queries `groupBy` estruturais próprias, sempre
  // GLOBAIS na parte de estoque atual.
  const periodo = interpretarPeriodoPipeline(params);
  const metricas = await buscarMetricasPipeline(organizationId, { periodo });
  // Fase P.7: leitura independente, própria (nunca reaproveita os itens
  // de buscarPipelineAberto/Encerrado, que têm teto de exibição) — mesmo
  // padrão arquitetural já estabelecido pra buscarMetricasPipeline (P.5).
  const analyticsHistorico = await buscarAnalyticsHistoricoPipeline(organizationId, { periodo });

  const Resumo = <ResumoPipeline metricas={metricas} />;
  const AnaliseHistorica = <AnalyticsHistoricoPipeline analytics={analyticsHistorico} />;

  const SeletorPeriodo = (
    <form method="get" className="flex flex-wrap items-end gap-2 mb-4">
      <input type="hidden" name="q" value={filtros.busca} />
      <input type="hidden" name="visao" value={filtros.visao === "ENCERRADA" ? "encerrada" : "aberta"} />
      <input type="hidden" name="resultado" value={filtros.resultado} />
      {params.page && <input type="hidden" name="page" value={params.page} />}
      <div className="space-y-1">
        <label htmlFor="pipeline-periodo" className="text-xs text-muted-foreground">
          Período dos resultados
        </label>
        <select
          id="pipeline-periodo"
          name="periodo"
          defaultValue={periodo}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {PERIODOS_PIPELINE_OPCOES.map((opcao) => (
            <option key={opcao} value={opcao}>
              {PERIODO_PIPELINE_LABEL[opcao]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Aplicar
      </button>
    </form>
  );

  const CabecalhoFiltros = (
    <>
      <nav className="flex flex-wrap gap-2 mb-3" aria-label="Situação da negociação">
        <Link
          href={construirHref(params, { visao: "aberta" }, true)}
          aria-current={filtros.visao === "ABERTA" ? "page" : undefined}
          className={cn(buttonVariants({ variant: filtros.visao === "ABERTA" ? "default" : "outline", size: "sm" }))}
        >
          Em andamento
        </Link>
        <Link
          href={construirHref(params, { visao: "encerrada" }, true)}
          aria-current={filtros.visao === "ENCERRADA" ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: filtros.visao === "ENCERRADA" ? "default" : "outline", size: "sm" })
          )}
        >
          Encerradas
        </Link>
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2 mb-4 border rounded-md p-3">
        <input type="hidden" name="visao" value={filtros.visao === "ENCERRADA" ? "encerrada" : "aberta"} />
        {periodo !== "30d" && <input type="hidden" name="periodo" value={periodo} />}
        <div className="flex-1 min-w-[160px] space-y-1">
          <label htmlFor="pipeline-q" className="text-xs text-muted-foreground">
            Buscar
          </label>
          <Input
            id="pipeline-q"
            name="q"
            defaultValue={filtros.busca}
            placeholder="Buscar cliente ou imóvel..."
          />
        </div>
        {filtros.visao === "ENCERRADA" && (
          <div className="space-y-1">
            <label htmlFor="pipeline-resultado" className="text-xs text-muted-foreground">
              Resultado
            </label>
            <select
              id="pipeline-resultado"
              name="resultado"
              defaultValue={filtros.resultado}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="TODOS">Todos</option>
              <option value="GANHO">Ganho</option>
              <option value="PERDIDO">Perdido</option>
            </select>
          </div>
        )}
        <button type="submit" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
          Filtrar
        </button>
        {(filtros.busca || filtros.resultado !== "TODOS") && (
          <Link
            href={construirHref({ visao: params.visao, periodo: params.periodo }, {}, true)}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Limpar filtros
          </Link>
        )}
      </form>
    </>
  );

  if (filtros.visao === "ABERTA") {
    const colunas = await buscarPipelineAberto(organizationId, { busca: filtros.busca });

    // Fase P.8: classificação pura, in-memory, zero I/O adicional — reusa
    // os itens já carregados por buscarPipelineAberto e a média por etapa
    // já carregada por buscarAnalyticsHistoricoPipeline (P.7), ambos
    // buscados acima antes desta ramificação. `agora` compartilhado entre
    // todos os itens desta mesma requisição (mesmo racional de agora
    // explícito em calcularAgingStageMs/derivarEpisodiosDaJornada).
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
    // cada coluna, nunca a ordenação (ordenarColuna, dentro de
    // buscarPipelineAberto, permanece intocada) e nunca ResumoPipeline/
    // AnalyticsHistoricoPipeline (já resolvidos acima, antes deste filtro).
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
    const semResultadoPorFiltro =
      totalAberto === 0 && (filtros.busca !== "" || filtroPrioridade !== "TODAS");

    const ResumoPrioridades = (
      <div
        className="flex flex-wrap items-center gap-2 mb-4 text-sm"
        aria-label="Prioridades das negociações abertas"
      >
        <span className="text-muted-foreground">Prioridades:</span>
        {(["TODAS", "ALTA", "MEDIA", "NORMAL"] as const).map((nivel) => (
          <Link
            key={nivel}
            href={construirHref(params, { prioridade: nivel }, true)}
            aria-current={filtroPrioridade === nivel ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: filtroPrioridade === nivel ? "default" : "outline", size: "sm" })
            )}
          >
            {nivel === "TODAS" ? "Todas" : PRIORIDADE_LABEL[nivel]} (
            {nivel === "TODAS" ? prioridadesPorItem.size : contagemPrioridade[nivel]})
          </Link>
        ))}
      </div>
    );

    return (
      <div>
        <h1 className="text-2xl font-semibold mb-1">Pipeline</h1>
        <p className="text-muted-foreground text-sm mb-4">
          Negociações em andamento, agrupadas por etapa.
        </p>

        {Resumo}
        {SeletorPeriodo}
        {AnaliseHistorica}
        {ResumoPrioridades}

        {CabecalhoFiltros}

        {totalAberto === 0 ? (
          <p className="text-muted-foreground text-sm">
            {semResultadoPorFiltro
              ? "Nenhuma negociação encontrada com estes filtros."
              : "Nenhuma negociação em andamento."}
          </p>
        ) : (
          // Desktop: colunas lado a lado, scroll horizontal CONTIDO neste
          // container (nunca no documento inteiro — critério de 360px da
          // P.4). Mobile: empilhadas (flex-col), scroll só vertical, sem
          // nenhum overflow horizontal novo.
          <div className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-2">
            {COLUNAS_ABERTAS.map((coluna) => (
              <div key={coluna} className="space-y-2 md:w-72 md:shrink-0">
                <h2 className="text-sm font-medium">
                  {COLUNA_LABEL[coluna]}{" "}
                  <span className="text-muted-foreground font-normal">({colunasExibidas[coluna].length})</span>
                </h2>
                {colunasExibidas[coluna].length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma negociação nesta etapa.</p>
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
    <div>
      <h1 className="text-2xl font-semibold mb-1">Pipeline</h1>
      <p className="text-muted-foreground text-sm mb-4">Negociações encerradas — ganhas ou perdidas.</p>

      {Resumo}
      {SeletorPeriodo}
      {AnaliseHistorica}

      {CabecalhoFiltros}

      {itens.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {temFiltroAtivo
            ? "Nenhuma negociação encontrada com estes filtros."
            : "Nenhuma negociação encerrada."}
        </p>
      ) : (
        <div className="max-w-2xl space-y-2">
          {itens.map((item) => (
            <CardPipeline key={item.id} item={item} />
          ))}
        </div>
      )}

      {(page > 1 || temProximaPagina) && (
        <div className="flex items-center gap-2 mt-4">
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
    </div>
  );
}
