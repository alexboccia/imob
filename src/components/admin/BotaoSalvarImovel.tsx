"use client";

import { Save } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Redesign da tela de edição de imóvel — CTA principal (item 4 da
// autorização): usado duas vezes na MESMA árvore de componentes dentro
// do <form> (cabeçalho e rodapé), nunca dois fluxos de salvamento — as
// duas instâncias compartilham o mesmo useFormStatus() (o pai comum é
// o <form>), então "Salvando..." aparece nas duas ao mesmo tempo.
export function BotaoSalvarImovel({
  rotulo = "Salvar imóvel",
}: {
  /** "Salvar alterações" na edição (item 4 da autorização); "Salvar
      imóvel" (default) continua valendo pro cadastro de um novo
      imóvel, fora do escopo desta fase. */
  rotulo?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      // Azul explícito (não a variante default, preta neste tema) — é o
      // CTA principal da página, com mais destaque que os demais botões
      // do cabeçalho (item 4 da autorização).
      className="gap-1.5 bg-blue-600 font-semibold text-white hover:bg-blue-700"
    >
      <Save className="size-4" />
      {pending ? "Salvando..." : rotulo}
    </Button>
  );
}
