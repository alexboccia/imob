import Image from "next/image";
import { TITULO_HERO, SUBTITULO_HERO } from "@/lib/site-typography";

// Proposta 2 — substitui o slideshow/carrossel anterior (SlideshowHome,
// removido) por uma composição única: imagem grande + overlay + headline
// fixa. `imagemUrl` reaproveita a MESMA fonte de dados que o slideshow já
// usava (capa do primeiro imóvel com hasSlideshow=true, ver page.tsx) —
// nenhum CMS/upload novo, só a foto de capa de um imóvel real da própria
// organização; sem imóvel marcado pra isso, cai num gradiente neutro (sem
// inventar imagem de banco de imagens). O overlay é sempre escuro
// (neutro), não a cor do tema — garante contraste de texto legível
// independente da cor primária configurada por cada organização; a cor
// do tema é aplicada no botão/tab do painel de busca logo abaixo, não
// aqui.
export function HeroHome({ imagemUrl }: { imagemUrl: string | null }) {
  return (
    <section className="relative bg-gray-900">
      <div className="relative flex h-[440px] flex-col items-center justify-center overflow-hidden sm:h-[520px] lg:h-[600px]">
        {imagemUrl ? (
          <Image
            src={imagemUrl}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-900 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pb-20 text-center sm:pb-24">
          <h1 className={TITULO_HERO}>Encontre o imóvel ideal para você</h1>
          <p className={`${SUBTITULO_HERO} mt-4 max-w-xl`}>
            Apartamentos, casas e imóveis comerciais selecionados para você.
          </p>
        </div>
      </div>
    </section>
  );
}
