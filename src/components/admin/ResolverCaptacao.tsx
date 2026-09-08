"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resolverCaptacaoPendente } from "@/app/app/captacoes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import type { CandidatoIdentidade } from "@/lib/captacao-pendente";

// Resolução de UMA captação (Fase 24).
//
// Radios, não um <select> da base inteira de clientes: a escolha aqui é
// entre os cadastros que REALMENTE correspondem ao e-mail ou telefone
// enviados, e cada opção diz por qual dado ela apareceu. Um gestor que
// não vê o motivo do match está adivinhando — que é exatamente o que o
// sistema se recusou a fazer sozinho no momento do envio.
//
// Sem opção "criar novo cliente" e sem "unificar cadastros": criar
// duplicata resolveria a fila e pioraria a base, e mesclar pessoas é
// outra operação, com outras consequências (fora de escopo).
export function ResolverCaptacao({
  captacaoId,
  candidatos,
}: {
  captacaoId: string;
  candidatos: CandidatoIdentidade[];
}) {
  // TOAST, e não uma mensagem dentro do próprio item: uma captação
  // resolvida SAI da fila, e a linha que exibiria a confirmação é
  // desmontada na revalidação. Com useActionState o usuário clicava e a
  // linha simplesmente sumia, sem nenhuma confirmação — o toast vive no
  // layout e sobrevive a isso.
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    iniciar(async () => {
      const estado = await resolverCaptacaoPendente(captacaoId, ESTADO_INICIAL_ACAO, formData);
      if (estado.success) {
        setErro(null);
        toast.success(estado.message ?? "Contato identificado.");
      } else {
        // O erro fica NO item, junto do contexto que o gerou — um toast
        // de erro desapareceria antes de a pessoa entender o que houve.
        setErro(estado.message ?? "Não foi possível identificar o contato.");
      }
    });
  }

  if (candidatos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum cliente cadastrado corresponde hoje a este e-mail ou telefone. O contato
        continua guardado: assim que existir um cadastro com esses dados, ele volta a
        aparecer como opção aqui.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-2">
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">Vincular ao cliente</legend>
        {candidatos.map((candidato, indice) => {
          const id = `captacao-${captacaoId}-${candidato.personId}`;
          const motivos = [
            candidato.porEmail ? "mesmo e-mail" : null,
            candidato.porTelefone ? "mesmo telefone" : null,
          ].filter(Boolean);
          return (
            <div key={candidato.personId} className="flex items-baseline gap-2">
              <input
                type="radio"
                id={id}
                name="personId"
                value={candidato.personId}
                defaultChecked={indice === 0 && candidatos.length === 1}
                required
                className="mt-0.5"
              />
              <label htmlFor={id} className="min-w-0 text-sm break-words">
                {candidato.nome}{" "}
                {/* O motivo em TEXTO: é o que sustenta a decisão. */}
                <span className="text-xs text-muted-foreground">({motivos.join(" e ")})</span>
              </label>
            </div>
          );
        })}
      </fieldset>

      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}

      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? "Vinculando..." : "Vincular contato"}
      </Button>
    </form>
  );
}
