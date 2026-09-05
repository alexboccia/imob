"use client";

import { useEffect } from "react";
import { enviarEventoAnalytics } from "@/lib/analytics-client";
import { TIPOS_EVENTO_ANALYTICS } from "@/lib/analytics-eventos";

// Marca a visualização de um imóvel (Fase 6).
//
// É um componente de CLIENTE que não renderiza nada — e essa é a
// definição operacional de "visualização válida" desta fase. Contar no
// Server Component da página contaria crawler, prefetch do Next, HEAD,
// geração de metadata, health check e link preview como audiência. Aqui,
// o evento só existe se um browser de verdade montou a página e rodou o
// efeito.
//
// useEffect com deps estáveis: dispara uma vez por montagem. Em dev, o
// StrictMode monta duas vezes — coberto pelo guarda em memória de
// enviarEventoAnalytics; em produção, a janela de 30 min do servidor
// cobre recarregamento e voltar/avançar.
export function RastreioVisualizacaoImovel({
  orgSlug,
  imovelId,
}: {
  orgSlug: string;
  imovelId: string;
}) {
  useEffect(() => {
    enviarEventoAnalytics({
      orgSlug,
      propertyId: imovelId,
      type: TIPOS_EVENTO_ANALYTICS.PROPERTY_VIEW,
    });
  }, [orgSlug, imovelId]);

  return null;
}
