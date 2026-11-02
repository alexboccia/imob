// Vocabulário em português pro parâmetro `finalidade` na URL pública —
// o código interno (FINALIDADE_LABEL em format.ts, Property.purpose no
// banco) continua em inglês (SALE/RENT), só a palavra visível na barra
// de endereço muda. Único ponto de tradução: toda escrita/leitura de URL
// passa por aqui, nunca um literal solto noutro arquivo.
const FINALIDADE_PARA_URL: Record<string, string> = {
  SALE: "venda",
  RENT: "aluguel",
};

// Aceita tanto a grafia nova (venda/aluguel) quanto a antiga (SALE/RENT)
// na LEITURA — um link já compartilhado/salvo com a grafia antiga nunca
// quebra, mesmo que a escrita só produza a nova a partir de agora.
const URL_PARA_FINALIDADE: Record<string, string> = {
  venda: "SALE",
  aluguel: "RENT",
  SALE: "SALE",
  RENT: "RENT",
};

export function finalidadeParaUrl(valor: string): string {
  return FINALIDADE_PARA_URL[valor] ?? valor;
}

export function finalidadeDaUrl(valor: string | undefined): string | undefined {
  if (!valor) return undefined;
  return URL_PARA_FINALIDADE[valor] ?? undefined;
}
