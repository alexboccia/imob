import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AgendamentoVisita } from "@/components/admin/AgendamentoVisita";
import { formatarDataHora, estaAtrasada } from "@/lib/scheduled-activity-date";
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

// Um único card pra qualquer item da agenda. Itens SCHEDULED (Hoje,
// Próximas, e o subconjunto atrasado de Anteriores) reutilizam o
// AgendamentoVisita da H.2 — mesmo componente, mesmas Server Actions,
// mesmo comportamento que a ficha do cliente/imóvel já têm, nunca uma
// segunda implementação de remarcar/cancelar/concluir. Itens
// COMPLETED/CANCELLED são só leitura (as ações da H.2 rejeitariam essas
// transições de qualquer forma — não faz sentido oferecer botões que só
// vão erroar).
export function AgendaItemCard({ item, agora }: { item: ItemAgenda; agora: Date }) {
  const acionavel = item.status === "SCHEDULED";
  const atrasada = acionavel && estaAtrasada({ status: item.status, scheduledAt: item.scheduledAt }, agora);

  return (
    <Card>
      <CardContent className="text-sm space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="font-medium">{formatarDataHora(item.scheduledAt.toISOString())}</p>
            <p className="text-muted-foreground">
              {item.person ? item.person.name : "Cliente indisponível"}
              {item.property ? ` — ${item.property.title}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {atrasada && (
              <Badge variant="destructive" className="text-[10px]">
                Atrasada
              </Badge>
            )}
            <Badge variant="secondary">{STATUS_VISITA_LABEL[item.status] ?? item.status}</Badge>
          </div>
        </div>

        {item.notes && <p className="text-foreground whitespace-pre-line">{item.notes}</p>}

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
            atividadeAgendada={{ id: item.id, scheduledAtISO: item.scheduledAt.toISOString() }}
          />
        )}
      </CardContent>
    </Card>
  );
}
