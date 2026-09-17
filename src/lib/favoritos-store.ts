import { useSyncExternalStore } from "react";
import {
  alternarNaLista,
  armazenamentoDoNavegador,
  gravarFavoritos,
  lerFavoritos,
} from "@/lib/favoritos";

// =======================================================================
// Favoritos no navegador — a ÚNICA fonte do lado do cliente (Fase 49)
// =======================================================================
// A ficha (Salvar), o header (contador) e a página de favoritos leem e
// escrevem por aqui. Sem estado global de biblioteca: o localStorage é o
// estado, e useSyncExternalStore faz cada componente reler quando ele
// muda —
//   - nesta aba: pelo evento próprio disparado a cada escrita;
//   - em outra aba: pelo evento "storage" do navegador.
//
// Quando o navegador bloqueia o localStorage, a lista vale só enquanto a
// página estiver aberta (memória) — os botões continuam funcionando.
// =======================================================================

const memoria = new Map<string, string[]>();
export const EVENTO_FAVORITOS = "easymob:favoritos-alterados";

function lerLista(orgSlug: string): string[] {
  return memoria.get(orgSlug) ?? lerFavoritos(armazenamentoDoNavegador(), orgSlug);
}

// useSyncExternalStore exige o MESMO objeto enquanto o valor não muda —
// ler o storage devolve um array novo a cada chamada.
const ultimaLeitura = new Map<string, { assinatura: string; lista: string[] }>();

/** A lista atual, com a mesma referência enquanto não mudar. */
export function listaFavoritosAtual(orgSlug: string): string[] {
  const lista = lerLista(orgSlug);
  const assinatura = JSON.stringify(lista);
  const anterior = ultimaLeitura.get(orgSlug);
  if (anterior && anterior.assinatura === assinatura) return anterior.lista;
  ultimaLeitura.set(orgSlug, { assinatura, lista });
  return lista;
}

export function inscreverFavoritos(aoMudar: () => void) {
  window.addEventListener("storage", aoMudar);
  window.addEventListener(EVENTO_FAVORITOS, aoMudar);
  return () => {
    window.removeEventListener("storage", aoMudar);
    window.removeEventListener(EVENTO_FAVORITOS, aoMudar);
  };
}

function gravar(orgSlug: string, lista: string[]) {
  if (gravarFavoritos(armazenamentoDoNavegador(), orgSlug, lista)) memoria.delete(orgSlug);
  else memoria.set(orgSlug, lista);
  window.dispatchEvent(new Event(EVENTO_FAVORITOS));
}

export function alternarFavorito(orgSlug: string, imovelId: string) {
  gravar(orgSlug, alternarNaLista(lerLista(orgSlug), imovelId));
}

export function removerFavorito(orgSlug: string, imovelId: string) {
  const lista = lerLista(orgSlug);
  if (lista.includes(imovelId)) gravar(orgSlug, lista.filter((id) => id !== imovelId));
}

/**
 * Os ids salvos nesta organização, na ordem gravada (mais antigo
 * primeiro). null até o navegador ser consultado: o servidor não conhece
 * o storage, e "ainda não sei" não pode ser confundido com "nenhum".
 */
export function useFavoritos(orgSlug: string): string[] | null {
  return useSyncExternalStore(
    inscreverFavoritos,
    () => listaFavoritosAtual(orgSlug),
    () => null
  );
}

export function useEhFavorito(orgSlug: string, imovelId: string): boolean {
  return useSyncExternalStore(
    inscreverFavoritos,
    () => lerLista(orgSlug).includes(imovelId),
    () => false
  );
}

/** Só para testes: esquece o fallback em memória. */
export function _limparMemoriaFavoritos() {
  memoria.clear();
  ultimaLeitura.clear();
}
