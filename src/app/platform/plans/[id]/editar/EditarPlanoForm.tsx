"use client";

import { useActionState } from "react";
import { atualizarPlano } from "../actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function CampoLimite({
  feature,
  label,
  valorAtual,
  erro,
}: {
  feature: string;
  label: string;
  valorAtual: number | null;
  erro?: string[];
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={feature}>{label}</Label>
      <Input id={feature} name={feature} defaultValue={valorAtual ?? ""} placeholder="Vazio = ilimitado" />
      {erro && <p className="text-xs text-destructive">{erro[0]}</p>}
    </div>
  );
}

export function EditarPlanoForm({
  planId,
  precoAtualReais,
  isTrialAtual,
  trialDaysAtual,
  activeAtual,
  limitesAtuais,
  quantidadeOrganizacoes,
}: {
  planId: string;
  precoAtualReais: string;
  isTrialAtual: boolean;
  trialDaysAtual: number | null;
  activeAtual: boolean;
  limitesAtuais: Record<"PROPERTIES" | "PHOTOS_PER_PROPERTY" | "USERS" | "CRM_CLIENTS", number | null>;
  quantidadeOrganizacoes: number;
}) {
  const atualizarComId = atualizarPlano.bind(null, planId);
  const [estado, formAction, pendente] = useActionState(atualizarComId, ESTADO_INICIAL_ACAO);

  return (
    <form action={formAction} className="space-y-6 max-w-md">
      {quantidadeOrganizacoes > 0 && (
        <p className="text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-md p-3">
          Atenção: {quantidadeOrganizacoes} organization
          {quantidadeOrganizacoes === 1 ? "" : "s"} usa{quantidadeOrganizacoes === 1 ? "" : "m"} este
          plano. Alterar preço/limites aqui afeta imediatamente todas elas, exceto as que têm um
          override próprio.
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor="priceMonthlyCentsRaw">Preço mensal (R$)</Label>
        <Input id="priceMonthlyCentsRaw" name="priceMonthlyCentsRaw" defaultValue={precoAtualReais} placeholder="99,00" />
        {estado.fieldErrors?.priceMonthlyCentsRaw && (
          <p className="text-xs text-destructive">{estado.fieldErrors.priceMonthlyCentsRaw[0]}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="isTrial">Este plano é um trial?</Label>
        <select
          id="isTrial"
          name="isTrial"
          defaultValue={String(isTrialAtual)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="false">Não</option>
          <option value="true">Sim</option>
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="trialDaysRaw">Duração padrão do trial (dias)</Label>
        <Input
          id="trialDaysRaw"
          name="trialDaysRaw"
          defaultValue={trialDaysAtual ?? ""}
          placeholder="Só usado quando o plano é trial"
        />
        {estado.fieldErrors?.trialDaysRaw && (
          <p className="text-xs text-destructive">{estado.fieldErrors.trialDaysRaw[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoLimite
          feature="PROPERTIES"
          label="Imóveis ativos"
          valorAtual={limitesAtuais.PROPERTIES}
          erro={estado.fieldErrors?.PROPERTIES}
        />
        <CampoLimite
          feature="PHOTOS_PER_PROPERTY"
          label="Fotos por imóvel"
          valorAtual={limitesAtuais.PHOTOS_PER_PROPERTY}
          erro={estado.fieldErrors?.PHOTOS_PER_PROPERTY}
        />
        <CampoLimite
          feature="USERS"
          label="Usuários"
          valorAtual={limitesAtuais.USERS}
          erro={estado.fieldErrors?.USERS}
        />
        <CampoLimite
          feature="CRM_CLIENTS"
          label="Clientes CRM"
          valorAtual={limitesAtuais.CRM_CLIENTS}
          erro={estado.fieldErrors?.CRM_CLIENTS}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="active">Plano ativo (pode ser atribuído a novas organizações)</Label>
        <select
          id="active"
          name="active"
          defaultValue={String(activeAtual)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar plano"}
        </Button>
        {estado.message && (
          <span className={estado.success ? "text-sm text-green-600" : "text-sm text-destructive"}>
            {estado.message}
          </span>
        )}
      </div>
    </form>
  );
}
