import sharp from "sharp";
import {
  HERO_LARGURA_MINIMA,
  HERO_ALTURA_MINIMA,
  HERO_LARGURA_MAXIMA_ARMAZENADA,
} from "@/lib/hero-image-limits";

// Único lugar que decodifica a imagem do Hero com `sharp` — chamado só
// pela rota de upload (/api/admin/upload) quando pasta === "hero", nunca
// importado de um componente client (sharp é Node-only). Mesma
// dependência já usada por extrair-paleta-logo.ts (geração de paleta) —
// nenhuma dependência nova só por causa desta feature.
//
// Sempre RE-CODIFICA o arquivo (nunca armazena os bytes originais como
// vieram) — corrige orientação EXIF (fotos de celular vêm com a
// orientação real só na tag EXIF, não nos pixels), garante que a imagem
// nunca fica menor que o mínimo recomendado pro Hero, limita a largura
// máxima armazenada (arquivo grande demais só desperdiça espaço — o
// Hero é sempre cover, recortado) e converte pra WebP (melhor
// compressão que JPEG/PNG pra foto, sem perda visual perceptível na
// qualidade escolhida).
const LIMITE_PIXELS_ENTRADA = 60_000_000; // ~60MP — generoso pra foto real, bloqueia decompression bomb
const QUALIDADE_WEBP = 82;

export type ResultadoProcessamentoHero =
  | { ok: true; bytes: Buffer }
  | { ok: false; erro: string; status: number };

export async function processarImagemHero(bytesOriginais: Buffer): Promise<ResultadoProcessamentoHero> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytesOriginais, { limitInputPixels: LIMITE_PIXELS_ENTRADA }).metadata();
  } catch {
    return { ok: false, erro: "Não foi possível processar esta imagem.", status: 400 };
  }

  if (!metadata.width || !metadata.height) {
    return { ok: false, erro: "Não foi possível ler as dimensões da imagem.", status: 400 };
  }

  // sharp.metadata() reporta as dimensões BRUTAS do arquivo — se a EXIF
  // indica rotação de 90°/270° (orientation 5-8), a imagem visualmente
  // final (depois do .rotate() automático abaixo) tem largura/altura
  // trocadas em relação ao que foi lido aqui. Validar contra a
  // orientação final, não a bruta, ou uma foto vertical de celular
  // (comum: 3024×4032 já rotacionada na EXIF) seria rejeitada por
  // engano quando na verdade fica horizontal depois de corrigida.
  const orientacaoRotacionada = metadata.orientation !== undefined && metadata.orientation >= 5;
  const larguraFinal = orientacaoRotacionada ? metadata.height : metadata.width;
  const alturaFinal = orientacaoRotacionada ? metadata.width : metadata.height;

  if (larguraFinal < HERO_LARGURA_MINIMA || alturaFinal < HERO_ALTURA_MINIMA) {
    return {
      ok: false,
      erro: `Imagem muito pequena para o Hero — mínimo ${HERO_LARGURA_MINIMA}×${HERO_ALTURA_MINIMA}px (esta imagem: ${larguraFinal}×${alturaFinal}px).`,
      status: 400,
    };
  }

  try {
    const bytes = await sharp(bytesOriginais, { limitInputPixels: LIMITE_PIXELS_ENTRADA })
      // Sem argumento: aplica a rotação indicada pela EXIF e remove a
      // tag depois (a imagem resultante já fica com a orientação certa
      // sem depender de nenhum leitor respeitar EXIF na exibição).
      .rotate()
      .resize({
        width: Math.min(larguraFinal, HERO_LARGURA_MAXIMA_ARMAZENADA),
        withoutEnlargement: true,
      })
      .webp({ quality: QUALIDADE_WEBP })
      .toBuffer();
    return { ok: true, bytes };
  } catch {
    return { ok: false, erro: "Não foi possível processar esta imagem.", status: 400 };
  }
}
