"use client";

import { enviarEventoAnalytics } from "@/lib/analytics-client";
import { TIPOS_EVENTO_ANALYTICS, type PlacementAnalytics } from "@/lib/analytics-eventos";

// Registra INTENÇÃO de contato via WhatsApp, sem tocar no link.
//
// -----------------------------------------------------------------------
// POR QUE UM WRAPPER, E NÃO UM onClick NO PRÓPRIO <a>
// -----------------------------------------------------------------------
// Os três CTAs de WhatsApp vivem em Server Components e são âncoras
// reais, com href, target, rel e aria-label próprios. Transformá-los em
// client components (ou trocar o <a> por um <button> com router.push)
// arriscaria href, abertura do app, fallback, acessibilidade e
// navegação por teclado — tudo que a Fase 2/2.1 já resolveu.
//
// Este wrapper não mexe em nada disso: ele só escuta o clique que
// BORBULHA da âncora. O <a> continua sendo exatamente o mesmo elemento
// server-rendered. Consequência importante: com o JavaScript quebrado ou
// desligado, o link continua funcionando perfeitamente — o tracking
// simplesmente não acontece.
//
// `display: contents` (className="contents") faz o wrapper desaparecer
// do layout: nenhuma caixa, nenhuma mudança de grid/flex, zero impacto
// visual. Nenhum papel ARIA é introduzido, então a semântica que o
// leitor de tela enxerga continua sendo só a do link.
//
// onClick captura teclado também: Enter numa âncora focada dispara um
// evento de clique que borbulha igual ao do mouse.
export function RastreioCliqueWhatsApp({
  orgSlug,
  imovelId,
  placement,
  children,
}: {
  orgSlug: string;
  imovelId: string;
  placement: PlacementAnalytics;
  children: React.ReactNode;
}) {
  return (
    <span
      className="contents"
      onClick={() =>
        // Síncrono e sem await: o clique segue seu caminho normal no
        // mesmo tick. sendBeacon entrega em background mesmo com a
        // navegação já em curso.
        enviarEventoAnalytics({
          orgSlug,
          propertyId: imovelId,
          type: TIPOS_EVENTO_ANALYTICS.WHATSAPP_CLICK,
          placement,
        })
      }
    >
      {children}
    </span>
  );
}
