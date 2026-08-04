"use client";

import { useActionState } from "react";
import { enviarContato } from "@/app/(public)/actions";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

export function ContatoForm() {
  const [estado, formAction, pendente] = useActionState(
    enviarContato,
    estadoInicial
  );

  return (
    <>
      {estado.sucesso ? (
        <p className="text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3">
          Mensagem enviada com sucesso! Em breve entraremos em contato.
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
            className="w-full border rounded-md px-3 py-2"
          />
          <textarea
            name="mensagem"
            placeholder="Mensagem"
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
            {pendente ? "Enviando..." : "Enviar mensagem"}
          </button>
        </form>
      )}
    </>
  );
}
