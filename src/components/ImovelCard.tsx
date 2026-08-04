"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import {
  FINALIDADE_LABEL,
  TIPO_IMOVEL_LABEL,
  formatarPreco,
  rotulosAtivos,
} from "@/lib/format";
import { IconeChevronEsquerdo, IconeChevronDireito } from "@/components/icons";

type ImovelCardProps = {
  imovel: {
    id: string;
    titulo: string;
    tipo: string;
    finalidade: string;
    bairro: string;
    cidade: string;
    estado: string;
    preco: unknown;
    precoAluguel?: unknown;
    quartos: number | null;
    vagasGaragem: number | null;
    lancamento: boolean;
    destaque: boolean;
    oportunidade: boolean;
    midias: { url: string }[];
  };
};

export function ImovelCard({ imovel }: ImovelCardProps) {
  const [indice, setIndice] = useState(0);
  const fotos = imovel.midias;
  const swiperRef = useRef<SwiperType | null>(null);

  function anterior(event: React.MouseEvent) {
    event.preventDefault();
    swiperRef.current?.slidePrev();
  }

  function proxima(event: React.MouseEvent) {
    event.preventDefault();
    swiperRef.current?.slideNext();
  }

  return (
    <Link
      href={`/imoveis/${imovel.id}`}
      className="block rounded-lg border overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-[4/3] bg-gray-100 group">
        {fotos.length > 0 ? (
          <Swiper
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
            }}
            onSlideChange={(swiper) => setIndice(swiper.activeIndex)}
            className="w-full h-full"
          >
            {fotos.map((foto) => (
              <SwiperSlide key={foto.url}>
                <div className="relative w-full h-full">
                  <Image
                    src={foto.url}
                    alt={imovel.titulo}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Sem foto
          </div>
        )}
        {rotulosAtivos(imovel).length > 0 && (
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 items-start">
            {rotulosAtivos(imovel).map((rotulo) => (
              <span
                key={rotulo.chave}
                className={`text-xs px-2 py-1 rounded-full ${rotulo.className}`}
              >
                {rotulo.label}
              </span>
            ))}
          </div>
        )}

        {fotos.length > 1 && (
          <>
            <button
              type="button"
              onClick={anterior}
              aria-label="Foto anterior"
              className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/80 text-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
            >
              <IconeChevronEsquerdo className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={proxima}
              aria-label="Próxima foto"
              className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/80 text-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
            >
              <IconeChevronDireito className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1">
              {fotos.map((foto, i) => (
                <span
                  key={foto.url}
                  className={`w-1.5 h-1.5 rounded-full ${
                    i === indice ? "bg-white" : "bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs text-gray-500">
          {TIPO_IMOVEL_LABEL[imovel.tipo] ?? imovel.tipo} ·{" "}
          {FINALIDADE_LABEL[imovel.finalidade] ?? imovel.finalidade}
        </p>
        <h3 className="mt-1 font-medium">{imovel.titulo}</h3>
        <p className="text-sm text-gray-500">
          {imovel.bairro}, {imovel.cidade} - {imovel.estado}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-semibold">
            {imovel.preco != null
              ? formatarPreco(imovel.preco)
              : imovel.precoAluguel != null
                ? `${formatarPreco(imovel.precoAluguel)}/mês`
                : formatarPreco(null)}
          </span>
          <span className="text-sm text-gray-500">
            {imovel.quartos ? `${imovel.quartos} qts` : ""}
            {imovel.vagasGaragem ? ` · ${imovel.vagasGaragem} vagas` : ""}
          </span>
        </div>
      </div>
    </Link>
  );
}
