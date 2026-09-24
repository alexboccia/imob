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

// As seis cores que o editor da tela de Configurações expõe (Fase 62).
// `link` fica de fora porque nunca foi editável: é derivado de `primary`
// tanto no catálogo fixo quanto no gerador (ver gerar-paleta.ts).
//
// A ordem é a de exibição no editor, do mais para o menos estruturante.
export const CHAVES_COR_EDITAVEIS = [
  "primary",
  "primaryHover",
  "primaryLight",
  "secondary",
  "border",
  "onPrimary",
] as const;

export type ChaveCorEditavel = (typeof CHAVES_COR_EDITAVEIS)[number];

// Nome do campo no FormData. Vive aqui, e não solto nos dois lados, para
// o formulário (cliente) e a Server Action lerem exatamente a mesma
// chave — um erro de digitação aqui seria uma cor que some ao salvar.
//
// Isto NÃO é um nome persistido: no banco a paleta continua sendo o JSON
// OrganizationBranding.customTheme com as chaves de TokensTema.
export function campoCorDaChave(chave: ChaveCorEditavel): string {
  return `cor_${chave}`;
}

// Rótulos apresentados ao usuário. Descrevem a FUNÇÃO real do token no
// site público, verificada em código (Fase 62):
//   - primary      -> --primary: botões, CTAs e contorno do item ativo;
//   - secondary    -> --secondary: fundo das seções (bg-secondary/40 em
//                     FaixaConfianca e SecaoCaptacao);
//   - border       -> --border: bordas de cards e divisores;
//   - onPrimary    -> --primary-foreground: texto sobre a cor primária.
// primaryHover e primaryLight são registrados como tokens do Tailwind
// (--color-primary-hover / --color-primary-light em globals.css) mas
// HOJE nenhum componente os consome — por isso o rótulo diz o que eles
// são (tons derivados da primária) em vez de prometer um "destaque" que
// não se vê em lugar nenhum do site.
export const ROTULOS_COR_EDITAVEL: Record<ChaveCorEditavel, string> = {
  primary: "Cor primária",
  primaryHover: "Primária no hover",
  primaryLight: "Primária clara",
  secondary: "Fundo de seções",
  border: "Bordas",
  onPrimary: "Texto sobre a primária",
};
