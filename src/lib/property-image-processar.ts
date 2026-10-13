import sharp from "sharp";
import {
  IMOVEL_LARGURA_MAXIMA_ARMAZENADA,
  IMOVEL_QUALIDADE_WEBP,
} from "@/lib/property-image-limits";

// =======================================================================
// Processamento de fotos de imóvel — Sharp + WebP (Fase 120-B)
// =======================================================================
// Mesmo padrão já em produção pro Hero institucional
// (hero-image-processar.ts) — reaproveitado aqui, não duplicado por
// acaso: mesma biblioteca, mesma ordem de operações
// (decodificar → corrigir orientação → redimensionar → reencodar),
// mesmo tratamento de erro. A diferença é só os parâmetros (sem altura
// mínima — uma foto de imóvel pequena ainda é uma foto válida, ao
// contrário do Hero, que exige um tamanho mínimo pra não ficar
// esticado em tela cheia) e o fato de nunca rejeitar por dimensão.
//
// SEMPRE RE-CODIFICA (nunca guarda os bytes originais como vieram) —
// corrige orientação EXIF e descarta o resto do EXIF como efeito
// colateral do reencode (nenhuma chamada a `.withMetadata()`): é assim
// que esta mudança resolve, sem lógica adicional, o achado de
// privacidade da Fase 119/120 (coordenadas de GPS preservadas em foto
// de imóvel). Ver docs/tecnico/imagens/fase-120/03-PRIVACIDADE-EXIF-GPS.md.
const LIMITE_PIXELS_ENTRADA = 60_000_000; // mesmo teto do Hero — bloqueia decompression bomb

export type ResultadoProcessamentoImovel =
  | { ok: true; bytes: Buffer; extensao: "webp"; mime: "image/webp" }
  | { ok: false; erro: string; status: number };

export async function processarImagemImovel(
  bytesOriginais: Buffer
): Promise<ResultadoProcessamentoImovel> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytesOriginais, { limitInputPixels: LIMITE_PIXELS_ENTRADA }).metadata();
  } catch {
    return { ok: false, erro: "Não foi possível processar esta imagem.", status: 400 };
  }

  if (!metadata.width || !metadata.height) {
    return { ok: false, erro: "Não foi possível ler as dimensões da imagem.", status: 400 };
  }

  // Mesma lógica do Hero: a largura/altura "final" (depois da correção
  // de orientação) pode estar trocada em relação ao que sharp.metadata()
  // reporta bruto, se a EXIF indicar rotação de 90°/270°.
  const orientacaoRotacionada = metadata.orientation !== undefined && metadata.orientation >= 5;
  const larguraFinal = orientacaoRotacionada ? metadata.height : metadata.width;

  try {
    const bytes = await sharp(bytesOriginais, { limitInputPixels: LIMITE_PIXELS_ENTRADA })
      // Sem argumento: aplica a rotação indicada pela EXIF e descarta a
      // tag depois — a imagem resultante já fica com a orientação certa
      // sem depender de nenhum leitor respeitar EXIF na exibição.
      .rotate()
      .resize({
        width: Math.min(larguraFinal, IMOVEL_LARGURA_MAXIMA_ARMAZENADA),
        // Nunca amplia uma foto menor que o teto — preserva a proporção
        // original, sem crop (não é `fit: cover`), inclusive pra fotos
        // panorâmicas.
        withoutEnlargement: true,
      })
      .webp({ quality: IMOVEL_QUALIDADE_WEBP })
      .toBuffer();

    // Se por algum motivo o resultado comprimido ficar maior que o
    // original (caso raro — arquivo de entrada já muito pequeno/
    // comprimido), usa o original em vez de piorar o armazenamento.
    // Ainda assim perde o EXIF? Não: neste caso o original (com
    // metadado, se houver) seria mantido. Para nunca abrir essa
    // exceção na remoção de EXIF/GPS (prioridade de privacidade,
    // Fase 120-D decisão 1), sempre devolve o resultado reencodado,
    // mesmo quando ligeiramente maior — a diferença de tamanho nesse
    // caso extremo é desprezível frente ao ganho de privacidade.
    return { ok: true, bytes, extensao: "webp", mime: "image/webp" };
  } catch {
    return { ok: false, erro: "Não foi possível processar esta imagem.", status: 400 };
  }
}
