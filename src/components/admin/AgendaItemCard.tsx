import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AgendamentoVisita } from "@/components/admin/AgendamentoVisita";
import {
  formatarDataHora,
  estaAtrasada,
  horarioJaPassouHoje,
  acaoOperacionalDaVisita,
  type AcaoOperacionalVisita,
} from "@/lib/scheduled-activity-date";
import { cn } from "@/lib/utils";
import type { ItemAgenda } from "@/lib/agenda";

// Labels amigáveis de status (Fase H.3) — mesmo padrão de
// ESTAGIO_INTERESSE_LABEL em InteresseImovelItem.tsx: só apresentação, o
// enum continua sendo a fonte lógica (nunca comparado por label em
// nenhuma regra).
export const STATUS_VISITA_LABEL: Record<string, string> = {
  SCHEDULED: "Agendada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

// Ação operacional recomendada (Fase H.7) — só apresentação, texto puro
// (não Badge) de propósito: já existem até 3 badges de estado no mesmo
// card (Próxima/Atrasada/Horário passou/Status); um 4º badge colorido
// pesaria visualmente sem agregar clareza. Este é um conceito diferente
// (orientação do que fazer, não estado), por isso fica destacado como
// texto próprio, nunca substituindo nenhum badge existente.
const ACAO_OPERACIONAL_LABEL: Record<Exclude<AcaoOperacionalVisita, null>, string> = {
  PREPARAR_VISITA: "Preparar visita",
  VISITA_AGORA: "Visita agora",
  REGISTRAR_RESULTADO: "Registrar resultado",
  RESOLVER_PENDENCIA: "Resolver pendência",
};

// Um único card pra qualquer item da agenda. Itens SCHEDULED (Hoje,
// Próximas, e o subconjunto atrasado de Anteriores) reutilizam o
// AgendamentoVisita da H.2 — mesmo componente, mesmas Server Actions,
// mesmo comportamento que a ficha do cliente/imóvel já têm, nunca uma
// segunda implementação de remarcar/cancelar/concluir. Itens
// COMPLETED/CANCELLED são só leitura (as ações da H.2 rejeitariam essas
// transições de qualquer forma — não faz sentido oferecer botões que só
// vão erroar).
// `ehProximaVisita` só faz sentido na aba Hoje (H.5): calculado uma vez
// pelo caller (page.tsx) via proximaVisita() sobre a lista já carregada
// e filtrada — nunca recalculado por card, nunca dispara query própria.
// Callers pré-existentes (ficha do cliente/imóvel) simplesmente não
// passam essa prop, sem nenhuma mudança de comportamento pra eles.
export function AgendaItemCard({
  item,
  agora,
  ehProximaVisita = false,
}: {
  item: ItemAgenda;
  agora: Date;
  ehProximaVisita?: boolean;
}) {
  const acionavel = item.status === "SCHEDULED";
  const atrasada = acionavel && estaAtrasada({ status: item.status, scheduledAt: item.scheduledAt }, agora);
  // Distinto de "atrasada" (H.3: dia calendário anterior) — "horário
  // passou" (H.5) é só o horário de HOJE já ter passado; nunca aparece
  // junto com "Atrasada" no mesmo card, já que uma exclui a outra por
  // construção (ver horarioJaPassouHoje).
  const horarioPassou = horarioJaPassouHoje({ status: item.status, scheduledAt: item.scheduledAt }, agora);
  // Mesmo padrão de atrasada/horarioPassou acima: chamada direta de um
  // helper puro exportado, com os dados que o card já recebe — nenhuma
  // lógica temporal nova escrita aqui, nenhuma query disparada.
  const acaoOperacional = acionavel
    ? acaoOperacionalDaVisita({ status: item.status, scheduledAt: item.scheduledAt }, agora)
    : null;

  return (
    <Card className={cn(ehProximaVisita && "border-primary ring-1 ring-primary")}>
      <CardContent className="text-sm space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="font-medium">{formatarDataHora(item.scheduledAt.toISOString())}</p>
            <p className="text-muted-foreground">
              {item.person ? item.person.name : "Cliente indisponível"}
              {item.property ? ` — ${item.property.title}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Texto curto ("Próxima", sem "visita") de propósito — o
                card, alguns parágrafos abaixo, já tem "Próxima visita:
                <data>" vindo do H.2 (AgendamentoVisita), que significa
                outra coisa (a data desta visita). Um rótulo idêntico
                aqui confundiria os dois conceitos. */}
            {ehProximaVisita && (
              <Badge variant="default" className="text-[10px]">
                Próxima
              </Badge>
            )}
            {atrasada && (
              <Badge variant="destructive" className="text-[10px]">
                Atrasada
              </Badge>
            )}
            {horarioPassou && (
              <Badge variant="outline" className="text-[10px]">
                Horário passou
              </Badge>
            )}
            <Badge variant="secondary">{STATUS_VISITA_LABEL[item.status] ?? item.status}</Badge>
          </div>
        </div>

        {acaoOperacional && (
          <p className="text-xs font-medium text-primary">
            {ACAO_OPERACIONAL_LABEL[acaoOperacional]}
          </p>
        )}

        {/* Observação (H.6): só exibida aqui em modo histórico/somente
            leitura (item não-acionável, ou seja, COMPLETED/CANCELLED) —
            quando acionável (SCHEDULED), a mesma observação já aparece
            editável dentro de AgendamentoVisita abaixo; mostrar as duas
            duplicaria o mesmo texto no card. */}
        {!acionavel && item.notes && (
          <div className="text-xs">
            <p className="font-medium text-muted-foreground">Observação</p>
            <p className="text-foreground whitespace-pre-line">{item.notes}</p>
          </div>
        )}

        {(item.person || item.property) && (
          <div className="flex items-center gap-3 text-xs">
            {item.person && (
              <Link href={`/app/clientes/${item.person.id}`} className="text-blue-600 hover:underline">
                Ver cliente
              </Link>
            )}
            {item.property && (
              <Link href={`/app/imoveis/${item.property.id}`} className="text-blue-600 hover:underline">
                Ver imóvel
              </Link>
            )}
          </div>
        )}

        {acionavel && (
          <AgendamentoVisita
            propertyInterestId={item.propertyInterestId ?? undefined}
            podeAgendar={false}
            atividadeAgendada={{
              id: item.id,
              scheduledAtISO: item.scheduledAt.toISOString(),
              notes: item.notes,
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
