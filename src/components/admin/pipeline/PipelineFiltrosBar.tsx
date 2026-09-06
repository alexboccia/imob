import Link from "next/link";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FILTRO_SEM_RESPONSAVEL, PERIODO_PIPELINE_LABEL, type FiltrosPipeline, type PeriodoPipeline, type VisaoPipeline } from "@/lib/pipeline";
import type { OpcaoResponsavel } from "@/lib/responsavel-negociacao";

const PERIODOS_PIPELINE_OPCOES: readonly PeriodoPipeline[] = ["30d", "90d", "ANO", "TODOS"];

type SearchParams = {
  q?: string;
  visao?: string;
  resultado?: string;
  page?: string;
  periodo?: string;
  prioridade?: string;
  responsavel?: string;
};

// Fase 11 — o campo "Corretor" que faltava. A nota abaixo registrava
// exatamente esta dívida: o filtro não existia porque não havia ownership
// server-side para filtrar. Agora PropertyInterest.responsibleMemberId
// existe, e o filtro é um parâmetro de URL como todos os outros.
//
// Redesenho do Pipeline — barra operacional única (item 7 do pedido):
// funde os dois <form> separados que existiam antes (seletor de período
// isolado + busca/resultado num form próprio) num só submit, sem nenhum
// campo novo — mesmos 3 parâmetros de URL de sempre (q/periodo/resultado),
// mesma leitura em page.tsx (interpretarFiltrosPipeline/
// interpretarPeriodoPipeline, já sanitizados contra enum inválido).
export function PipelineFiltrosBar({
  params,
  filtros,
  periodo,
  visao,
  construirHref,
  membros,
  membroAtualId,
}: {
  params: SearchParams;
  filtros: FiltrosPipeline;
  periodo: PeriodoPipeline;
  visao: VisaoPipeline;
  construirHref: (params: SearchParams, overrides: Partial<SearchParams>, resetarPage: boolean) => string;
  membros: OpcaoResponsavel[];
  // Vínculo do usuário logado nesta organização. Sem ele (sessão sem
  // membership) a opção "Meus negócios" simplesmente não aparece, em vez
  // de virar um filtro quebrado — estado seguro.
  membroAtualId: string | null;
}) {
  const temFiltroAtivo =
    filtros.busca !== "" || filtros.resultado !== "TODOS" || filtros.responsavel !== "";

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
      {/* "Meus negócios" é a MESMA dimensão de "corretor X": um só
          <select> resolve os quatro estados pedidos (todos / meus /
          corretor X / sem responsável) sem inventar um controle novo, e
          continua cabendo em 375px. O valor de "Meus negócios" é o id do
          próprio membro — nunca User.id, que é identidade global e não
          casaria com responsibleMemberId. */}
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="pipeline-responsavel" className="text-xs text-muted-foreground">
          Responsável
        </label>
        <select
          id="pipeline-responsavel"
          name="responsavel"
          defaultValue={filtros.responsavel}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos</option>
          {membroAtualId && <option value={membroAtualId}>Meus negócios</option>}
          <option value={FILTRO_SEM_RESPONSAVEL}>Sem responsável</option>
          {membros
            .filter((m) => m.memberId !== membroAtualId)
            .map((membro) => (
              <option key={membro.memberId} value={membro.memberId}>
                {membro.nome}
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
