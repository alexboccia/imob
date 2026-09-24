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
    // Fase 66.1 — o valor e a ação ficavam lado a lado num flex-wrap: com
    // nome longo ou coluna estreita, o "Trocar" encostava no valor e lia
    // como "Sem responsávelTrocar". Agora o rótulo tem linha própria, o
    // valor ocupa a largura disponível e o "Trocar" fica na ponta direita,
    // com `shrink-0` para nunca ser espremido e `ml-auto` para nunca
    // colar no texto. `min-w-0` + `break-words` no valor: um nome longo
    // quebra dentro do card em vez de alargá-lo.
    //
    // Comportamento, permissões e a regra de `encerrada` continuam os
    // mesmos — a mudança é de layout.
    <div className="min-w-0 text-xs">
      <p className="text-muted-foreground">Responsável:</p>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="min-w-0 flex-1 break-words">
          {responsavel ? (
            <span className="font-medium text-foreground">{responsavel.nome}</span>
          ) : (
            // null NÃO é zero: a negociação existe e simplesmente não tem
            // dono registrado. Nunca inventamos um a partir de quem criou,
            // de quem fechou ou do responsável pelo imóvel.
            <span className="italic text-muted-foreground">{SEM_RESPONSAVEL_LABEL}</span>
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
            data-trocar-responsavel
            onClick={() => setAberto(true)}
            // Ação secundária e discreta — nunca um botão primário.
            className="ml-auto shrink-0 rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Trocar
          </button>
        )}
      </div>

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
