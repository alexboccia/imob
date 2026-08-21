import Link from "next/link";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FiltrosAgenda, FiltroStatusAgenda } from "@/lib/agenda";

const STATUS_FILTRO_LABEL: Record<FiltroStatusAgenda, string> = {
  TODAS: "Todas",
  AGENDADAS: "Agendadas",
  CONCLUIDAS: "Concluídas",
  CANCELADAS: "Canceladas",
  ATRASADAS: "Atrasadas",
};
const STATUS_FILTRO_OPCOES: FiltroStatusAgenda[] = [
  "TODAS",
  "AGENDADAS",
  "CONCLUIDAS",
  "CANCELADAS",
  "ATRASADAS",
];

// Redesenho da Agenda (item 9 do pedido) — barra operacional única, mesmo
// visual de PipelineFiltrosBar. Mantém EXATAMENTE os 4 controles que já
// existiam (busca/De/Até/status) — "De"/"Até" continuam porque são
// capacidade real já suportada por interpretarFiltrosAgenda/
// buscarAgenda* (src/lib/agenda.ts), não removida s/ necessidade.
// Nenhum campo novo, nenhum parâmetro de URL novo.
function paraInputDate(data: Date | null): string {
  if (!data) return "";
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function AgendaFiltrosBar({
  aba,
  filtros,
  temFiltrosAtivos,
}: {
  aba: string;
  filtros: FiltrosAgenda;
  temFiltrosAtivos: boolean;
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-sm"
    >
      <input type="hidden" name="aba" value={aba} />
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor="agenda-q" className="text-xs text-muted-foreground">
          Buscar
        </label>
        <Input id="agenda-q" name="q" defaultValue={filtros.busca} placeholder="Buscar cliente ou imóvel..." />
      </div>
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="agenda-de" className="text-xs text-muted-foreground">
          De
        </label>
        {/* w-full + min-w-0: um <input type="date"> nativo, como
            qualquer item flex, tem min-width:auto por padrão — sem isso
            força a própria largura de conteúdo mesmo num container
            flex-wrap mais estreito (mesmo mecanismo do bug de overflow
            corrigido no Pipeline: h1/<select> de período). */}
        <input
          id="agenda-de"
          name="de"
          type="date"
          defaultValue={paraInputDate(filtros.de)}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="agenda-ate" className="text-xs text-muted-foreground">
          Até
        </label>
        <input
          id="agenda-ate"
          name="ate"
          type="date"
          defaultValue={paraInputDate(filtros.ate)}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="min-w-0 max-w-full space-y-1">
        <label htmlFor="agenda-status" className="text-xs text-muted-foreground">
          Status
        </label>
        <select
          id="agenda-status"
          name="status"
          defaultValue={filtros.status}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {STATUS_FILTRO_OPCOES.map((opcao) => (
            <option key={opcao} value={opcao}>
              {STATUS_FILTRO_LABEL[opcao]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
        Filtrar
      </button>
      {temFiltrosAtivos && (
        <Link href={`/app/agenda${aba !== "hoje" ? `?aba=${aba}` : ""}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          Limpar filtros
        </Link>
      )}
      {filtros.intervaloInvalido && (
        <p className="w-full basis-full text-xs text-destructive">
          Data inicial não pode ser depois da data final — mostrando todos os períodos.
        </p>
      )}
    </form>
  );
}
