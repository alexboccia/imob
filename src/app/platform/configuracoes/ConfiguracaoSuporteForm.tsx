"use client";

import { useActionState, useState } from "react";
import { salvarConfiguracaoSuporte } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { normalizarTelefoneSuporte, linkWhatsAppSuporte } from "@/lib/plataforma-suporte";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function ConfiguracaoSuporteForm({
  telefoneInicial,
  horarioInicial,
  telefoneE164Atual,
  configuradoAnteriormente,
}: {
  telefoneInicial: string;
  horarioInicial: string;
  telefoneE164Atual: string | null;
  configuradoAnteriormente: boolean;
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarConfiguracaoSuporte,
    ESTADO_INICIAL_ACAO
  );
  const [telefone, setTelefone] = useState(telefoneInicial);

  // Prévia do link — calculada no CLIENTE, mas nunca é o destino real do
  // botão de salvar (que sempre vai pro servidor validar de novo); é só
  // feedback visual de "isso é o número que vai ficar salvo".
  const digitosValidados = normalizarTelefoneSuporte(telefone);
  const previaLink = linkWhatsAppSuporte(digitosValidados);

  return (
    <form action={formAction} className="space-y-4">
      {!configuradoAnteriormente && (
        <p className="text-sm text-amber-700">
          Ainda não há configuração salva — os campos abaixo mostram os valores aprovados
          inicialmente. Clique em &quot;Salvar&quot; para confirmá-los.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
        <Input
          id="telefone"
          name="telefone"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="11976069213"
          required
        />
        <ErroCampo erros={estado.fieldErrors?.telefone} />
        <p className="text-xs text-muted-foreground">
          {previaLink ? (
            <>
              Prévia do link:{" "}
              <a
                href={previaLink}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {previaLink}
              </a>
            </>
          ) : (
            "Informe DDD + número para ver a prévia do link."
          )}
        </p>
        {telefoneE164Atual && (
          <p className="text-xs text-muted-foreground">
            Valor salvo atualmente: {telefoneE164Atual}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="horario">Horário de atendimento</Label>
        <Input
          id="horario"
          name="horario"
          defaultValue={horarioInicial}
          placeholder="Segunda a sexta, 9h às 18h"
        />
        <ErroCampo erros={estado.fieldErrors?.horario} />
        <p className="text-xs text-muted-foreground">
          Texto livre — não representa um SLA nem atendimento automatizado.
        </p>
      </div>
      {estado.message && (
        <p className={estado.success ? "text-sm text-green-600" : "text-sm text-destructive"}>
          {estado.message}
        </p>
      )}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
