import Link from "next/link";
import { requireOrganizationId } from "@/lib/tenant";
import { hasModule } from "@/lib/entitlements";
import { interpretarPaginacao } from "@/lib/pagination";
import {
  buscarAgendaHoje,
  buscarAgendaProximas,
  buscarAgendaAnteriores,
  contarAgenda,
  contarResumoDiario,
  interpretarFiltrosAgenda,
  type ItemAgenda,
  type FiltroStatusAgenda,
} from "@/lib/agenda";
import { periodoDaVisita, proximaVisita, type PeriodoDia } from "@/lib/scheduled-activity-date";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";
import { AgendaItemCard } from "@/components/admin/AgendaItemCard";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Agenda do corretor (Fase H.3, evoluída na H.4) — projeção operacional de
// ScheduledActivity(VISIT), nunca uma segunda fonte de verdade. Sem
// formulário de "nova visita" solta: criação continua exclusivamente a
// partir de um PropertyInterest existente, nas fichas já implementadas
// pela H.2. A H.4 adiciona busca, filtro de período e filtro de status
// operacional — todos aplicados no servidor (Prisma/Postgres), nunca
// carregando a listagem inteira pra filtrar no client.

const ABAS = ["hoje", "proximas", "anteriores"] as const;
type Aba = (typeof ABAS)[number];

function ehAba(valor: string | undefined): valor is Aba {
  return ABAS.includes(valor as Aba);
}

const ABA_LABEL: Record<Aba, string> = {
  hoje: "Hoje",
  proximas: "Próximas",
  anteriores: "Anteriores",
};

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

// Agrupamento da aba Hoje (Fase H.5) — ordem de exibição fixa
// Manhã/Tarde/Noite, nunca reordenada por status/cliente/imóvel.
const PERIODOS_DIA: PeriodoDia[] = ["MANHA", "TARDE", "NOITE"];
const PERIODO_DIA_LABEL: Record<PeriodoDia, string> = {
  MANHA: "Manhã",
  TARDE: "Tarde",
  NOITE: "Noite",
};

type SearchParams = {
  aba?: string;
  page?: string;
  pageSize?: string;
  q?: string;
  de?: string;
  ate?: string;
  status?: string;
};

// Formata Date -> "YYYY-MM-DD" (valor esperado por <input type="date">) a
// partir dos componentes UTC — nunca toISOString().slice(0,10) puro seria
// arriscado aqui porque os valores já vêm de parseDataUTC (sempre meia-
// noite UTC), mas manter os getters UTC explícitos evita qualquer dúvida
// futura se essa função for reaproveitada com outro tipo de Date.
function paraInputDate(data: Date | null): string {
  if (!data) return "";
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Monta querystring preservando os filtros atuais, com overrides pontuais
// (ex: trocar só `aba` ou só `page`) — usado tanto pelos links de aba
// quanto pelos de paginação, pra nenhuma navegação "esquecer" um filtro
// ativo do usuário.
function construirHref(params: SearchParams, overrides: Partial<SearchParams>, resetarPage: boolean): string {
  const efetivos: SearchParams = { ...params, ...overrides };
  if (resetarPage) delete efetivos.page;

  const busca = new URLSearchParams();
  if (efetivos.aba && efetivos.aba !== "hoje") busca.set("aba", efetivos.aba);
  if (efetivos.q) busca.set("q", efetivos.q);
  if (efetivos.de) busca.set("de", efetivos.de);
  if (efetivos.ate) busca.set("ate", efetivos.ate);
  if (efetivos.status && efetivos.status !== "TODAS") busca.set("status", efetivos.status);
  if (efetivos.page) busca.set("page", efetivos.page);

  const query = busca.toString();
  return query ? `/app/agenda?${query}` : "/app/agenda";
}

export default async function AgendaPage({
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
          descricao="Acompanhe suas visitas agendadas em um só lugar."
        />
      </div>
    );
  }

  const aba: Aba = ehAba(params.aba) ? params.aba : "hoje";
  // Um único instante "agora" reaproveitado em toda a página — contadores e
  // lista da aba ativa precisam concordar sobre o que é "hoje" dentro da
  // mesma requisição.
  const agora = new Date();

  const filtros = interpretarFiltrosAgenda(params);
  const temFiltrosAtivos = Boolean(filtros.busca || filtros.de || filtros.ate || filtros.status !== "TODAS");

  const contadores = await contarAgenda(organizationId, { agora });

  const { page, take } = interpretarPaginacao(params, { pageSizePadrao: 20, pageSizeMaximo: 50 });
  const skip = (page - 1) * take;

  let itens: ItemAgenda[];
  if (aba === "hoje") {
    itens = await buscarAgendaHoje(organizationId, { agora, filtros });
  } else if (aba === "proximas") {
    itens = await buscarAgendaProximas(organizationId, { agora, filtros });
  } else {
    itens = await buscarAgendaAnteriores(organizationId, { agora, skip, take, filtros });
  }

  // Resumo diário (H.5) — só calculado/exibido na aba Hoje, sempre
  // GLOBAL (não aplica filtros H.4, decisão explícita da H.5 seção 12):
  // uma busca por "João" não pode fazer "Agendadas hoje" parecer 1
  // quando na verdade são 5.
  const resumoDiario = aba === "hoje" ? await contarResumoDiario(organizationId, { agora }) : null;

  // Próxima visita e agrupamento por período (H.5) — calculados em
  // memória sobre `itens` (já filtrado pelos parâmetros H.4 ativos),
  // nunca via query própria. "Próxima visita" reflete o conjunto VISÍVEL
  // após os filtros, não o conjunto total do dia (decisão H.5 seção 13).
  const proximaVisitaItem = aba === "hoje" ? proximaVisita(itens, agora) : null;
  const gruposDoDia =
    aba === "hoje"
      ? PERIODOS_DIA.map((periodo) => ({
          periodo,
          itens: itens.filter((item) => periodoDaVisita(item.scheduledAt) === periodo),
        })).filter((grupo) => grupo.itens.length > 0)
      : null;

  const mensagemVazia: Record<Aba, string> = {
    hoje: "Nenhuma visita agendada para hoje.",
    proximas: "Nenhuma próxima visita agendada.",
    anteriores: "Nenhuma visita anterior encontrada.",
  };
  const mensagemVaziaFinal = temFiltrosAtivos
    ? "Nenhuma visita encontrada com esses filtros."
    : mensagemVazia[aba];

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Agenda</h1>
      <p className="text-muted-foreground text-sm mb-4">
        Gerencie suas visitas e compromissos comerciais.
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-4">
        <span>
          Hoje: <span className="font-medium text-foreground">{contadores.hoje}</span>
        </span>
        <span>
          Próximas: <span className="font-medium text-foreground">{contadores.proximas}</span>
        </span>
        <span>
          Atrasadas: <span className="font-medium text-foreground">{contadores.atrasadas}</span>
        </span>
      </div>

      {/* Resumo diário (H.5) — distinto do resumo global acima: só na
          aba Hoje, sempre baseado em scheduledAt (data da visita), nunca
          filtrado pelos parâmetros de busca/período/status. */}
      {resumoDiario && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-4 border-t pt-3">
          <span>
            Agendadas hoje: <span className="font-medium text-foreground">{resumoDiario.agendadas}</span>
          </span>
          <span>
            Concluídas hoje: <span className="font-medium text-foreground">{resumoDiario.concluidas}</span>
          </span>
          <span>
            Canceladas hoje: <span className="font-medium text-foreground">{resumoDiario.canceladas}</span>
          </span>
        </div>
      )}

      <form method="get" className="flex flex-wrap items-end gap-2 mb-3 border rounded-md p-3">
        <input type="hidden" name="aba" value={aba} />
        <div className="flex-1 min-w-[140px] space-y-1">
          <label htmlFor="agenda-q" className="text-xs text-muted-foreground">
            Buscar
          </label>
          <Input
            id="agenda-q"
            name="q"
            defaultValue={filtros.busca}
            placeholder="Buscar cliente ou imóvel..."
          />
        </div>
        <div className="space-y-1 w-[132px] max-w-full">
          <label htmlFor="agenda-de" className="text-xs text-muted-foreground">
            De
          </label>
          <input
            id="agenda-de"
            name="de"
            type="date"
            defaultValue={paraInputDate(filtros.de)}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="space-y-1 w-[132px] max-w-full">
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
        <div className="space-y-1">
          <label htmlFor="agenda-status" className="text-xs text-muted-foreground">
            Status
          </label>
          <select
            id="agenda-status"
            name="status"
            defaultValue={filtros.status}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
          <Link href="/app/agenda" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Limpar filtros
          </Link>
        )}
      </form>

      {filtros.intervaloInvalido && (
        <p className="text-xs text-destructive mb-3">
          Data inicial não pode ser depois da data final — mostrando todos os períodos.
        </p>
      )}

      <nav className="flex flex-wrap gap-2 mb-6" aria-label="Período da agenda">
        {ABAS.map((chave) => (
          <Link
            key={chave}
            href={construirHref(params, { aba: chave }, true)}
            aria-current={aba === chave ? "page" : undefined}
            className={cn(buttonVariants({ variant: aba === chave ? "default" : "outline", size: "sm" }))}
          >
            {ABA_LABEL[chave]} ({contadores[chave]})
          </Link>
        ))}
      </nav>

      {itens.length === 0 ? (
        <p className="text-muted-foreground text-sm">{mensagemVaziaFinal}</p>
      ) : gruposDoDia ? (
        <div className="space-y-6">
          {gruposDoDia.map((grupo) => (
            <div key={grupo.periodo} className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {PERIODO_DIA_LABEL[grupo.periodo]}
              </h2>
              {grupo.itens.map((item) => (
                <AgendaItemCard
                  key={item.id}
                  item={item}
                  agora={agora}
                  ehProximaVisita={proximaVisitaItem?.id === item.id}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map((item) => (
            <AgendaItemCard key={item.id} item={item} agora={agora} />
          ))}
        </div>
      )}

      {aba === "anteriores" && (page > 1 || itens.length === take) && (
        <div className="flex items-center justify-between mt-4 text-sm">
          {page > 1 ? (
            <Link
              href={construirHref(params, { page: String(page - 1) }, false)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              ← Página anterior
            </Link>
          ) : (
            <span />
          )}
          {itens.length === take && (
            <Link
              href={construirHref(params, { page: String(page + 1) }, false)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Próxima página →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
