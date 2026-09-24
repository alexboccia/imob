"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { BotaoEscolherArquivo } from "@/components/admin/BotaoEscolherArquivo";
import { Label } from "@/components/ui/label";
import { IMAGEM_HERO_PADRAO } from "@/lib/site-config";
import { HERO_LARGURA_MINIMA, HERO_ALTURA_MINIMA } from "@/lib/hero-image-limits";

// Imagem de fundo do Hero da Home pública (OrganizationSettings.
// heroImageUrl) — mesmo padrão de upload de LogoUpload/LogoRodapeUpload/
// FaviconUpload (POST em /api/admin/upload, resultado num input hidden
// que viaja com o resto do formulário em "Salvar alterações"), com uma
// diferença: o preview aqui SEMPRE mostra uma imagem (a customizada, ou
// o fallback padrão do produto — nunca fica em branco), porque é isso
// que deixa o admin ver exatamente o que a Home pública vai mostrar sem
// precisar abrir o site. "Restaurar imagem padrão" só aparece quando há
// uma imagem customizada pra restaurar (voltar ao padrão quando já está
// no padrão não faz sentido).
export function HeroImageUpload({ heroImageInicial }: { heroImageInicial: string | null }) {
  const [heroImage, setHeroImage] = useState(heroImageInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleArquivo(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setEnviando(true);
    setErro(null);
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("pasta", "hero");
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
    setHeroImage(dados.url);
    event.target.value = "";
  }

  const imagemExibida = heroImage ?? IMAGEM_HERO_PADRAO;

  return (
    <div className="min-w-0 space-y-2">
      <Label>Imagem principal da Home</Label>
      <p className="min-w-0 break-words text-sm text-muted-foreground">
        Esta imagem aparece em destaque no topo do seu site.
      </p>
      <input type="hidden" name="heroImage" value={heroImage ?? ""} />

      <div className="relative aspect-[12/5] w-full max-w-2xl overflow-hidden rounded-lg border bg-gray-900">
        <Image
          src={imagemExibida}
          alt="Prévia da imagem principal da Home"
          fill
          sizes="(min-width: 1024px) 672px, 100vw"
          className="object-cover"
        />
        {enviando && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white">
            Enviando...
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-2 pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <BotaoEscolherArquivo
            onArquivo={handleArquivo}
            accept="image/jpeg,image/png,image/webp"
            disabled={enviando}
            rotulo={enviando ? "Enviando..." : heroImage ? "Alterar imagem" : "Enviar imagem"}
            descricaoAcessivel="Enviar imagem principal da Home"
          />
          {heroImage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9"
              onClick={() => setHeroImage(null)}
              disabled={enviando}
            >
              Restaurar imagem padrão
            </Button>
          )}
        </div>
        {erro && <p className="min-w-0 break-words text-sm text-destructive">{erro}</p>}
      </div>

      <p className="min-w-0 break-words text-xs text-muted-foreground">
        Recomendado: imagem horizontal, em alta resolução (mínimo{" "}
        {HERO_LARGURA_MINIMA}×{HERO_ALTURA_MINIMA}px, ideal 1920×900px ou
        superior). JPEG, PNG ou WEBP, até 10MB.
      </p>
    </div>
  );
}
