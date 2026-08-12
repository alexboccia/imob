import Link from "next/link";
import { requireOrganizationId } from "@/lib/tenant";
import { hasModule } from "@/lib/entitlements";
import { interpretarPaginacao } from "@/lib/pagination";
import {
  buscarAgendaHoje,
  buscarAgendaProximas,
  buscarAgendaAnteriores,
  contarAgenda,
  type ItemAgenda,
} from "@/lib/agenda";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";
import { AgendaItemCard } from "@/components/admin/AgendaItemCard";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Agenda do corretor (Fase H.3) — projeção operacional de
// ScheduledActivity(VISIT), nunca uma segunda fonte de verdade. Sem
// formulário de "nova visita" solta: criação continua exclusivamente a
// partir de um PropertyInterest existente, nas fichas já implementadas
// pela H.2.

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

type SearchParams = { aba?: string; page?: string; pageSize?: string };

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

  const contadores = await contarAgenda(organizationId, { agora });

  const { page, take } = interpretarPaginacao(params, { pageSizePadrao: 20, pageSizeMaximo: 50 });
  const skip = (page - 1) * take;

  let itens: ItemAgenda[];
  if (aba === "hoje") {
    itens = await buscarAgendaHoje(organizationId, { agora });
  } else if (aba === "proximas") {
    itens = await buscarAgendaProximas(organizationId, { agora });
  } else {
    itens = await buscarAgendaAnteriores(organizationId, { agora, skip, take });
  }

  const mensagemVazia: Record<Aba, string> = {
    hoje: "Nenhuma visita agendada para hoje.",
    proximas: "Nenhuma próxima visita agendada.",
    anteriores: "Nenhuma visita anterior encontrada.",
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Agenda</h1>

      <nav className="flex flex-wrap gap-2 mb-6" aria-label="Período da agenda">
        {ABAS.map((chave) => (
          <Link
            key={chave}
            href={`/app/agenda?aba=${chave}`}
            aria-current={aba === chave ? "page" : undefined}
            className={cn(buttonVariants({ variant: aba === chave ? "default" : "outline", size: "sm" }))}
          >
            {ABA_LABEL[chave]} ({contadores[chave]})
          </Link>
        ))}
      </nav>

      {itens.length === 0 ? (
        <p className="text-muted-foreground text-sm">{mensagemVazia[aba]}</p>
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
              href={`/app/agenda?aba=anteriores&page=${page - 1}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              ← Página anterior
            </Link>
          ) : (
            <span />
          )}
          {itens.length === take && (
            <Link
              href={`/app/agenda?aba=anteriores&page=${page + 1}`}
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
