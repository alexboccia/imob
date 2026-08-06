"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import { AnimatePresence, motion } from "motion/react";
import { ModalContato } from "@/components/ModalContato";
import { Button } from "@/components/ui/button";
import {
  IconeChevronEsquerdo,
  IconeChevronDireito,
  IconeFechar,
  IconeCompartilhar,
  IconeZoomMais,
  IconeZoomMenos,
  IconeGrade,
  IconePlay,
} from "@/components/icons";

type Foto = { id: string; url: string };

export function GaleriaFotos({
  fotos,
  titulo,
  imovelId,
  whatsappHref,
  mensagemContato,
  temVideo = false,
}: {
  fotos: Foto[];
  titulo: string;
  imovelId: string;
  whatsappHref: string;
  mensagemContato: string;
  temVideo?: boolean;
}) {
  const router = useRouter();
  const [indice, setIndice] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const thumbsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const swiperInlineRef = useRef<SwiperType | null>(null);
  const swiperLightboxRef = useRef<SwiperType | null>(null);

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
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [aberto, anterior, proxima]);

  useEffect(() => {
    thumbsRef.current[indice]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
    swiperInlineRef.current?.slideTo(fotos.length > 1 ? indice + 1 : indice);
    if (aberto) {
      swiperLightboxRef.current?.slideTo(indice);
    }
  }, [indice, aberto, fotos.length]);

  async function compartilhar() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, url });
      } catch {
        // usuário cancelou o compartilhamento
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  }

  function zoomMais() {
    setZoom((z) => Math.min(3, z + 0.5));
  }

  function zoomMenos() {
    setZoom((z) => Math.max(1, z - 0.5));
  }

  if (fotos.length === 0) {
    return (
      <div className="aspect-video bg-gray-100 flex items-center justify-center text-gray-400">
        Sem fotos
      </div>
    );
  }

  const temMultiplas = fotos.length > 1;
  // Preenche com uma cópia da última foto antes da primeira e uma cópia da
  // primeira foto depois da última, para o preview lateral nunca ficar vazio
  // nas pontas. Ao alcançar um desses clones, pulamos (sem animação) para a
  // posição real correspondente.
  const slidesInline = temMultiplas
    ? [
        { foto: fotos[fotos.length - 1], real: fotos.length - 1 },
        ...fotos.map((foto, i) => ({ foto, real: i })),
        { foto: fotos[0], real: 0 },
      ]
    : fotos.map((foto, i) => ({ foto, real: i }));
  const slideInicial = temMultiplas ? 1 : 0;

  return (
    <>
      <div className="relative w-full h-[340px] sm:h-[440px] lg:h-[560px] bg-black overflow-hidden">
        <Swiper
          centeredSlides
          initialSlide={slideInicial}
          slidesPerView={1}
          spaceBetween={0}
          breakpoints={
            temMultiplas
              ? {
                  640: { slidesPerView: 1.2, spaceBetween: 0 },
                  1024: { slidesPerView: 1.6, spaceBetween: 0 },
                }
              : undefined
          }
          onSwiper={(swiper) => {
            swiperInlineRef.current = swiper;
          }}
          onSlideChange={(swiper) => {
            const posicao = swiper.activeIndex;
            if (!temMultiplas) {
              setIndice(posicao);
            } else if (posicao === 0) {
              swiper.slideTo(fotos.length, 0, false);
              setIndice(fotos.length - 1);
            } else if (posicao === fotos.length + 1) {
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
            <SwiperSlide key={`${item.foto.id}-${posicao}`}>
              <button
                type="button"
                onClick={() => setAberto(true)}
                aria-label="Ampliar foto"
                className="relative block w-full h-full cursor-zoom-in"
              >
                <Image
                  src={item.foto.url}
                  alt={titulo}
                  fill
                  className={`object-cover transition-all duration-300 ${
                    item.real === indice ? "" : "blur-[3px] brightness-[0.55]"
                  }`}
                  sizes="100vw"
                  priority={posicao === slideInicial}
                />
              </button>
            </SwiperSlide>
          ))}
        </Swiper>

        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          className="absolute top-4 left-4 z-20 rounded-full bg-white/90 pl-2.5 shadow hover:bg-white"
        >
          <IconeChevronEsquerdo className="w-4 h-4" />
          Voltar
        </Button>

        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={compartilhar}
              aria-label="Compartilhar"
              className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-gray-900 flex items-center justify-center shadow"
            >
              <IconeCompartilhar className="w-4 h-4" />
            </button>
            {linkCopiado && (
              <span className="absolute top-full right-0 mt-1 whitespace-nowrap text-xs bg-white text-gray-900 px-2 py-1 rounded shadow">
                Link copiado!
              </span>
            )}
          </div>
        </div>

        {fotos.length > 1 && (
          <>
            <button
              type="button"
              onClick={anterior}
              aria-label="Foto anterior"
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-900 flex items-center justify-center shadow"
            >
              <IconeChevronEsquerdo className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={proxima}
              aria-label="Próxima foto"
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-900 flex items-center justify-center shadow"
            >
              <IconeChevronDireito className="w-5 h-5" />
            </button>
            <span className="absolute bottom-4 right-4 z-20 bg-black/60 text-white text-xs rounded-full px-2.5 py-1">
              {indice + 1} / {fotos.length}
            </span>
          </>
        )}
      </div>

      {(fotos.length > 1 || temVideo) && (
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex gap-2 mt-3 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1">
            {fotos.map((foto, i) => (
              <button
                key={foto.id}
                ref={(el) => {
                  thumbsRef.current[i] = el;
                }}
                type="button"
                onClick={() => {
                  setIndice(i);
                  setZoom(1);
                }}
                className={`relative w-20 h-20 flex-shrink-0 snap-start rounded-md overflow-hidden border-2 ${
                  i === indice ? "border-black" : "border-transparent"
                }`}
              >
                <Image
                  src={foto.url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="flex-shrink-0 w-20 h-20 rounded-md border bg-gray-50 hover:bg-gray-100 text-gray-600 flex flex-col items-center justify-center gap-1 text-xs font-medium text-center px-1"
            >
              <IconeGrade className="w-4 h-4" />
              Ver galeria ({fotos.length})
            </button>
            {temVideo && (
              <a
                href="#videos"
                className="flex-shrink-0 w-20 h-20 rounded-md border bg-gray-900 hover:bg-gray-800 active:bg-black transition-colors text-white flex flex-col items-center justify-center gap-1 text-xs font-medium text-center px-1"
              >
                <IconePlay className="w-4 h-4" />
                Vídeo
              </a>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-md p-4 sm:p-8"
            onClick={() => setAberto(false)}
          >
          <button
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
              {fotos.map((foto) => (
                <SwiperSlide key={foto.id}>
                  <div
                    className="relative w-full h-full transition-transform duration-200"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <Image
                      src={foto.url}
                      alt={titulo}
                      fill
                      className="object-contain"
                      sizes="100vw"
                    />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>

            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={compartilhar}
                  aria-label="Compartilhar"
                  className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-gray-900 flex items-center justify-center shadow"
                >
                  <IconeCompartilhar className="w-4 h-4" />
                </button>
                {linkCopiado && (
                  <span className="absolute top-full right-0 mt-1 whitespace-nowrap text-xs bg-white text-gray-900 px-2 py-1 rounded shadow">
                    Link copiado!
                  </span>
                )}
              </div>
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
            <Button
              className="bg-green-600 hover:bg-green-700 active:bg-green-800"
              render={
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" />
              }
            >
              WhatsApp
            </Button>
            <ModalContato
              imovelId={imovelId}
              mensagemPreenchida={mensagemContato}
              whatsappHref={whatsappHref}
              className="bg-white text-gray-900 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-100"
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
