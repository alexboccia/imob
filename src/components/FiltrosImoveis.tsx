"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizarTexto } from "@/lib/texto";
import { FINALIDADE_LABEL, formatarPreco } from "@/lib/format";
import {
  IconeFiltros,
  IconeChevronBaixo,
  IconeFechar,
} from "@/components/icons";

type Opcao = { value: string; label: string };

type FiltrosIniciais = {
  tipo: string[];
  finalidade: string;
  bairro: string[];
  precoMin: string;
  precoMax: string;
  caracteristicas: string[];
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
          ? "bg-black text-white border-black"
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
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-50 border rounded-md px-3 py-2 text-sm mb-3 outline-none"
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

function FiltroPill({
  label,
  valor,
  aberto,
  onClick,
}: {
  label: string;
  valor: string;
  aberto: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start text-left px-3 py-1.5 rounded-lg border shrink-0 ${
        aberto ? "border-gray-900" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
        {label}
        <IconeChevronBaixo
          className={`w-3 h-3 transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </span>
      <span className="text-sm font-medium truncate max-w-[160px]">
        {valor}
      </span>
    </button>
  );
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
}: {
  tipos: Opcao[];
  bairros: string[];
  caracteristicas: string[];
  inicial: FiltrosIniciais;
  paramsExtras: Record<string, string>;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [tipo, setTipo] = useState(inicial.tipo);
  const [finalidade, setFinalidade] = useState(inicial.finalidade);
  const [bairro, setBairro] = useState(inicial.bairro);
  const [precoMin, setPrecoMin] = useState(inicial.precoMin);
  const [precoMax, setPrecoMax] = useState(inicial.precoMax);
  const [caract, setCaract] = useState(inicial.caracteristicas);
  const [aberto, setAberto] = useState<PainelAberto>(null);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(evento.target as Node)
      ) {
        setAberto(null);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

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

  function buscar() {
    const query = new URLSearchParams();
    tipo.forEach((t) => query.append("tipo", t));
    if (finalidade) query.set("finalidade", finalidade);
    bairro.forEach((b) => query.append("bairro", b));
    if (precoMin) query.set("precoMin", precoMin);
    if (precoMax) query.set("precoMax", precoMax);
    caract.forEach((c) => query.append("caracteristicas", c));
    Object.entries(paramsExtras).forEach(([chave, valor]) => {
      if (valor) query.set(chave, valor);
    });
    setAberto(null);
    router.push(`/imoveis?${query.toString()}`);
  }

  const labelTipo = rotuloMultiplo(
    tipo,
    (v) => tipos.find((t) => t.value === v)?.label ?? v,
    "Não definido"
  );
  const labelBairro = rotuloMultiplo(bairro, (v) => v, "Não definido");
  const labelCaract = rotuloMultiplo(caract, (v) => v, "Não definido");
  const labelNegocio = finalidade
    ? FINALIDADE_LABEL[finalidade] ?? finalidade
    : "Comprar ou Alugar";
  const labelValor =
    precoMin || precoMax
      ? `${precoMin ? formatarPreco(precoMin) : "Qualquer"} - ${
          precoMax ? formatarPreco(precoMax) : "Qualquer"
        }`
      : "Não definido";

  return (
    <div ref={containerRef} className="relative border rounded-lg">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2.5">
        <div className="flex items-center gap-2 pr-3 border-r shrink-0">
          <IconeFiltros className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="leading-tight">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Filtros rápidos
            </p>
            <p className="text-sm font-medium">Refine a sua busca</p>
          </div>
        </div>

        <FiltroPill
          label="Tipo"
          valor={labelTipo}
          aberto={aberto === "tipo"}
          onClick={() => setAberto((a) => (a === "tipo" ? null : "tipo"))}
        />
        <FiltroPill
          label="Negócio"
          valor={labelNegocio}
          aberto={aberto === "negocio"}
          onClick={() => setAberto((a) => (a === "negocio" ? null : "negocio"))}
        />
        <FiltroPill
          label="Localização"
          valor={labelBairro}
          aberto={aberto === "localizacao"}
          onClick={() =>
            setAberto((a) => (a === "localizacao" ? null : "localizacao"))
          }
        />
        <FiltroPill
          label="Valor"
          valor={labelValor}
          aberto={aberto === "valor"}
          onClick={() => setAberto((a) => (a === "valor" ? null : "valor"))}
        />
        <FiltroPill
          label="Características"
          valor={labelCaract}
          aberto={aberto === "caracteristicas"}
          onClick={() =>
            setAberto((a) =>
              a === "caracteristicas" ? null : "caracteristicas"
            )
          }
        />

        <button
          type="button"
          onClick={buscar}
          className="ml-auto bg-black text-white rounded-md px-6 py-2.5 text-sm font-medium hover:bg-gray-800 active:bg-gray-900 transition-colors shrink-0"
        >
          Buscar
        </button>
      </div>

      {aberto === "tipo" && (
        <div className="absolute z-30 top-full left-0 mt-2 bg-white border rounded-lg shadow-lg p-4 w-[360px]">
          <div className="grid grid-cols-2 gap-2">
            {tipos.map((t) => (
              <Chip
                key={t.value}
                ativo={tipo.includes(t.value)}
                onClick={() => alternar(tipo, setTipo, t.value)}
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {aberto === "negocio" && (
        <div className="absolute z-30 top-full left-0 mt-2 bg-white border rounded-lg shadow-lg p-4 w-[280px]">
          <div className="flex flex-col gap-2">
            <Chip
              ativo={finalidade === ""}
              onClick={() => setFinalidade("")}
            >
              Comprar ou Alugar
            </Chip>
            {Object.entries(FINALIDADE_LABEL).map(([value, label]) => (
              <Chip
                key={value}
                ativo={finalidade === value}
                onClick={() => setFinalidade(value)}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {aberto === "localizacao" && (
        <div className="absolute z-30 top-full left-0 mt-2 bg-white border rounded-lg shadow-lg">
          <PainelMultiSelecao
            titulo="Em qual localização?"
            placeholder="Digite o bairro..."
            opcoes={bairros}
            selecionados={bairro}
            onToggle={(valor) => alternar(bairro, setBairro, valor)}
          />
        </div>
      )}

      {aberto === "valor" && (
        <div className="absolute z-30 top-full left-0 mt-2 bg-white border rounded-lg shadow-lg p-4 w-[280px]">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Faixa de preço
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={precoMin}
              onChange={(e) => setPrecoMin(e.target.value)}
              placeholder="Mínimo"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <span className="text-gray-400">–</span>
            <input
              type="number"
              value={precoMax}
              onChange={(e) => setPrecoMax(e.target.value)}
              placeholder="Máximo"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {aberto === "caracteristicas" && (
        <div className="absolute z-30 top-full left-0 mt-2 bg-white border rounded-lg shadow-lg">
          <PainelMultiSelecao
            titulo="Características"
            placeholder="Buscar característica..."
            opcoes={caracteristicas}
            selecionados={caract}
            onToggle={(valor) => alternar(caract, setCaract, valor)}
          />
        </div>
      )}
    </div>
  );
}
