"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function FotoCorretorUpload({
  fotoInicial,
}: {
  fotoInicial: string | null;
}) {
  const [foto, setFoto] = useState(fotoInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleArquivo(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setEnviando(true);
    setErro(null);
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("pasta", "usuarios");
    const resposta = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });
    const dados = await resposta.json();
    setEnviando(false);
    if (!resposta.ok) {
      setErro(dados.erro ?? "Falha ao enviar arquivo");
      return;
    }
    setFoto(dados.url);
    event.target.value = "";
  }

  return (
    <div className="space-y-2">
      <Label>Foto</Label>
      <input type="hidden" name="foto" value={foto ?? ""} />
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 rounded-full overflow-hidden border bg-gray-100 shrink-0">
          {foto ? (
            <Image
              src={foto}
              alt="Foto do corretor"
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              Sem foto
            </div>
          )}
        </div>
        <div className="space-y-1">
          <input
            type="file"
            accept="image/*"
            onChange={handleArquivo}
            disabled={enviando}
            className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-gray-800 active:file:bg-gray-900 file:transition-colors disabled:opacity-50"
          />
          {foto && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-destructive h-auto p-0 block"
              onClick={() => setFoto(null)}
            >
              Remover foto
            </Button>
          )}
          {erro && <p className="text-xs text-destructive">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
