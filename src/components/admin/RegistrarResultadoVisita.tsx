"use client";

import { useActionState, useId, useState } from "react";
import { concluirAgendamentoVisita } from "@/app/app/agendamentos/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { CAMPO_AGENDAR_PROXIMO } from "@/lib/registro-atendimento";
import {
  RESULTADOS_VISITA,
  RESULTADO_VISITA_LABEL,
  RESULTADO_VISITA_AJUDA,
} from "@/lib/resultado-visita";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Registrar o resultado da visita (Fase 37).
//
// Substitui o antigo botão "Marcar como realizada", que era um clique só
// e dizia apenas que algo aconteceu. A pergunta agora é uma só — "o que
// aconteceu nesta visita?" — e a resposta é obrigatória: encerrar uma
// visita sem dizer o que aconteceu é exatamente o buraco que esta fase
// veio fechar.
//
// UMA LISTA DE OPÇÕES, não duas perguntas encadeadas ("aconteceu? sim/
// não" → "gostou? sim/não"): o corretor sabe de uma vez, e dividir faria
// ele responder duas vezes a mesma coisa.
//
// RADIO GROUP DE VERDADE: <fieldset> + <legend>, inputs nativos com
// <label> clicável. O leitor de tela anuncia "grupo — o que aconteceu?"
// e navega com as setas; o alvo de toque é a linha inteira, que é o que
// torna o fluxo utilizável no celular — onde ele acontece de verdade,
// logo depois da visita.
export function RegistrarResultadoVisita({
  atividadeId,
  imovelTitulo,
  clienteNome,
}: {
  atividadeId: string;
  imovelTitulo?: string;
  clienteNome?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [agendarProximo, setAgendarProximo] = useState(false);
  const acao = concluirAgendamentoVisita.bind(null, atividadeId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);

  const idObservacao = useId();
  const idProximo = useId();
  const idAssunto = useId();
  const idQuando = useId();
  const erros = estado.fieldErrors ?? {};

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        Registrar resultado
      </Button>

      {/* MONTA SÓ QUANDO ABERTO — mesma correção das Fases 10/11/36: a
          Agenda renderiza um destes por visita, e diálogos ociosos
          empilham camadas dismissíveis na mesma página. O Dialog do
          projeto (Base UI) já cuida de foco inicial, trap, Esc e
          devolução do foco ao gatilho ao fechar. */}
      {aberto && !estado.success && (
        <Dialog open onOpenChange={setAberto}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resultado da visita</DialogTitle>
              <DialogDescription>
                {imovelTitulo && clienteNome
                  ? `${imovelTitulo} — ${clienteNome}`
                  : "O que aconteceu nesta visita."}
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="space-y-4">
              <fieldset className="min-w-0 space-y-2">
                <legend className="text-sm font-medium">O que aconteceu?</legend>
                <div className="space-y-1">
                  {RESULTADOS_VISITA.map((opcao) => (
                    <label
                      key={opcao}
                      className="flex min-w-0 cursor-pointer items-start gap-2 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-muted/50"
                    >
                      <input
                        type="radio"
                        name="resultado"
                        value={opcao}
                        className="mt-0.5 size-4 shrink-0"
                        aria-describedby={`${idObservacao}-${opcao}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {RESULTADO_VISITA_LABEL[opcao]}
                        </span>
                        {/* A diferença entre "sem definição" e "sem
                            interesse" é a que mais erra no preenchimento,
                            e errar aqui contamina o histórico inteiro. */}
                        <span
                          id={`${idObservacao}-${opcao}`}
                          className="block min-w-0 break-words text-xs text-muted-foreground"
                        >
                          {RESULTADO_VISITA_AJUDA[opcao]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {erros.resultado && (
                  <p role="alert" className="text-sm text-destructive">
                    {erros.resultado[0]}
                  </p>
                )}
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor={idObservacao}>Observação (opcional)</Label>
                <Textarea
                  id={idObservacao}
                  name="observacaoResultado"
                  rows={2}
                  placeholder="Ex.: achou os quartos pequenos, quer ver algo maior no mesmo bairro."
                  aria-invalid={erros.observacaoResultado ? true : undefined}
                />
                {erros.observacaoResultado && (
                  <p className="text-sm text-destructive">{erros.observacaoResultado[0]}</p>
                )}
              </div>

              {/* A próxima ação é OPCIONAL e usa o MESMO contrato do
                  atendimento inline: existe visita que termina ali, e
                  obrigar um agendamento faria o corretor inventar um
                  compromisso para conseguir salvar. */}
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
                      placeholder="Ex.: enviar opções parecidas no mesmo bairro."
                      aria-invalid={erros.proximoAssunto ? true : undefined}
                    />
                    {erros.proximoAssunto && (
                      <p className="text-sm text-destructive">{erros.proximoAssunto[0]}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={idQuando}>Quando</Label>
                    <Input
                      id={idQuando}
                      name="proximoQuando"
                      type="datetime-local"
                      aria-invalid={erros.proximoQuando ? true : undefined}
                    />
                    {erros.proximoQuando && (
                      <p className="text-sm text-destructive">{erros.proximoQuando[0]}</p>
                    )}
                  </div>
                </div>
              )}

              {estado.message && !estado.success && (
                <p role="alert" className="text-sm text-destructive">
                  {estado.message}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAberto(false)}
                  disabled={pendente}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={pendente}>
                  {pendente ? "Salvando..." : "Salvar resultado"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {estado.message && estado.success && (
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {estado.message}
        </span>
      )}
    </>
  );
}
