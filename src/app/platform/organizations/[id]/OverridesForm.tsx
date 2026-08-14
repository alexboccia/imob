"use client";

import { useActionState, useState } from "react";
import { atualizarOverrides } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ModoOverride = "PADRAO" | "ILIMITADO" | "PERSONALIZADO";
type Feature = "PROPERTIES" | "PHOTOS_PER_PROPERTY" | "USERS" | "CRM_CLIENTS";

const LABEL_FEATURE: Record<Feature, string> = {
  PROPERTIES: "Imóveis ativos",
  PHOTOS_PER_PROPERTY: "Fotos por imóvel",
  USERS: "Usuários",
  CRM_CLIENTS: "Clientes CRM",
};

function CampoOverride({
  feature,
  modoInicial,
  valorInicial,
}: {
  feature: Feature;
  modoInicial: ModoOverride;
  valorInicial: number | null;
}) {
  // Correção pós-auditoria, 2ª rodada — causa raiz real: um <select
  // value={...}> CONTROLADO nunca escreve o atributo HTML `selected` na
  // <option> certa (React só seta a propriedade JS .value no DOM). O
  // reset nativo de formulário que o React 19 dispara depois de toda
  // Server Action (mesmo com o form remontado via key) restaura a UI pelo
  // atributo HTML, não pela propriedade JS — cai sempre na primeira
  // <option> (PADRAO). O Input já funcionava porque usa `defaultValue`
  // (não-controlado, que o reset nativo SABE restaurar corretamente).
  // Solução: o <select> também vira não-controlado (`defaultValue`,
  // remontado via key igual ao Input) — `modoVisivel` continua existindo
  // só pra decidir mostrar/esconder o Input, nunca pra controlar o que o
  // <select> exibe.
  const [modoVisivel, setModoVisivel] = useState<ModoOverride>(modoInicial);

  return (
    <div className="space-y-1">
      <Label htmlFor={`${feature}_modo`}>{LABEL_FEATURE[feature]}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`${feature}_modo`}
          name={`${feature}_modo`}
          defaultValue={modoInicial}
          onChange={(e) => setModoVisivel(e.target.value as ModoOverride)}
          className="h-9 min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="PADRAO">Usar padrão do plano</option>
          <option value="ILIMITADO">Ilimitado (override)</option>
          <option value="PERSONALIZADO">Valor personalizado</option>
        </select>
        {/* Sempre montado (nunca condicionalmente criado/destruído) — só
            escondido/desabilitado fora do modo PERSONALIZADO. Evita o
            aviso do Base UI sobre FieldControl não-controlado mudando de
            estado default depois de montado, que um mount condicional
            disparava. disabled também garante que o valor nunca é
            submetido fora do modo PERSONALIZADO, mesmo estando no DOM. */}
        <Input
          name={`${feature}_valor`}
          defaultValue={valorInicial ?? ""}
          placeholder="Número"
          className="w-24"
          hidden={modoVisivel !== "PERSONALIZADO"}
          disabled={modoVisivel !== "PERSONALIZADO"}
        />
      </div>
    </div>
  );
}

export function OverridesForm({
  organizationId,
  precoOverrideAtualReais,
  overridesAtuais,
}: {
  organizationId: string;
  precoOverrideAtualReais: string;
  overridesAtuais: Record<Feature, { modo: ModoOverride; valor: number | null }>;
}) {
  const atualizarComId = atualizarOverrides.bind(null, organizationId);
  const [estado, formAction, pendente] = useActionState(atualizarComId, ESTADO_INICIAL_ACAO);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="precoOverrideRaw">Preço mensal contratado (vazio = usar preço padrão do plano)</Label>
        {/* key = mesmo racional do CampoOverride abaixo: força remount
            quando o valor vindo do servidor muda após save, nunca deixa
            um defaultValue desatualizado num Input já montado. */}
        <Input
          key={precoOverrideAtualReais}
          id="precoOverrideRaw"
          name="precoOverrideRaw"
          defaultValue={precoOverrideAtualReais}
          placeholder="Ex: 129,00"
          className="w-40"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(LABEL_FEATURE) as Feature[]).map((feature) => (
          // Correção pós-auditoria (achado 2, UI dessincronizada após
          // save): `key` inclui modo+valor vindos do servidor, não só
          // `feature` — quando a Server Action salva e revalidatePath
          // traz um `overridesAtuais` novo, a key muda e React desmonta o
          // CampoOverride antigo e monta um novo do zero, com useState já
          // inicializado no valor real e correto. Nunca useEffect pra
          // "sincronizar" estado depois — mais simples e sem janela de
          // inconsistência visual.
          <CampoOverride
            key={`${feature}-${overridesAtuais[feature].modo}-${overridesAtuais[feature].valor ?? "null"}`}
            feature={feature}
            modoInicial={overridesAtuais[feature].modo}
            valorInicial={overridesAtuais[feature].valor}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar overrides"}
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
