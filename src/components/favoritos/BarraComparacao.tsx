"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { limparSelecao, MINIMO_PARA_COMPARAR } from "@/lib/comparador-selecao";
import { cn } from "@/lib/utils";

// Estado da comparação dentro da página de favoritos (Fase 59).
//
// Bloco NO FLUXO da página, não barra fixa: o rodapé do site já é o fim
// natural da leitura, e uma faixa colada na base disputaria espaço com o
// botão flutuante de contato (BotaoContatoFlutuante) em telas pequenas —
// justo onde o polegar está.
//
// Só existe quando há algo selecionado: sem seleção, a página de
// favoritos é exatamente a que era antes desta fase.
export function BarraComparacao({
  orgSlug,
  basePath,
  total,
}: {
  orgSlug: string;
  basePath: string;
  total: number;
}) {
  if (total === 0) return null;

  const suficiente = total >= MINIMO_PARA_COMPARAR;

  return (
    <div
      data-barra-comparacao
      className="mt-6 flex min-w-0 flex-col gap-3 rounded-xl border bg-muted p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-medium text-gray-900" data-total-selecionados>
          {total === 1 ? "1 imóvel selecionado" : `${total} imóveis selecionados`}
        </p>
        {/* Um imóvel não é uma comparação: em vez de um botão que abre
            uma tela inútil, a própria linha diz o que falta. */}
        {!suficiente && (
          <p className="text-sm text-muted-foreground">
            Selecione pelo menos {MINIMO_PARA_COMPARAR} imóveis para comparar.
          </p>
        )}
      </div>

      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          data-limpar-selecao
          onClick={() => limparSelecao(orgSlug)}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Limpar seleção
        </button>
        {suficiente && (
          <Link
            href={`${basePath}/favoritos/comparar`}
            data-abrir-comparacao
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Comparar {total} imóveis
          </Link>
        )}
      </div>
    </div>
  );
}
