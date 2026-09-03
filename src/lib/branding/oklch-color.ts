// Matemática de cor pura (sem I/O, sem Prisma) usada pela geração de
// paleta a partir do logotipo (ver gerar-paleta.ts) — conversão sRGB↔OKLab/
// OKLCH (fórmulas públicas de Björn Ottosson, https://bottosson.github.io/
// posts/oklab/) e contraste WCAG. Mesmo espaço de cor já usado no catálogo
// fixo de temas (ver branding/temas.ts) — usar OKLCH aqui em vez de somar/
// subtrair RGB é o que garante que luminosidade/croma da cor extraída do
// logo se comportem de forma perceptualmente previsível ao gerar
// variações (hover, light, etc.), igual ao catálogo escrito à mão.

export type Oklch = { l: number; c: number; h: number };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function sRgbParaLinear(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearParaSRgb(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// sRGB 0-255 → OKLCH. Usado só pra ANALISAR pixels do logo (nunca pra
// gerar CSS diretamente a partir do resultado sem antes passar pelos
// ajustes/validação em gerar-paleta.ts).
export function srgbParaOklch(r: number, g: number, b: number): Oklch {
  const rl = sRgbParaLinear(r / 255);
  const gl = sRgbParaLinear(g / 255);
  const bl = sRgbParaLinear(b / 255);

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return { l: L, c: C, h: C < 1e-6 ? 0 : H };
}

// REGRA ÚNICA de cor digitável no produto: exatamente "#RRGGBB".
//
// Deliberadamente estrita — não aceita "#RGB" nem hex sem "#". É o
// formato que a EyeDropper API devolve (`sRGBHex`), o que a UI mostra e o
// que os campos de cor da paleta aceitam, então client e servidor
// validam pela MESMA regra em vez de cada camada ter a sua.
const PADRAO_HEX = /^#[0-9a-f]{6}$/i;

export function hexValido(valor: unknown): valor is string {
  return typeof valor === "string" && PADRAO_HEX.test(valor.trim());
}

// "#RRGGBB" → OKLCH, o formato usado em todo o branding. Devolve null pra
// qualquer coisa fora do padrão — quem chama trata como "ignora este
// valor", nunca grava lixo.
export function hexParaOklch(valor: unknown): Oklch | null {
  if (!hexValido(valor)) return null;
  const digitos = valor.trim().slice(1);
  const r = parseInt(digitos.slice(0, 2), 16);
  const g = parseInt(digitos.slice(2, 4), 16);
  const b = parseInt(digitos.slice(4, 6), 16);
  return srgbParaOklch(r, g, b);
}

// OKLCH → sRGB 0-255 (clampado). Usado pra checar contraste (via
// luminância relativa WCAG) e pra exibir o hex de prévia na UI — nunca
// pra reconstruir o valor persistido, que continua sendo a string
// oklch(...) original gerada em gerar-paleta.ts.
export function oklchParaSrgb({ l, c, h }: Oklch): { r: number; g: number; b: number } {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const bb = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bb;

  const ll = l_ * l_ * l_;
  const mm = m_ * m_ * m_;
  const ss = s_ * s_ * s_;

  const rl = 4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss;
  const gl = -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss;
  const bl = -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss;

  return {
    r: Math.round(clamp(linearParaSRgb(rl), 0, 1) * 255),
    g: Math.round(clamp(linearParaSRgb(gl), 0, 1) * 255),
    b: Math.round(clamp(linearParaSRgb(bl), 0, 1) * 255),
  };
}

export function oklchParaHex(cor: Oklch): string {
  const { r, g, b } = oklchParaSrgb(cor);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Luminância relativa WCAG (0-1) a partir de sRGB linear — base do cálculo
// de contraste abaixo. Fórmula padrão (WCAG 2.x), independente do OKLCH.
function luminanciaRelativa({ r, g, b }: { r: number; g: number; b: number }): number {
  const R = sRgbParaLinear(r / 255);
  const G = sRgbParaLinear(g / 255);
  const B = sRgbParaLinear(b / 255);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

// Razão de contraste WCAG entre duas cores OKLCH (1 a 21). >=4.5 é o
// mínimo AA pra texto normal — usado tanto pra escolher onPrimary
// (branco vs quase-preto sobre a cor gerada) quanto pra validar `link`
// contra o --background estático (branco, ver globals.css) antes de
// aceitar a cor extraída do logo como está.
export function razaoContraste(corA: Oklch, corB: Oklch): number {
  const lA = luminanciaRelativa(oklchParaSrgb(corA));
  const lB = luminanciaRelativa(oklchParaSrgb(corB));
  const mais = Math.max(lA, lB);
  const menos = Math.min(lA, lB);
  return (mais + 0.05) / (menos + 0.05);
}

export const BRANCO: Oklch = { l: 1, c: 0, h: 0 };
export const QUASE_PRETO: Oklch = { l: 0.2, c: 0, h: 0 };

// Formato textual "oklch(<L> <C> <H>)", o mesmo do catálogo fixo (ver
// branding/temas.ts). Nunca serializar cor de outra forma: é este formato
// que parseOklchSeguro (abaixo) aceita de volta, fechando o ciclo
// geração→persistência→leitura sem nunca aceitar CSS livre.
export function formatarOklch({ l, c, h }: Oklch): string {
  const L = clamp(l, 0, 1);
  const C = clamp(c, 0, 0.4);
  const H = ((h % 360) + 360) % 360;
  // Precisão suficiente pra ida-e-volta hex -> oklch -> hex devolver
  // EXATAMENTE o mesmo hex de 8 bits. Com as 3 casas (e hue inteiro) de
  // antes, ~52% das cores voltavam com 1 unidade de diferença em algum
  // canal — invisível a olho nu, mas visível no campo de cor da paleta,
  // onde o usuário digita #17345B e receberia #18345b de volta ao
  // aplicar. Valores curtos continuam curtos ("0.55" segue "0.55"):
  // toString() não inventa zeros à direita.
  return `oklch(${arredondar(L, 5)} ${arredondar(C, 5)} ${arredondar(H, 2)})`;
}

function arredondar(v: number, casas: number): string {
  const fator = 10 ** casas;
  return (Math.round(v * fator) / fator).toString();
}

// Único ponto de entrada pra transformar uma STRING (vinda do banco, nunca
// do client diretamente) numa cor OKLCH estruturada. Rejeita qualquer
// coisa fora do formato "oklch(L C H)" com números em faixas plausíveis —
// é isso que impede CSS arbitrário de voltar a ser injetado no site
// mesmo que a coluna customTheme seja adulterada por fora da aplicação.
const PADRAO_OKLCH = /^oklch\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/;

export function parseOklchSeguro(valor: unknown): Oklch | null {
  if (typeof valor !== "string") return null;
  const m = PADRAO_OKLCH.exec(valor.trim());
  if (!m) return null;
  const l = Number(m[1]);
  const c = Number(m[2]);
  const h = Number(m[3]);
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) return null;
  if (l < 0 || l > 1) return null;
  if (c < 0 || c > 0.4) return null;
  if (h < 0 || h > 360) return null;
  return { l, c, h };
}
