"use client";

import { useActionState } from "react";
import { alternarStatusUsuario, reenviarConviteUsuario } from "@/app/app/usuarios/actions";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// Redesenho de Usuários — ação rápida embutida na linha da listagem:
// reaproveita alternarStatusUsuario (mesmas proteções de
// atualizarUsuario, ver actions.ts), sem passar pela página completa de
// edição. Continua sendo possível editar papel/nome/foto/senha pela
// mesma página de sempre (link no nome, coluna "Usuário").
//
// `podeGerenciar` (calculado em page.tsx, combina PAPEIS_GESTAO_USUARIOS
// da sessão + a regra "só OWNER mexe em OWNER") decide se o botão aparece
// de verdade — quando não aparece, mostra só o rótulo do papel/nenhuma
// ação, nunca um botão que a Server Action vai recusar de qualquer jeito
// (mesma defesa em profundidade do resto do projeto: a UI só evita uma
// tentativa fadada a erro, a regra de verdade é sempre checada nela).
export function UsuarioAcoesCell({
  membershipId,
  ativo,
  // Fase 25 — o status BRUTO, e não só o booleano: com o convite de
  // membro, INVITED deixou de ser inalcançável nesta tela, e "ativar/
  // desativar" não é a ação certa para quem nunca entrou. O que essa
  // pessoa precisa é de outro link.
  status,
  ehVoceMesmo,
  podeGerenciar,
}: {
  membershipId: string;
  ativo: boolean;
  status: string;
  ehVoceMesmo: boolean;
  podeGerenciar: boolean;
}) {
  const acao = alternarStatusUsuario.bind(null, membershipId, !ativo);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);
  const reenviar = reenviarConviteUsuario.bind(null, membershipId);
  const [estadoConvite, acaoConvite, reenviando] = useActionState(
    reenviar,
    ESTADO_INICIAL_ACAO
  );

  if (ehVoceMesmo) {
    return <span className="text-xs text-muted-foreground">Você</span>;
  }
  if (!podeGerenciar) {
    return null;
  }

  if (status === "INVITED") {
    return (
      <form action={acaoConvite} onClick={(e) => e.stopPropagation()}>
        <Button type="submit" variant="ghost" size="sm" disabled={reenviando}>
          {reenviando ? "Enviando..." : "Reenviar convite"}
        </Button>
        {/* Sucesso e erro aparecem no mesmo lugar: reenviar convite é
            uma ação sem retorno visível nenhum (o efeito acontece na
            caixa de e-mail de outra pessoa), então dizer que saiu é a
            única confirmação possível. O link NUNCA é exibido aqui. */}
        {estadoConvite.message && (
          <p
            role="status"
            className={
              estadoConvite.success
                ? "mt-1 text-xs text-emerald-700"
                : "mt-1 text-xs text-destructive"
            }
          >
            {estadoConvite.message}
          </p>
        )}
      </form>
    );
  }

  return (
    <form action={formAction} onClick={(e) => e.stopPropagation()}>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className={ativo ? "text-destructive hover:text-destructive" : undefined}
      >
        {pendente ? "Salvando..." : ativo ? "Desativar" : "Ativar"}
      </Button>
      {!estado.success && estado.message && (
        <p className="mt-1 text-xs text-destructive">{estado.message}</p>
      )}
    </form>
  );
}
