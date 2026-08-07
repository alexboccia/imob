"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { ESTADO_INICIAL_ACAO, type ActionState } from "@/lib/action-result";

export function NovoItemCatalogoForm({
  action,
  categoria,
  placeholder,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  categoria: string;
  placeholder: string;
}) {
  const [estado, formAction, pendente] = useActionState(action, ESTADO_INICIAL_ACAO);

  return (
    <div className="mb-4">
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="categoria" value={categoria} />
        <Input name="nome" placeholder={placeholder} required disabled={pendente} />
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? "Adicionando..." : "Adicionar"}
        </Button>
      </form>
      {!estado.success && (
        <ErroCampo erros={estado.fieldErrors?.nome ?? (estado.message ? [estado.message] : [])} />
      )}
    </div>
  );
}
