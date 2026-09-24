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
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";
import { escopoComercialDaSessao } from "@/lib/escopo-comercial-sessao";
import { whereNegociacao } from "@/lib/escopo-comercial";
import { buscarMembrosAtribuiveis } from "@/lib/membros-organizacao";
import { auth } from "@/lib/auth";
import { PipelineKpiCards } from "@/components/admin/pipeline/PipelineKpiCards";
import { PipelineTabs } from "@/components/admin/pipeline/PipelineTabs";
import { PipelineFiltrosBar } from "@/components/admin/pipeline/PipelineFiltrosBar";
import { PipelinePrioridadeChips } from "@/components/admin/pipeline/PipelinePrioridadeChips";
import { PipelineInsights } from "@/components/admin/pipeline/PipelineInsights";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { CircleCheck, Inbox, KanbanSquare, SearchX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";

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
  // Fase 11 — id de OrganizationMember, "SEM" (sem responsável) ou
  // ausente (todos).
  responsavel?: string;
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
  // Fase 18 — fuso comercial da organização, resolvido UMA vez e
  // repassado às queries e a todos os cards: "pendência" é uma visita
  // cujo dia calendário da organização já passou, a mesma definição que
  // Agenda e Central usam.
  const fuso = await buscarFusoOrganizacao(organizationId);
  // Fase 22 — universo autorizado desta sessão. Entra em TODAS as
  // consultas do Pipeline (board, encerradas, métricas e histórico),
  // nunca só na listagem visível.
  const escopo = await escopoComercialDaSessao(organizationId);
  const escopoInteresse = whereNegociacao(escopo);
  // Período é deliberadamente independente de q/visao/resultado — só
  // afeta o resumo gerencial (KPIs/Insights), nunca o Kanban/lista abaixo.
  // buscarMetricasPipeline nunca reaproveita os itens já carregados de
  // buscarPipelineAberto/Encerrado (que têm teto de exibição) — 2 queries
  // `groupBy` estruturais próprias, sempre GLOBAIS na parte de estoque atual.
  const periodo = interpretarPeriodoPipeline(params);
  const metricas = await buscarMetricasPipeline(organizationId, escopoInteresse, { periodo });
  // Leitura independente, própria (nunca reaproveita os itens de
  // buscarPipelineAberto/Encerrado, que têm teto de exibição).
  const analyticsHistorico = await buscarAnalyticsHistoricoPipeline(organizationId, escopoInteresse, { periodo });
  // Fase 11 — uma query só para a página inteira: alimenta o filtro da
  // barra E o diálogo de troca de responsável de todos os cards.
  const [membrosAtribuiveis, session] = await Promise.all([
    buscarMembrosAtribuiveis(organizationId),
    auth(),
  ]);
  const membroAtualId = session?.user.organizationMemberId ?? null;

  const Cabecalho = (
    <CabecalhoPagina
      titulo="Pipeline"
      descricao="Acompanhe suas negociações e avance cada oportunidade até o fechamento."
    />
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
      membros={membrosAtribuiveis}
      membroAtualId={membroAtualId}
    />
  );

  const Insights = <PipelineInsights analytics={analyticsHistorico} />;

  if (filtros.visao === "ABERTA") {
    const colunas = await buscarPipelineAberto(organizationId, escopoInteresse, fuso, {
      busca: filtros.busca,
      responsavel: filtros.responsavel,
    });

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
          classificarPrioridadePipeline(
            item,
            analyticsHistorico.tempoMedioHistorico[coluna],
            fuso,
            agora
          )
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
    const semResultadoPorFiltro =
      totalAberto === 0 &&
      (filtros.busca !== "" || filtroPrioridade !== "TODAS" || filtros.responsavel !== "");

    return (
      <div className="space-y-6">
        {Cabecalho}
        {Kpis}
        {Tabs}

        {/* Seção NEGOCIAÇÕES — reúne filtros, prioridade e Kanban, que
            juntos são uma coisa só: encontrar e trabalhar as oportunidades.
            NÃO é uma aba: "Em andamento | Encerradas" já é a divisão de
            contexto desta tela, e esconder o Kanban ou a análise atrás de
            abas obrigaria a clicar para ver o trabalho do dia. */}
        <section className="min-w-0 space-y-4">
          <CabecalhoSecao
            icone={KanbanSquare}
            titulo="Negociações"
            descricao="Acompanhe e organize as oportunidades em cada etapa do funil."
          />

          {/* Fase 66.1 — filtros e prioridade formam UMA área funcional:
              16px entre eles (space-y-3 no bloco) em vez dos 24px que a
              seção aplicava, e o respiro maior fica antes do Kanban. Eles
              parecem relacionados sem virar uma única linha de controles —
              a prioridade continua visivelmente secundária. */}
          <div className="min-w-0 space-y-3">
            {FiltrosBar}

            <PipelinePrioridadeChips
              filtroAtual={filtroPrioridade}
              total={prioridadesPorItem.size}
              contagem={contagemPrioridade}
              href={(nivel) => construirHref(params, { prioridade: nivel }, true)}
            />
          </div>

        {totalAberto === 0 ? (
          <Card>
            <CardContent>
              <EstadoVazio
                icone={semResultadoPorFiltro ? SearchX : KanbanSquare}
                titulo={
                  semResultadoPorFiltro
                    ? "Nenhuma negociação encontrada com estes filtros."
                    : "Nenhuma negociação em andamento."
                }
                descricao={
                  semResultadoPorFiltro
                    ? "Ajuste a busca, o período, o responsável ou a prioridade."
                    : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          // Desktop: colunas lado a lado, scroll horizontal CONTIDO neste
          // container (nunca no documento inteiro). Mobile: empilhadas
          // (flex-col), scroll só vertical, sem nenhum overflow horizontal
          // novo — mesmo mecanismo já validado antes do redesenho, só
          // restilizado.
          // As colunas vêm de COLUNAS_ABERTAS (= ESTAGIOS_INTERESSE), nunca
          // escritas à mão aqui: acrescentar um estágio ao catálogo já o
          // faz aparecer como coluna.
          //
          // Desktop: colunas lado a lado, scroll horizontal CONTIDO neste
          // container (nunca no documento inteiro). Mobile: empilhadas
          // (flex-col), scroll só vertical — mesmo mecanismo já validado,
          // preservado.
          <div
            data-kanban-pipeline
            className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-2"
            // Fase 66.1 — INDICAÇÃO DE CONTINUIDADE HORIZONTAL, 100% CSS.
            //
            // O problema: em larguras intermediárias a última coluna
            // aparece cortada, e um corte sem sinal nenhum lê como layout
            // quebrado em vez de "há mais etapas ao lado".
            //
            // A técnica são quatro camadas de background. Duas "tampas"
            // com `background-attachment: local` ROLAM JUNTO do conteúdo;
            // duas sombras com `scroll` ficam presas às bordas do
            // container. No início, a tampa esquerda está sobre a sombra
            // esquerda e a esconde; ao rolar, a tampa sai e a sombra
            // aparece. No fim do scroll acontece o mesmo à direita. Sem
            // overflow, as duas tampas cobrem as duas sombras e nada é
            // exibido — que é exatamente o "não indicar conteúdo que não
            // existe" pedido.
            //
            // POR QUE NÃO JAVASCRIPT: detectar início/fim exigiria um
            // listener de scroll + ResizeObserver por página, re-render a
            // cada pixel rolado, e um estado novo num componente de
            // servidor. O CSS entrega o mesmo comportamento sem nada
            // disso. Limitação aceita e documentada: as tampas usam
            // `var(--background)`, então dependem do fundo da página ser
            // sólido — é o caso aqui.
            //
            // É decorativo por construção: background não entra na árvore
            // de acessibilidade, não recebe foco e não intercepta clique,
            // então nunca bloqueia um card.
            style={{
              backgroundImage: [
                "linear-gradient(to right, var(--background), transparent)",
                "linear-gradient(to left, var(--background), transparent)",
                "linear-gradient(to right, rgba(0,0,0,0.10), transparent)",
                "linear-gradient(to left, rgba(0,0,0,0.10), transparent)",
              ].join(", "),
              backgroundPosition: "left center, right center, left center, right center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "24px 100%, 24px 100%, 12px 100%, 12px 100%",
              backgroundAttachment: "local, local, scroll, scroll",
            }}
          >
            {COLUNAS_ABERTAS.map((coluna) => (
              // Superfície MUITO sutil para delimitar a coluna sem virar
              // um bloco colorido — e sem cor arbitrária por etapa, que
              // sugeriria uma semântica que o produto não tem.
              <div
                key={coluna}
                data-coluna-pipeline={coluna}
                className="min-w-0 space-y-2 rounded-xl border bg-muted/30 p-2.5 md:w-76 md:shrink-0"
              >
                {/* <h3>: a coluna vive sob o <h2> da seção "Negociações". */}
                <h3 className="flex min-w-0 items-center justify-between gap-2 text-sm font-medium">
                  <span className="min-w-0 break-words">{COLUNA_LABEL[coluna]}</span>
                  <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs font-normal text-muted-foreground tabular-nums">
                    {colunasExibidas[coluna].length}
                  </span>
                </h3>
                {colunasExibidas[coluna].length === 0 ? (
                  <EstadoVazio
                    className="gap-1.5 rounded-lg border border-dashed bg-background/60 px-3 py-6"
                    icone={Inbox}
                    titulo="Nenhuma negociação nesta etapa."
                  />
                ) : (
                  <div className="space-y-2">
                    {colunasExibidas[coluna].map((item) => (
                      <CardPipeline
                        key={item.id}
                        fuso={fuso}
                        item={item}
                        prioridade={prioridadesPorItem.get(item.id)}
                        membros={membrosAtribuiveis}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </section>

        {Insights}
      </div>
    );
  }

  // Visão "Encerradas" — lista paginada (WON/REJECTED), mesmo
  // PAGE_SIZE_PADRAO/interpretarPaginacao de toda listagem administrativa.
  const { page, take } = interpretarPaginacao(params, { pageSizePadrao: 20, pageSizeMaximo: 50 });
  const skip = (page - 1) * take;
  const { itens, total } = await buscarPipelineEncerrado(organizationId, escopoInteresse, {
    busca: filtros.busca,
    resultado: filtros.resultado,
    responsavel: filtros.responsavel,
    skip,
    take,
  });
  const temFiltroAtivo =
    filtros.busca !== "" || filtros.resultado !== "TODOS" || filtros.responsavel !== "";
  const temProximaPagina = skip + itens.length < total;

  return (
    <div className="space-y-6">
      {Cabecalho}
      {Kpis}
      {Tabs}
      {FiltrosBar}

      {itens.length === 0 ? (
        <Card>
          <CardContent>
            <EstadoVazio
              icone={temFiltroAtivo ? SearchX : CircleCheck}
              titulo={
                temFiltroAtivo
                  ? "Nenhuma negociação encontrada com estes filtros."
                  : "Nenhuma negociação encerrada."
              }
              descricao={
                temFiltroAtivo
                  ? "Ajuste a busca, o período, o responsável ou o resultado."
                  : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid max-w-2xl grid-cols-1 gap-2">
          {itens.map((item) => (
            <CardPipeline key={item.id} item={item} fuso={fuso} membros={membrosAtribuiveis} />
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
