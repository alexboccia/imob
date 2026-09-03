export const LOGO_ALTURA_PADRAO = 40;
export const LOGO_ALTURA_MIN = 24;
export const LOGO_ALTURA_MAX = 96;

// Rodapé tem altura própria, independente do cabeçalho: o logo do rodapé
// costuma ser outra arte (versão clara pra fundo escuro) e quase nunca
// quer o mesmo tamanho do topo. O PADRÃO 44 é exatamente o `h-11` fixo
// que o SiteFooter usava antes deste campo existir — quem nunca
// configurar continua vendo o rodapé idêntico ao de hoje.
export const LOGO_RODAPE_ALTURA_PADRAO = 44;
export const LOGO_RODAPE_ALTURA_MIN = 24;
export const LOGO_RODAPE_ALTURA_MAX = 96;

// Largura da caixa do logo a partir da altura escolhida. A imagem usa
// object-contain, então a caixa é só o espaço MÁXIMO disponível: o logo
// nunca distorce, só deixa de ser limitado pela largura. Proporção ~2,55
// é a mesma que o rodapé já tinha fixa (112px de largura para 44px de
// altura), então a aparência no valor padrão não muda.
export function larguraCaixaLogoRodape(altura: number): number {
  return Math.round(altura * (112 / 44));
}
