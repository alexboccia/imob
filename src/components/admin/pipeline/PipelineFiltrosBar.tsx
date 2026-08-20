import Link from "next/link";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PERIODO_PIPELINE_LABEL, type FiltrosPipeline, type PeriodoPipeline, type VisaoPipeline } from "@/lib/pipeline";

const PERIODOS_PIPELINE_OPCOES: readonly PeriodoPipeline[] = ["30d", "90d", "ANO", "TODOS"];

type SearchParams = {
  q?: string;
  visao?: string;
  resultado?: string;
  page?: string;
  periodo?: string;
  prioridade?: string;
};

// Redesenho do Pipeline — barra operacional única (item 7 do pedido):
// funde os dois <form> separados que existiam antes (seletor de período
// isolado + busca/resultado num form próprio) num só submit, sem nenhum
// campo novo — mesmos 3 parâmetros de URL de sempre (q/periodo/resultado),
// mesma leitura em page.tsx (interpretarFiltrosPipeline/
// interpretarPeriodoPipeline, já sanitizados contra enum inválido). Sem
// "Corretor": não existe hoje como filtro server-side, e inventar um
// backend novo só pra bater com o mockup está fora do escopo desta
// correção (ver relatório final).
export function PipelineFiltrosBar({
  params,
  filtros,
  periodo,
  visao,
  construirHref,
}: {
  params: SearchParams;
  filtros: FiltrosPipeline;
  periodo: PeriodoPipeline;
  visao: VisaoPipeline;
  construirHref: (params: SearchParams, overrides: Partial<SearchParams>, resetarPage: boolean) => string;
}) {
  const temFiltroAtivo = filtros.busca !== "" || filtros.resultado !== "TODOS";

  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-sm"
    >
      <input type="hidden" name="visao" value={visao === "ENCERRADA" ? "encerrada" : "aberta"} />
      {params.prioridade && <input type="hidden" name="prioridade" value={params.prioridade} />}
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor="pipeline-q" className="text-xs text-muted-foreground">
          Buscar
        </label>
        <Input id="pipeline-q" name="q" defaultValue={filtros.busca} placeholder="Buscar cliente ou imóvel..." />
      </div>
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="pipeline-periodo" className="text-xs text-muted-foreground">
          Período
        </label>
        {/* w-full (não largura intrínseca do <option> mais longo): um
            <select> nativo, como qualquer item flex, tem min-width:auto
            por padrão — sem isso ele força a própria largura de conteúdo
            mesmo dentro de um container flex-wrap mais estreito (mesmo
            mecanismo do bug de overflow do h1 do Dashboard, só que aqui
            no elemento de formulário em vez de texto). */}
        <select
          id="pipeline-periodo"
          name="periodo"
          defaultValue={periodo}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {PERIODOS_PIPELINE_OPCOES.map((opcao) => (
            <option key={opcao} value={opcao}>
              {PERIODO_PIPELINE_LABEL[opcao]}
            </option>
          ))}
        </select>
      </div>
      {visao === "ENCERRADA" && (
        <div className="min-w-0 max-w-full space-y-1">
          <label htmlFor="pipeline-resultado" className="text-xs text-muted-foreground">
            Resultado
          </label>
          <select
            id="pipeline-resultado"
            name="resultado"
            defaultValue={filtros.resultado}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
      {temFiltroAtivo && (
        <Link
          href={construirHref({ visao: params.visao, periodo: params.periodo }, {}, true)}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Limpar filtros
        </Link>
      )}
    </form>
  );
}
