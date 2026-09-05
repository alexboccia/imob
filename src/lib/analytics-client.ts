"use client";

import type { PlacementAnalytics, TipoEventoAnalytics } from "@/lib/analytics-eventos";

// Cliente de tracking (Fase 6) — pequeno de propósito: nenhuma
// dependência, nenhuma biblioteca de analytics, nada que pese no bundle
// do site público.
//
// -----------------------------------------------------------------------
// FAIL-OPEN É A REGRA, NÃO UMA PRECAUÇÃO
// -----------------------------------------------------------------------
// Nada aqui pode impedir o visitante de fazer o que veio fazer. Toda
// função é síncrona do ponto de vista de quem chama, nunca devolve
// promessa que alguém possa dar `await`, e engole qualquer erro. Se
// localStorage estiver bloqueado, se sendBeacon não existir, se o
// endpoint estiver fora do ar: o clique no WhatsApp abre o WhatsApp do
// mesmo jeito e a navegação acontece do mesmo jeito.

const CHAVE_VISITOR = "easymob:visitor";

// Identificador pseudônimo do navegador: UUID aleatório, sem nenhum
// significado externo, first-party, criado pela própria aplicação.
//
// localStorage e NÃO cookie, deliberadamente: um cookie viajaria em toda
// requisição ao servidor (inclusive nas autenticadas), aumentando a
// superfície de dado pessoal sem nenhum ganho — este id só precisa ser
// lido pelo próprio JS da página. Também não é sessionStorage: a
// deduplicação de 30 minutos precisa sobreviver a abrir o imóvel em
// outra aba.
//
// Nunca deriva de e-mail, telefone, nome, IP ou atributos de device —
// não é fingerprint, é um número sorteado.
export function obterVisitorId(): string | null {
  try {
    const existente = window.localStorage.getItem(CHAVE_VISITOR);
    if (existente) return existente;
    // randomUUID exige contexto seguro (https ou localhost). Sem ele,
    // simplesmente não há tracking — nada de fallback com Math.random,
    // que geraria colisão e estragaria a deduplicação.
    if (!window.crypto?.randomUUID) return null;
    const novo = window.crypto.randomUUID();
    window.localStorage.setItem(CHAVE_VISITOR, novo);
    return novo;
  } catch {
    // Modo privado, storage bloqueado por política, cota estourada.
    return null;
  }
}

type EventoParaEnviar = {
  orgSlug: string;
  propertyId: string;
  type: TipoEventoAnalytics;
  placement?: PlacementAnalytics;
};

// Guarda em memória: evita repetir o MESMO evento dentro da mesma
// página montada (re-render, StrictMode em dev, clique duplo). É só uma
// economia de requisição — a deduplicação de verdade, que atravessa
// abas e recarregamentos, é a do servidor (janela de 30 min).
const jaEnviadosNestaPagina = new Set<string>();

export function enviarEventoAnalytics(evento: EventoParaEnviar): void {
  try {
    const chave = `${evento.type}:${evento.propertyId}:${evento.placement ?? ""}`;
    if (jaEnviadosNestaPagina.has(chave)) return;

    const visitorId = obterVisitorId();
    if (!visitorId) return;

    jaEnviadosNestaPagina.add(chave);

    const corpo = JSON.stringify({ ...evento, visitorId });

    // sendBeacon: entregue pelo browser em background, sobrevive à
    // navegação que o próprio clique dispara (é exatamente o caso do
    // link do WhatsApp, que troca de página/app no mesmo instante) e
    // nunca atrasa o clique. Não bloqueia nada e não retorna promessa.
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/evento", new Blob([corpo], { type: "application/json" }));
      return;
    }

    // Fallback pra browser sem sendBeacon. keepalive faz o mesmo papel
    // de sobreviver à navegação. `catch` vazio de propósito: uma falha
    // de rede aqui não é problema de ninguém além da métrica.
    void fetch("/api/analytics/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corpo,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Nunca propaga: um erro de tracking jamais pode virar erro de página.
  }
}
