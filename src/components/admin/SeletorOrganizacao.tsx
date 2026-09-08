"use client";

import { useActionState, useState } from "react";
import { trocarOrganizacao } from "@/app/app/trocar-organizacao/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import type { OrganizacaoAcessivel } from "@/lib/organizacoes-do-usuario";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Seletor de imobiliária (Fase 26).
//
// Só existe quando há mais de uma opção. Para quem tem uma única
// imobiliária — a esmagadora maioria — a navegação continua exatamente
// como era: o nome aparece como texto, sem controle nenhum.
//
// O papel vem junto de cada opção porque a MESMA pessoa pode ser
// proprietária de uma e corretora de outra, e trocar muda o que ela
// pode fazer. Esconder isso faria a troca parecer só cosmética.
function OpcaoOrganizacao({
  organizacao,
  atual,
  onTrocou,
}: {
  organizacao: OrganizacaoAcessivel;
  atual: boolean;
  onTrocou: () => void;
}) {
  const acao = trocarOrganizacao.bind(null, organizacao.organizationId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);

  return (
    <form action={formAction} onSubmit={onTrocou}>
      <button
        type="submit"
        disabled={pendente || atual}
        className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-muted disabled:cursor-default disabled:opacity-100"
      >
        <span className="min-w-0 break-words text-sm font-medium">
          {organizacao.nome}
          {atual && <span className="ml-2 text-xs text-muted-foreground">(atual)</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {PAPEL_USUARIO_LABEL[organizacao.papel] ?? organizacao.papel}
        </span>
      </button>
      {estado.message && !estado.success && (
        <p role="alert" className="px-3 text-xs text-destructive">
          {estado.message}
        </p>
      )}
    </form>
  );
}

export function SeletorOrganizacao({
  organizacoes,
  organizationIdAtual,
  // No celular o nome da imobiliária já aparece no título do menu; sem
  // isto ele seria escrito duas vezes na mesma tela estreita.
  apenasBotao = false,
}: {
  organizacoes: OrganizacaoAcessivel[];
  organizationIdAtual: string | undefined;
  apenasBotao?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = organizacoes.find((o) => o.organizationId === organizationIdAtual);
  const nomeAtual = atual?.nome ?? "Painel";

  if (organizacoes.length <= 1 && apenasBotao) return null;

  if (organizacoes.length <= 1) {
    return (
      <div className="min-w-0 border-b px-4 py-4">
        <p className="min-w-0 truncate font-semibold" title={nomeAtual}>
          {nomeAtual}
        </p>
      </div>
    );
  }

  return (
    <div className={apenasBotao ? "min-w-0" : "min-w-0 border-b px-4 py-3"}>
      {!apenasBotao && (
        <p className="min-w-0 truncate font-semibold" title={nomeAtual}>
          {nomeAtual}
        </p>
      )}
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-0.5 min-h-9 rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Trocar imobiliária
      </button>

      {aberto && (
        <Dialog open onOpenChange={setAberto}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Trocar imobiliária</DialogTitle>
              <DialogDescription>
                Você tem acesso a mais de uma. Trocar muda os dados e as permissões desta
                sessão — não é preciso sair e entrar de novo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              {organizacoes.map((organizacao) => (
                <OpcaoOrganizacao
                  key={organizacao.organizationId}
                  organizacao={organizacao}
                  atual={organizacao.organizationId === organizationIdAtual}
                  onTrocou={() => setAberto(false)}
                />
              ))}
            </div>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
