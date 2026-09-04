"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import { AnimatePresence, motion } from "motion/react";
import {
  IconeChevronEsquerdo,
  IconeChevronDireito,
  IconeFechar,
} from "@/components/icons";
import { TITULO_BLOCO } from "@/lib/site-typography";

type Planta = { id: string; url: string };

export function CarrosselPlantas({ plantas }: { plantas: Planta[] }) {
  const [indice, setIndice] = useState(0);
  const [aberto, setAberto] = useState(false);
  const swiperInlineRef = useRef<SwiperType | null>(null);
  const swiperLightboxRef = useRef<SwiperType | null>(null);

  const anterior = useCallback(() => {
    setIndice((i) => (i - 1 + plantas.length) % plantas.length);
  }, [plantas.length]);

  const proxima = useCallback(() => {
    setIndice((i) => (i + 1) % plantas.length);
  }, [plantas.length]);

  useEffect(() => {
    swiperInlineRef.current?.slideTo(indice);
    if (aberto) {
      swiperLightboxRef.current?.slideTo(indice);
    }
  }, [indice, aberto]);

  if (plantas.length === 0) return null;

  return (
    <div>
      {/* TITULO_BLOCO: mesmo peso dos demais títulos de seção do detalhe
          (Descrição, Características, Localização) — antes era um
          font-semibold solto, menor que os vizinhos. */}
      <h2 className={`${TITULO_BLOCO} mb-4`}>Plantas e imagens</h2>

      <div className="flex items-center justify-center gap-4">
        {plantas.length > 1 && (
          <button
            type="button"
            onClick={anterior}
            aria-label="Planta anterior"
            className="shrink-0 w-9 h-9 rounded-full border flex items-center justify-center hover:bg-gray-50"
          >
            <IconeChevronEsquerdo className="w-5 h-5" />
          </button>
        )}

        <div className="relative w-full max-w-xs aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border">
          <Swiper
            onSwiper={(swiper) => {
              swiperInlineRef.current = swiper;
            }}
            onSlideChange={(swiper) => setIndice(swiper.activeIndex)}
            className="w-full h-full"
          >
            {plantas.map((planta, i) => (
              <SwiperSlide key={planta.id}>
                <button
                  type="button"
                  onClick={() => setAberto(true)}
                  aria-label="Ampliar planta"
                  className="relative block w-full h-full cursor-zoom-in"
                >
                  <Image
                    src={planta.url}
                    alt={`Planta ${i + 1}`}
                    fill
                    className="object-contain"
                    sizes="320px"
                  />
                </button>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {plantas.length > 1 && (
          <button
            type="button"
            onClick={proxima}
            aria-label="Próxima planta"
            className="shrink-0 w-9 h-9 rounded-full border flex items-center justify-center hover:bg-gray-50"
          >
            <IconeChevronDireito className="w-5 h-5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={() => setAberto(false)}
          >
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white hover:opacity-70"
          >
            <IconeFechar className="w-6 h-6" />
          </button>

          {plantas.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                anterior();
              }}
              aria-label="Planta anterior"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            >
              <IconeChevronEsquerdo className="w-5 h-5" />
            </button>
          )}

          <div
            className="relative w-full h-full max-w-2xl max-h-[85vh] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Swiper
              initialSlide={indice}
              onSwiper={(swiper) => {
                swiperLightboxRef.current = swiper;
              }}
              onSlideChange={(swiper) => setIndice(swiper.activeIndex)}
              className="w-full h-full"
            >
              {plantas.map((planta, i) => (
                <SwiperSlide key={planta.id}>
                  <Image
                    src={planta.url}
                    alt={`Planta ${i + 1}`}
                    fill
                    className="object-contain"
                    sizes="100vw"
                  />
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          {plantas.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                proxima();
              }}
              aria-label="Próxima planta"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            >
              <IconeChevronDireito className="w-5 h-5" />
            </button>
          )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
