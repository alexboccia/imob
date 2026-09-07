"use client";

import { useActionState, useId, useState } from "react";
import {
  criarFollowUp,
  atualizarFollowUp,
  concluirFollowUp,
  cancelarFollowUp,
} from "@/app/app/agendamentos/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import {
  formatarDataHoraNoFuso,
  paraDatetimeLocalNoFuso,
  rotuloFuso,
} from "@/lib/fuso-horario";
import { LIMITE_ASSUNTO_FOLLOW_UP } from "@/lib/follow-up";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Follow-up comercial (Fase 19) — componente único reutilizado pela ficha
// do cliente e pelo drawer da Agenda, pelo mesmo motivo de
// AgendamentoVisita: nunca duplicar o formulário nem a regra de exibição
// em dois lugares.
//
// Espelha AgendamentoVisita de propósito (mesma estrutura, mesmos
// padrões de useActionState e de reset após confirmação do servidor) —
// mas é um componente SEPARADO, não um modo dele, porque as ações são
// outras: concluir um follow-up não cria Interaction nem move stage.
//
// scheduledAt trafega como string ISO (nunca Date) através da fronteira
// Server → Client (Fase 16 preservada), e `fuso` como string simples.

export type FollowUpAgendado = {
  id: string;
  assunto: string;
  scheduledAtISO: string;
  notes: string | null;
};

// Campos compartilhados entre criar e editar — o rótulo do assunto é o
// que responde "o quê?", então ele vem primeiro e é obrigatório.
function CamposFollowUp({
  fuso,
  idAssunto,
  idData,
  idNotes,
  valores,
  erros,
}: {
  fuso: string;
  idAssunto: string;
  idData: string;
  idNotes: string;
  valores?: { assunto: string; scheduledAtLocal: string; notes: string };
  erros?: { subject?: string[]; scheduledAt?: string[]; notes?: string[] };
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={idAssunto} className="text-xs">
          O que precisa ser feito
        </Label>
        <Input
          id={idAssunto}
          name="subject"
          required
          maxLength={LIMITE_ASSUNTO_FOLLOW_UP}
          defaultValue={valores?.assunto}
          placeholder="Ex: enviar proposta revisada"
          aria-describedby={erros?.subject ? `${idAssunto}-erro` : undefined}
        />
        {erros?.subject && (
          <p id={`${idAssunto}-erro`} className="text-xs text-destructive">
            {erros.subject[0]}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={idData} className="text-xs">
          Data e horário
        </Label>
        <Input
          id={idData}
          name="scheduledAt"
          type="datetime-local"
          required
          defaultValue={valores?.scheduledAtLocal}
          aria-describedby={erros?.scheduledAt ? `${idData}-erro` : undefined}
        />
        {/* Fase 18 — datetime-local não carrega fuso; a tela diz qual é. */}
        <p className="text-xs text-muted-foreground">
          Horário no fuso da organização: {rotuloFuso(fuso)}
        </p>
        {erros?.scheduledAt && (
          <p id={`${idData}-erro`} className="text-xs text-destructive">
            {erros.scheduledAt[0]}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={idNotes} className="text-xs">
          Observação (opcional)
        </Label>
        {/* H.6 preservada: observação é CONTEXTO do compromisso, nunca o
            compromisso em si — que é o campo acima. */}
        <Textarea
          id={idNotes}
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={valores?.notes}
          placeholder="Ex: cliente pediu opção com entrada menor."
        />
        {erros?.notes && <p className="text-xs text-destructive">{erros.notes[0]}</p>}
      </div>
    </>
  );
}

export function CriarFollowUp({
  propertyInterestId,
  fuso,
}: {
  propertyInterestId: string;
  fuso: string;
}) {
  const [aberto, setAberto] = useState(false);
  const acao = criarFollowUp.bind(null, propertyInterestId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);
  const idAssunto = useId();
  const idData = useId();
  const idNotes = useId();

  // Fecha o formulário quando o servidor confirma — mesmo padrão de
  // ajuste-durante-render de AgendamentoVisita (nunca useEffect+setState).
  const [sucessoVisto, setSucessoVisto] = useState(false);
  if (estado.success && !sucessoVisto) {
    setSucessoVisto(true);
    setAberto(false);
  }
  if (!estado.success && sucessoVisto) setSucessoVisto(false);

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        Agendar follow-up
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium">Agendar follow-up</p>
      <CamposFollowUp
        fuso={fuso}
        idAssunto={idAssunto}
        idData={idData}
        idNotes={idNotes}
        erros={estado.fieldErrors}
      />
      {estado.message && !estado.success && (
        <p role="alert" className="text-xs text-destructive">
          {estado.message}
        </p>
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

export function FollowUpAgendadoCard({
  followUp,
  fuso,
}: {
  followUp: FollowUpAgendado;
  fuso: string;
}) {
  const [editando, setEditando] = useState(false);
  // Fecha a edição assim que o servidor confirma um novo valor — mesmo
  // racional de VisitaAgendadaCard.
  const [vistoEm, setVistoEm] = useState(followUp.scheduledAtISO + followUp.assunto);
  const chaveAtual = followUp.scheduledAtISO + followUp.assunto;
  if (chaveAtual !== vistoEm) {
    setVistoEm(chaveAtual);
    setEditando(false);
  }

  const [estadoEditar, formEditar, pendenteEditar] = useActionState(
    atualizarFollowUp.bind(null, followUp.id),
    ESTADO_INICIAL_ACAO
  );
  const [estadoConcluir, formConcluir, pendenteConcluir] = useActionState(
    concluirFollowUp.bind(null, followUp.id),
    ESTADO_INICIAL_ACAO
  );
  const [estadoCancelar, formCancelar, pendenteCancelar] = useActionState(
    cancelarFollowUp.bind(null, followUp.id),
    ESTADO_INICIAL_ACAO
  );

  const idAssunto = useId();
  const idData = useId();
  const idNotes = useId();
  const erro = [estadoEditar, estadoConcluir, estadoCancelar].find(
    (e) => e.message && !e.success
  );

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium">
        Follow-up: <span className="font-normal">{followUp.assunto}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {formatarDataHoraNoFuso(followUp.scheduledAtISO, fuso)}
      </p>
      {followUp.notes && (
        <p className="whitespace-pre-line text-xs text-muted-foreground">{followUp.notes}</p>
      )}

      {erro?.message && (
        <p role="alert" className="text-xs text-destructive">
          {erro.message}
        </p>
      )}

      {editando ? (
        <form action={formEditar} className="space-y-2 border-t pt-2">
          <CamposFollowUp
            fuso={fuso}
            idAssunto={idAssunto}
            idData={idData}
            idNotes={idNotes}
            valores={{
              assunto: followUp.assunto,
              scheduledAtLocal: paraDatetimeLocalNoFuso(followUp.scheduledAtISO, fuso),
              notes: followUp.notes ?? "",
            }}
            erros={estadoEditar.fieldErrors}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pendenteEditar}>
              {pendenteEditar ? "Salvando..." : "Salvar"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2 border-t pt-2">
          <form action={formConcluir}>
            <Button type="submit" size="sm" disabled={pendenteConcluir}>
              {pendenteConcluir ? "Concluindo..." : "Concluir"}
            </Button>
          </form>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
            Editar
          </Button>
          <form action={formCancelar}>
            <Button type="submit" variant="ghost" size="sm" disabled={pendenteCancelar}>
              {pendenteCancelar ? "Cancelando..." : "Cancelar follow-up"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
