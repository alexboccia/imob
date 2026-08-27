"use client";

import { useState } from "react";
import { IconeBusca } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { TipoComCategoria } from "@/lib/filtros-imoveis-data";

type Finalidade = "SALE" | "RENT";

// Proposta 2 — substitui BuscaHome (busca livre + botão "todos os
// filtros") por um painel estruturado inspirado na referência de UX
// (Lello), priorizando os campos reais do domínio: finalidade
// (Comprar/Alugar), bairro, tipo de imóvel e faixa de valor. Não existe
// filtro de "cidade" no domínio atual (só bairro, ver
// filtros-imoveis-data.ts) — omitido de propósito, não inventado.
//
// <form method="GET"> nativo pro mesmo destino/contrato de URL de sempre
// (${basePath}/imoveis com finalidade/bairro/tipo/precoMin/precoMax,
// já interpretados em imoveis/page.tsx) — funciona sem JS; o estado de
// Comprar/Alugar só existe pra alternar visualmente qual tab parece
// selecionada antes do submit (input hidden carrega o valor de verdade).
// Um <select> vazio nunca quebra o filtro: paraArray("") em
// imoveis/page.tsx já trata string vazia como "nenhum filtro".
export function PainelBuscaHome({
  tipos,
  bairros,
  basePath,
}: {
  tipos: TipoComCategoria[];
  bairros: string[];
  basePath: string;
}) {
  const [finalidade, setFinalidade] = useState<Finalidade>("SALE");

  const classeCampo =
    "h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20";
  const classeLabel = "mb-1 block text-xs font-medium text-gray-500";

  return (
    <div className="relative z-10 -mt-16 px-4 sm:-mt-20">
      <div className="mx-auto max-w-4xl rounded-2xl border border-gray-100 bg-white p-4 shadow-xl sm:p-6">
        <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
          {(["SALE", "RENT"] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFinalidade(valor)}
              aria-pressed={finalidade === valor}
              className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
                finalidade === valor
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {valor === "SALE" ? "Comprar" : "Alugar"}
            </button>
          ))}
        </div>

        <form method="GET" action={`${basePath}/imoveis`}>
          <input type="hidden" name="finalidade" value={finalidade} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-1">
              <label htmlFor="busca-home-bairro" className={classeLabel}>
                Bairro
              </label>
              <select id="busca-home-bairro" name="bairro" defaultValue="" className={classeCampo}>
                <option value="">Qualquer bairro</option>
                {bairros.map((bairro) => (
                  <option key={bairro} value={bairro}>
                    {bairro}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="busca-home-tipo" className={classeLabel}>
                Tipo de imóvel
              </label>
              <select id="busca-home-tipo" name="tipo" defaultValue="" className={classeCampo}>
                <option value="">Qualquer tipo</option>
                {tipos.map((tipo) => (
                  <option key={tipo.nome} value={tipo.nome}>
                    {tipo.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="busca-home-preco-min" className={classeLabel}>
                Valor mínimo
              </label>
              <input
                id="busca-home-preco-min"
                type="number"
                inputMode="numeric"
                min={0}
                name="precoMin"
                placeholder="R$ 0"
                className={classeCampo}
              />
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="busca-home-preco-max" className={classeLabel}>
                Valor máximo
              </label>
              <input
                id="busca-home-preco-max"
                type="number"
                inputMode="numeric"
                min={0}
                name="precoMax"
                placeholder="Sem limite"
                className={classeCampo}
              />
            </div>
          </div>

          <Button type="submit" size="lg" className="mt-4 w-full gap-2 sm:w-auto">
            <IconeBusca className="size-4" />
            Buscar imóveis
          </Button>
        </form>
      </div>
    </div>
  );
}
