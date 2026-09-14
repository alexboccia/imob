import { interpretarValorMonetario, type ValorFechamento } from "@/lib/valor-fechamento";
import type { OfferSide } from "@/generated/prisma/client";

// =======================================================================
// Negociação de valores — a memória estruturada da negociação
// =======================================================================
// O produto sabia que uma negociação estava "em PROPOSTA" e não sabia
// QUAL era a proposta. Este módulo é a regra pura por trás da correção:
// como se lê um valor do formulário, como se nomeiam os dois lados da
// mesa, e — o que mais importa — como se deriva O ESTADO COMERCIAL ATUAL
// de uma sequência de propostas.
//
// Puro de propósito: é importado pelo componente cliente do diálogo, e um
// import de Prisma aqui arrastaria o driver `pg` para o bundle do
// navegador (achado da Fase 31, comprovado pelo build).

/**
 * Rótulos dos dois lados. As mesmas duas palavras para VENDA e ALUGUEL:
 * "cliente" e "proprietário" são corretos nas duas leituras
 * (comprador/vendedor, locatário/locador), e um vocabulário por
 * finalidade seria duplicar o que `Property.purpose` já diz.
 */
export const LADO_PROPOSTA_LABEL: Record<OfferSide, string> = {
  CLIENT: "Cliente",
  OWNER: "Proprietário",
};

export const LADOS_PROPOSTA = ["CLIENT", "OWNER"] as const;

/** O lado oposto — é dele a vez depois de uma proposta. */
export function ladoOposto(lado: OfferSide): OfferSide {
  return lado === "CLIENT" ? "OWNER" : "CLIENT";
}

/** Mesma regra monetária do fechamento, com as palavras da proposta. */
export function interpretarValorProposta(bruto: unknown): ValorFechamento {
  return interpretarValorMonetario(bruto, "da proposta");
}

export type PropostaRegistrada = {
  id: string;
  valor: number;
  lado: OfferSide;
  ocorridoEmISO: string;
  /** Quem REGISTROU no easymob — nunca quem propôs. */
  registradoPor: string | null;
};

export type SituacaoNegociacao = {
  /** A proposta que está em jogo. null quando ainda não houve nenhuma. */
  ultima: PropostaRegistrada | null;
  /**
   * De quem é a vez. DERIVADO, não persistido: quem propôs por último
   * está esperando o outro lado responder. Não existe estado
   * "pendente/aceita/recusada" guardado porque a sequência já responde —
   * uma proposta nova substitui a anterior, e aceitação é o fechamento
   * da negociação (closedValue), que o domínio já registra.
   *
   * null quando não há proposta nenhuma (ninguém está esperando) ou
   * quando a negociação está encerrada — aí não há mais vez de ninguém.
   */
  aguardando: OfferSide | null;
  total: number;
};

/**
 * O estado comercial atual, lido de uma sequência já ordenada da mais
 * recente para a mais antiga.
 *
 * `encerrada` entra porque uma negociação ganha ou perdida não está
 * esperando resposta de lado nenhum — dizer "aguardando o proprietário"
 * num negócio já fechado seria afirmar trabalho que não existe.
 */
export function situacaoDaNegociacao(
  propostasRecentesPrimeiro: readonly PropostaRegistrada[],
  encerrada: boolean
): SituacaoNegociacao {
  const ultima = propostasRecentesPrimeiro[0] ?? null;
  return {
    ultima,
    aguardando: ultima && !encerrada ? ladoOposto(ultima.lado) : null,
    total: propostasRecentesPrimeiro.length,
  };
}

/**
 * O preço pedido, para a finalidade certa — CONTEXTO da negociação, não
 * cópia: o valor continua vivendo no imóvel, e a proposta nunca o
 * duplica. Venda lê `price`, aluguel lê `rentPrice`, exatamente como a
 * listagem pública decidiu em campoPrecoPorFinalidade.
 */
export function precoPedido(imovel: {
  purpose: string;
  price: number | null;
  rentPrice: number | null;
}): number | null {
  return imovel.purpose === "RENT" ? imovel.rentPrice : imovel.price;
}
