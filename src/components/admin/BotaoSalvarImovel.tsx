"use client";

import { useFormStatus } from "react-dom";

export function BotaoSalvarImovel() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-black text-white rounded-md px-6 py-2 font-medium hover:bg-gray-800 active:bg-gray-900 transition-colors disabled:opacity-50"
    >
      {pending ? "Salvando..." : "Salvar imóvel"}
    </button>
  );
}
