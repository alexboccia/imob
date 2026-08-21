"use client";

import { useActionState } from "react";
import { alternarStatusUsuario } from "@/app/app/usuarios/actions";
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
  ehVoceMesmo,
  podeGerenciar,
}: {
  membershipId: string;
  ativo: boolean;
  ehVoceMesmo: boolean;
  podeGerenciar: boolean;
}) {
  const acao = alternarStatusUsuario.bind(null, membershipId, !ativo);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);

  if (ehVoceMesmo) {
    return <span className="text-xs text-muted-foreground">Você</span>;
  }
  if (!podeGerenciar) {
    return null;
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
