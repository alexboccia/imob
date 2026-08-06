"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function LogoUpload({ logoInicial }: { logoInicial: string | null }) {
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
    <div className="space-y-2">
      <Label>Logotipo</Label>
      <input type="hidden" name="logo" value={logo ?? ""} />
      <div className="flex items-center gap-4">
        <div className="relative w-40 h-14 rounded-md overflow-hidden border bg-gray-50 shrink-0">
          {logo ? (
            <Image
              src={logo}
              alt="Logotipo"
              fill
              className="object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              Sem logotipo
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
          {erro && <p className="text-xs text-destructive">{erro}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Recomendado: PNG ou SVG com fundo transparente, formato retangular
        (proporção até 3:1) e pelo menos 200px de altura. No cabeçalho do
        site ele é exibido com altura fixa de 40px — imagens maiores são
        reduzidas automaticamente e não afetam o layout, mas usar uma
        imagem já nesse tamanho evita arquivos desnecessariamente pesados.
        Se nenhum logotipo for enviado, o nome da imobiliária continua
        sendo exibido em texto.
      </p>
    </div>
  );
}
