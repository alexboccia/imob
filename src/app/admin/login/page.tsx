"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/lib/site-config";

export default function LoginPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCarregando(true);
    setErro(null);

    const formData = new FormData(event.currentTarget);
    const resultado = await signIn("credentials", {
      email: formData.get("email"),
      senha: formData.get("senha"),
      redirect: false,
    });

    setCarregando(false);

    if (!resultado || resultado.error) {
      setErro("E-mail ou senha inválidos.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-center mb-1">
          {siteConfig.nome}
        </h1>
        <p className="text-center text-gray-500 mb-6 text-sm">
          Painel administrativo
        </p>
        <form
          onSubmit={handleSubmit}
          className="bg-white border rounded-lg p-6 space-y-4"
        >
          <input
            name="email"
            type="email"
            placeholder="E-mail"
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <input
            name="senha"
            type="password"
            placeholder="Senha"
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-black text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-800 active:bg-gray-900 transition-colors disabled:opacity-50"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
