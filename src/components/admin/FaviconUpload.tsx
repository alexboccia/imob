"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { BotaoEscolherArquivo } from "@/components/admin/BotaoEscolherArquivo";
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
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {/* Mesmos `accept`, mesma validação e mesmo fallback — só a
                apresentação do disparador mudou. */}
            <BotaoEscolherArquivo
              onArquivo={handleArquivo}
              accept="image/png,image/jpeg,image/webp"
              disabled={enviando}
              rotulo={enviando ? "Enviando..." : favicon ? "Alterar favicon" : "Enviar favicon"}
              descricaoAcessivel="Enviar arquivo de favicon"
            />
            {favicon && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 text-destructive hover:text-destructive"
                onClick={() => setFavicon(null)}
              >
                Remover
              </Button>
            )}
          </div>
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
