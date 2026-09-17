// =======================================================================
// Favoritos do visitante (Fase 47)
// =======================================================================
// O site público não tem conta de visitante: a única identidade pública é
// o navegador. Por isso o favorito mora no localStorage DAQUELE navegador
// — sobrevive a refresh, navegação e reabertura, e nada vai ao servidor.
// Não existe tabela de favoritos: um registro sem dono seria um dado
// órfão.
//
// Uma chave POR ORGANIZAÇÃO (o slug público do site): o mesmo navegador
// visitando duas imobiliárias nunca mistura as listas, mesmo que dois
// ids coincidam. O valor é a lista dos ids públicos dos imóveis (os mesmos
// de /imoveis/[id]).
//
// Tolerante a tudo: storage bloqueado, JSON corrompido, valor de outro
// formato — nada disso lança. Valor inválido é tratado como lista vazia e
// só é sobrescrito quando o visitante salvar algo; chaves de outros
// sistemas nunca são tocadas.
// =======================================================================

export const PREFIXO_FAVORITOS = "easymob:favoritos:v1:";
export const LIMITE_FAVORITOS = 200;

export function chaveFavoritos(orgSlug: string): string {
  return `${PREFIXO_FAVORITOS}${orgSlug}`;
}

export type ArmazenamentoSimples = Pick<Storage, "getItem" | "setItem">;

export function lerFavoritos(armazenamento: ArmazenamentoSimples | null, orgSlug: string): string[] {
  if (!armazenamento) return [];
  try {
    const bruto = armazenamento.getItem(chaveFavoritos(orgSlug));
    if (!bruto) return [];
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return [...new Set(lista.filter((id): id is string => typeof id === "string" && id.length > 0))];
  } catch {
    return [];
  }
}

/** Grava a lista; false quando o navegador não deixou (bloqueio, cota). */
export function gravarFavoritos(
  armazenamento: ArmazenamentoSimples | null,
  orgSlug: string,
  ids: string[]
): boolean {
  if (!armazenamento) return false;
  try {
    armazenamento.setItem(chaveFavoritos(orgSlug), JSON.stringify(ids.slice(-LIMITE_FAVORITOS)));
    return true;
  } catch {
    return false;
  }
}

/** Nova lista com o imóvel adicionado (no fim) ou removido. */
export function alternarNaLista(ids: string[], imovelId: string): string[] {
  return ids.includes(imovelId) ? ids.filter((id) => id !== imovelId) : [...ids, imovelId];
}

/** O localStorage, ou null quando o navegador o bloqueia. */
export function armazenamentoDoNavegador(): ArmazenamentoSimples | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    // Alguns navegadores expõem o objeto mas lançam no primeiro uso.
    storage.getItem(PREFIXO_FAVORITOS);
    return storage;
  } catch {
    return null;
  }
}
