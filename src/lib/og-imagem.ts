// Conversão da foto de capa pra og:image (MKT-005) — ÚNICO arquivo desta
// feature que faz I/O e usa `sharp`. Node-only, nunca importado de um
// Client Component nem de generateMetadata (que só monta a URL via
// urlOgImagemDoImovel em compartilhar-imovel.ts — a conversão em si só
// acontece aqui, dentro da rota, quando um crawler de fato pede a
// imagem). Mesmo padrão de fetch defensivo já usado em
// anuncio-imovel-render.ts/extrair-paleta-logo.ts: timeout, teto de
// bytes, nunca lança.
import sharp from "sharp";

const TAMANHO_MAX_BYTES = 10 * 1024 * 1024; // mesmo teto de LIMITE_TAMANHO_BYTES.imagem
const TIMEOUT_MS = 8_000;
const LIMITE_PIXELS_ENTRADA = 60_000_000; // mesmo teto de hero-image-processar.ts
const QUALIDADE_JPEG = 85;
// Og:image não precisa da resolução de armazenamento — 1200px de largura
// já é mais que o suficiente pro card de preview de qualquer rede social,
// e mantém o JPEG pequeno o bastante pra não pesar no crawler.
const LARGURA_MAXIMA = 1200;

async function buscarBytesSeguro(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let resposta: Response;
    try {
      resposta = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resposta.ok) return null;

    const contentLength = resposta.headers.get("content-length");
    if (contentLength && Number(contentLength) > TAMANHO_MAX_BYTES) return null;

    const arrayBuffer = await resposta.arrayBuffer();
    if (arrayBuffer.byteLength > TAMANHO_MAX_BYTES) return null;
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export type ResultadoOgImagem = { ok: true; bytes: Buffer } | { ok: false; erro: string };

// Sempre JPEG na saída, seja a foto de capa jpg/png/webp na origem — o
// upload aceita os três (upload-validation.ts) e nenhum formato de
// origem é tratado como especial aqui: JPEG é o único denominador comum
// que os principais crawlers de preview social (WhatsApp incluído)
// renderizam de forma confiável.
export async function transcodificarParaOgImagem(url: string): Promise<ResultadoOgImagem> {
  const bytes = await buscarBytesSeguro(url);
  if (!bytes) return { ok: false, erro: "Não foi possível carregar a foto." };

  try {
    const jpeg = await sharp(bytes, { limitInputPixels: LIMITE_PIXELS_ENTRADA })
      .rotate()
      .resize({ width: LARGURA_MAXIMA, withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // PNG com transparência não pode virar JPEG com canal alfa
      .jpeg({ quality: QUALIDADE_JPEG })
      .toBuffer();
    return { ok: true, bytes: jpeg };
  } catch {
    return { ok: false, erro: "Não foi possível processar a foto." };
  }
}
