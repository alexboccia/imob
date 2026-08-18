"use client";

import { useActionState } from "react";
import { adicionarDominio } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";

export function AdicionarDominioForm({ organizationId }: { organizationId: string }) {
  const adicionarComId = adicionarDominio.bind(null, organizationId);
  const [estado, formAction, pendente] = useActionState(adicionarComId, ESTADO_INICIAL_ACAO);

  return (
    <form action={formAction} className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="hostname"
          placeholder="www.suaimobiliaria.com.br"
          autoComplete="off"
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm flex-1 min-w-48"
        />
        <select
          name="type"
          defaultValue="CUSTOM"
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="CUSTOM">Domínio próprio</option>
          <option value="EASYMOB_SUBDOMAIN">Subdomínio easymob</option>
        </select>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Adicionando..." : "Adicionar domínio"}
        </Button>
      </div>
      {estado.message && (
        <p className={estado.success ? "text-sm text-green-600" : "text-sm text-destructive"}>{estado.message}</p>
      )}
    </form>
  );
}
