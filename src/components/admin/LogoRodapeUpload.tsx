"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Slot de logo dedicado ao rodapé (OrganizationSettings.footerLogoUrl) —
// opcional e independente do logo do cabeçalho (LogoUpload.tsx). Sem
// campo de altura (diferente de LogoUpload): o rodapé usa uma altura fixa
// própria (ver SiteFooter.tsx), não configurável por organização.
export function LogoRodapeUpload({ logoInicial }: { logoInicial: string | null }) {
  const [logo, setLogo] = useState(logoInicial);
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
    setLogo(dados.url);
    event.target.value = "";
  }

  return (
    <div className="min-w-0 space-y-2">
      <Label>Logotipo do rodapé</Label>
      <input type="hidden" name="logoRodape" value={logo ?? ""} />
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative h-11 w-44 max-w-full shrink-0 overflow-hidden rounded-md border bg-gray-50">
          {logo ? (
            <Image src={logo} alt="Logotipo do rodapé" fill className="object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              Sem logotipo
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <input
            type="file"
            accept="image/*"
            onChange={handleArquivo}
            disabled={enviando}
            className="block w-full min-w-0 max-w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-gray-800 active:file:bg-gray-900 file:transition-colors disabled:opacity-50"
          />
          {logo && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-destructive h-auto p-0 block"
              onClick={() => setLogo(null)}
            >
              Remover logotipo
            </Button>
          )}
          {erro && <p className="min-w-0 break-words text-xs text-destructive">{erro}</p>}
        </div>
      </div>
      <p className="min-w-0 break-words text-xs text-muted-foreground">
        Opcional. Se nenhum logotipo do rodapé for enviado, o rodapé usa o
        mesmo logotipo do cabeçalho (ou o nome da imobiliária em texto).
      </p>
    </div>
  );
}
