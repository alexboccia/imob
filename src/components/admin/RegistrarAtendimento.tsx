"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { registrarAtendimentoDoContato } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import {
  CAMPO_AGENDAR_PROXIMO,
  TIPOS_ATENDIMENTO,
  TIPO_ATENDIMENTO_PADRAO,
} from "@/lib/registro-atendimento";
import { TIPO_INTERACAO_LABEL } from "@/lib/crm-labels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// Registrar atendimento sem sair da Central.
//
// DIÁLOGO, e não expansão do card: o card fechado não cresce um pixel, e
// o primitivo já entrega o que a acessibilidade exige — foco presa
// dentro, Escape fecha, foco volta para o gatilho. Num celular ele ocupa
// a largura toda, que é onde este formulário mais vai ser usado.
//
// TOAST no sucesso, erro INLINE. É a mesma escolha (e o mesmo motivo) de
// ResolverCaptacao: um atendimento registrado tira o contato da fila, e
// o item que exibiria a confirmação é desmontado na revalidação — a
// confirmação precisa viver fora dele. O erro fica no diálogo, junto do
// formulário que o causou.
//
// O <select> é nativo de propósito: dentro de um diálogo, num teclado de
// celular, o seletor do sistema operacional é mais previsível que
// qualquer popover — e o rótulo vem de TIPO_INTERACAO_LABEL, o mesmo que
// o corretor já lê no histórico do cliente.
export function RegistrarAtendimento({
  interactionId,
  nomePessoa,
}: {
  interactionId: string;
  nomePessoa: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string[]>>({});
  // Os campos da próxima ação só existem quando ela é pedida — o diálogo
  // fechado continua do tamanho de antes, e quem só quer registrar o
  // atendimento não vê formulário de agenda nenhum.
  const [agendarProximo, setAgendarProximo] = useState(false);
  const [pendente, iniciar] = useTransition();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    iniciar(async () => {
      const estado = await registrarAtendimentoDoContato(
        interactionId,
        ESTADO_INICIAL_ACAO,
        formData
      );
      if (estado.success) {
        setErro(null);
        setErrosCampo({});
        setAberto(false);
        setAgendarProximo(false);
        toast.success(estado.message ?? "Atendimento registrado.");
      } else {
        setErro(estado.message ?? "Não foi possível registrar o atendimento.");
        setErrosCampo(estado.fieldErrors ?? {});
      }
    });
  }

  const idTipo = `atendimento-tipo-${interactionId}`;
  const idNotas = `atendimento-notas-${interactionId}`;
  const idErro = `atendimento-erro-${interactionId}`;
  const idProximo = `atendimento-proximo-${interactionId}`;
  const idAssunto = `atendimento-assunto-${interactionId}`;
  const idQuando = `atendimento-quando-${interactionId}`;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(valor) => {
        setAberto(valor);
        if (!valor) {
          setErro(null);
          setErrosCampo({});
          setAgendarProximo(false);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" size="sm" />}>
        Registrar atendimento
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={enviar}>
          <DialogHeader>
            <DialogTitle>Registrar atendimento</DialogTitle>
            <DialogDescription>
              O que aconteceu no seu contato com {nomePessoa}. Isso vira um registro no
              histórico do cliente e tira este contato da fila.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor={idTipo}>Como foi o contato</Label>
              <select
                id={idTipo}
                name="tipo"
                defaultValue={TIPO_ATENDIMENTO_PADRAO}
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              >
                {TIPOS_ATENDIMENTO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {TIPO_INTERACAO_LABEL[tipo]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={idNotas}>Observação (opcional)</Label>
              <Textarea
                id={idNotas}
                name="notas"
                rows={3}
                placeholder="Ex.: cliente quer visitar sábado de manhã."
                aria-describedby={erro ? idErro : undefined}
              />
            </div>

            {/* A próxima ação é OPCIONAL: existe atendimento que termina
                ali, e obrigar um agendamento faria o corretor inventar
                um compromisso para conseguir salvar. Checkbox nativo com
                <label> clicável — semântica antes de estilo. */}
            <div className="flex items-center gap-2 border-t pt-3">
              <input
                type="checkbox"
                id={idProximo}
                name={CAMPO_AGENDAR_PROXIMO}
                checked={agendarProximo}
                onChange={(e) => setAgendarProximo(e.target.checked)}
                className="size-4"
              />
              <Label htmlFor={idProximo} className="font-normal">
                Agendar próximo contato
              </Label>
            </div>

            {agendarProximo && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={idAssunto}>O que precisa ser feito</Label>
                  <Input
                    id={idAssunto}
                    name="proximoAssunto"
                    placeholder="Ex.: ligar para confirmar a visita."
                    aria-invalid={errosCampo.proximoAssunto ? true : undefined}
                    aria-describedby={errosCampo.proximoAssunto ? `${idAssunto}-erro` : undefined}
                  />
                  {errosCampo.proximoAssunto && (
                    <p id={`${idAssunto}-erro`} className="text-sm text-destructive">
                      {errosCampo.proximoAssunto[0]}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={idQuando}>Quando</Label>
                  <Input
                    id={idQuando}
                    name="proximoQuando"
                    type="datetime-local"
                    aria-invalid={errosCampo.proximoQuando ? true : undefined}
                    aria-describedby={errosCampo.proximoQuando ? `${idQuando}-erro` : undefined}
                  />
                  {errosCampo.proximoQuando && (
                    <p id={`${idQuando}-erro`} className="text-sm text-destructive">
                      {errosCampo.proximoQuando[0]}
                    </p>
                  )}
                </div>
              </div>
            )}

            {erro && (
              <p id={idErro} role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
