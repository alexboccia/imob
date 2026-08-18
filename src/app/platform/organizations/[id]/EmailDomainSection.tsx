"use client";

import { useActionState } from "react";
import { salvarEmailDomain, atualizarStatusEmailDomain, removerEmailDomain } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_OPCOES = ["PENDING", "VERIFIED", "ACTIVE", "FAILED"] as const;

export function EmailDomainSection({
  organizationId,
  emailDomain,
}: {
  organizationId: string;
  emailDomain: { domain: string; fromName: string; fromAddress: string; status: string; verifiedAt: string | null } | null;
}) {
  const salvarComId = salvarEmailDomain.bind(null, organizationId);
  const [estadoSalvar, formActionSalvar, pendenteSalvar] = useActionState(salvarComId, ESTADO_INICIAL_ACAO);
  const statusComId = atualizarStatusEmailDomain.bind(null, organizationId);
  const [estadoStatus, formActionStatus, pendenteStatus] = useActionState(statusComId, ESTADO_INICIAL_ACAO);
  const removerComId = removerEmailDomain.bind(null, organizationId);
  const [estadoRemover, formActionRemover, pendenteRemover] = useActionState(removerComId, ESTADO_INICIAL_ACAO);

  return (
    <div className="space-y-3">
      {emailDomain && (
        <div className="flex items-center justify-between gap-2 flex-wrap border-b pb-3">
          <div>
            <p className="text-sm font-medium">
              {emailDomain.fromName} &lt;{emailDomain.fromAddress}&gt;
            </p>
            <p className="text-xs text-muted-foreground">
              {emailDomain.domain}
              {emailDomain.verifiedAt &&
                ` · verificado em ${new Date(emailDomain.verifiedAt).toLocaleDateString("pt-BR")}`}
            </p>
          </div>
          <Badge variant={emailDomain.status === "ACTIVE" ? "default" : emailDomain.status === "FAILED" ? "destructive" : "secondary"}>
            {emailDomain.status}
          </Badge>
        </div>
      )}

      {emailDomain && (
        <div className="flex items-center gap-2 flex-wrap">
          <form action={formActionStatus} className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={emailDomain.status}
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
      )}
      {estadoStatus.message && (
        <p className={estadoStatus.success ? "text-xs text-green-600" : "text-xs text-destructive"}>{estadoStatus.message}</p>
      )}
      {estadoRemover.message && !estadoRemover.success && <p className="text-xs text-destructive">{estadoRemover.message}</p>}

      <form action={formActionSalvar} className="space-y-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {emailDomain ? "Substituir domínio de e-mail" : "Cadastrar domínio de e-mail"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            name="domain"
            placeholder="mail.suaimobiliaria.com.br"
            defaultValue={emailDomain?.domain}
            autoComplete="off"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          />
          <input
            name="fromName"
            placeholder="Imobiliária XYZ"
            defaultValue={emailDomain?.fromName}
            autoComplete="off"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          />
          <input
            name="fromAddress"
            type="email"
            placeholder="notificacoes@mail.suaimobiliaria.com.br"
            defaultValue={emailDomain?.fromAddress}
            autoComplete="off"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          />
        </div>
        <Button type="submit" size="sm" disabled={pendenteSalvar}>
          {pendenteSalvar ? "Salvando..." : "Salvar"}
        </Button>
        {estadoSalvar.message && (
          <p className={estadoSalvar.success ? "text-xs text-green-600" : "text-xs text-destructive"}>{estadoSalvar.message}</p>
        )}
      </form>
    </div>
  );
}
