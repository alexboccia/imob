"use client";

import { useActionState } from "react";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { salvarMeuPerfilPublico } from "@/app/app/meu-perfil/actions";
import { CardPerfilPublico } from "@/components/admin/meu-perfil/CardPerfilPublico";
import { CardFotoPublica } from "@/components/admin/meu-perfil/CardFotoPublica";
import { CardContatosPublicos } from "@/components/admin/meu-perfil/CardContatosPublicos";
import { CardApresentacao } from "@/components/admin/meu-perfil/CardApresentacao";

// Fase 130 — Redesign visual (4 cards, referência aprovada) de cima do
// MESMO formulário/action/schema de sempre. `PerfilPublicoCorretorFields`
// (usado por EditarUsuarioForm, a gestão de usuários) continua intocado —
// esta reescrita vale só para a tela de autoatendimento.
export function MeuPerfilPublicoForm({
  valores,
  perfilPublicoHref,
}: {
  valores: {
    publicado: boolean;
    creci: string | null;
    foto: string | null;
    bio: string | null;
    whatsapp: string | null;
    telefone: string | null;
    email: string | null;
  };
  perfilPublicoHref: string | null;
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarMeuPerfilPublico,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="space-y-4">
      <CardPerfilPublico publicado={valores.publicado} />
      <CardFotoPublica foto={valores.foto} />
      <CardContatosPublicos
        valores={{
          creci: valores.creci,
          whatsapp: valores.whatsapp,
          telefone: valores.telefone,
          email: valores.email,
        }}
        erros={estado.fieldErrors}
      />
      <CardApresentacao
        bio={valores.bio}
        erro={estado.fieldErrors?.perfilPublicoBio}
        perfilPublicoHref={perfilPublicoHref}
        mensagem={estado.message ? { texto: estado.message, sucesso: estado.success } : null}
        pendente={pendente}
      />
    </form>
  );
}
