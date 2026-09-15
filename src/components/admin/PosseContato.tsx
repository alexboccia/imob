"use client";

import { useActionState, useState } from "react";
import { assumirContato, atribuirContato } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SeletorResponsavel } from "@/components/admin/SeletorResponsavel";
import type { OpcaoResponsavel } from "@/lib/responsavel-negociacao";
import type { ResponsavelPessoa } from "@/lib/posse-lead";

// Posse do lead na caixa de entrada (Fase 36).
//
// Responde "de quem é este contato?" e oferece as duas ações que mudam
// essa resposta — e SOMENTE elas. Nada aqui registra atendimento, cria
// negociação ou agenda: assumir é dizer "eu cuido disto", não "já falei
// com o cliente", e o card continua na fila depois.
//
// ESTADO EM TEXTO, NUNCA SÓ COR: "Sem responsável" é a informação mais
// importante da fila (é o que precisa ser distribuído) e precisa ser
// legível por quem não distingue os tons do badge.
//
// O componente NÃO decide autorização: `podeAtribuir` chega resolvido do
// servidor e a action revalida o papel de novo. Esconder um botão é
// higiene de interface, jamais controle de acesso.
export function PosseContato({
  personId,
  nomePessoa,
  responsavel,
  souEu,
  podeAtribuir,
  membros,
}: {
  personId: string;
  nomePessoa: string;
  responsavel: ResponsavelPessoa | null;
  /** Resolvido no servidor comparando com o membro da sessão. */
  souEu: boolean;
  podeAtribuir: boolean;
  membros: OpcaoResponsavel[];
}) {
  const assumir = assumirContato.bind(null, personId);
  const [estadoAssumir, formAssumir, assumindo] = useActionState(assumir, ESTADO_INICIAL_ACAO);

  const [aberto, setAberto] = useState(false);
  const atribuir = atribuirContato.bind(null, personId);
  const [estadoAtribuir, formAtribuir, atribuindo] = useActionState(
    atribuir,
    ESTADO_INICIAL_ACAO
  );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {responsavel ? (
        <span className="min-w-0 text-xs text-muted-foreground">
          Responsável:{" "}
          <span className="font-medium text-foreground">{responsavel.nome}</span>
          {/* Membro desativado continua sendo o responsável. O nome
              permanece e ganha a marca — desativar não é apagar. */}
          {responsavel.inativo && " (inativo)"}
          {souEu && " · você"}
        </span>
      ) : (
        <Badge variant="outline" className="shrink-0">
          Sem responsável
        </Badge>
      )}

      {/* Assumir só aparece quando há o que assumir. Quem já tem dono não
          oferece o botão: assumir NUNCA rouba, e mostrar uma ação que o
          servidor vai recusar seria oferecer uma porta fechada. */}
      {!responsavel && (
        <form action={formAssumir}>
          <Button type="submit" size="sm" variant="outline" disabled={assumindo}>
            {assumindo ? "Assumindo..." : "Assumir"}
          </Button>
        </form>
      )}

      {podeAtribuir && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setAberto(true)}
          disabled={atribuindo}
        >
          {responsavel ? "Transferir" : "Atribuir a..."}
        </Button>
      )}

      {/* Resultado inline com aria-live: quem usa leitor de tela recebe
          "já foi assumido por outro membro" sem procurar na página. */}
      {estadoAssumir.message && (
        <span
          role="status"
          aria-live="polite"
          className={
            estadoAssumir.success
              ? "text-xs text-muted-foreground"
              : "text-xs text-destructive"
          }
        >
          {estadoAssumir.message}
        </span>
      )}
      {estadoAtribuir.message && estadoAtribuir.success && (
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {estadoAtribuir.message}
        </span>
      )}

      {/* MONTA SÓ QUANDO ABERTO — mesma correção das Fases 10/11: a
          Central renderiza um destes por card, e diálogos ociosos
          empilham camadas dismissíveis na mesma página. O Dialog do
          projeto (Base UI) já cuida de foco inicial, trap, Esc e
          devolução do foco ao gatilho. */}
      {aberto && !estadoAtribuir.success && (
        <Dialog open onOpenChange={setAberto}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{responsavel ? "Transferir contato" : "Atribuir contato"}</DialogTitle>
              <DialogDescription>
                Quem deve conduzir {nomePessoa}. Não registra atendimento e não altera o
                responsável por negociações já existentes deste cliente.
              </DialogDescription>
            </DialogHeader>

            <form action={formAtribuir} className="space-y-3">
              <SeletorResponsavel
                id={`posse-${personId}`}
                membros={membros}
                valorInicial={responsavel?.memberId ?? ""}
                rotuloVazio="Deixar sem responsável"
                label="Responsável pelo contato"
                descricao="Somente usuários ativos podem receber contatos. A mudança fica registrada no histórico da organização."
              />

              {estadoAtribuir.message && !estadoAtribuir.success && (
                <p role="alert" className="text-xs text-destructive">
                  {estadoAtribuir.message}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAberto(false)}
                  disabled={atribuindo}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={atribuindo}>
                  {atribuindo ? "Salvando..." : "Salvar responsável"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
