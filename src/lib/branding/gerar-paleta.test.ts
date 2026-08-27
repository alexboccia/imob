import { describe, test, expect } from "vitest";
import { extrairCorMarca, gerarTokensDeCorMarca } from "@/lib/branding/gerar-paleta";
import { parseOklchSeguro, razaoContraste, BRANCO, QUASE_PRETO } from "@/lib/branding/oklch-color";
import { CATALOGO_TEMAS } from "@/lib/branding/temas";

// Monta um buffer RGBA repetindo cada cor N vezes — pixel(255,0,0,255)
// repetido 10x é o mesmo que um bloco sólido de 10 pixels vermelhos, que
// é tudo que extrairCorMarca precisa (não lê largura/altura, só a
// sequência de pixels).
function pixels(...blocos: { cor: [number, number, number, number]; n: number }[]): Buffer {
  const bytes: number[] = [];
  for (const { cor, n } of blocos) {
    for (let i = 0; i < n; i++) bytes.push(...cor);
  }
  return Buffer.from(bytes);
}

describe("extrairCorMarca — fallbacks explícitos (seção 12 do pedido)", () => {
  test("buffer totalmente transparente → sem_pixels_opacos", () => {
    const buf = pixels({ cor: [37, 99, 235, 0], n: 50 });
    const resultado = extrairCorMarca(buf);
    expect(resultado).toEqual({ ok: false, motivo: "sem_pixels_opacos" });
  });

  test("logotipo só preto → sem_cor_dominante (nunca escolhe preto como cor de marca)", () => {
    const buf = pixels({ cor: [0, 0, 0, 255], n: 200 });
    expect(extrairCorMarca(buf)).toEqual({ ok: false, motivo: "sem_cor_dominante" });
  });

  test("logotipo só branco → sem_cor_dominante", () => {
    const buf = pixels({ cor: [255, 255, 255, 255], n: 200 });
    expect(extrairCorMarca(buf)).toEqual({ ok: false, motivo: "sem_cor_dominante" });
  });

  test("logotipo monocromático (só tons de cinza) → sem_cor_dominante", () => {
    const buf = pixels(
      { cor: [30, 30, 30, 255], n: 80 },
      { cor: [120, 120, 120, 255], n: 80 },
      { cor: [220, 220, 220, 255], n: 80 }
    );
    expect(extrairCorMarca(buf)).toEqual({ ok: false, motivo: "sem_cor_dominante" });
  });

  test("branco + preto + UMA cor cromática: nunca escolhe o neutro havendo cor real", () => {
    const buf = pixels(
      { cor: [255, 255, 255, 255], n: 500 }, // fundo branco, maioria absoluta
      { cor: [10, 10, 10, 255], n: 50 }, // texto preto
      { cor: [37, 99, 235, 255], n: 60 } // logo azul
    );
    const resultado = extrairCorMarca(buf);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      // Azul puro (37,99,235) tem hue ~260° em OKLCH.
      expect(resultado.corMarca.h).toBeGreaterThan(240);
      expect(resultado.corMarca.h).toBeLessThan(280);
    }
  });
});

describe("extrairCorMarca — respeita transparência", () => {
  test("pixels transparentes nunca contam, mesmo sendo a maioria", () => {
    const buf = pixels(
      { cor: [255, 0, 0, 0], n: 900 }, // "vermelho" mas 100% transparente — deve ser ignorado
      { cor: [37, 99, 235, 255], n: 40 } // azul opaco, minoria em contagem bruta
    );
    const resultado = extrairCorMarca(buf);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.corMarca.h).toBeGreaterThan(240);
      expect(resultado.corMarca.h).toBeLessThan(280);
    }
  });

  test("pixels quase-transparentes (alpha baixo) também são ignorados", () => {
    const buf = pixels(
      { cor: [255, 0, 0, 10], n: 900 },
      { cor: [37, 99, 235, 255], n: 40 }
    );
    const resultado = extrairCorMarca(buf);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.corMarca.h).toBeGreaterThan(240);
  });
});

describe("extrairCorMarca — vívido vs. dominante (soma de croma, não só contagem)", () => {
  test("logo pequeno mas vívido vence um fundo grande levemente colorido", () => {
    // (190,205,235) ~ croma 0.045 (levemente acima do limiar de neutro);
    // crimson (220,20,60) ~ croma 0.22 — bem mais vívido. Com poucos
    // pixels pálidos (40) o vívido vence mesmo em menor número absoluto.
    const buf = pixels(
      { cor: [190, 205, 235, 255], n: 40 },
      { cor: [220, 20, 60, 255], n: 15 }
    );
    const resultado = extrairCorMarca(buf);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      // Crimson tem hue ~20°.
      expect(resultado.corMarca.h).toBeGreaterThan(0);
      expect(resultado.corMarca.h).toBeLessThan(40);
    }
  });

  test("fundo pálido MUITO dominante (maioria esmagadora) ainda pode vencer", () => {
    const buf = pixels(
      { cor: [190, 205, 235, 255], n: 300 },
      { cor: [220, 20, 60, 255], n: 15 }
    );
    const resultado = extrairCorMarca(buf);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      // Azulado, não vermelho — com essa proporção o fundo pálido domina.
      expect(resultado.corMarca.h).toBeGreaterThan(240);
      expect(resultado.corMarca.h).toBeLessThan(290);
    }
  });
});

describe("extrairCorMarca — determinismo", () => {
  test("mesmo buffer produz exatamente o mesmo resultado", () => {
    const buf = pixels(
      { cor: [255, 255, 255, 255], n: 300 },
      { cor: [37, 99, 235, 255], n: 60 },
      { cor: [10, 10, 10, 255], n: 20 }
    );
    const r1 = extrairCorMarca(buf);
    const r2 = extrairCorMarca(Buffer.from(buf));
    expect(r1).toEqual(r2);
  });
});

describe("gerarTokensDeCorMarca — shape e consistência", () => {
  test("link é sempre igual a primary (mesmo padrão dos 6 temas fixos)", () => {
    const tokens = gerarTokensDeCorMarca({ l: 0.55, c: 0.18, h: 255 });
    expect(tokens.link).toBe(tokens.primary);
  });

  test("primaryHover tem a mesma matiz/croma de primary, com L menor", () => {
    const tokens = gerarTokensDeCorMarca({ l: 0.55, c: 0.18, h: 255 });
    const primary = parseOklchSeguro(tokens.primary)!;
    const hover = parseOklchSeguro(tokens.primaryHover)!;
    expect(hover.h).toBe(primary.h);
    expect(hover.c).toBe(primary.c);
    expect(hover.l).toBeLessThan(primary.l);
  });

  test("primaryLight/secondary/border são claros e pouco cromáticos", () => {
    const tokens = gerarTokensDeCorMarca({ l: 0.55, c: 0.18, h: 255 });
    for (const chave of ["primaryLight", "secondary", "border"] as const) {
      const cor = parseOklchSeguro(tokens[chave])!;
      expect(cor.l).toBeGreaterThan(0.85);
      expect(cor.c).toBeLessThan(0.05);
    }
  });

  test("onPrimary é sempre branco ou quase-preto (nunca outra cor)", () => {
    for (const h of [0, 60, 120, 180, 240, 300]) {
      const tokens = gerarTokensDeCorMarca({ l: 0.5, c: 0.15, h });
      expect(["oklch(1 0 0)", "oklch(0.2 0 0)"]).toContain(tokens.onPrimary);
    }
  });

  test("onPrimary escolhe sempre a opção de MAIOR contraste real contra primary", () => {
    for (const [l, c, h] of [
      [0.15, 0.2, 20],
      [0.3, 0.15, 140],
      [0.5, 0.15, 255],
      [0.7, 0.1, 85],
      [0.85, 0.06, 60],
    ] as const) {
      const tokens = gerarTokensDeCorMarca({ l, c, h });
      const primary = parseOklchSeguro(tokens.primary)!;
      const onPrimary = parseOklchSeguro(tokens.onPrimary)!;
      const contrasteEscolhido = razaoContraste(primary, onPrimary);
      const contrasteBranco = razaoContraste(primary, BRANCO);
      const contrastePreto = razaoContraste(primary, QUASE_PRETO);
      expect(contrasteEscolhido).toBeCloseTo(Math.max(contrasteBranco, contrastePreto), 5);
    }
  });

  test("todos os 7 tokens são strings oklch(...) válidas (nunca CSS livre)", () => {
    const tokens = gerarTokensDeCorMarca({ l: 0.6, c: 0.12, h: 190 });
    for (const valor of Object.values(tokens)) {
      expect(parseOklchSeguro(valor)).not.toBeNull();
    }
  });
});

describe("gerarTokensDeCorMarca — contraste mínimo do link contra o fundo (branco)", () => {
  test("cor de marca muito clara é escurecida até atingir o piso de contraste", () => {
    const tokens = gerarTokensDeCorMarca({ l: 0.97, c: 0.15, h: 90 });
    const primary = parseOklchSeguro(tokens.primary)!;
    expect(primary.l).toBeLessThan(0.97);
    expect(razaoContraste(primary, BRANCO)).toBeGreaterThanOrEqual(2.9);
  });

  test("cor de marca que já tem contraste suficiente não é alterada além do necessário", () => {
    // classic-blue real do catálogo já tem contraste >3 contra branco.
    const tokens = gerarTokensDeCorMarca({ l: 0.55, c: 0.18, h: 255 });
    expect(tokens.primary).toBe("oklch(0.55 0.18 255)");
  });

  test("nunca reduz L abaixo do piso de segurança (0.15), mesmo em casos extremos", () => {
    const tokens = gerarTokensDeCorMarca({ l: 0.99, c: 0.01, h: 90 });
    const primary = parseOklchSeguro(tokens.primary)!;
    expect(primary.l).toBeGreaterThanOrEqual(0.15);
  });
});

describe("gerarTokensDeCorMarca — reproduz decisões reais já em produção (âncora de regressão)", () => {
  test("cor idêntica ao Dourado do catálogo fixo gera a MESMA paleta (primary e onPrimary)", () => {
    const dourado = CATALOGO_TEMAS.gold;
    const corMarca = parseOklchSeguro(dourado.primary)!;
    const gerado = gerarTokensDeCorMarca(corMarca);
    expect(gerado.primary).toBe(dourado.primary);
    expect(gerado.onPrimary).toBe(dourado.onPrimary);
  });

  test("cor idêntica ao Grafite (escura, quase neutra) também gera onPrimary branco, como o catálogo", () => {
    const grafite = CATALOGO_TEMAS.graphite;
    const corMarca = parseOklchSeguro(grafite.primary)!;
    const gerado = gerarTokensDeCorMarca(corMarca);
    expect(gerado.onPrimary).toBe(grafite.onPrimary);
  });
});

describe("gerarTokensDeCorMarca — clamps defensivos (entrada fora de faixa nunca quebra)", () => {
  test("L/C/H fora dos limites físicos não lança e produz tokens válidos", () => {
    expect(() => gerarTokensDeCorMarca({ l: -5, c: 99, h: 999 })).not.toThrow();
    const tokens = gerarTokensDeCorMarca({ l: -5, c: 99, h: 999 });
    for (const valor of Object.values(tokens)) {
      expect(parseOklchSeguro(valor)).not.toBeNull();
    }
  });
});
