// Sistema tipográfico do site público — Proposta 2. Fonte mantida (Geist,
// já carregada no layout raiz via next/font/google, compartilhada com o
// painel administrativo): sem fonte nova, zero fetch adicional, zero risco
// de layout shift. O que muda é a ESCALA (tamanho/peso/tracking) aplicada
// de forma consistente em vez de className solta por página — Home,
// Comprar/Alugar, listagem e detalhe do imóvel importam destas mesmas
// constantes em vez de reinventar tamanho por tamanho.
//
// Escopo: só o site público ([orgSlug]/**). O painel administrativo
// (/app, /platform) continua com suas próprias classes, inalteradas.
export const TITULO_HERO =
  "text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white";
export const SUBTITULO_HERO = "text-base sm:text-lg text-white/90";

export const TITULO_SECAO =
  "text-2xl sm:text-3xl font-bold tracking-tight text-gray-900";
export const SUBTITULO_SECAO = "text-sm sm:text-base text-gray-500";

export const TITULO_PAGINA =
  "text-2xl sm:text-3xl font-bold tracking-tight text-gray-900";

export const TITULO_CARD = "font-semibold text-gray-900 leading-snug";
export const TITULO_DETALHE =
  "text-2xl sm:text-3xl font-bold tracking-tight text-gray-900";

export const TITULO_BLOCO = "text-lg font-semibold text-gray-900";
