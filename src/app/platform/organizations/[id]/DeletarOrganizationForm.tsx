"use client";

import { useActionState, useState } from "react";
import { deletarOrganization } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";

export function DeletarOrganizationForm({
  organizationId,
  slug,
}: {
  organizationId: string;
  slug: string;
}) {
  const deletarComId = deletarOrganization.bind(null, organizationId);
  const [estado, formAction, pendente] = useActionState(
    deletarComId,
    ESTADO_INICIAL_ACAO
  );
  const [confirmacao, setConfirmacao] = useState("");

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Esta ação apaga permanentemente a organização e todos os dados
        relacionados (imóveis, clientes, negociações, histórico). Não pode
        ser desfeita. Digite <span className="font-mono font-medium">{slug}</span> para
        confirmar.
      </p>
      <div className="flex items-center gap-2">
        <input
          name="confirmacao"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          placeholder={slug}
          autoComplete="off"
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm flex-1 max-w-xs"
        />
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={pendente || confirmacao !== slug}
        >
          {pendente ? "Excluindo..." : "Excluir organização permanentemente"}
        </Button>
      </div>
      {estado.message && (
        <p
          className={
            estado.success ? "text-sm text-green-600" : "text-sm text-destructive"
          }
        >
          {estado.message}
        </p>
      )}
    </form>
  );
}
