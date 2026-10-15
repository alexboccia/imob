"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { salvarComissaoPadrao } from "@/app/app/configuracoes/comissao-actions";

// Fase 124 (item 15) — interface administrativa para o percentual padrão
// de comissão (infraestrutura criada na Fase 122, sem tela até aqui).
// Deliberadamente um formulário pequeno e isolado, no mesmo padrão de
// MeuPerfilPublicoForm — não entra no formulário grande de Configurações
// (ConfiguracaoContatoForm) porque é um dado financeiro, de preocupação
// diferente de contato/identidade visual.
//
// Este percentual NUNCA é aplicado automaticamente a nenhum negócio —
// ver o racional completo em src/lib/comissao-configuracao.ts. A tela
// deixa isso explícito para não sugerir ao usuário um cálculo que o
// produto não faz.
export function ComissaoConfiguracaoForm({
  percentualAtual,
}: {
  percentualAtual: number | null;
}) {
  const [estado, formAction, pendente] = useActionState(salvarComissaoPadrao, ESTADO_INICIAL_ACAO);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comissão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Defina um percentual padrão para ajudar no preenchimento ao registrar uma proposta.
          Ele nunca é aplicado automaticamente — o valor em reais de cada negociação continua
          sendo informado e confirmado por quem registra o negócio.
        </p>

        <form action={formAction} className="flex flex-col gap-3 sm:max-w-xs">
          <div className="space-y-1.5">
            <Label htmlFor="percentualComissaoPadrao">Percentual padrão de comissão</Label>
            <div className="relative">
              <Input
                id="percentualComissaoPadrao"
                name="percentualComissaoPadrao"
                inputMode="decimal"
                placeholder="Ex.: 6"
                defaultValue={percentualAtual ?? ""}
                aria-describedby="percentualComissaoPadrao-sufixo"
                className="pr-8"
              />
              <span
                id="percentualComissaoPadrao-sufixo"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
              >
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Deixe em branco para não configurar um padrão.
            </p>
          </div>

          {estado.message && (
            <Alert variant={estado.success ? "default" : "destructive"}>
              <AlertDescription>{estado.message}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={pendente} className="self-start">
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
