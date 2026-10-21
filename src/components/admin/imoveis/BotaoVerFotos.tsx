"use client";

import { Images } from "lucide-react";
import { rolarParaSecaoImovel } from "@/lib/scroll-secao";

// Redesign da tela de edição de imóvel — "Ver fotos (N)", sobreposto à
// foto no card de resumo. Rola até a seção "Fotos e mídia" (MESMA seção
// da navegação horizontal, MESMO MediaUploader de sempre) em vez de
// abrir uma segunda experiência de visualização — a autorização pediu
// explicitamente para não duplicar o gerenciamento de mídia.
export function BotaoVerFotos({ total }: { total: number }) {
  return (
    <button
      type="button"
      onClick={() => rolarParaSecaoImovel("secao-fotos")}
      className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/70"
    >
      <Images className="size-3.5" aria-hidden />
      Ver fotos ({total})
    </button>
  );
}
