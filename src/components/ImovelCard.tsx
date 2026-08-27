"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import {
  FINALIDADE_LABEL,
  formatarPreco,
  rotulosAtivos,
} from "@/lib/format";
import {
  IconeChevronEsquerdo,
  IconeChevronDireito,
  IconeQuartos,
  IconeVaga,
} from "@/components/icons";
import { TITULO_CARD } from "@/lib/site-typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  distancia?: string;
};

export function ImovelCard({
  imovel,
  distancia,
  basePath,
}: ImovelCardProps & { basePath: string }) {
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
      href={`${basePath}/imoveis/${imovel.id}`}
      className="block overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
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
              <Badge key={rotulo.chave} className={rotulo.className}>
                {rotulo.label}
              </Badge>
            ))}
          </div>
        )}
        {distancia && (
          <Badge
            variant="secondary"
            className="absolute top-2 right-2 z-10 bg-white/90 text-gray-700"
          >
            {distancia}
          </Badge>
        )}

        {fotos.length > 1 && (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={anterior}
              aria-label="Foto anterior"
              className="absolute left-1 top-1/2 -translate-y-1/2 z-10 size-7 rounded-full bg-white/80 opacity-0 group-hover:opacity-100 hover:bg-white"
            >
              <IconeChevronEsquerdo className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={proxima}
              aria-label="Próxima foto"
              className="absolute right-1 top-1/2 -translate-y-1/2 z-10 size-7 rounded-full bg-white/80 opacity-0 group-hover:opacity-100 hover:bg-white"
            >
              <IconeChevronDireito className="w-4 h-4" />
            </Button>
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
        <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
          {imovel.tipo} ·{" "}
          {FINALIDADE_LABEL[imovel.finalidade] ?? imovel.finalidade}
        </p>
        <h3 className={`mt-1.5 line-clamp-1 ${TITULO_CARD}`}>{imovel.titulo}</h3>
        <p className="mt-0.5 text-sm text-gray-500">
          {imovel.bairro}, {imovel.cidade} - {imovel.estado}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-lg font-bold text-gray-900">
            {imovel.preco != null
              ? formatarPreco(imovel.preco)
              : imovel.precoAluguel != null
                ? `${formatarPreco(imovel.precoAluguel)}/mês`
                : formatarPreco(null)}
          </span>
          {(imovel.quartos || imovel.vagasGaragem) && (
            <span className="flex items-center gap-3 text-sm text-gray-500">
              {imovel.quartos ? (
                <span className="flex items-center gap-1">
                  <IconeQuartos className="size-4" />
                  {imovel.quartos}
                </span>
              ) : null}
              {imovel.vagasGaragem ? (
                <span className="flex items-center gap-1">
                  <IconeVaga className="size-4" />
                  {imovel.vagasGaragem}
                </span>
              ) : null}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
