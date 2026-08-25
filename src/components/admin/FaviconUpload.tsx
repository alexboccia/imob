"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function FaviconUpload({ faviconInicial }: { faviconInicial: string | null }) {
  const [favicon, setFavicon] = useState(faviconInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleArquivo(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setEnviando(true);
    setErro(null);
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("pasta", "site");
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
    setFavicon(dados.url);
    event.target.value = "";
  }

  return (
    <div className="min-w-0 space-y-2">
      <Label>Favicon</Label>
      <input type="hidden" name="favicon" value={favicon ?? ""} />
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative w-8 h-8 shrink-0 rounded overflow-hidden border bg-gray-50">
          {favicon ? (
            <Image src={favicon} alt="Favicon" fill className="object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-[8px]">
              —
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleArquivo}
            disabled={enviando}
            className="block w-full min-w-0 max-w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-gray-800 active:file:bg-gray-900 file:transition-colors disabled:opacity-50"
          />
          {favicon && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-destructive h-auto p-0 block"
              onClick={() => setFavicon(null)}
            >
              Remover favicon
            </Button>
          )}
          {erro && <p className="min-w-0 break-words text-xs text-destructive">{erro}</p>}
        </div>
      </div>
      <p className="min-w-0 break-words text-xs text-muted-foreground">
        PNG, JPEG ou WEBP, de preferência quadrado (ex: 32x32 ou 64x64). Se
        nenhum favicon for enviado, o site público usa o ícone padrão.
      </p>
    </div>
  );
}
