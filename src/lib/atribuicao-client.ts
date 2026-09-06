"use client";

import {
  montarAtribuicao,
  decidirAtribuicao,
  temAtribuicao,
  ATRIBUICAO_VAZIA,
  type Atribuicao,
} from "@/lib/atribuicao";

// Captura e leitura da atribuição no navegador (Fase 7).
//
// -----------------------------------------------------------------------
// sessionStorage, NÃO localStorage — e o motivo é semântico, não técnico
// -----------------------------------------------------------------------
// A atribuição desta fase é de SESSÃO/JORNADA. sessionStorage tem
// exatamente essa duração: morre quando a aba fecha. localStorage
// guardaria a origem por semanas e transformaria isto, na prática, num
// first-touch persistente — que é o rastreamento de longo prazo de uma
// pessoa que a Fase 6 recusou, e que a UI estaria descrevendo errado.
//
// O visitorId da Fase 6 continua em localStorage e continua servindo só
// para deduplicar visualização; são coisas diferentes com durações
// diferentes, guardadas em lugares diferentes de propósito.
//
// Cookie: nunca. Viajaria em toda requisição (inclusive nas
// autenticadas), aumentando superfície de dado sem ganho — este valor só
// precisa ser lido pelo JS da própria página.
//
// Tudo aqui é fail-open: em modo restrito, storage bloqueado ou cota
// estourada, as funções devolvem null/vazio e a página segue normal.

const CHAVE_ATRIBUICAO = "easymob:atribuicao";

function lerArmazenada(): Atribuicao | null {
  try {
    const bruto = window.sessionStorage.getItem(CHAVE_ATRIBUICAO);
    if (!bruto) return null;
    const objeto = JSON.parse(bruto);
    if (typeof objeto !== "object" || objeto === null) return null;
    // Reconstrói campo a campo: um JSON adulterado à mão no storage não
    // deve virar um objeto de forma arbitrária circulando pelo código.
    return {
      utmSource: objeto.utmSource ?? null,
      utmMedium: objeto.utmMedium ?? null,
      utmCampaign: objeto.utmCampaign ?? null,
      utmContent: objeto.utmContent ?? null,
      utmTerm: objeto.utmTerm ?? null,
      referrerHost: objeto.referrerHost ?? null,
    };
  } catch {
    return null;
  }
}

// Executado uma vez por carregamento de página do site público. Lê a URL
// e o document.referrer, decide pela regra de sobrescrita (ver
// decidirAtribuicao) e persiste o resultado.
export function capturarAtribuicao(): Atribuicao | null {
  try {
    const parametros = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    const { atribuicao: candidata, chegada } = montarAtribuicao({
      parametros,
      referrer: document.referrer || null,
      hostAtual: window.location.hostname,
    });

    const armazenada = lerArmazenada();
    const decidida = decidirAtribuicao({ armazenada, chegada, candidata });

    if (decidida && decidida !== armazenada) {
      window.sessionStorage.setItem(CHAVE_ATRIBUICAO, JSON.stringify(decidida));
    }
    return decidida;
  } catch {
    return null;
  }
}

// Atribuição corrente da jornada, para carimbar num evento ou num
// formulário. Nunca lança e nunca retorna promessa: quem chama está no
// caminho de um clique de conversão.
export function atribuicaoAtual(): Atribuicao {
  const armazenada = lerArmazenada();
  return armazenada && temAtribuicao(armazenada) ? armazenada : ATRIBUICAO_VAZIA;
}
