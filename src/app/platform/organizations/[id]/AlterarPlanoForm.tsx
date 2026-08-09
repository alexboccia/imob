"use client";

import { useActionState } from "react";
import { alterarPlano } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";

export function AlterarPlanoForm({
  organizationId,
  planoAtualId,
  planos,
}: {
  organizationId: string;
  planoAtualId: string;
  planos: { id: string; name: string }[];
}) {
  const alterarComId = alterarPlano.bind(null, organizationId);
  const [estado, formAction, pendente] = useActionState(
    alterarComId,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <select
        key={planoAtualId}
        name="planId"
        defaultValue={planoAtualId}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
      >
        {planos.map((plano) => (
          <option key={plano.id} value={plano.id}>
            {plano.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? "Salvando..." : "Alterar plano"}
      </Button>
      {estado.message && (
        <span
          className={
            estado.success
              ? "text-sm text-green-600"
              : "text-sm text-destructive"
          }
        >
          {estado.message}
        </span>
      )}
    </form>
  );
}
