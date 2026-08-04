"use client";

import { useActionState } from "react";
import { enviarAnuncioProprietario } from "@/app/(public)/actions";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

export function AnuncieForm() {
  const [estado, formAction, pendente] = useActionState(
    enviarAnuncioProprietario,
    estadoInicial
  );

  return (
    <>
      {estado.sucesso ? (
        <p className="text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3">
          Recebemos seus dados! Em breve um corretor entrará em contato.
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          <input
            name="nome"
            placeholder="Nome"
            required
            className="w-full border rounded-md px-3 py-2"
          />
          <input
            name="email"
            type="email"
            placeholder="E-mail"
            className="w-full border rounded-md px-3 py-2"
          />
          <input
            name="telefone"
            placeholder="Telefone/WhatsApp"
            required
            className="w-full border rounded-md px-3 py-2"
          />
          <textarea
            name="descricaoImovel"
            placeholder="Descreva o imóvel (endereço, tipo, valor pretendido...)"
            required
            rows={5}
            className="w-full border rounded-md px-3 py-2"
          />
          {estado.erro && <p className="text-red-600 text-sm">{estado.erro}</p>}
          <button
            type="submit"
            disabled={pendente}
            className="bg-black text-white rounded-md px-6 py-2 font-medium hover:bg-gray-800 active:bg-gray-900 transition-colors disabled:opacity-50"
          >
            {pendente ? "Enviando..." : "Enviar"}
          </button>
        </form>
      )}
    </>
  );
}
