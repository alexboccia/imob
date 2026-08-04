"use client";

import { useMemo, useState } from "react";
import { normalizarTexto } from "@/lib/texto";

const QUANTIDADE_INICIAL = 12;

export function SeletorCaracteristicas({
  nome,
  titulo,
  opcoes,
  selecionadas = [],
}: {
  nome: string;
  titulo: string;
  opcoes: string[];
  selecionadas?: string[];
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

    const selecionadasPrimeiro = opcoes.filter((o) => selecionadas.includes(o));
    const restantes = opcoes.filter((o) => !selecionadas.includes(o));
    return [...selecionadasPrimeiro, ...restantes].slice(
      0,
      Math.max(QUANTIDADE_INICIAL, selecionadasPrimeiro.length)
    );
  }, [opcoes, buscaNormalizada, mostrarTodas, selecionadas]);

  const restantesCount = opcoes.length - visiveis.length;

  if (opcoes.length === 0) {
    return (
      <div>
        <p className="text-sm font-medium mb-2">{titulo}</p>
        <p className="text-xs text-gray-500">
          Nenhuma opção cadastrada. Cadastre em Características, no menu.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium mb-2">{titulo}</p>
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar..."
        className="w-full border rounded-md px-3 py-2 text-sm mb-3"
      />

      <div className="flex flex-wrap gap-2">
        {visiveis.map((opcao) => (
          <label key={opcao} className="cursor-pointer">
            <input
              type="checkbox"
              name={nome}
              value={opcao}
              defaultChecked={selecionadas.includes(opcao)}
              className="peer sr-only"
            />
            <span className="inline-block text-sm px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:border-gray-400 peer-checked:bg-black peer-checked:text-white peer-checked:border-black transition-colors">
              {opcao}
            </span>
          </label>
        ))}
      </div>

      {buscaNormalizada && visiveis.length === 0 && (
        <p className="text-xs text-gray-500 mt-2">
          Nenhuma característica encontrada.
        </p>
      )}

      {!buscaNormalizada && restantesCount > 0 && (
        <button
          type="button"
          onClick={() => setMostrarTodas(true)}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Ver as outras {restantesCount} opções
        </button>
      )}
      {!buscaNormalizada && mostrarTodas && (
        <button
          type="button"
          onClick={() => setMostrarTodas(false)}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Ver menos
        </button>
      )}
    </div>
  );
}
