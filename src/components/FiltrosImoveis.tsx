"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizarTexto } from "@/lib/texto";
import { FINALIDADE_LABEL, formatarPreco } from "@/lib/format";
import { IconeFiltros, IconeChevronBaixo, IconeFechar } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoBuscaImoveis } from "@/components/CampoBuscaImoveis";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type FiltrosIniciais = {
  tipo: string[];
  finalidade: string;
  bairro: string[];
  precoMin: string;
  precoMax: string;
  caracteristicas: string[];
  busca: string;
};

type PainelAberto =
  | "tipo"
  | "negocio"
  | "localizacao"
  | "valor"
  | "caracteristicas"
  | null;

const QUANTIDADE_INICIAL = 8;

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
        ativo
          ? "bg-primary text-primary-foreground border-primary"
          : "border-gray-300 text-gray-700 hover:border-gray-400"
      }`}
    >
      {children}
    </button>
  );
}

function PainelMultiSelecao({
  titulo,
  placeholder,
  opcoes,
  selecionados,
  onToggle,
}: {
  titulo: string;
  placeholder: string;
  opcoes: string[];
  selecionados: string[];
  onToggle: (valor: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const buscaNormalizada = normalizarTexto(busca.trim());

  const visiveis = useMemo(() => {
    if (buscaNormalizada) {
      return opcoes.filter((opcao) =>
        normalizarTexto(opcao).includes(buscaNormalizada)
      );
    }
    if (mostrarTodas) return opcoes;
    const selecionadosPrimeiro = opcoes.filter((o) => selecionados.includes(o));
    const restantes = opcoes.filter((o) => !selecionados.includes(o));
    return [...selecionadosPrimeiro, ...restantes].slice(
      0,
      Math.max(QUANTIDADE_INICIAL, selecionadosPrimeiro.length)
    );
  }, [opcoes, buscaNormalizada, mostrarTodas, selecionados]);

  const restantesCount = opcoes.length - visiveis.length;

  return (
    <div className="p-4 w-[320px] max-h-[70vh] overflow-y-auto">
      <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
        {titulo}
      </p>
      <Input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={placeholder}
        className="mb-3 bg-gray-50"
      />

      {opcoes.length === 0 ? (
        <p className="text-xs text-gray-500">Nenhuma opção cadastrada.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {visiveis.map((opcao) => (
            <Chip
              key={opcao}
              ativo={selecionados.includes(opcao)}
              onClick={() => onToggle(opcao)}
            >
              {opcao}
            </Chip>
          ))}
        </div>
      )}

      {buscaNormalizada && visiveis.length === 0 && (
        <p className="text-xs text-gray-500 mt-2">Nenhum resultado encontrado.</p>
      )}

      {!buscaNormalizada && restantesCount > 0 && (
        <button
          type="button"
          onClick={() => setMostrarTodas(true)}
          className="mt-3 text-sm text-blue-600 hover:underline block"
        >
          Ver as outras {restantesCount} opções
        </button>
      )}
      {!buscaNormalizada && mostrarTodas && (
        <button
          type="button"
          onClick={() => setMostrarTodas(false)}
          className="mt-3 text-sm text-blue-600 hover:underline block"
        >
          Ver menos
        </button>
      )}

      {selecionados.length > 0 && (
        <div className="border-t mt-4 pt-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            Selecionados
          </p>
          <div className="flex flex-wrap gap-2">
            {selecionados.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-xs rounded-full pl-3 pr-2 py-1"
              >
                {s}
                <button
                  type="button"
                  onClick={() => onToggle(s)}
                  aria-label={`Remover ${s}`}
                  className="hover:text-black"
                >
                  <IconeFechar className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function pillTriggerClassName(aberto: boolean) {
  return `flex flex-col items-start justify-center text-left min-h-8 px-3 py-1 rounded-lg border shrink-0 ${
    aberto ? "border-primary" : "border-gray-200 hover:border-gray-300"
  }`;
}

function FiltroPillLabel({
  label,
  valor,
  aberto,
}: {
  label: string;
  valor: string;
  aberto: boolean;
}) {
  return (
    <>
      <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
        {label}
        <IconeChevronBaixo
          className={`w-3 h-3 transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </span>
      {valor && (
        <span className="text-sm font-medium truncate max-w-[160px]">
          {valor}
        </span>
      )}
    </>
  );
}

// Faixa de preço é sempre em reais inteiros — diferente do CampoMoeda
// (usado no cadastro do imóvel), que mascara centavos dígito a dígito.
// Aqui o texto digitado já É o valor em reais, só formatado com
// separador de milhar pra leitura.
function formatarMilhar(valor: string): string {
  if (!valor) return "";
  return Number(valor).toLocaleString("pt-BR");
}

function rotuloMultiplo(
  selecionados: string[],
  labelDe: (valor: string) => string,
  vazio: string
) {
  if (selecionados.length === 0) return vazio;
  if (selecionados.length === 1) return labelDe(selecionados[0]);
  return `${labelDe(selecionados[0])} +${selecionados.length - 1}`;
}

export function FiltrosImoveis({
  tipos,
  bairros,
  caracteristicas,
  inicial,
  paramsExtras,
  orgSlug,
  basePath,
}: {
  tipos: string[];
  bairros: string[];
  caracteristicas: string[];
  inicial: FiltrosIniciais;
  paramsExtras: Record<string, string>;
  orgSlug: string;
  basePath: string;
}) {
  const router = useRouter();

  const [tipo, setTipo] = useState(inicial.tipo);
  const [finalidade, setFinalidade] = useState(inicial.finalidade);
  const [bairro, setBairro] = useState(inicial.bairro);
  const [precoMin, setPrecoMin] = useState(inicial.precoMin);
  const [precoMax, setPrecoMax] = useState(inicial.precoMax);
  const [caract, setCaract] = useState(inicial.caracteristicas);
  const [busca, setBusca] = useState(inicial.busca);
  const [aberto, setAberto] = useState<PainelAberto>(null);
  const [mobileExpandido, setMobileExpandido] = useState(false);

  function alternar(
    lista: string[],
    setLista: (v: string[]) => void,
    valor: string
  ) {
    setLista(
      lista.includes(valor)
        ? lista.filter((v) => v !== valor)
        : [...lista, valor]
    );
  }

  function abrirPainel(painel: Exclude<PainelAberto, null>) {
    return (aberto: boolean) => setAberto(aberto ? painel : null);
  }

  function buscar() {
    const query = new URLSearchParams();
    tipo.forEach((t) => query.append("tipo", t));
    if (finalidade) query.set("finalidade", finalidade);
    bairro.forEach((b) => query.append("bairro", b));
    if (precoMin) query.set("precoMin", precoMin);
    if (precoMax) query.set("precoMax", precoMax);
    caract.forEach((c) => query.append("caracteristicas", c));
    if (busca) query.set("busca", busca);
    Object.entries(paramsExtras).forEach(([chave, valor]) => {
      if (valor) query.set(chave, valor);
    });
    setAberto(null);
    router.push(`${basePath}/imoveis?${query.toString()}`);
  }

  function limparFiltros() {
    setTipo([]);
    setFinalidade("");
    setBairro([]);
    setPrecoMin("");
    setPrecoMax("");
    setCaract([]);
    setBusca("");
    setAberto(null);
    router.push(`${basePath}/imoveis`);
  }

  const labelTipo = rotuloMultiplo(tipo, (v) => v, "");
  const labelBairro = rotuloMultiplo(bairro, (v) => v, "");
  const labelCaract = rotuloMultiplo(caract, (v) => v, "");
  const labelNegocio = finalidade
    ? FINALIDADE_LABEL[finalidade] ?? finalidade
    : "";
  const labelValor =
    precoMin || precoMax
      ? `${precoMin ? formatarPreco(precoMin) : "Qualquer"} - ${
          precoMax ? formatarPreco(precoMax) : "Qualquer"
        }`
      : "";

  return (
    <div className="border rounded-lg sticky top-[var(--site-header-height)] z-20 bg-background">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2.5">
        <button
          type="button"
          onClick={() => setMobileExpandido((v) => !v)}
          aria-label={mobileExpandido ? "Ocultar filtros" : "Mostrar filtros"}
          aria-expanded={mobileExpandido}
          className="sm:hidden flex items-center justify-center size-8 rounded-lg border border-gray-200 hover:border-gray-300 shrink-0"
        >
          <IconeFiltros className="w-4 h-4 text-gray-500" />
        </button>

        <div
          className={`${
            mobileExpandido ? "contents" : "hidden"
          } sm:contents`}
        >
        <Popover
          open={aberto === "negocio"}
          onOpenChange={abrirPainel("negocio")}
        >
          <PopoverTrigger className={pillTriggerClassName(aberto === "negocio")}>
            <FiltroPillLabel
              label="Tipo de negócio"
              valor={labelNegocio}
              aberto={aberto === "negocio"}
            />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[280px] p-4">
            <div className="flex flex-col gap-2">
              {Object.entries(FINALIDADE_LABEL).map(([value, label]) => (
                <Chip
                  key={value}
                  ativo={finalidade === value}
                  onClick={() =>
                    setFinalidade(finalidade === value ? "" : value)
                  }
                >
                  {label}
                </Chip>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={aberto === "tipo"} onOpenChange={abrirPainel("tipo")}>
          <PopoverTrigger className={pillTriggerClassName(aberto === "tipo")}>
            <FiltroPillLabel label="Tipo de Imóvel" valor={labelTipo} aberto={aberto === "tipo"} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <PainelMultiSelecao
              titulo="Tipo de imóvel"
              placeholder="Buscar tipo..."
              opcoes={tipos}
              selecionados={tipo}
              onToggle={(valor) => alternar(tipo, setTipo, valor)}
            />
          </PopoverContent>
        </Popover>

        <Popover
          open={aberto === "localizacao"}
          onOpenChange={abrirPainel("localizacao")}
        >
          <PopoverTrigger
            className={pillTriggerClassName(aberto === "localizacao")}
          >
            <FiltroPillLabel
              label="Localização"
              valor={labelBairro}
              aberto={aberto === "localizacao"}
            />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <PainelMultiSelecao
              titulo="Em qual localização?"
              placeholder="Digite o bairro..."
              opcoes={bairros}
              selecionados={bairro}
              onToggle={(valor) => alternar(bairro, setBairro, valor)}
            />
          </PopoverContent>
        </Popover>

        <Popover open={aberto === "valor"} onOpenChange={abrirPainel("valor")}>
          <PopoverTrigger className={pillTriggerClassName(aberto === "valor")}>
            <FiltroPillLabel
              label="Valor"
              valor={labelValor}
              aberto={aberto === "valor"}
            />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[280px] p-4">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Faixa de preço
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                  R$
                </span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatarMilhar(precoMin)}
                  onChange={(e) =>
                    setPrecoMin(e.target.value.replace(/\D/g, "").slice(0, 12))
                  }
                  placeholder="Mínimo"
                  className="pl-8"
                />
              </div>
              <span className="text-gray-400">–</span>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                  R$
                </span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatarMilhar(precoMax)}
                  onChange={(e) =>
                    setPrecoMax(e.target.value.replace(/\D/g, "").slice(0, 12))
                  }
                  placeholder="Máximo"
                  className="pl-8"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover
          open={aberto === "caracteristicas"}
          onOpenChange={abrirPainel("caracteristicas")}
        >
          <PopoverTrigger
            className={pillTriggerClassName(aberto === "caracteristicas")}
          >
            <FiltroPillLabel
              label="Características"
              valor={labelCaract}
              aberto={aberto === "caracteristicas"}
            />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <PainelMultiSelecao
              titulo="Características"
              placeholder="Buscar característica..."
              opcoes={caracteristicas}
              selecionados={caract}
              onToggle={(valor) => alternar(caract, setCaract, valor)}
            />
          </PopoverContent>
        </Popover>
        </div>

        <CampoBuscaImoveis
          value={busca}
          onChange={setBusca}
          onEnter={buscar}
          className="ml-auto min-w-[200px] flex-1"
          orgSlug={orgSlug}
          basePath={basePath}
        />

        <Button
          onClick={limparFiltros}
          variant="outline"
          size="lg"
          className="shrink-0"
        >
          Limpar filtros
        </Button>

        <Button onClick={buscar} size="lg" className="shrink-0">
          Buscar
        </Button>
      </div>
    </div>
  );
}
