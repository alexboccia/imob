"use client";

import { useActionState } from "react";
import { PerfilPublicoCorretorFields } from "@/components/admin/PerfilPublicoCorretorFields";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { salvarMeuPerfilPublico } from "@/app/app/meu-perfil/actions";

// Formulário de autoatendimento. Reaproveita o MESMO bloco de campos da
// tela de gestão de usuários — o que muda é só a action por trás e a
// pasta de upload da foto. Nenhum JSX foi copiado.
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
      <PerfilPublicoCorretorFields
        valores={valores}
        erros={estado.fieldErrors}
        perfilPublicoHref={perfilPublicoHref}
        pastaDaFoto="perfil"
      />

      {estado.message && (
        <Alert variant={estado.success ? "default" : "destructive"}>
          <AlertDescription>{estado.message}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
