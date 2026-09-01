// Lógica pura compartilhada entre a Home (PainelBuscaHome, form GET
// nativo) e a listagem pública (/imoveis, monta o Prisma where a partir
// dos mesmos searchParams) — mantém as duas em sincronia sem duplicar
// comportamento em dois lugares que poderiam divergir.

// Bug real corrigido nesta feature: o filtro de preço da listagem pública
// sempre aplicava o limite no campo `price` (venda), mesmo quando
// `finalidade=RENT` — imóveis só-aluguel normalmente têm `price` nulo,
// então o filtro de valor era um no-op silencioso pra quem buscava
// aluguel. "Comprar" usa `price`; "Alugar" usa `rentPrice`, nunca o
// contrário.
export function campoPrecoPorFinalidade(
  finalidade: string | null | undefined
): "price" | "rentPrice" {
  return finalidade === "RENT" ? "rentPrice" : "price";
}
