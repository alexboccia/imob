import { describe, test, expect } from "vitest";
import {
  srgbParaOklch,
  oklchParaSrgb,
  oklchParaHex,
  formatarOklch,
  parseOklchSeguro,
  razaoContraste,
  BRANCO,
  QUASE_PRETO,
} from "@/lib/branding/oklch-color";

describe("sRGB ↔ OKLCH — ida e volta", () => {
  test.each([
    ["branco", 255, 255, 255],
    ["preto", 0, 0, 0],
    ["azul puro", 37, 99, 235],
    ["cinza médio", 128, 128, 128],
  ])("%s sobrevive ao roundtrip sRGB → OKLCH → sRGB (tolerância de 2 por canal)", (_nome, r, g, b) => {
    const oklch = srgbParaOklch(r, g, b);
    const volta = oklchParaSrgb(oklch);
    expect(volta.r).toBeGreaterThanOrEqual(r - 2);
    expect(volta.r).toBeLessThanOrEqual(r + 2);
    expect(volta.g).toBeGreaterThanOrEqual(g - 2);
    expect(volta.g).toBeLessThanOrEqual(g + 2);
    expect(volta.b).toBeGreaterThanOrEqual(b - 2);
    expect(volta.b).toBeLessThanOrEqual(b + 2);
  });

  test("branco tem L≈1 e croma≈0", () => {
    const oklch = srgbParaOklch(255, 255, 255);
    expect(oklch.l).toBeCloseTo(1, 1);
    expect(oklch.c).toBeCloseTo(0, 1);
  });

  test("preto tem L≈0 e croma≈0", () => {
    const oklch = srgbParaOklch(0, 0, 0);
    expect(oklch.l).toBeCloseTo(0, 1);
    expect(oklch.c).toBeCloseTo(0, 1);
  });

  test("cinza puro (r=g=b) tem croma ≈ 0 pra qualquer luminosidade", () => {
    for (const v of [10, 60, 120, 200, 250]) {
      expect(srgbParaOklch(v, v, v).c).toBeLessThan(0.005);
    }
  });
});

describe("oklchParaHex", () => {
  test("branco vira #ffffff", () => {
    expect(oklchParaHex(BRANCO)).toBe("#ffffff");
  });

  test("preto puro vira #000000", () => {
    expect(oklchParaHex({ l: 0, c: 0, h: 0 })).toBe("#000000");
  });
});

describe("formatarOklch — formato idêntico ao catálogo fixo", () => {
  test("gera 'oklch(L C H)' com H inteiro", () => {
    expect(formatarOklch({ l: 0.5523, c: 0.1789, h: 254.6 })).toMatch(
      /^oklch\(0\.552 0\.179 255\)$/
    );
  });

  test("clampa L, C e H fora de faixa antes de formatar", () => {
    const resultado = formatarOklch({ l: 1.5, c: 0.9, h: 400 });
    const parsed = parseOklchSeguro(resultado);
    expect(parsed).not.toBeNull();
    expect(parsed!.l).toBeLessThanOrEqual(1);
    expect(parsed!.c).toBeLessThanOrEqual(0.4);
    expect(parsed!.h).toBeGreaterThanOrEqual(0);
    expect(parsed!.h).toBeLessThan(360);
  });
});

describe("parseOklchSeguro — única porta de entrada pra string→OKLCH (defesa contra CSS injection)", () => {
  test("aceita o formato exato do catálogo", () => {
    expect(parseOklchSeguro("oklch(0.55 0.18 255)")).toEqual({ l: 0.55, c: 0.18, h: 255 });
  });

  test("aceita espaços extras dentro dos parênteses", () => {
    expect(parseOklchSeguro("oklch( 0.5   0.1  200 )")).toEqual({ l: 0.5, c: 0.1, h: 200 });
  });

  test.each([
    "oklch(0.5 0.1 200); background:url(evil.png)",
    "javascript:alert(1)",
    "oklch(0.5 0.1 200) content:''",
    "<script>alert(1)</script>",
    "rgb(255,0,0)",
    "oklch(0.5 0.1)",
    "oklch(0.5 0.1 200 300)",
    "não é oklch nenhum",
    "",
    "oklch(1.5 0.1 200)", // L fora de [0,1]
    "oklch(0.5 0.9 200)", // C fora de [0,0.4]
    "oklch(0.5 0.1 500)", // H fora de [0,360]
    "oklch(NaN 0.1 200)",
  ])("rejeita entrada inválida/perigosa: %s", (entrada) => {
    expect(parseOklchSeguro(entrada)).toBeNull();
  });

  test.each([null, undefined, 42, {}, [], true])("rejeita valores não-string: %j", (entrada) => {
    expect(parseOklchSeguro(entrada)).toBeNull();
  });
});

describe("razaoContraste — WCAG", () => {
  test("branco contra branco é 1 (sem contraste)", () => {
    expect(razaoContraste(BRANCO, BRANCO)).toBeCloseTo(1, 1);
  });

  test("preto puro contra branco puro é ~21 (contraste máximo)", () => {
    const pretoPuro = srgbParaOklch(0, 0, 0);
    const brancoPuro = srgbParaOklch(255, 255, 255);
    expect(razaoContraste(pretoPuro, brancoPuro)).toBeGreaterThan(19);
  });

  test("é simétrica (ordem dos argumentos não importa)", () => {
    const azul = srgbParaOklch(37, 99, 235);
    expect(razaoContraste(azul, BRANCO)).toBeCloseTo(razaoContraste(BRANCO, azul), 5);
  });

  test("quase-preto tem mais contraste contra branco do que um cinza médio", () => {
    const cinzaMedio = srgbParaOklch(128, 128, 128);
    expect(razaoContraste(QUASE_PRETO, BRANCO)).toBeGreaterThan(razaoContraste(cinzaMedio, BRANCO));
  });
});
