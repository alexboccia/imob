"use client";

import { useState } from "react";
import { MapPin, Home as IconeCasa, CircleDollarSign, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TipoComCategoria } from "@/lib/filtros-imoveis-data";

type Finalidade = "SALE" | "RENT";

// Proposta 2 (correção) — card vertical de busca, pra ficar DENTRO do hero
// (ver HeroHome.tsx, que renderiza isto como `children` ao lado da
// headline em desktop) em vez de uma barra horizontal solta abaixo dele.
// Mesmo contrato de sempre: <form method="GET"> nativo pro mesmo destino
// (${basePath}/imoveis com finalidade/bairro/tipo/precoMin/precoMax, já
// interpretados em imoveis/page.tsx) — funciona sem JS; um <select> vazio
// nunca quebra o filtro (paraArray("") já trata string vazia como
// "nenhum filtro"). Sem campo de "Cidade": não existe no domínio (só
// bairro, ver filtros-imoveis-data.ts).
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
    "h-12 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20";
  const classeLabel =
    "mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500";

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl">
      {/* Tabs ocupando a largura toda, metade cada — destaque forte no
          selecionado (bg-primary), mesma ordem do mockup (Alugar |
          Comprar). */}
      <div className="grid grid-cols-2">
        {(["RENT", "SALE"] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            onClick={() => setFinalidade(valor)}
            aria-pressed={finalidade === valor}
            className={`py-4 text-sm font-semibold transition-colors ${
              finalidade === valor
                ? "bg-primary text-primary-foreground"
                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            }`}
          >
            {valor === "RENT" ? "Alugar" : "Comprar"}
          </button>
        ))}
      </div>

      <form method="GET" action={`${basePath}/imoveis`} className="p-5 sm:p-6">
        <input type="hidden" name="finalidade" value={finalidade} />

        <div>
          <label htmlFor="busca-home-bairro" className={classeLabel}>
            <MapPin className="size-3.5" />
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

        <div className="mt-4 border-t border-gray-100 pt-4">
          <label htmlFor="busca-home-tipo" className={classeLabel}>
            <IconeCasa className="size-3.5" />
            Tipo de imóvel
          </label>
          <select id="busca-home-tipo" name="tipo" defaultValue="" className={classeCampo}>
            <option value="">Todos os imóveis</option>
            {tipos.map((tipo) => (
              <option key={tipo.nome} value={tipo.nome}>
                {tipo.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4">
          <label htmlFor="busca-home-preco-min" className={classeLabel}>
            <CircleDollarSign className="size-3.5" />
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

        <div className="mt-4 border-t border-gray-100 pt-4">
          <label htmlFor="busca-home-preco-max" className={classeLabel}>
            <CircleDollarSign className="size-3.5" />
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

        <Button type="submit" size="lg" className="mt-5 h-12 w-full gap-2 text-base">
          <Search className="size-4" />
          Buscar imóveis
        </Button>
      </form>
    </div>
  );
}
