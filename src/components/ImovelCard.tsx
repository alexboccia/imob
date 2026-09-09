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
  IconeArea,
  IconeQuartos,
  IconeBanheiro,
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
    areaTotal?: number | null;
    banheiros?: number | null;
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
      // flex-col + h-full: numa grade de quatro colunas os cards
      // precisam terminar na mesma linha mesmo com títulos de tamanhos
      // diferentes. A altura NÃO é fixa (cortaria conteúdo) — o bloco de
      // preço/atributos é empurrado para baixo com mt-auto.
      className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
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
      {/* flex-1 + flex-col: o conteúdo cresce e o rodapé (preço +
          atributos) desce para a base, alinhando os cards da faixa. */}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
          {imovel.tipo} ·{" "}
          {FINALIDADE_LABEL[imovel.finalidade] ?? imovel.finalidade}
        </p>
        {/* Duas linhas no máximo: um título longo não pode esticar o card
            indefinidamente, e cortar em uma linha perdia informação útil
            de imóveis com endereço no título. */}
        <h3 className={`mt-2 line-clamp-2 ${TITULO_CARD}`}>{imovel.titulo}</h3>
        <p className="mt-1 line-clamp-1 text-sm text-gray-500">
          {imovel.bairro}, {imovel.cidade} - {imovel.estado}
        </p>

        {/* mt-auto: o preço encosta na base do card, não logo abaixo do
            título — é o que mantém a faixa alinhada. */}
        <p className="mt-auto pt-4 text-xl font-bold text-gray-900">
          {imovel.preco != null
            ? formatarPreco(imovel.preco)
            : imovel.precoAluguel != null
              ? `${formatarPreco(imovel.precoAluguel)}/mês`
              : formatarPreco(null)}
        </p>

        {/* Atributos só aparecem quando existem — mesma regra da ficha do
            imóvel (caracteristicas-ficha.ts): nulo e zero são ausência, e
            "0 banheiros" seria uma afirmação que o cadastro não fez.
            Se nenhum existir, a linha e o divisor somem junto. */}
        {(!!imovel.areaTotal ||
          !!imovel.quartos ||
          !!imovel.banheiros ||
          !!imovel.vagasGaragem) && (
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-sm text-gray-500">
            {!!imovel.areaTotal && (
              <li className="flex items-center gap-1.5">
                <IconeArea className="size-4 shrink-0" aria-hidden />
                {/* O valor traz a unidade em texto: quem não enxerga o
                    ícone continua sabendo do que se trata. */}
                {imovel.areaTotal} m²
              </li>
            )}
            {!!imovel.quartos && (
              <li className="flex items-center gap-1.5">
                <IconeQuartos className="size-4 shrink-0" aria-hidden />
                {imovel.quartos}
                <span className="sr-only">
                  {imovel.quartos === 1 ? "quarto" : "quartos"}
                </span>
              </li>
            )}
            {!!imovel.banheiros && (
              <li className="flex items-center gap-1.5">
                <IconeBanheiro className="size-4 shrink-0" aria-hidden />
                {imovel.banheiros}
                <span className="sr-only">
                  {imovel.banheiros === 1 ? "banheiro" : "banheiros"}
                </span>
              </li>
            )}
            {!!imovel.vagasGaragem && (
              <li className="flex items-center gap-1.5">
                <IconeVaga className="size-4 shrink-0" aria-hidden />
                {imovel.vagasGaragem}
                <span className="sr-only">
                  {imovel.vagasGaragem === 1 ? "vaga" : "vagas"}
                </span>
              </li>
            )}
          </ul>
        )}
      </div>
    </Link>
  );
}
