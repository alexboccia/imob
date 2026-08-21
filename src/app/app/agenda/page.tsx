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
} from "@/lib/agenda";
import { periodoDaVisita, proximaVisita, painelAgoraDoDia, type PeriodoDia } from "@/lib/scheduled-activity-date";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";
import { AgendaItemCard } from "@/components/admin/AgendaItemCard";
import { PainelAgoraAgenda } from "@/components/admin/PainelAgoraAgenda";
import { AgendaKpiCards } from "@/components/admin/agenda/AgendaKpiCards";
import { AgendaTabs } from "@/components/admin/agenda/AgendaTabs";
import { AgendaFiltrosBar } from "@/components/admin/agenda/AgendaFiltrosBar";
import type { ItemAgendaClient } from "@/components/admin/agenda/agenda-visual";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Converte pra forma client-safe (scheduledAt -> scheduledAtISO) antes de
// entregar a AgendaItemCard/AgendaDetalhesDrawer — nenhum objeto Date
// bruto cruza a fronteira Server -> Client (ver ItemAgendaClient em
// agenda-visual.ts).
function paraItemCliente(item: ItemAgenda): ItemAgendaClient {
  const { scheduledAt, ...resto } = item;
  return { ...resto, scheduledAtISO: scheduledAt.toISOString() };
}

// Agenda do corretor (Fase H.3-H.7, redesenhada pra seguir o mesmo padrão
// visual/UX do CRM de Clientes/Pipeline) — projeção operacional de
// ScheduledActivity(VISIT), nunca uma segunda fonte de verdade. Sem
// formulário de "nova visita" solta: criação continua exclusivamente a
// partir de um PropertyInterest existente, nas fichas do cliente/imóvel —
// por isso este redesenho NÃO adiciona nenhum botão "+ Novo compromisso"
// (capacidade que nunca existiu, não deve ser fabricada só pro visual).

const ABAS = ["hoje", "proximas", "anteriores"] as const;
type Aba = (typeof ABAS)[number];

function ehAba(valor: string | undefined): valor is Aba {
  return ABAS.includes(valor as Aba);
}

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
  // Resumo diário (H.5) — antes do redesenho, só era calculado na aba
  // "hoje" (o único lugar que o exibia). Agora os KPIs ficam visíveis em
  // qualquer aba (mesmo padrão de Clientes/Pipeline), então esta mesma
  // query barata (3 counts pelo índice já existente) passa a rodar
  // sempre — nenhuma query nova, só deixou de ser condicional.
  const resumoDiario = await contarResumoDiario(organizationId, { agora });

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

  // Próxima visita e agrupamento por período (H.5) — calculados em
  // memória sobre `itens` (já filtrado pelos parâmetros H.4 ativos),
  // nunca via query própria.
  const proximaVisitaItem = aba === "hoje" ? proximaVisita(itens, agora) : null;
  // Painel "Agora" (Fase H.7) — calculado sobre `itens`, o mesmo conjunto
  // VISÍVEL já filtrado.
  const painelAgora = aba === "hoje" ? painelAgoraDoDia(itens, agora) : null;
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
  // "Ver próximas" só na aba Hoje realmente vazia (sem filtro ativo) —
  // navegação real pra uma aba que já existe, nunca um botão de criação
  // fabricado (capacidade que não existe nesta tela — ver comentário do
  // topo do arquivo).
  const mostrarLinkProximas = aba === "hoje" && !temFiltrosAtivos && itens.length === 0;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <p className="text-sm text-muted-foreground">Gerencie suas visitas e compromissos comerciais.</p>
      </div>

      <AgendaKpiCards contadores={contadores} concluidasHoje={resumoDiario.concluidas} />

      <AgendaTabs
        abaAtual={aba}
        contadores={contadores}
        href={(a) => construirHref(params, { aba: a }, true)}
      />

      <AgendaFiltrosBar aba={aba} filtros={filtros} temFiltrosAtivos={temFiltrosAtivos} />

      {painelAgora && <PainelAgoraAgenda estado={painelAgora} />}

      {itens.length === 0 ? (
        <div className="rounded-xl border bg-card p-2 text-center sm:p-8">
          <p className="text-sm text-muted-foreground">{mensagemVaziaFinal}</p>
          {mostrarLinkProximas && (
            <Link
              href={construirHref(params, { aba: "proximas" }, true)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
            >
              Ver próximas
            </Link>
          )}
        </div>
      ) : gruposDoDia ? (
        <div className="space-y-6">
          {gruposDoDia.map((grupo) => (
            <div key={grupo.periodo} className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {PERIODO_DIA_LABEL[grupo.periodo]}
              </h2>
              <div className="space-y-2">
                {grupo.itens.map((item) => (
                  <AgendaItemCard
                    key={item.id}
                    item={paraItemCliente(item)}
                    agoraISO={agora.toISOString()}
                    ehProximaVisita={proximaVisitaItem?.id === item.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((item) => (
            <AgendaItemCard key={item.id} item={paraItemCliente(item)} agoraISO={agora.toISOString()} />
          ))}
        </div>
      )}

      {aba === "anteriores" && (page > 1 || itens.length === take) && (
        <div className="flex items-center justify-between text-sm">
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
