import { describe, test, expect } from "vitest";
import sharp from "sharp";
import { processarImagemImovel } from "@/lib/property-image-processar";
import { IMOVEL_LARGURA_MAXIMA_ARMAZENADA } from "@/lib/property-image-limits";

// Mesma técnica já usada em hero-image-processar.test.ts — imagem sólida
// (uma cor só), suficiente pra validar dimensões/formato/orientação/
// metadados sem depender de nenhum arquivo externo.
async function imagemDeTeste(
  largura: number,
  altura: number,
  opcoes: { formato?: "jpeg" | "png" | "webp"; orientation?: number; comExif?: boolean } = {}
): Promise<Buffer> {
  const raw = Buffer.alloc(largura * altura * 3, 100);
  let pipeline = sharp(raw, { raw: { width: largura, height: altura, channels: 3 } });
  pipeline =
    opcoes.formato === "png" ? pipeline.png() : opcoes.formato === "webp" ? pipeline.webp() : pipeline.jpeg();
  if (opcoes.orientation || opcoes.comExif) {
    pipeline = pipeline.withMetadata({
      ...(opcoes.orientation ? { orientation: opcoes.orientation as never } : {}),
      // IFD0 embutido via withMetadata — sharp só expõe escrita de
      // IFD0/IFD1 na sua API simples (não há um bloco "GPS" dedicado
      // para escrever), mas é suficiente pra provar que TODO o bloco
      // EXIF desaparece no reencode, não só a tag de orientação — se o
      // IFD0 inteiro é descartado, a sub-IFD de GPS (referenciada a
      // partir dele num EXIF real de câmera/celular) vai junto.
      ...(opcoes.comExif ? { exif: { IFD0: { Copyright: "teste", Make: "teste" } } } : {}),
    });
  }
  return pipeline.toBuffer();
}

describe("processarImagemImovel — formatos de entrada", () => {
  test("aceita JPEG", async () => {
    const img = await imagemDeTeste(1200, 800, { formato: "jpeg" });
    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
  });

  test("aceita PNG", async () => {
    const img = await imagemDeTeste(1200, 800, { formato: "png" });
    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
  });

  test("aceita WebP (reencoda normalizando mesmo entrada já WebP)", async () => {
    const img = await imagemDeTeste(1200, 800, { formato: "webp" });
    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.format).toBe("webp");
    }
  });
});

describe("processarImagemImovel — saída sempre WebP, redimensionada", () => {
  test("produz WebP decodificável, sem alterar dimensões abaixo do teto", async () => {
    const img = await imagemDeTeste(1200, 800);
    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.extensao).toBe("webp");
      expect(resultado.mime).toBe("image/webp");
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(800);
    }
  });

  test("nunca armazena mais largo que o teto — redimensiona preservando proporção", async () => {
    const larguraOriginal = IMOVEL_LARGURA_MAXIMA_ARMAZENADA + 1000;
    const alturaOriginal = 2000;
    const img = await imagemDeTeste(larguraOriginal, alturaOriginal);
    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.width).toBe(IMOVEL_LARGURA_MAXIMA_ARMAZENADA);
      const alturaEsperada = Math.round(
        (IMOVEL_LARGURA_MAXIMA_ARMAZENADA / larguraOriginal) * alturaOriginal
      );
      expect(meta.height).toBeGreaterThanOrEqual(alturaEsperada - 1);
      expect(meta.height).toBeLessThanOrEqual(alturaEsperada + 1);
    }
  });

  test("foto pequena (abaixo do teto) não é ampliada", async () => {
    const img = await imagemDeTeste(600, 400);
    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.width).toBe(600);
    }
  });

  test("foto panorâmica preserva proporção, sem recorte (sem fit: cover)", async () => {
    const img = await imagemDeTeste(IMOVEL_LARGURA_MAXIMA_ARMAZENADA + 2000, 600);
    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.width).toBe(IMOVEL_LARGURA_MAXIMA_ARMAZENADA);
      // Proporção larga preservada (muito mais larga que alta).
      expect(meta.width!).toBeGreaterThan(meta.height! * 2);
    }
  });
});

describe("processarImagemImovel — correção de orientação EXIF", () => {
  test("foto de celular em retrato marcada pra girar 90° sai fisicamente corrigida", async () => {
    const img = await imagemDeTeste(900, 2000, { orientation: 6 });
    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      // Depois de corrigida, a imagem é paisagem (largura > altura).
      expect(meta.width!).toBeGreaterThan(meta.height!);
    }
  });
});

describe("processarImagemImovel — privacidade: remoção de metadados (EXIF/GPS)", () => {
  test("saída não carrega mais a tag de orientação EXIF", async () => {
    const img = await imagemDeTeste(900, 2000, { orientation: 6 });
    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.orientation).toBeUndefined();
    }
  });

  test("saída não carrega nenhum bloco EXIF, mesmo quando o original tinha GPS/Copyright", async () => {
    const img = await imagemDeTeste(1200, 800, { comExif: true });
    // Confirma que o arquivo de ENTRADA de fato carregava o bloco EXIF
    // (prova que o teste é válido — não está testando algo que nunca
    // existiu).
    const metaEntrada = await sharp(img).metadata();
    expect(metaEntrada.exif).toBeDefined();

    const resultado = await processarImagemImovel(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const metaSaida = await sharp(resultado.bytes).metadata();
      expect(metaSaida.exif).toBeUndefined();
    }
  });
});

describe("processarImagemImovel — entrada inválida", () => {
  test("rejeita bytes que não são uma imagem, sem lançar exceção", async () => {
    const lixo = Buffer.from("isto não é uma imagem de verdade");
    const resultado = await processarImagemImovel(lixo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(400);
  });

  test("rejeita buffer vazio", async () => {
    const resultado = await processarImagemImovel(Buffer.alloc(0));
    expect(resultado.ok).toBe(false);
  });
});
