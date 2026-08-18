"use client";

import { useActionState } from "react";
import { atualizarStatusDominio, removerDominio } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_OPCOES = ["PENDING", "VERIFIED", "ACTIVE", "FAILED", "DISABLED"] as const;

const TIPO_LABEL: Record<string, string> = {
  CUSTOM: "Domínio próprio",
  EASYMOB_SUBDOMAIN: "Subdomínio easymob",
};

export function DominioLinha({
  id,
  hostname,
  type,
  status,
  verifiedAt,
}: {
  id: string;
  hostname: string;
  type: string;
  status: string;
  verifiedAt: string | null;
}) {
  const atualizarComId = atualizarStatusDominio.bind(null, id);
  const [estadoStatus, formActionStatus, pendenteStatus] = useActionState(atualizarComId, ESTADO_INICIAL_ACAO);
  const removerComId = removerDominio.bind(null, id);
  const [estadoRemover, formActionRemover, pendenteRemover] = useActionState(removerComId, ESTADO_INICIAL_ACAO);

  return (
    <div className="py-2 border-b last:border-b-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="font-medium text-sm">{hostname}</p>
          <p className="text-xs text-muted-foreground">
            {TIPO_LABEL[type] ?? type}
            {verifiedAt && ` · verificado em ${new Date(verifiedAt).toLocaleDateString("pt-BR")}`}
          </p>
        </div>
        <Badge variant={status === "ACTIVE" ? "default" : status === "FAILED" ? "destructive" : "secondary"}>
          {status}
        </Badge>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <form action={formActionStatus} className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={status}
            className="h-7 rounded-lg border border-input bg-transparent px-2 text-xs"
          >
            {STATUS_OPCOES.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" disabled={pendenteStatus}>
            Salvar status
          </Button>
        </form>
        <form action={formActionRemover}>
          <Button type="submit" size="sm" variant="ghost" className="text-destructive" disabled={pendenteRemover}>
            Remover
          </Button>
        </form>
      </div>
      {estadoStatus.message && (
        <p className={estadoStatus.success ? "text-xs text-green-600" : "text-xs text-destructive"}>
          {estadoStatus.message}
        </p>
      )}
      {estadoRemover.message && !estadoRemover.success && (
        <p className="text-xs text-destructive">{estadoRemover.message}</p>
      )}
    </div>
  );
}
