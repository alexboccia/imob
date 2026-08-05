"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import { FINALIDADE_LABEL, formatarPreco } from "@/lib/format";
import { IconeChevronEsquerdo, IconeChevronDireito } from "@/components/icons";

type ImovelSlide = {
  id: string;
  titulo: string;
  tipo: string;
  finalidade: string;
  bairro: string;
  cidade: string;
  estado: string;
  preco: unknown;
  precoAluguel: unknown;
  midias: { url: string }[];
};

const INTERVALO_MS = 6000;

export function SlideshowHome({ imoveis }: { imoveis: ImovelSlide[] }) {
  const [indice, setIndice] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);

  return (
    <section className="relative bg-gray-900 text-white overflow-hidden">
      <div className="relative h-[420px] sm:h-[500px]">
        <Swiper
          modules={[Autoplay]}
          autoplay={
            imoveis.length > 1
              ? {
                  delay: INTERVALO_MS,
                  pauseOnMouseEnter: true,
                  disableOnInteraction: false,
                }
              : false
          }
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          onSlideChange={(swiper) => setIndice(swiper.realIndex)}
          className="w-full h-full"
        >
          {imoveis.map((imovel, i) => {
            const capa = imovel.midias[0]?.url;
            return (
              <SwiperSlide key={imovel.id}>
                <div className="relative w-full h-full">
                  {capa ? (
                    <Image
                      src={capa}
                      alt={imovel.titulo}
                      fill
                      priority={i === 0}
                      className="object-cover opacity-60"
                      sizes="100vw"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gray-800" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                  <div className="relative h-full mx-auto max-w-6xl px-4 flex flex-col justify-end pb-16">
                    <p className="text-sm text-gray-200">
                      {imovel.tipo} ·{" "}
                      {FINALIDADE_LABEL[imovel.finalidade] ?? imovel.finalidade}
                    </p>
                    <h1 className="text-2xl sm:text-4xl font-semibold mt-1 max-w-2xl">
                      {imovel.titulo}
                    </h1>
                    <p className="text-gray-200 mt-1">
                      {imovel.bairro}, {imovel.cidade} - {imovel.estado}
                    </p>
                    <p className="text-xl font-semibold mt-2">
                      {imovel.preco != null
                        ? formatarPreco(imovel.preco)
                        : imovel.precoAluguel != null
                          ? `${formatarPreco(imovel.precoAluguel)}/mês`
                          : formatarPreco(null)}
                    </p>
                    <Link
                      href={`/imoveis/${imovel.id}`}
                      className="inline-block mt-4 w-fit rounded-md bg-white text-gray-900 px-6 py-3 text-sm font-medium hover:bg-gray-100"
                    >
                      Ver detalhes
                    </Link>
                  </div>
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>

        {imoveis.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => swiperRef.current?.slidePrev()}
              aria-label="Slide anterior"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
            >
              <IconeChevronEsquerdo className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => swiperRef.current?.slideNext()}
              aria-label="Próximo slide"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
            >
              <IconeChevronDireito className="w-5 h-5" />
            </button>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
              {imoveis.map((imovel, i) => (
                <button
                  key={imovel.id}
                  type="button"
                  onClick={() => swiperRef.current?.slideTo(i)}
                  aria-label={`Ir para o slide ${i + 1}`}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === indice ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
