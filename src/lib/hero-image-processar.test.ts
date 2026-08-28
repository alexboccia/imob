import { describe, test, expect } from "vitest";
import sharp from "sharp";
import { processarImagemHero } from "@/lib/hero-image-processar";
import {
  HERO_LARGURA_MINIMA,
  HERO_ALTURA_MINIMA,
  HERO_LARGURA_MAXIMA_ARMAZENADA,
} from "@/lib/hero-image-limits";

// Gera uma imagem de teste sólida (uma cor só) — suficiente pra validar
// dimensões/formato/orientação sem depender de nenhum arquivo externo.
async function imagemDeTeste(
  largura: number,
  altura: number,
  opcoes: { formato?: "jpeg" | "png"; orientation?: number } = {}
): Promise<Buffer> {
  const raw = Buffer.alloc(largura * altura * 3, 100);
  let pipeline = sharp(raw, { raw: { width: largura, height: altura, channels: 3 } });
  pipeline = opcoes.formato === "png" ? pipeline.png() : pipeline.jpeg();
  if (opcoes.orientation) {
    pipeline = pipeline.withMetadata({ orientation: opcoes.orientation as never });
  }
  return pipeline.toBuffer();
}

describe("processarImagemHero — dimensões mínimas", () => {
  test("aceita imagem no tamanho mínimo exato", async () => {
    const img = await imagemDeTeste(HERO_LARGURA_MINIMA, HERO_ALTURA_MINIMA);
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(true);
  });

  test("aceita imagem maior que o mínimo", async () => {
    const img = await imagemDeTeste(1920, 900);
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(true);
  });

  test("rejeita imagem menor que a largura mínima", async () => {
    const img = await imagemDeTeste(HERO_LARGURA_MINIMA - 1, HERO_ALTURA_MINIMA + 200);
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.status).toBe(400);
      expect(resultado.erro).toContain(`${HERO_LARGURA_MINIMA}`);
    }
  });

  test("rejeita imagem menor que a altura mínima", async () => {
    const img = await imagemDeTeste(HERO_LARGURA_MINIMA + 200, HERO_ALTURA_MINIMA - 1);
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(false);
  });

  test("rejeita imagem muito pequena (ex: foto de perfil enviada por engano)", async () => {
    const img = await imagemDeTeste(400, 400);
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(false);
  });
});

describe("processarImagemHero — orientação EXIF", () => {
  test("uma foto de celular ARMAZENADA em retrato mas marcada pra girar 90° (fica paisagem de verdade) não é rejeitada por engano", async () => {
    // Bytes brutos 900×2000 (retrato) + orientation=6 (girar 90° CW) —
    // depois de corrigida, a imagem REAL é 2000×900 (paisagem), acima do
    // mínimo. Uma validação ingênua que olhasse só width/height brutos
    // rejeitaria isto por engano (900 < largura mínima).
    const img = await imagemDeTeste(900, 2000, { orientation: 6 });
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(true);
  });

  test("o inverso também: retrato de verdade (depois de corrigido) continua sendo rejeitado", async () => {
    // Bytes brutos 2000×900 (parecem paisagem) + orientation=6 — depois
    // de corrigida, a imagem REAL é 900×2000 (retrato), abaixo do
    // mínimo de largura.
    const img = await imagemDeTeste(2000, 900, { orientation: 6 });
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(false);
  });
});

describe("processarImagemHero — saída sempre WebP, redimensionada, sem EXIF", () => {
  test("produz WebP decodificável com as dimensões esperadas", async () => {
    const img = await imagemDeTeste(1920, 900);
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(900);
    }
  });

  test("nunca armazena mais largo que o teto — redimensiona preservando proporção", async () => {
    const larguraOriginal = HERO_LARGURA_MAXIMA_ARMAZENADA + 1000;
    const alturaOriginal = 1500;
    const img = await imagemDeTeste(larguraOriginal, alturaOriginal);
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.width).toBe(HERO_LARGURA_MAXIMA_ARMAZENADA);
      // Proporção preservada (tolerância de 1px por arredondamento).
      const alturaEsperada = Math.round((HERO_LARGURA_MAXIMA_ARMAZENADA / larguraOriginal) * alturaOriginal);
      expect(meta.height).toBeGreaterThanOrEqual(alturaEsperada - 1);
      expect(meta.height).toBeLessThanOrEqual(alturaEsperada + 1);
    }
  });

  test("imagem já dentro do teto de largura não é redimensionada (sem upscale nem downscale desnecessário)", async () => {
    const img = await imagemDeTeste(1800, 800);
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.width).toBe(1800);
    }
  });

  test("saída não carrega mais a tag de orientação EXIF (já fisicamente rotacionada)", async () => {
    const img = await imagemDeTeste(900, 2000, { orientation: 6 });
    const resultado = await processarImagemHero(img);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const meta = await sharp(resultado.bytes).metadata();
      expect(meta.orientation).toBeUndefined();
      // Dimensões finais já na orientação visual correta (paisagem).
      expect(meta.width).toBeGreaterThan(meta.height!);
    }
  });
});

describe("processarImagemHero — entrada inválida", () => {
  test("rejeita bytes que não são uma imagem, sem lançar exceção", async () => {
    const lixo = Buffer.from("isto não é uma imagem de verdade");
    const resultado = await processarImagemHero(lixo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(400);
  });

  test("rejeita buffer vazio", async () => {
    const resultado = await processarImagemHero(Buffer.alloc(0));
    expect(resultado.ok).toBe(false);
  });
});
