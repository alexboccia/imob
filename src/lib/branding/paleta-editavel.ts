import { hexParaOklch, formatarOklch } from "@/lib/branding/oklch-color";
import type { TokensTema } from "@/lib/branding/temas";

// Troca UMA cor da paleta sugerida, devolvendo uma paleta nova.
//
// Existe como função pura (fora do componente) por dois motivos: é o
// ponto onde o requisito "cada conta-gotas mexe só na sua própria cor"
// pode ser testado de verdade, e mantém a conversão hex -> oklch num
// lugar só. Devolve a paleta ORIGINAL, intacta, quando o hex não é
// válido — assim uma seleção estranha nunca corrompe a prévia.
//
// Note que `link` faz parte de TokensTema mas não aparece na lista
// editável da UI: ele é gerado junto e simplesmente carregado adiante
// sem alteração, que é o que mantém o token válido no schema na hora de
// aplicar.
export function aplicarCorNaPaleta(
  paleta: TokensTema,
  chave: keyof TokensTema,
  hex: string
): TokensTema {
  const oklch = hexParaOklch(hex);
  if (!oklch) return paleta;
  return { ...paleta, [chave]: formatarOklch(oklch) };
}
