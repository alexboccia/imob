"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGO_ALTURA_MIN, LOGO_ALTURA_MAX, LOGO_ALTURA_PADRAO } from "@/lib/logo";

export function LogoUpload({
  logoInicial,
  alturaInicial,
}: {
  logoInicial: string | null;
  alturaInicial: number;
}) {
  const [logo, setLogo] = useState(logoInicial);
  const [altura, setAltura] = useState(alturaInicial || LOGO_ALTURA_PADRAO);
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
        <div
          className="relative rounded-md overflow-hidden border bg-gray-50 shrink-0"
          style={{ height: altura, width: Math.min(altura * 4, 220) }}
        >
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

      <div className="space-y-1.5 pt-1">
        <Label htmlFor="logoAltura">Altura do logotipo no cabeçalho (px)</Label>
        <Input
          id="logoAltura"
          name="logoAltura"
          type="number"
          min={LOGO_ALTURA_MIN}
          max={LOGO_ALTURA_MAX}
          value={altura}
          onChange={(e) => {
            const valor = Number(e.target.value);
            if (Number.isFinite(valor)) setAltura(valor);
          }}
          className="w-24"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Recomendado: PNG ou WEBP com fundo transparente e formato retangular
        (proporção até 3:1), até 10MB. A imagem é redimensionada
        automaticamente para caber na altura escolhida (entre{" "}
        {LOGO_ALTURA_MIN}px e {LOGO_ALTURA_MAX}px) sem distorcer nem quebrar
        o layout. Se nenhum logotipo for enviado, o nome da imobiliária
        continua sendo exibido em texto.
      </p>
    </div>
  );
}
