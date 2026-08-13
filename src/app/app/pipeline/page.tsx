import Link from "next/link";
import { requireOrganizationId } from "@/lib/tenant";
import { hasModule } from "@/lib/entitlements";
import { interpretarPaginacao } from "@/lib/pagination";
import {
  buscarPipelineAberto,
  buscarPipelineEncerrado,
  interpretarFiltrosPipeline,
  COLUNAS_ABERTAS,
  type ColunaAberta,
} from "@/lib/pipeline";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";
import { CardPipeline } from "@/components/admin/CardPipeline";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
};

// Mesmo racional de construirHref em agenda/page.tsx — preserva os
// filtros ativos em qualquer navegação (troca de visão, paginação),
// nunca "esquece" um filtro que o corretor já tinha aplicado.
function construirHref(params: SearchParams, overrides: Partial<SearchParams>, resetarPage: boolean): string {
  const efetivos: SearchParams = { ...params, ...overrides };
  if (resetarPage) delete efetivos.page;

  const busca = new URLSearchParams();
  if (efetivos.q) busca.set("q", efetivos.q);
  if (efetivos.visao && efetivos.visao.toUpperCase() === "ENCERRADA") busca.set("visao", efetivos.visao);
  if (efetivos.resultado && efetivos.resultado.toUpperCase() !== "TODOS") busca.set("resultado", efetivos.resultado);
  if (efetivos.page) busca.set("page", efetivos.page);

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
            href={construirHref({ visao: params.visao }, {}, true)}
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
    const totalAberto = COLUNAS_ABERTAS.reduce((soma, coluna) => soma + colunas[coluna].length, 0);
    const semResultadoPorFiltro = totalAberto === 0 && filtros.busca !== "";

    return (
      <div>
        <h1 className="text-2xl font-semibold mb-1">Pipeline</h1>
        <p className="text-muted-foreground text-sm mb-4">
          Negociações em andamento, agrupadas por etapa.
        </p>

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
                  <span className="text-muted-foreground font-normal">({colunas[coluna].length})</span>
                </h2>
                {colunas[coluna].length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma negociação nesta etapa.</p>
                ) : (
                  <div className="space-y-2">
                    {colunas[coluna].map((item) => (
                      <CardPipeline key={item.id} item={item} />
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
