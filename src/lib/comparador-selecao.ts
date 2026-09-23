import { useSyncExternalStore } from "react";
import { idImovelValido, LIMITE_FAVORITOS } from "@/lib/favoritos";

// =======================================================================
// Seleção para comparar (Fase 59)
// =======================================================================
// SELECIONAR PARA COMPARAR ≠ FAVORITAR. São dois estados diferentes e
// vivem em lugares diferentes, de propósito:
//
//   favorito  -> localStorage, permanente, é a lista salva do visitante
//   seleção   -> sessionStorage, efêmera, é o conjunto de trabalho de
//                UMA sessão de decisão
//
// sessionStorage porque a seleção precisa sobreviver à navegação entre
// /favoritos e /favoritos/comparar (e ao F5 nela), mas não faz sentido
// reencontrar a comparação de semanas atrás ao voltar ao site — isso
// seria a lista de favoritos, que já existe.
//
// NÃO VAI PARA A URL: os ids seriam internos e visíveis em histórico,
// referer e log de acesso, e uma URL com ids convidaria a manipulá-los.
// O servidor revalida tudo de qualquer forma (a consulta é escopada por
// organização e ficha pública), mas não expor é a porta mais barata.
//
// Uma chave POR ORGANIZAÇÃO, como nos favoritos: o mesmo navegador em
// duas imobiliárias nunca mistura seleções.
//
// Tolerante a tudo, como o store de favoritos: storage bloqueado, JSON
// corrompido ou de outro formato nunca lança — vira seleção vazia.

export const PREFIXO_SELECAO = "easymob:comparar:v1:";
export const EVENTO_SELECAO = "easymob:comparacao-alterada";

/** Abaixo de dois imóveis não existe comparação — existe uma ficha. */
export const MINIMO_PARA_COMPARAR = 2;

export function chaveSelecao(orgSlug: string): string {
  return `${PREFIXO_SELECAO}${orgSlug}`;
}

type ArmazenamentoSimples = Pick<Storage, "getItem" | "setItem">;

function sessao(): ArmazenamentoSimples | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const memoria = new Map<string, string[]>();

export function lerSelecao(
  armazenamento: ArmazenamentoSimples | null,
  orgSlug: string
): string[] {
  if (!armazenamento) return [];
  try {
    const bruto = armazenamento.getItem(chaveSelecao(orgSlug));
    if (!bruto) return [];
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return [
      ...new Set(
        lista.filter((id): id is string => typeof id === "string" && idImovelValido(id))
      ),
    ].slice(0, LIMITE_FAVORITOS);
  } catch {
    return [];
  }
}

function lerLista(orgSlug: string): string[] {
  return memoria.get(orgSlug) ?? lerSelecao(sessao(), orgSlug);
}

// useSyncExternalStore exige a MESMA referência enquanto o valor não
// muda — ler o storage devolve um array novo a cada chamada.
const ultimaLeitura = new Map<string, { assinatura: string; lista: string[] }>();

export function selecaoAtual(orgSlug: string): string[] {
  const lista = lerLista(orgSlug);
  const assinatura = JSON.stringify(lista);
  const anterior = ultimaLeitura.get(orgSlug);
  if (anterior && anterior.assinatura === assinatura) return anterior.lista;
  ultimaLeitura.set(orgSlug, { assinatura, lista });
  return lista;
}

function gravar(orgSlug: string, lista: string[]) {
  const armazenamento = sessao();
  let gravou = false;
  try {
    if (armazenamento) {
      armazenamento.setItem(chaveSelecao(orgSlug), JSON.stringify(lista));
      gravou = true;
    }
  } catch {
    gravou = false;
  }
  // Sem storage, a seleção vale enquanto a página estiver aberta — os
  // controles continuam funcionando.
  if (gravou) memoria.delete(orgSlug);
  else memoria.set(orgSlug, lista);
  window.dispatchEvent(new Event(EVENTO_SELECAO));
}

function inscrever(aoMudar: () => void) {
  window.addEventListener("storage", aoMudar);
  window.addEventListener(EVENTO_SELECAO, aoMudar);
  return () => {
    window.removeEventListener("storage", aoMudar);
    window.removeEventListener(EVENTO_SELECAO, aoMudar);
  };
}

export function alternarSelecao(orgSlug: string, imovelId: string) {
  const lista = lerLista(orgSlug);
  gravar(
    orgSlug,
    lista.includes(imovelId) ? lista.filter((id) => id !== imovelId) : [...lista, imovelId]
  );
}

/**
 * Tira um imóvel da comparação. NÃO mexe nos favoritos: são estados
 * diferentes, e remover da comparação nunca pode apagar o que a pessoa
 * salvou.
 */
export function removerDaSelecao(orgSlug: string, imovelId: string) {
  const lista = lerLista(orgSlug);
  if (lista.includes(imovelId)) gravar(orgSlug, lista.filter((id) => id !== imovelId));
}

export function limparSelecao(orgSlug: string) {
  gravar(orgSlug, []);
}

/**
 * Mantém na seleção apenas o que ainda é favorito.
 *
 * Deixar de favoritar é uma decisão sobre o imóvel, não sobre a tela:
 * manter na comparação algo que saiu da lista salva deixaria a
 * comparação apontando para fora dela. Chamado por quem já conhece a
 * lista de favoritos — este módulo não a lê para não criar dependência
 * cruzada entre os dois stores.
 */
export function sincronizarComFavoritos(orgSlug: string, favoritos: string[]) {
  const lista = lerLista(orgSlug);
  const permitidos = new Set(favoritos);
  const filtrada = lista.filter((id) => permitidos.has(id));
  if (filtrada.length !== lista.length) gravar(orgSlug, filtrada);
}

/** Os ids selecionados. null até o navegador ser consultado. */
export function useSelecao(orgSlug: string): string[] | null {
  return useSyncExternalStore(
    inscrever,
    () => selecaoAtual(orgSlug),
    () => null
  );
}

export function useEstaSelecionado(orgSlug: string, imovelId: string): boolean {
  return useSyncExternalStore(inscrever, () => lerLista(orgSlug).includes(imovelId), () => false);
}

/** Só para testes: esquece o fallback em memória. */
export function _limparMemoriaSelecao() {
  memoria.clear();
  ultimaLeitura.clear();
}
