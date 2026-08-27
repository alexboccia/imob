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
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
    >
      <input type="hidden" name="visao" value={visao === "ENCERRADA" ? "encerrada" : "aberta"} />
      {params.prioridade && <input type="hidden" name="prioridade" value={params.prioridade} />}
      {/* w-full sm:min-w-0 sm:flex-1: achado real da auditoria de
          responsividade — com flex-1+min-w-0 dentro de um flex-wrap de
          largura livre, o navegador sempre consegue encaixar tudo numa
          linha só encolhendo este campo até quase 0 (min-w-0 remove o piso
          que faria o flex-wrap disparar), em vez de quebrar linha —
          resultado visual: campo de busca reduzido a ~40px, mostrando só
          "Bu" do placeholder. Abaixo de `sm`, este campo ocupa sua própria
          linha inteira (w-full); a partir de `sm`, volta a dividir espaço
          com os demais campos (sm:flex-1). */}
      <div className="w-full space-y-1 sm:min-w-0 sm:flex-1">
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
      {/* size="default" (não "sm"): Input/<select> desta barra são h-8;
          buttonVariants({size:"sm"}) é h-7, 4px mais baixo — com
          items-end no container, isso alinhava só a base, deixando o
          topo do botão visivelmente mais baixo que os campos ao lado
          (achado real reportado nesta tela). size="default" é h-8,
          mesma altura dos campos — corrige sem tocar Button/
          buttonVariants nem outras telas que usam o mesmo padrão
          size="sm" ao lado de <select> h-8 (ex: Agenda), que ficam fora
          de escopo desta correção pontual do Pipeline. */}
      <button type="submit" className={cn(buttonVariants({ variant: "default" }))}>
        Filtrar
      </button>
      {temFiltroAtivo && (
        <Link
          href={construirHref({ visao: params.visao, periodo: params.periodo }, {}, true)}
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          Limpar filtros
        </Link>
      )}
    </form>
  );
}
