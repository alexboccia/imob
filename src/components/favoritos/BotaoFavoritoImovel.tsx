"use client";

import { IconeCoracao } from "@/components/icons";
import { rotulosBotaoFavorito } from "@/lib/favoritos";
import { alternarFavorito, useEhFavorito } from "@/lib/favoritos-store";
import { cn } from "@/lib/utils";

// Coração sobre a foto do card (Fases 49/50).
//
// O estado vem do store do navegador — o mesmo do Salvar da ficha e do
// contador do header —, então dois controles do mesmo imóvel na tela
// nunca divergem. Favoritar é local: nenhuma requisição.
//
// `aoClicar` substitui a ação padrão (alternar). A página de favoritos
// usa isso para remover com gestão de foco e aviso próprios.
//
// Antes da hidratação o servidor não conhece o navegador e renderiza "não
// salvo"; o estado real aparece assim que a página hidrata.
export function BotaoFavoritoImovel({
  orgSlug,
  imovelId,
  titulo,
  aoClicar,
}: {
  orgSlug: string;
  imovelId: string;
  titulo: string;
  aoClicar?: () => void;
}) {
  const salvo = useEhFavorito(orgSlug, imovelId);
  const rotulos = rotulosBotaoFavorito(titulo, salvo);

  return (
    <button
      type="button"
      data-favorito-imovel={imovelId}
      aria-pressed={salvo}
      aria-label={rotulos.nome}
      title={rotulos.dica}
      onClick={aoClicar ?? (() => alternarFavorito(orgSlug, imovelId))}
      className={cn(
        "flex size-10 items-center justify-center rounded-full border border-black/5 bg-white/95 shadow-sm outline-none transition-colors hover:bg-white focus-visible:ring-3 focus-visible:ring-ring/50",
        salvo ? "text-primary" : "text-gray-700 hover:text-primary"
      )}
    >
      <IconeCoracao preenchido={salvo} className="size-5" />
    </button>
  );
}
