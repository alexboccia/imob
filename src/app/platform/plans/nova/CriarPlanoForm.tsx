"use client";

import Link from "next/link";
import { useActionState } from "react";
import { criarPlano, type EstadoCriarPlano } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

const ESTADO_INICIAL: EstadoCriarPlano = ESTADO_INICIAL_ACAO;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function CampoLimite({ feature, label, erro }: { feature: string; label: string; erro?: string[] }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={feature}>{label}</Label>
      <Input id={feature} name={feature} placeholder="Vazio = ilimitado" />
      {erro && <p className="text-xs text-destructive">{erro[0]}</p>}
    </div>
  );
}

export function CriarPlanoForm() {
  const [estado, formAction, pendente] = useActionState(criarPlano, ESTADO_INICIAL);

  return (
    <form action={formAction} className="space-y-6 max-w-md">
      <div className="space-y-1">
        <Label htmlFor="code">Código técnico</Label>
        <Input id="code" name="code" placeholder="ENTERPRISE" className="font-mono uppercase" />
        <p className="text-xs text-muted-foreground">
          Maiúsculas, números e underscore. Não pode ser alterado depois de criado.
        </p>
        {estado.fieldErrors?.code && <p className="text-xs text-destructive">{estado.fieldErrors.code[0]}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">Nome do plano</Label>
        <Input id="name" name="name" placeholder="Enterprise" />
        {estado.fieldErrors?.name && <p className="text-xs text-destructive">{estado.fieldErrors.name[0]}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="descriptionRaw">Descrição comercial (opcional)</Label>
        <Textarea
          id="descriptionRaw"
          name="descriptionRaw"
          placeholder="Ex: Para redes grandes com múltiplas filiais"
          rows={2}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="priceMonthlyCentsRaw">Preço mensal (R$)</Label>
        <Input id="priceMonthlyCentsRaw" name="priceMonthlyCentsRaw" placeholder="999,00" />
        {estado.fieldErrors?.priceMonthlyCentsRaw && (
          <p className="text-xs text-destructive">{estado.fieldErrors.priceMonthlyCentsRaw[0]}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="isTrial">Este plano é um trial?</Label>
        <select
          id="isTrial"
          name="isTrial"
          defaultValue="false"
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="false">Não</option>
          <option value="true">Sim</option>
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="trialDaysRaw">Duração padrão do trial (dias)</Label>
        <Input id="trialDaysRaw" name="trialDaysRaw" placeholder="Só usado quando o plano é trial" />
        {estado.fieldErrors?.trialDaysRaw && (
          <p className="text-xs text-destructive">{estado.fieldErrors.trialDaysRaw[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoLimite feature="PROPERTIES" label="Imóveis ativos" erro={estado.fieldErrors?.PROPERTIES} />
        <CampoLimite
          feature="PHOTOS_PER_PROPERTY"
          label="Fotos por imóvel"
          erro={estado.fieldErrors?.PHOTOS_PER_PROPERTY}
        />
        <CampoLimite feature="USERS" label="Usuários" erro={estado.fieldErrors?.USERS} />
        <CampoLimite feature="CRM_CLIENTS" label="Clientes CRM" erro={estado.fieldErrors?.CRM_CLIENTS} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Criando..." : "Criar plano"}
        </Button>
        {estado.message && (
          <span className={estado.success ? "text-sm text-green-600" : "text-sm text-destructive"}>
            {estado.message}
            {estado.success && estado.planId && (
              <>
                {" "}
                <Link href={`/platform/plans/${estado.planId}`} className="underline">
                  Ver plano
                </Link>
              </>
            )}
          </span>
        )}
      </div>
    </form>
  );
}
