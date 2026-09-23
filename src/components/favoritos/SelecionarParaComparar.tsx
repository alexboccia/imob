"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { alternarSelecao, useEstaSelecionado } from "@/lib/comparador-selecao";

// Seleção de um imóvel para a comparação (Fase 59).
//
// AÇÃO DIFERENTE DO CORAÇÃO, e o card mostra as duas: favoritar é "quero
// guardar este imóvel"; selecionar é "quero pôr este imóvel lado a lado
// com os outros agora". Transformar o coração em seletor faria o
// visitante perder a lista salva ao mexer na comparação.
//
// O rótulo é texto de verdade (não `sr-only`): duas caixas mudas num
// card já foi o defeito da Fase 58, e aqui o custo de escrever
// "Comparar" é uma palavra.
export function SelecionarParaComparar({
  orgSlug,
  imovelId,
  titulo,
}: {
  orgSlug: string;
  imovelId: string;
  titulo: string;
}) {
  const selecionado = useEstaSelecionado(orgSlug, imovelId);
  const id = useId();

  return (
    <label
      htmlFor={id}
      data-selecionar-comparar={imovelId}
      className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700"
    >
      <Checkbox
        id={id}
        checked={selecionado}
        onCheckedChange={() => alternarSelecao(orgSlug, imovelId)}
        // O nome acessível diz DE QUAL imóvel é esta caixa: numa grade
        // de cards, cinco "Comparar" idênticos não orientam ninguém que
        // navegue por leitor de tela.
        aria-label={`Comparar ${titulo}`}
      />
      Comparar
    </label>
  );
}
