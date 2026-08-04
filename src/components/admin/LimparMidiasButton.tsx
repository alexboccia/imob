"use client";

import { useState, useTransition } from "react";
import { limparMidiasOrfas } from "@/app/admin/manutencao/actions";

export function LimparMidiasButton() {
  const [resultado, setResultado] = useState<{
    totalObjetos: number;
    totalRemovidas: number;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function executar() {
    setErro(null);
    setResultado(null);
    startTransition(async () => {
      try {
        const res = await limparMidiasOrfas();
        setResultado(res);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao limpar mídias.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={executar}
        disabled={pendente}
        className="bg-black text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-800 active:bg-gray-900 transition-colors disabled:opacity-50"
      >
        {pendente ? "Limpando..." : "Limpar fotos não utilizadas"}
      </button>
      {resultado && (
        <p className="text-sm text-gray-600 mt-3">
          {resultado.totalObjetos} arquivo(s) verificado(s) no storage,{" "}
          {resultado.totalRemovidas} removido(s) por não estarem vinculados a
          nenhum imóvel.
        </p>
      )}
      {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}
    </div>
  );
}
