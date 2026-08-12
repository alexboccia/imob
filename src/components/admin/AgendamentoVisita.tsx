"use client";

import { useActionState, useId, useState } from "react";
import {
  criarAgendamentoVisita,
  remarcarAgendamentoVisita,
  cancelarAgendamentoVisita,
  concluirAgendamentoVisita,
} from "@/app/app/agendamentos/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { formatarDataHora, paraDatetimeLocal } from "@/lib/scheduled-activity-date";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Agenda de visitas (Fase H.2 do CRM) — componente único reutilizado tanto
// na ficha do cliente (InteresseImovelItem) quanto na ficha do imóvel
// ("Clientes interessados"), pra nunca duplicar o formulário/regra de
// exibição em dois lugares.
//
// scheduledAt trafega como string ISO (nunca Date) através da fronteira
// Server → Client Component — mais seguro que depender de serialização
// implícita de Date, que este projeto não usa em nenhum outro componente
// cliente (ver auditoria da H.2).

type AtividadeAgendada = { id: string; scheduledAtISO: string };

export function AgendamentoVisita({
  propertyInterestId,
  podeAgendar,
  atividadeAgendada,
}: {
  propertyInterestId: string;
  // Já considera: stage !== REJECTED, Property.status === AVAILABLE, e
  // ausência de visita SCHEDULED — calculado pelo caller (página), que já
  // tem os dados de PropertyInterest/Property carregados.
  podeAgendar: boolean;
  atividadeAgendada: AtividadeAgendada | null;
}) {
  if (atividadeAgendada) {
    return <VisitaAgendadaCard atividade={atividadeAgendada} />;
  }
  if (!podeAgendar) return null;
  return <CriarVisitaForm propertyInterestId={propertyInterestId} />;
}

function CriarVisitaForm({ propertyInterestId }: { propertyInterestId: string }) {
  const [aberto, setAberto] = useState(false);
  const acao = criarAgendamentoVisita.bind(null, propertyInterestId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);
  const dataId = useId();
  const notesId = useId();

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        Agendar visita
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 border rounded-md p-3">
      <p className="text-xs font-medium">Agendar visita</p>
      <div className="space-y-1.5">
        <Label htmlFor={dataId} className="text-xs">
          Data e horário
        </Label>
        <Input id={dataId} name="scheduledAt" type="datetime-local" required />
        {estado.fieldErrors?.scheduledAt && (
          <p className="text-xs text-destructive">{estado.fieldErrors.scheduledAt[0]}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={notesId} className="text-xs">
          Observação (opcional)
        </Label>
        <Textarea id={notesId} name="notes" rows={2} />
      </div>
      {estado.message && !estado.success && (
        <p className="text-xs text-destructive">{estado.message}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Agendando..." : "Agendar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function VisitaAgendadaCard({ atividade }: { atividade: AtividadeAgendada }) {
  const [remarcando, setRemarcando] = useState(false);
  // Ajuste de state durante a renderização (padrão recomendado pelo React
  // em vez de um useEffect+setState, que dispara o lint
  // react-hooks/set-state-in-effect): fecha o formulário de remarcação
  // assim que `scheduledAt` muda de fato no servidor — sem isso, o form
  // ficava aberto indefinidamente mostrando a data já salva
  // (revalidatePath atualiza `atividade`, mas nunca reseta um useState
  // local sozinho).
  const [scheduledAtVisto, setScheduledAtVisto] = useState(atividade.scheduledAtISO);
  if (atividade.scheduledAtISO !== scheduledAtVisto) {
    setScheduledAtVisto(atividade.scheduledAtISO);
    setRemarcando(false);
  }

  const remarcarAcao = remarcarAgendamentoVisita.bind(null, atividade.id);
  const [estadoRemarcar, formActionRemarcar, pendenteRemarcar] = useActionState(
    remarcarAcao,
    ESTADO_INICIAL_ACAO
  );

  const cancelarAcao = cancelarAgendamentoVisita.bind(null, atividade.id);
  const [estadoCancelar, formActionCancelar, pendenteCancelar] = useActionState(
    cancelarAcao,
    ESTADO_INICIAL_ACAO
  );

  const concluirAcao = concluirAgendamentoVisita.bind(null, atividade.id);
  const [estadoConcluir, formActionConcluir, pendenteConcluir] = useActionState(
    concluirAcao,
    ESTADO_INICIAL_ACAO
  );

  const dataId = useId();
  const erro = [estadoRemarcar, estadoCancelar, estadoConcluir].find(
    (e) => e.message && !e.success
  );

  return (
    <div className="border rounded-md p-3 space-y-2">
      <p className="text-xs font-medium">
        Próxima visita:{" "}
        <span className="font-normal">{formatarDataHora(atividade.scheduledAtISO)}</span>
      </p>

      {erro?.message && <p className="text-xs text-destructive">{erro.message}</p>}

      {remarcando ? (
        <form action={formActionRemarcar} className="space-y-2">
          <Label htmlFor={dataId} className="text-xs">
            Nova data e horário
          </Label>
          <Input
            id={dataId}
            name="scheduledAt"
            type="datetime-local"
            defaultValue={paraDatetimeLocal(atividade.scheduledAtISO)}
            required
          />
          {estadoRemarcar.fieldErrors?.scheduledAt && (
            <p className="text-xs text-destructive">{estadoRemarcar.fieldErrors.scheduledAt[0]}</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pendenteRemarcar}>
              {pendenteRemarcar ? "Salvando..." : "Salvar nova data"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRemarcando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setRemarcando(true)}>
            Remarcar
          </Button>
          <form action={formActionCancelar}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={pendenteCancelar}
            >
              {pendenteCancelar ? "Cancelando..." : "Cancelar visita"}
            </Button>
          </form>
          <form action={formActionConcluir}>
            <Button type="submit" variant="outline" size="sm" disabled={pendenteConcluir}>
              {pendenteConcluir ? "Salvando..." : "Marcar como realizada"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
