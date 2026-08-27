import {
  type Oklch,
  srgbParaOklch,
  formatarOklch,
  razaoContraste,
  BRANCO,
  QUASE_PRETO,
} from "@/lib/branding/oklch-color";
import type { TokensTema } from "@/lib/branding/temas";

// Pixels com alpha abaixo disto são tratados como transparentes — nunca
// entram na análise de cor (ver `[FUNC] extrai a cor da marca...` abaixo).
const LIMIAR_ALPHA = 32;

// Croma OKLCH abaixo disto é tratado como "neutro" (cinza/preto/branco,
// incluindo antialiasing sutil) — nunca vira a "cor da marca" enquanto
// houver pixels mais cromáticos disponíveis. 0.04 é bem abaixo do croma
// do tema mais neutro do catálogo fixo (Grafite, c=0.01) e bem acima de
// ruído de compressão/antialiasing em torno de cinzas puros.
const LIMIAR_CROMA_NEUTRO = 0.04;

// Nº de faixas de matiz (360° / 24 = 15° por faixa) — granularidade
// suficiente pra distinguir tons de marca (ex: azul vs ciano) sem ser tão
// fina a ponto de duas variações de antialiasing do MESMO tom caírem em
// faixas diferentes e diluir o voto.
const NUM_FAIXAS_MATIZ = 24;

export type MotivoFalhaPaleta = "sem_pixels_opacos" | "sem_cor_dominante";

export type ResultadoPaleta =
  | { ok: true; tokens: TokensTema; corMarca: Oklch }
  | { ok: false; motivo: MotivoFalhaPaleta };

type AcumuladorFaixa = {
  contagem: number;
  somaL: number;
  somaC: number;
  somaSeno: number;
  somaCosseno: number;
};

// Extrai a cor de marca dominante de um buffer de pixels RGBA (4 canais,
// já decodificado e idealmente reduzido a uma miniatura — ver
// extrair-paleta-logo.ts, que faz o resize antes de chamar isto). Pura:
// sem I/O, sem Prisma, sem fetch — só matemática sobre os bytes recebidos,
// o que permite testar exaustivamente sem imagem real nenhuma.
//
// Estratégia: ignora pixels transparentes (respeita alpha), classifica
// cada pixel opaco em OKLCH, descarta os quase-neutros (cinza/preto/
// branco) e agrupa o resto em 24 faixas de matiz. A faixa vencedora é a
// de MAIOR SOMA DE CROMA (não só contagem) — isso favorece um logotipo
// pequeno mas vívido sobre um fundo grande levemente colorido, que é o
// caso que mais gera falso positivo em abordagens ingênuas de "cor mais
// frequente".
export function extrairCorMarca(pixelsRgba: Uint8Array | Buffer): ResultadoPaleta {
  const faixas = new Map<number, AcumuladorFaixa>();
  let totalOpacos = 0;

  for (let i = 0; i + 3 < pixelsRgba.length; i += 4) {
    const a = pixelsRgba[i + 3];
    if (a < LIMIAR_ALPHA) continue;
    totalOpacos++;

    const r = pixelsRgba[i];
    const g = pixelsRgba[i + 1];
    const b = pixelsRgba[i + 2];
    const cor = srgbParaOklch(r, g, b);
    if (cor.c < LIMIAR_CROMA_NEUTRO) continue;

    const faixaIdx = Math.floor(cor.h / (360 / NUM_FAIXAS_MATIZ)) % NUM_FAIXAS_MATIZ;
    const hRad = (cor.h * Math.PI) / 180;
    const acc = faixas.get(faixaIdx) ?? {
      contagem: 0,
      somaL: 0,
      somaC: 0,
      somaSeno: 0,
      somaCosseno: 0,
    };
    acc.contagem += 1;
    acc.somaL += cor.l;
    acc.somaC += cor.c;
    acc.somaSeno += Math.sin(hRad) * cor.c;
    acc.somaCosseno += Math.cos(hRad) * cor.c;
    faixas.set(faixaIdx, acc);
  }

  if (totalOpacos === 0) return { ok: false, motivo: "sem_pixels_opacos" };
  if (faixas.size === 0) return { ok: false, motivo: "sem_cor_dominante" };

  let melhorFaixa: AcumuladorFaixa | null = null;
  for (const acc of faixas.values()) {
    if (!melhorFaixa || acc.somaC > melhorFaixa.somaC) melhorFaixa = acc;
  }
  // melhorFaixa nunca é null aqui (faixas.size > 0 checado acima).
  const vencedora = melhorFaixa!;

  const l = vencedora.somaL / vencedora.contagem;
  const c = vencedora.somaC / vencedora.contagem;
  // Média circular ponderada por croma — evita que matizes em lados
  // opostos do "zero" (ex: 358° e 2°) se cancelem numa média aritmética
  // ingênua e resultem incorretamente em ~180°.
  let h = (Math.atan2(vencedora.somaSeno, vencedora.somaCosseno) * 180) / Math.PI;
  if (h < 0) h += 360;

  const corMarca: Oklch = { l, c, h };
  return { ok: true, tokens: gerarTokensDeCorMarca(corMarca), corMarca };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Contraste mínimo exigido de `link`/`primary` contra o --background
// estático do site (branco fixo, ver globals.css — não varia por
// organização). 3.0 (WCAG "large text"/componente de UI, não o 4.5 de
// texto normal) de propósito: o tema Dourado do próprio catálogo fixo já
// em produção (ver branding/temas.ts) tem contraste real de ~3.69 contra
// branco — usar 4.5 aqui seria uma barra MAIS rígida que a já aceita
// nos temas escritos à mão, e escureceria cores de marca legitimamente
// claras/quentes (douradas, amarelas) mais do que o necessário. Ainda é
// um piso de verdade: cores muito claras/lavadas continuam sendo
// escurecidas até passar nele.
const CONTRASTE_MINIMO_LINK = 3.0;

// A partir de UMA cor de marca (já filtrada/dominante), deriva os 7
// tokens no mesmo formato do catálogo fixo (ver branding/temas.ts —
// mesmos nomes, mesmo racional: primaryLight/secondary/border sempre
// claros e pouco cromáticos, link=primary, onPrimary escolhido pelo
// melhor contraste). Constantes de derivação (deltas de L, faixas de C)
// calibradas nos 6 temas escritos à mão do catálogo — ver comentário de
// cada bloco abaixo.
export function gerarTokensDeCorMarca(corMarcaBruta: Oklch): TokensTema {
  const c = clamp(corMarcaBruta.c, 0.04, 0.25);
  let l = clamp(corMarcaBruta.l, 0.15, 0.85);
  const h = corMarcaBruta.h;

  // Ajuste automático de contraste (não altera a identidade — só a
  // luminosidade, e só o mínimo necessário) — ver seção 5 do pedido.
  while (l > 0.15 && razaoContraste({ l, c, h }, BRANCO) < CONTRASTE_MINIMO_LINK) {
    l = Math.max(0.15, l - 0.02);
  }

  const primary: Oklch = { l, c, h };

  const onPrimary =
    razaoContraste(primary, BRANCO) >= razaoContraste(primary, QUASE_PRETO) ? BRANCO : QUASE_PRETO;

  // Delta de ~0.08 de L pro hover em todos os 6 temas do catálogo.
  const primaryHover: Oklch = { l: clamp(l - 0.08, 0.12, 1), c, h };
  // primaryLight/secondary/border: mesmos alvos de L e faixas de C
  // observados no catálogo (L~0.93/0.96/0.875, C bem reduzido).
  const primaryLight: Oklch = { l: 0.93, c: clamp(c * 0.2, 0.015, 0.045), h };
  const secondary: Oklch = { l: 0.96, c: clamp(c * 0.11, 0.01, 0.02), h };
  const border: Oklch = { l: 0.875, c: clamp(c * 0.15, 0.01, 0.03), h };

  return {
    primary: formatarOklch(primary),
    primaryHover: formatarOklch(primaryHover),
    primaryLight: formatarOklch(primaryLight),
    onPrimary: formatarOklch(onPrimary),
    secondary: formatarOklch(secondary),
    border: formatarOklch(border),
    // Mesmo padrão dos 6 temas fixos: link sempre igual a primary.
    link: formatarOklch(primary),
  };
}
