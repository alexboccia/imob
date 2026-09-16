// =======================================================================
// Recursos multimídia do imóvel (Fase 39)
// =======================================================================
// A barra logo abaixo da galeria: Tour 360° · Planta · Vídeo.
//
// REGRA ÚNICA, e é a razão deste módulo existir: um botão só aparece
// quando o recurso EXISTE naquele imóvel. Nada de botão desabilitado,
// href="#", placeholder ou conteúdo demonstrativo — um atalho que não
// leva a lugar nenhum é pior que a ausência dele, porque promete.
//
// OS TRÊS RECURSOS JÁ SÃO MEDIA, cada um com o seu tipo:
//   FLOOR_PLAN    a planta, que a ficha já exibe num carrossel
//   VIDEO         o vídeo, que a ficha já embute
//   VIRTUAL_TOUR  o tour, adicionado nesta fase — um link externo
//
// POR QUE PLANTA E VÍDEO VIRAM ÂNCORA, e não uma segunda exibição: as
// duas seções já existem mais abaixo na mesma página. Duplicar o
// conteúdo criaria duas fontes do mesmo material; o atalho leva o
// visitante até onde ele já está.
//
// O TOUR É EXTERNO porque é assim que ele existe: o produto não hospeda
// experiência 360°, guarda o endereço de uma.
// =======================================================================

/** Âncoras das seções que já existem na ficha. */
export const ANCORA_PLANTAS = "plantas";
export const ANCORA_VIDEOS = "videos";

export type RecursoImovel = {
  chave: "tour" | "planta" | "video";
  rotulo: string;
  /** Âncora interna (#secao) ou URL externa do tour. */
  href: string;
  /** Tour abre fora do site; planta e vídeo são a mesma página. */
  externo: boolean;
};

// -----------------------------------------------------------------------
// Segurança da URL do tour
// -----------------------------------------------------------------------
// O tour vira o `href` de um link, e href aceita `javascript:` — ao
// contrário do vídeo, que vai para um <iframe src> e já é contido pelo
// `frame-src` da CSP. Um endereço que não seja http(s) é DESCARTADO na
// leitura: o botão simplesmente não aparece, em vez de renderizar um link
// perigoso ou um erro para o visitante.
//
// A validação é na LEITURA, e não só na escrita, de propósito: o dado
// pode ter entrado por outro caminho (import, correção manual, fase
// futura), e a página pública é o último lugar onde ele é usado.
export function urlTourSegura(url: string | null | undefined): string | null {
  if (!url) return null;
  const texto = url.trim();
  if (!texto) return null;
  try {
    const parsed = new URL(texto);
    // Lista de PERMITIDOS, nunca de proibidos: o que não for http(s)
    // — javascript:, data:, vbscript:, file: — não passa por omissão.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return texto;
  } catch {
    // URL relativa ou malformada não é um tour externo.
    return null;
  }
}

type MidiaDoImovel = { type: string; url: string };

/**
 * Os recursos disponíveis, na ordem em que a barra os apresenta:
 * Tour 360° · Planta · Vídeo.
 *
 * A ordem é fixa e não depende do cadastro — é a mesma em todo imóvel,
 * para o visitante que compara duas fichas não ter de reprocurar.
 *
 * Lista vazia = a barra não é renderizada.
 */
export function recursosDoImovel(midias: readonly MidiaDoImovel[]): RecursoImovel[] {
  const recursos: RecursoImovel[] = [];

  // TOUR — a primeira URL válida. O model permite mais de uma linha
  // VIRTUAL_TOUR (Media é uma coleção), mas um imóvel tem um tour: a
  // barra leva ao primeiro e não inventa uma lista.
  const tour = midias
    .filter((m) => m.type === "VIRTUAL_TOUR")
    .map((m) => urlTourSegura(m.url))
    .find((url): url is string => url !== null);
  if (tour) {
    recursos.push({ chave: "tour", rotulo: "Tour 360°", href: tour, externo: true });
  }

  if (midias.some((m) => m.type === "FLOOR_PLAN")) {
    recursos.push({
      chave: "planta",
      rotulo: "Planta",
      href: `#${ANCORA_PLANTAS}`,
      externo: false,
    });
  }

  if (midias.some((m) => m.type === "VIDEO")) {
    recursos.push({
      chave: "video",
      rotulo: "Vídeo",
      href: `#${ANCORA_VIDEOS}`,
      externo: false,
    });
  }

  return recursos;
}
