"use client";

import { useActionState, useState } from "react";
import { transferirResponsavelNegociacao } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { SeletorResponsavel } from "@/components/admin/SeletorResponsavel";
import {
  SEM_RESPONSAVEL_LABEL,
  type OpcaoResponsavel,
  type ResponsavelNegociacao as Responsavel,
} from "@/lib/responsavel-negociacao";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Responsável pela negociação (Fase 11) — exibição + transferência.
// Compartilhado pela ficha do cliente e pelo card do Kanban, para que as
// duas telas digam a mesma coisa com as mesmas palavras.
//
// SEMPRE TEXTO, nunca só avatar/inicial/cor: quem é o responsável precisa
// ser legível por leitor de tela e por quem não distingue cores.
export function ResponsavelNegociacao({
  interesseId,
  responsavel,
  membros,
  encerrada,
}: {
  interesseId: string;
  responsavel: Responsavel | null;
  membros: OpcaoResponsavel[];
  // WON/REJECTED: o botão de trocar some. O servidor recusa de qualquer
  // jeito (transferirResponsavelNegociacao bloqueia stage encerrado) —
  // isto aqui é só a tela não oferecer o que não é permitido.
  encerrada: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const acao = transferirResponsavelNegociacao.bind(null, interesseId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <p className="text-xs text-muted-foreground">
        Responsável:{" "}
        {responsavel ? (
          <span className="font-medium text-foreground">{responsavel.nome}</span>
        ) : (
          // null NÃO é zero: a negociação existe e simplesmente não tem
          // dono registrado. Nunca inventamos um a partir de quem criou,
          // de quem fechou ou do responsável pelo imóvel.
          <span className="italic">{SEM_RESPONSAVEL_LABEL}</span>
        )}
        {responsavel?.inativo && (
          // Membro desativado continua sendo o responsável HISTÓRICO.
          // Vira "(inativo)" ao lado do nome, nunca "Sem responsável".
          <span className="ml-1 text-muted-foreground">(inativo)</span>
        )}
      </p>

      {!encerrada && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Trocar
        </button>
      )}

      {/* MONTA SÓ QUANDO ABERTO — mesma correção da Fase 10: o Kanban
          renderiza um destes por card, e diálogos ociosos empilhavam
          camadas dismissíveis que competiam com o Sheet da negociação. */}
      {aberto && !estado.success && (
        <Dialog open onOpenChange={setAberto}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Trocar responsável</DialogTitle>
              <DialogDescription>
                Quem conduz esta negociação. Não altera o responsável pelo imóvel nem pelo cliente.
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="space-y-3">
              <SeletorResponsavel
                id={`responsavel-${interesseId}`}
                membros={membros}
                valorInicial={responsavel?.memberId ?? ""}
                rotuloVazio="Deixar sem responsável"
                label="Novo responsável"
                descricao="Somente usuários ativos podem receber negociações. A troca fica registrada no histórico da organização."
              />

              {estado.message && !estado.success && (
                <p role="alert" className="text-xs text-destructive">
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
                  {pendente ? "Salvando..." : "Salvar responsável"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
