import type { Metadata } from "next";
import { ContatoForm } from "@/components/ContatoForm";

export const metadata: Metadata = {
  title: "Contato",
  description:
    "Envie sua mensagem e um de nossos corretores retornará em breve.",
};

export default function ContatoPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Contato</h1>
      <p className="text-gray-500 mb-8">
        Envie sua mensagem e um de nossos corretores retornará em breve.
      </p>
      <ContatoForm />
    </div>
  );
}
