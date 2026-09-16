"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import { AnimatePresence, motion } from "motion/react";
import { ModalContato } from "@/components/ModalContato";
import { BotaoCompartilhar } from "@/components/BotaoCompartilhar";
import { Button, buttonVariants } from "@/components/ui/button";
import { enviarEventoAnalytics } from "@/lib/analytics-client";
import { TIPOS_EVENTO_ANALYTICS } from "@/lib/analytics-eventos";
import {
  IconeChevronEsquerdo,
  IconeChevronDireito,
  IconeFechar,
  IconeZoomMais,
  IconeZoomMenos,
  IconeGrade,
} from "@/components/icons";

type Foto = { id: string; url: string };

// Galeria comercial (Fase 44): no desktop, um HERO de uma peça só (foto
// principal + até 4 complementares); abaixo de lg, carrossel. Os dois
// abrem o MESMO lightbox, com todas as fotos na ordem cadastrada.
//
// Fase 43 — a galeria não carrega mais atalho de vídeo nem Compartilhar
// sobre a foto: o atalho oficial de vídeo é a barra de recursos logo
// abaixo, e o Compartilhar da ficha é o do cabeçalho. Dentro do
// lightbox o Compartilhar continua — ali o cabeçalho não está visível.
export function GaleriaFotos({
  fotos,
  titulo,
  imovelId,
  whatsappHref,
  mensagemContato,
  orgSlug,
  nome,
}: {
  fotos: Foto[];
  titulo: string;
  imovelId: string;
  // null quando o tenant não tem WhatsApp configurado — o CTA da barra
  // do lightbox some, e o ModalContato (que já aceita a prop opcional)
  // segue oferecendo o formulário. Nunca renderiza "wa.me/" vazio.
  whatsappHref: string | null;
  mensagemContato: string;
  orgSlug: string;
  nome: string;
}) {
  const router = useRouter();
  const [indice, setIndice] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [zoom, setZoom] = useState(1);
  const swiperInlineRef = useRef<SwiperType | null>(null);
  const swiperLightboxRef = useRef<SwiperType | null>(null);
  const fecharRef = useRef<HTMLButtonElement | null>(null);
  // Quem abriu o lightbox recebe o foco de volta ao fechar.
  const origemFocoRef = useRef<HTMLElement | null>(null);

  const total = fotos.length;
  const rotuloVerGaleria = `Ver galeria (${total} ${total === 1 ? "foto" : "fotos"})`;
  // Não há descrição cadastrada por foto (Media só tem url, ordem e capa),
  // então o texto alternativo diz o que é verdade: a posição da foto na
  // galeria deste imóvel. Nada é deduzido do conteúdo da imagem.
  const altFoto = (i: number) => `Foto ${i + 1} de ${total} — ${titulo}`;

  function abrir(i: number) {
    origemFocoRef.current = document.activeElement as HTMLElement | null;
    setIndice(i);
    setZoom(1);
    setAberto(true);
  }

  const anterior = useCallback(() => {
    setIndice((i) => (i - 1 + fotos.length) % fotos.length);
    setZoom(1);
  }, [fotos.length]);

  const proxima = useCallback(() => {
    setIndice((i) => (i + 1) % fotos.length);
    setZoom(1);
  }, [fotos.length]);

  useEffect(() => {
    if (!aberto) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAberto(false);
      if (event.key === "ArrowLeft") anterior();
      if (event.key === "ArrowRight") proxima();
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    fecharRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      origemFocoRef.current?.focus?.();
    };
  }, [aberto, anterior, proxima]);

  useEffect(() => {
    swiperInlineRef.current?.slideTo(fotos.length > 1 ? indice + 1 : indice);
    if (aberto) {
      swiperLightboxRef.current?.slideTo(indice);
    }
  }, [indice, aberto, fotos.length]);

  function zoomMais() {
    setZoom((z) => Math.min(3, z + 0.5));
  }

  function zoomMenos() {
    setZoom((z) => Math.max(1, z - 0.5));
  }

  // Sem fotos: um aviso discreto na largura do conteúdo. Antes era um
  // bloco 16:9 de ponta a ponta (~720px de altura em 1280) que empurrava
  // a ficha inteira para baixo sem mostrar nada.
  if (total === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div
          data-galeria-vazia
          className="flex h-40 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-500 sm:h-48"
        >
          Sem fotos
        </div>
      </div>
    );
  }

  const temMultiplas = total > 1;
  // Preenche com uma cópia da última foto antes da primeira e uma cópia da
  // primeira foto depois da última, para o carrossel girar sem fim. Ao
  // alcançar um desses clones, pulamos (sem animação) para a posição real
  // correspondente. Os clones ficam fora da árvore acessível.
  const slidesInline = temMultiplas
    ? [
        { foto: fotos[total - 1], real: total - 1, clone: true },
        ...fotos.map((foto, i) => ({ foto, real: i, clone: false })),
        { foto: fotos[0], real: 0, clone: true },
      ]
    : fotos.map((foto, i) => ({ foto, real: i, clone: false }));
  const slideInicial = temMultiplas ? 1 : 0;

  // Grade do desktop: 1 principal + até 4 complementares, sem repetir
  // foto e sem célula vazia. A disposição das complementares depende de
  // quantas existem:
  //   1 → ocupa a coluna inteira
  //   2 → empilhadas
  //   3 → uma larga em cima, duas embaixo
  //   4 → 2x2
  const complementares = fotos.slice(1, 5);
  const restantes = total - 1 - complementares.length;
  const gradeComplementares =
    complementares.length === 1
      ? "grid-cols-1 grid-rows-1"
      : complementares.length === 2
        ? "grid-cols-1 grid-rows-2"
        : "grid-cols-2 grid-rows-2";

  const botaoVerGaleria = (className: string) => (
    <button
      type="button"
      onClick={() => abrir(indice)}
      data-ver-galeria
      className={`inline-flex items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-gray-900 shadow-md transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 ${className}`}
    >
      <IconeGrade className="size-4" />
      {rotuloVerGaleria}
    </button>
  );

  const botaoVoltar = (
    <Button
      type="button"
      variant="secondary"
      onClick={() => router.back()}
      className="absolute top-4 left-4 z-20 rounded-full bg-white/90 pl-2.5 shadow hover:bg-white"
    >
      <IconeChevronEsquerdo className="w-4 h-4" />
      Voltar
    </Button>
  );

  // O foco do teclado sobre a foto precisa aparecer mesmo em foto clara
  // ou escura: anel branco por dentro, com sombra escura por fora dele.
  const focoSobreFoto =
    "outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white focus-visible:shadow-[inset_0_0_0_6px_rgb(0_0_0/0.35)]";

  return (
    <>
      {/* Celular e tablet (< lg): carrossel próprio, de ponta a ponta. A
          grade 1+4 só existe quando há largura para ela — em 768px a foto
          principal ficaria mais alta que larga. As miniaturas que ficavam
          abaixo saíram: repetiam o carrossel em 80px e empurravam a ficha;
          swipe, setas, contador, "Ver galeria" e o lightbox continuam
          levando a todas as fotos. */}
      <div
        data-galeria-carrossel
        className="lg:hidden relative w-full h-[340px] sm:h-[440px] bg-black overflow-hidden"
      >
        <Swiper
          centeredSlides
          initialSlide={slideInicial}
          slidesPerView={1}
          spaceBetween={0}
          onSwiper={(swiper) => {
            swiperInlineRef.current = swiper;
          }}
          onSlideChange={(swiper) => {
            const posicao = swiper.activeIndex;
            if (!temMultiplas) {
              setIndice(posicao);
            } else if (posicao === 0) {
              swiper.slideTo(total, 0, false);
              setIndice(total - 1);
            } else if (posicao === total + 1) {
              swiper.slideTo(1, 0, false);
              setIndice(0);
            } else {
              setIndice(posicao - 1);
            }
            setZoom(1);
          }}
          className="w-full h-full"
        >
          {slidesInline.map((item, posicao) => (
            <SwiperSlide
              key={`${item.foto.id}-${posicao}`}
              aria-hidden={item.clone || undefined}
            >
              <button
                type="button"
                onClick={() => abrir(item.real)}
                aria-label={`Ampliar foto ${item.real + 1} de ${total}`}
                tabIndex={item.clone ? -1 : undefined}
                className={`relative block w-full h-full cursor-zoom-in ${focoSobreFoto}`}
              >
                <Image
                  src={item.foto.url}
                  alt={item.clone ? "" : altFoto(item.real)}
                  fill
                  className="object-cover"
                  sizes="100vw"
                  // Candidata a LCP só abaixo de lg. Sem `preload`: a
                  // imagem que é LCP muda conforme a viewport, e a doc do
                  // Next 16 pede eager + fetchPriority nesse caso.
                  {...(posicao === slideInicial
                    ? { loading: "eager" as const, fetchPriority: "high" as const }
                    : {})}
                />
              </button>
            </SwiperSlide>
          ))}
        </Swiper>

        {botaoVoltar}

        {temMultiplas && (
          <>
            <button
              type="button"
              onClick={anterior}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-900 flex items-center justify-center shadow"
            >
              <IconeChevronEsquerdo className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={proxima}
              aria-label="Próxima foto"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-900 flex items-center justify-center shadow"
            >
              <IconeChevronDireito className="w-5 h-5" />
            </button>
            <span
              data-contador-fotos
              className="absolute bottom-4 right-4 z-20 bg-black/60 text-white text-xs rounded-full px-2.5 py-1"
            >
              {indice + 1} / {total}
            </span>
          </>
        )}

        {botaoVerGaleria("absolute bottom-4 left-4 z-20 min-h-11")}
      </div>

      {/* Desktop (>= lg): HERO em uma peça só — foto principal com ~54% da
          largura e as complementares ao lado, separadas por um vão fino e
          com os cantos arredondados só por fora. A altura vem da
          proporção (21:10): ~533px na largura máxima da ficha, ~472px em
          1024. Baixa o bastante para o cabeçalho comercial da Fase 43 e
          parte boa da galeria caberem juntos na primeira tela. */}
      <div className="hidden lg:block mx-auto max-w-6xl px-4 pt-4">
        <div
          data-galeria-hero
          className="grid aspect-[21/10] gap-2 overflow-hidden rounded-xl"
          style={{
            gridTemplateColumns: temMultiplas
              ? "minmax(0, 54fr) minmax(0, 46fr)"
              : "minmax(0, 1fr)",
          }}
        >
          <div data-foto-principal className="relative min-h-0 min-w-0">
            <button
              type="button"
              onClick={() => abrir(0)}
              aria-label={`Ampliar foto 1 de ${total}`}
              className={`group absolute inset-0 cursor-zoom-in overflow-hidden ${focoSobreFoto}`}
            >
              <Image
                src={fotos[0].url}
                alt={altFoto(0)}
                fill
                className="object-cover transition-[filter] duration-200 group-hover:brightness-95"
                sizes={temMultiplas ? "(min-width: 1152px) 605px, 54vw" : "(min-width: 1152px) 1120px, 100vw"}
                loading="eager"
                fetchPriority="high"
              />
            </button>
            {botaoVoltar}
            {botaoVerGaleria("absolute bottom-4 left-4 z-20 min-h-10")}
          </div>

          {complementares.length > 0 && (
            <div
              data-fotos-complementares
              className={`grid min-h-0 min-w-0 gap-2 ${gradeComplementares}`}
            >
              {complementares.map((foto, i) => {
                const indiceReal = i + 1;
                const ultima = i === complementares.length - 1;
                // Com mais de 5 fotos, a última célula avisa que a galeria
                // continua e abre direto na primeira foto que a grade não
                // mostrou.
                const continua = ultima && restantes > 0;
                return (
                  <button
                    key={foto.id}
                    type="button"
                    data-foto-complementar
                    onClick={() => abrir(continua ? indiceReal + 1 : indiceReal)}
                    aria-label={
                      continua
                        ? `Ver mais ${restantes} ${restantes === 1 ? "foto" : "fotos"}`
                        : `Ampliar foto ${indiceReal + 1} de ${total}`
                    }
                    className={`group relative min-h-0 min-w-0 cursor-zoom-in overflow-hidden ${
                      complementares.length === 3 && i === 0 ? "col-span-2" : ""
                    } ${focoSobreFoto}`}
                  >
                    <Image
                      src={foto.url}
                      alt={altFoto(indiceReal)}
                      fill
                      className="object-cover transition-[filter] duration-200 group-hover:brightness-95"
                      sizes={
                        complementares.length === 1
                          ? "(min-width: 1152px) 515px, 46vw"
                          : "(min-width: 1152px) 256px, 23vw"
                      }
                    />
                    {continua && (
                      <span
                        aria-hidden
                        className="absolute inset-0 flex items-center justify-center bg-black/60 text-3xl font-semibold tracking-tight text-white"
                      >
                        +{restantes}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-md p-4 sm:p-8"
            onClick={() => setAberto(false)}
            role="dialog"
            aria-modal="true"
            aria-label={`Galeria de fotos — ${titulo}`}
            data-lightbox
          >
          <button
            ref={fecharRef}
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 w-10 h-10 rounded-full bg-white hover:bg-gray-100 text-gray-900 flex items-center justify-center shadow-lg"
          >
            <IconeFechar className="w-5 h-5" />
          </button>

          {fotos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  anterior();
                }}
                aria-label="Foto anterior"
                className="absolute left-3 sm:left-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white hover:bg-gray-100 text-gray-900 flex items-center justify-center shadow-lg"
              >
                <IconeChevronEsquerdo className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  proxima();
                }}
                aria-label="Próxima foto"
                className="absolute right-3 sm:right-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white hover:bg-gray-100 text-gray-900 flex items-center justify-center shadow-lg"
              >
                <IconeChevronDireito className="w-5 h-5" />
              </button>
            </>
          )}

          <div
            className="relative w-full max-w-6xl h-[75vh] sm:h-[80vh] rounded-2xl overflow-hidden shadow-2xl bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <Swiper
              initialSlide={indice}
              onSwiper={(swiper) => {
                swiperLightboxRef.current = swiper;
              }}
              onSlideChange={(swiper) => {
                setIndice(swiper.activeIndex);
                setZoom(1);
              }}
              className="w-full h-full"
            >
              {fotos.map((foto, i) => (
                <SwiperSlide key={foto.id}>
                  <div
                    className="relative w-full h-full transition-transform duration-200"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <Image
                      src={foto.url}
                      alt={altFoto(i)}
                      fill
                      className="object-contain"
                      sizes="100vw"
                    />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>

            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
<BotaoCompartilhar
              titulo={titulo}
              className="flex size-9 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow hover:bg-white"
            />
            </div>
          </div>

          <div
            className="flex items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={zoomMenos}
              disabled={zoom <= 1}
              aria-label="Diminuir zoom"
              className="w-9 h-9 rounded-full bg-white hover:bg-gray-100 text-gray-700 flex items-center justify-center shadow disabled:opacity-40"
            >
              <IconeZoomMenos className="w-4 h-4" />
            </button>
            {fotos.length > 1 && (
              <span className="bg-white text-gray-900 text-xs font-medium rounded-full px-3 py-1.5 shadow">
                {indice + 1}/{fotos.length}
              </span>
            )}
            <button
              type="button"
              onClick={zoomMais}
              disabled={zoom >= 3}
              aria-label="Aumentar zoom"
              className="w-9 h-9 rounded-full bg-white hover:bg-gray-100 text-gray-700 flex items-center justify-center shadow disabled:opacity-40"
            >
              <IconeZoomMais className="w-4 h-4" />
            </button>
          </div>

          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                // Este componente já é client, então não precisa do
                // wrapper RastreioCliqueWhatsApp: chama o helper direto.
                // Síncrono, sem await, com o href intacto — o WhatsApp
                // abre mesmo se o tracking falhar.
                onClick={() =>
                  enviarEventoAnalytics({
                    orgSlug,
                    propertyId: imovelId,
                    type: TIPOS_EVENTO_ANALYTICS.WHATSAPP_CLICK,
                    placement: "GALLERY",
                  })
                }
                className={buttonVariants({
                  className:
                    "bg-whatsapp-brand text-white hover:bg-whatsapp-brand-hover active:bg-whatsapp-brand-active",
                })}
              >
                WhatsApp
              </a>
            )}
            <ModalContato
              imovelId={imovelId}
              mensagemPreenchida={mensagemContato}
              whatsappHref={whatsappHref ?? undefined}
              className="bg-white text-gray-900 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-100"
              orgSlug={orgSlug}
              nome={nome}
            >
              Enviar mensagem
            </ModalContato>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
