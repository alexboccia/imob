// Origem de um contato vindo do site público — de onde o visitante
// estava quando decidiu falar com a imobiliária.
//
// Por que isto existe: até aqui, todo lead do site chegava ao CRM como
// `source: WEBSITE`, sem distinguir quem preencheu o formulário da
// página de um imóvel, quem usou a página /contato e quem pediu para
// anunciar um imóvel em /anuncie. Para o corretor que abre o registro,
// são três conversas completamente diferentes.
//
// Fica em Interaction (o evento), não em Person (a pessoa): a mesma
// pessoa pode voltar pelo /contato hoje e por um imóvel amanhã, e cada
// um desses contatos tem a sua própria origem. Person.source continua
// sendo WEBSITE — o canal — sem mudança de significado.
//
// String validada por catálogo em código, e não enum do Postgres, pelo
// mesmo motivo do themeId do catálogo de temas: origens novas (portal,
// campanha, indicação de parceiro) devem poder existir sem migration.
// Um valor desconhecido nunca é gravado — ver origemValida abaixo.

export const ORIGENS_CAPTACAO = {
  // Formulário na página de detalhe de um imóvel (card lateral, modal da
  // galeria ou barra fixa do mobile). Sempre acompanhado do propertyId.
  IMOVEL: "IMOVEL",
  // Página /contato — contato geral, sem imóvel específico.
  CONTATO: "CONTATO",
  // Página /anuncie — proprietário oferecendo imóvel. É o oposto
  // comercial dos outros dois: não quer comprar, quer vender.
  ANUNCIE: "ANUNCIE",
} as const;

export type OrigemCaptacao =
  (typeof ORIGENS_CAPTACAO)[keyof typeof ORIGENS_CAPTACAO];

export const LABEL_ORIGEM_CAPTACAO: Record<string, string> = {
  IMOVEL: "Página do imóvel",
  CONTATO: "Página de contato",
  ANUNCIE: "Anuncie seu imóvel",
};

// Só grava origem que o produto conhece. Um valor fora do catálogo (vindo
// de uma versão futura, de um payload adulterado ou de um registro
// antigo) vira null em vez de sujar o dado que os relatórios vão ler.
export function origemValida(valor: unknown): valor is OrigemCaptacao {
  // Object.hasOwn, não `in`: com `in`, "toString" e "constructor" seriam
  // aceitos como origem por virem da cadeia de protótipos.
  return typeof valor === "string" && Object.hasOwn(ORIGENS_CAPTACAO, valor);
}

// Rótulo para exibição. Origem desconhecida ou ausente devolve null —
// quem chama simplesmente não mostra a etiqueta, em vez de escrever
// "undefined" na tela do corretor.
export function rotuloOrigemCaptacao(valor: unknown): string | null {
  if (!origemValida(valor)) return null;
  return LABEL_ORIGEM_CAPTACAO[valor] ?? null;
}

// A origem de um envio do formulário de contato é decidida NO SERVIDOR
// pelo imóvel que veio junto — não por um campo que o navegador poderia
// declarar. Com imóvel validado (pertencente a esta organização), o
// contato nasceu na página daquele imóvel; sem imóvel, veio da página de
// contato. É por isso que a função recebe o id já validado, e não o que
// chegou no FormData.
export function origemDoContato(imovelIdValidado: string | null): OrigemCaptacao {
  return imovelIdValidado ? ORIGENS_CAPTACAO.IMOVEL : ORIGENS_CAPTACAO.CONTATO;
}
