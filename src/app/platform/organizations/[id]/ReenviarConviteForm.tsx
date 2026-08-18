"use client";

import { useActionState } from "react";
import { reenviarConvite, type EstadoReenviarConvite } from "./actions";
import { Button } from "@/components/ui/button";

const ESTADO_INICIAL: EstadoReenviarConvite = { success: false };

export function ReenviarConviteForm({
  organizationId,
  emailAtual,
}: {
  organizationId: string;
  emailAtual: string;
}) {
  const reenviarComId = reenviarConvite.bind(null, organizationId);
  const [estado, formAction, pendente] = useActionState(
    reenviarComId,
    ESTADO_INICIAL
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          name="novoEmail"
          type="email"
          defaultValue={emailAtual}
          required
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm flex-1 max-w-sm"
        />
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Enviando..." : "Reenviar convite"}
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
      {estado.linkConvite && (
        <p className="text-xs text-muted-foreground break-all">{estado.linkConvite}</p>
      )}
    </form>
  );
}
