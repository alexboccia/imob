"use client";

import { useActionState } from "react";
import { CalendarClock } from "lucide-react";
import {
  confirmarSolicitacaoVisita,
  descartarSolicitacaoVisita,
} from "@/app/app/agendamentos/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_VISITA_LABEL, type ItemAgendaClient } from "@/components/admin/agenda/agenda-visual";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";

// Fase 56 — um PEDIDO de visita esperando resposta.
//
// Card próprio, e não um modo do AgendaItemCard: as ações de um
// compromisso assumido (remarcar, concluir, registrar resultado) não
// existem para um pedido, e o que ele precisa mostrar — desde quando
// está esperando — não existe para os outros. Misturar os dois num
// componente com bifurcações produziria exatamente a confusão que esta
// fase veio desfazer.
//
// Sem I/O próprio: os dados chegam prontos de buscarAgendaSolicitacoes.
// `item` e o fuso cruzam a fronteira Server -> Client como string (nunca
// Date bruto), mesmo padrão de AgendaItemCard.
export function SolicitacaoVisitaCard({
  item,
  fuso,
}: {
  item: ItemAgendaClient;
  fuso: string;
}) {
  const [estadoConfirmar, confirmarAction, confirmando] = useActionState(
    confirmarSolicitacaoVisita.bind(null, item.id),
    ESTADO_INICIAL_ACAO
  );
  const [estadoDescartar, descartarAction, descartando] = useActionState(
    descartarSolicitacaoVisita.bind(null, item.id),
    ESTADO_INICIAL_ACAO
  );

  // Enquanto uma das duas está em voo, a outra fica indisponível: as
  // duas decidem o MESMO registro, e deixar as duas clicáveis convidaria
  // a corrida que o CAS do servidor teria de resolver.
  const ocupado = confirmando || descartando;
  const erro = [estadoConfirmar, estadoDescartar].find((e) => e.message && !e.success);

  return (
    <Card size="sm" className="min-w-0">
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{formatarDataHoraNoFuso(item.scheduledAtISO, fuso)}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
              Data e horário pedidos pelo cliente
            </p>
          </div>
          {/* O status em TEXTO, nunca só por cor — mesma regra do resto
              da Agenda. É este badge que distingue, à primeira vista,
              uma solicitação de um compromisso confirmado. */}
          <Badge variant="outline" className="shrink-0">
            {STATUS_VISITA_LABEL.REQUESTED}
          </Badge>
        </div>

        <div className="border-t pt-2">
          <p className="truncate font-medium">
            {item.person ? item.person.name : "Cliente indisponível"}
          </p>
          {item.person?.phone && (
            <p className="truncate text-xs text-muted-foreground">{item.person.phone}</p>
          )}
          {item.property ? (
            <>
              <p className="truncate text-xs text-muted-foreground">{item.property.title}</p>
              <p className="truncate text-xs text-muted-foreground">{item.property.neighborhood}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Imóvel indisponível</p>
          )}
        </div>

        {/* A observação que o visitante escreveu — parte do que a pessoa
            precisa para decidir, então fica no card, não escondida. */}
        {item.notes && (
          <p className="min-w-0 break-words rounded-md bg-muted p-2 text-xs text-muted-foreground">
            {item.notes}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Solicitada em {formatarDataHoraNoFuso(item.createdAtISO, fuso)}
        </p>

        {erro?.message && (
          <p role="status" className="text-xs text-destructive">
            {erro.message}
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-2">
          <form action={confirmarAction}>
            <Button type="submit" size="sm" disabled={ocupado} data-confirmar-solicitacao>
              {confirmando ? "Confirmando..." : "Confirmar visita"}
            </Button>
          </form>
          <form action={descartarAction}>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={ocupado}
              data-descartar-solicitacao
            >
              {descartando ? "Descartando..." : "Descartar"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
