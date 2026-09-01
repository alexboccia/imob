"use client";

import { useMemo, useState } from "react";
import { MapPin, Map as MapaIcone, Home as IconeCasa, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import { normalizarTexto } from "@/lib/texto";
import { formatarMilharDigitos } from "@/lib/format";
import type { TipoComCategoria, BairroComCidade } from "@/lib/filtros-imoveis-data";

type Finalidade = "SALE" | "RENT";

const SENTINELA_TODOS_TIPOS = "__TODOS__";
const LABEL_CATEGORIA: Record<string, string> = {
  RESIDENTIAL: "Residencial",
  COMMERCIAL: "Comercial",
};
// Ordem fixa (não alfabética) — Residencial antes de Comercial, mesma
// ordem do catálogo/mockup de referência. Tipos sem categoria no
// catálogo (PropertyTypeOption) — ex: valor livre digitado antes de
// existir o catálogo, ou tipo removido do catálogo depois de já usado em
// algum imóvel — caem no grupo "Outros" no fim, nunca escondidos.
const ORDEM_CATEGORIAS = ["RESIDENTIAL", "COMMERCIAL"] as const;

function agruparTipos(tipos: TipoComCategoria[]) {
  const porCategoria = new Map<string, TipoComCategoria[]>();
  for (const tipo of tipos) {
    const chave = tipo.categoria ?? "OUTROS";
    const lista = porCategoria.get(chave) ?? [];
    lista.push(tipo);
    porCategoria.set(chave, lista);
  }
  const grupos: { label: string; tipos: TipoComCategoria[] }[] = [];
  for (const categoria of ORDEM_CATEGORIAS) {
    const lista = porCategoria.get(categoria);
    if (lista && lista.length > 0) {
      grupos.push({ label: LABEL_CATEGORIA[categoria], tipos: lista });
    }
  }
  const outros = porCategoria.get("OUTROS");
  if (outros && outros.length > 0) {
    grupos.push({ label: "Outros", tipos: outros });
  }
  return grupos;
}

// Mesmo normalizador já usado no filtro avançado de /imoveis
// (FiltrosImoveis.tsx) — "sao" ou "São" encontram "São Paulo" do mesmo
// jeito, sem alterar o valor de verdade que é enviado no filtro.
function filtroLocalizacao(itemValue: string, query: string): boolean {
  return normalizarTexto(itemValue).includes(normalizarTexto(query));
}

// Proposta 2 (correção) — card vertical de busca, pra ficar DENTRO do hero
// (ver HeroHome.tsx, que renderiza isto como `children` ao lado da
// headline em desktop). <form method="GET"> nativo pro mesmo destino
// (${basePath}/imoveis) — funciona sem JS pro submit em si; Cidade/Bairro
// (Combobox) e Tipo (Select) usam primitivos do Base UI com suporte
// nativo a `name` (renderizam um input oculto sincronizado), então
// continuam submitindo corretamente dentro do form nativo mesmo sendo
// componentes client interativos.
//
// Cidade/bairro: autocomplete 100% client-side sobre a lista de facetas
// já carregada pelo Server Component pai (buscarDadosFiltros) — nenhum
// request extra por tecla, dataset por tenant é pequeno o bastante pra
// isso ser a escolha certa (ver investigação da feature). Bairro é
// filtrado pela Cidade selecionada; trocar de cidade limpa um bairro que
// não pertença mais a ela.
export function PainelBuscaHome({
  tipos,
  cidades,
  bairros,
  basePath,
}: {
  tipos: TipoComCategoria[];
  cidades: string[];
  bairros: BairroComCidade[];
  basePath: string;
}) {
  const [finalidade, setFinalidade] = useState<Finalidade>("SALE");
  const [cidade, setCidade] = useState<string | null>(null);
  const [bairro, setBairro] = useState<string | null>(null);
  const [tipo, setTipo] = useState(SENTINELA_TODOS_TIPOS);
  const [valorDigitos, setValorDigitos] = useState("");

  const gruposTipos = useMemo(() => agruparTipos(tipos), [tipos]);

  const bairrosDaCidade = useMemo(() => {
    if (!cidade) return [];
    return bairros.filter((b) => b.cidade === cidade).map((b) => b.nome);
  }, [bairros, cidade]);

  function aoMudarCidade(novaCidade: string | null) {
    setCidade(novaCidade);
    // Bairro só é válido dentro da cidade selecionada — trocar de cidade
    // sem limpar o bairro deixaria um filtro incoerente (ex: "Moema" +
    // "Campinas") ser enviado silenciosamente.
    if (bairro) {
      const bairrosValidos = novaCidade
        ? bairros.filter((b) => b.cidade === novaCidade).map((b) => b.nome)
        : [];
      if (!bairrosValidos.includes(bairro)) setBairro(null);
    }
  }

  const classeLabel =
    "mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500";
  const labelValor = finalidade === "RENT" ? "Aluguel até" : "Valor até";

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
          <label htmlFor="busca-home-cidade" className={classeLabel}>
            <MapPin className="size-3.5" />
            Cidade
          </label>
          <Combobox
            items={cidades}
            value={cidade}
            onValueChange={aoMudarCidade}
            filter={filtroLocalizacao}
            autoHighlight
            name="cidade"
          >
            <ComboboxInputGroup>
              <ComboboxInput
                id="busca-home-cidade"
                placeholder="Buscar uma cidade..."
                className="pr-8"
              />
              <div className="absolute right-1 flex items-center">
                <ComboboxClear aria-label="Limpar cidade" />
              </div>
            </ComboboxInputGroup>
            <ComboboxContent>
              <ComboboxEmpty>Nenhuma cidade encontrada.</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4">
          <label htmlFor="busca-home-bairro" className={classeLabel}>
            <MapaIcone className="size-3.5" />
            Bairro
          </label>
          <Combobox
            items={bairrosDaCidade}
            value={bairro}
            onValueChange={setBairro}
            filter={filtroLocalizacao}
            autoHighlight
            name="bairro"
            disabled={!cidade}
          >
            <ComboboxInputGroup className={!cidade ? "opacity-60" : undefined}>
              <ComboboxInput
                id="busca-home-bairro"
                placeholder={cidade ? "Buscar por bairro..." : "Selecione uma cidade primeiro"}
                className="pr-8"
              />
              <div className="absolute right-1 flex items-center">
                <ComboboxClear aria-label="Limpar bairro" />
              </div>
            </ComboboxInputGroup>
            <ComboboxContent>
              <ComboboxEmpty>Nenhum bairro encontrado.</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="busca-home-tipo" className={classeLabel}>
              <IconeCasa className="size-3.5" />
              Tipo de imóvel
            </label>
            <Select
              value={tipo}
              onValueChange={(v) => setTipo(v ?? SENTINELA_TODOS_TIPOS)}
              name={tipo === SENTINELA_TODOS_TIPOS ? undefined : "tipo"}
            >
              <SelectTrigger id="busca-home-tipo" className="h-12 w-full rounded-lg border-gray-200 px-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SENTINELA_TODOS_TIPOS}>Todos os imóveis</SelectItem>
                {gruposTipos.map((grupo) => (
                  <SelectGroup key={grupo.label}>
                    <SelectLabel>{grupo.label}</SelectLabel>
                    {grupo.tipos.map((t) => (
                      <SelectItem key={t.nome} value={t.nome}>
                        {t.nome}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0">
            <label htmlFor="busca-home-valor" className={classeLabel}>
              {labelValor}
            </label>
            {/* Duas entradas deliberadas: a visível formata com separador
                de milhar pra leitura (nunca decimal — isto é sempre reais
                inteiros), a oculta é a que de fato viaja no form GET,
                sempre só dígitos — nunca manda texto formatado
                ("600.000") pro parser numérico de /imoveis (ver seção 17
                do pedido: Number("600.000") quebraria, seria lido como
                600). */}
            <input type="hidden" name="precoMax" value={valorDigitos} />
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">
                R$
              </span>
              <input
                id="busca-home-valor"
                type="text"
                inputMode="numeric"
                value={formatarMilharDigitos(valorDigitos)}
                onChange={(e) =>
                  setValorDigitos(e.target.value.replace(/\D/g, "").slice(0, 12))
                }
                placeholder="Sem limite"
                className="h-12 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20"
              />
            </div>
          </div>
        </div>

        <Button type="submit" size="lg" className="mt-5 h-12 w-full gap-2 text-base">
          <Search className="size-4" />
          Buscar imóveis
        </Button>
      </form>
    </div>
  );
}
