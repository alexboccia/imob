import { decimalParaValor } from "@/lib/valor-fechamento";

// =======================================================================
// Preços do imóvel na fronteira Server -> Client (Fase 16)
// =======================================================================
// Prisma devolve `Decimal` (um objeto com prototype próprio) para as
// colunas monetárias. Isso está CORRETO no banco e correto dentro do
// domínio server-side — o que não é correto é atravessar a fronteira de
// um Client Component com ele: o React avisa "Only plain objects can be
// passed to Client Components from Server Components. Decimal objects
// are not supported." e o valor chega degradado.
//
// A conversão pertence aqui, na APRESENTAÇÃO, e não no schema: nada de
// Float no banco, nada de serializar o universo, nada de
// JSON.parse(JSON.stringify(...)).
//
// `null` continua `null`. "Sem preço" não é "R$ 0" — um imóvel só para
// locação tem `price` nulo, e exibi-lo como zero seria anunciar de graça.
//
// Precisão: Decimal(14,2) tem no máximo 12 dígitos inteiros + 2 casas,
// o que cabe com folga nos ~15 dígitos significativos de um double —
// a conversão não move centavos (coberto por teste).
export type PrecosImovel = {
  // Preço de VENDA anunciado. Não confundir com closedValue (valor
  // negociado), commissionValue, allocationValue ou pagamento.
  price: number | null;
  // Preço de LOCAÇÃO anunciado.
  rentPrice: number | null;
};

export function precosDoImovel(imovel: {
  price: unknown;
  rentPrice: unknown;
}): PrecosImovel {
  return {
    price: decimalParaValor(imovel.price),
    rentPrice: decimalParaValor(imovel.rentPrice),
  };
}
