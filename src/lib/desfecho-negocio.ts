import type { LostReason, PropertyPurpose, PropertyStatus } from "@/generated/prisma/client";

// =======================================================================
// O desfecho do negócio — três verdades que precisam ser a mesma
// =======================================================================
// Ganhar uma negociação não pode ser só mudar uma linha do funil. Depois
// do fechamento, três coisas têm de ser verdade ao mesmo tempo:
//
//   1. a negociação terminou;
//   2. o valor final foi preservado;
//   3. o imóvel está no estado comercial correto.
//
// Até aqui só as duas primeiras aconteciam: era possível ter
// PropertyInterest WON com Property AVAILABLE, e o site seguia
// anunciando um imóvel já vendido. Este módulo é a regra pura da
// terceira.

/**
 * Para onde vai o imóvel quando o negócio é ganho.
 *
 * SALE e RENT são determinados pelo domínio — não há escolha a fazer, e
 * perguntar seria transformar em pergunta o que o dado já responde.
 *
 * SALE_AND_RENT é o único caso ambíguo, e ele é REAL: o imóvel está
 * anunciado para as duas coisas, e ganhar uma negociação não diz qual
 * delas aconteceu. `PropertyInterest` liga pessoa a IMÓVEL, não a
 * finalidade. Aqui o sistema não deduz: quem sabe é o corretor, e o
 * diálogo pergunta. Escolher um dos dois por conta própria gravaria uma
 * informação comercial falsa — e um imóvel marcado como vendido quando
 * foi alugado é pior do que um imóvel sem status atualizado.
 */
export type DesfechoImovel =
  | { tipo: "definido"; status: Extract<PropertyStatus, "SOLD" | "RENTED"> }
  | { tipo: "precisa_escolha" };

export function desfechoDoImovel(purpose: PropertyPurpose): DesfechoImovel {
  if (purpose === "SALE") return { tipo: "definido", status: "SOLD" };
  if (purpose === "RENT") return { tipo: "definido", status: "RENTED" };
  return { tipo: "precisa_escolha" };
}

/** Os dois desfechos possíveis, para o formulário e para a validação. */
export const DESFECHOS_POSSIVEIS = ["SOLD", "RENTED"] as const;
export type DesfechoEscolhido = (typeof DESFECHOS_POSSIVEIS)[number];

export const DESFECHO_LABEL: Record<DesfechoEscolhido, string> = {
  SOLD: "Vendido",
  RENTED: "Alugado",
};

/**
 * O imóvel deve mudar de estado agora?
 *
 * Só quando ele ainda está DISPONÍVEL. Um imóvel já SOLD, RENTED,
 * RESERVED, DRAFT ou INACTIVE não é tocado: ele já não está em
 * circulação, e sobrescrever seu estado a partir de uma negociação
 * ganha apagaria um fato registrado antes — inclusive o de outra
 * negociação do mesmo imóvel que tenha fechado primeiro.
 */
export function imovelDeveTransicionar(statusAtual: PropertyStatus): boolean {
  return statusAtual === "AVAILABLE";
}

export const MOTIVOS_PERDA = [
  "PRICE",
  "FINANCING",
  "CLIENT_GAVE_UP",
  "PROPERTY_UNAVAILABLE",
  "OTHER",
] as const;

export const MOTIVO_PERDA_LABEL: Record<LostReason, string> = {
  PRICE: "Não fecharam no valor",
  FINANCING: "Financiamento não saiu",
  CLIENT_GAVE_UP: "Cliente desistiu",
  PROPERTY_UNAVAILABLE: "Imóvel ficou indisponível",
  OTHER: "Outro motivo",
};

/**
 * Lê o motivo do formulário. Ausente é um estado legítimo — "não
 * informado" é honesto, e obrigar uma escolha produziria motivo falso,
 * exatamente como um closedValue obrigatório produziria valor inventado.
 */
export function interpretarMotivoPerda(bruto: unknown): LostReason | null {
  return MOTIVOS_PERDA.find((m) => m === bruto) ?? null;
}
