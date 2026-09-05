import { createHash } from "node:crypto";

// =======================================================================
// Catálogo de eventos digitais (Fase 6) — funil VISUALIZAÇÃO → INTENÇÃO
// =======================================================================
//
// O CRM já sabia medir CONTATO RECEBIDO (Interaction.origin, Fase 4/5).
// O que faltava era o que acontece ANTES dele. Esta é a fonte de verdade
// das duas primeiras etapas — e SOMENTE delas.
//
// -----------------------------------------------------------------------
// POR QUE NÃO EXISTE UM EVENTO "CONTACT_SUBMIT"
// -----------------------------------------------------------------------
// Contato efetivamente captado JÁ tem fonte confiável: a Interaction
// criada com sucesso pelo formulário público. Criar um terceiro tipo de
// evento aqui só para o funil ter três degraus simétricos produziria
// DUPLA CONTAGEM (o mesmo contato em duas tabelas, divergindo assim que
// uma falhasse) e mediria a coisa errada: um clique em "Enviar" que
// morre em validação, rate limit ou erro de banco NÃO é um contato
// recebido. Cada etapa tem UMA fonte:
//
//   VISUALIZAÇÃO -> PropertyAnalyticsEvent (PROPERTY_VIEW)
//   INTENÇÃO     -> PropertyAnalyticsEvent (WHATSAPP_CLICK)
//   CONTATO      -> Interaction (origin ∈ ORIGENS_CAPTACAO)
//
// -----------------------------------------------------------------------
// STRING VALIDADA POR CATÁLOGO, NÃO ENUM DO POSTGRES
// -----------------------------------------------------------------------
// Mesmo precedente (e mesma justificativa) de Interaction.origin: tipos
// de evento novos — VIDEO_PLAY, MAP_OPEN, PHONE_CLICK, SHARE — devem
// poder existir sem migration. Um valor fora do catálogo nunca é
// gravado: o servidor rejeita antes de tocar o banco.
// =======================================================================

export const TIPOS_EVENTO_ANALYTICS = {
  // Página de detalhe de um imóvel efetivamente APRESENTADA num browser.
  // Ver "O QUE CONTA COMO VISUALIZAÇÃO" abaixo.
  PROPERTY_VIEW: "PROPERTY_VIEW",
  // Clique num CTA de WhatsApp da página do imóvel. É INTENÇÃO, nunca
  // conversa: ninguém sabe, deste lado, se a mensagem foi enviada.
  WHATSAPP_CLICK: "WHATSAPP_CLICK",
} as const;

export type TipoEventoAnalytics =
  (typeof TIPOS_EVENTO_ANALYTICS)[keyof typeof TIPOS_EVENTO_ANALYTICS];

export const LABEL_TIPO_EVENTO: Record<string, string> = {
  PROPERTY_VIEW: "Visualizações",
  // "Cliques no WhatsApp", nunca "Leads pelo WhatsApp": o dado que
  // existe é o clique. Chamar de lead afirmaria uma conversa que este
  // sistema não observou.
  WHATSAPP_CLICK: "Cliques no WhatsApp",
};

export function tipoEventoValido(valor: unknown): valor is TipoEventoAnalytics {
  return typeof valor === "string" && Object.hasOwn(TIPOS_EVENTO_ANALYTICS, valor);
}

// -----------------------------------------------------------------------
// PLACEMENT — coluna validada, não JSON livre
// -----------------------------------------------------------------------
// A página do imóvel tem TRÊS CTAs de WhatsApp, e os três disparam
// exatamente a mesma ação com exatamente o mesmo href. Eles NÃO são
// eventos semanticamente diferentes — são o mesmo evento em lugares
// diferentes. Por isso `placement` é uma dimensão opcional do
// WHATSAPP_CLICK, e não três tipos de evento: assim "cliques no
// WhatsApp" é uma soma trivial, e quem quiser saber qual CTA converte
// mais ainda consegue.
//
// Cardinalidade fechada de propósito (3 valores, catálogo): uma coluna
// de texto livre viraria uma sacola impossível de consultar.
export const PLACEMENTS_ANALYTICS = {
  SIDEBAR: "SIDEBAR",
  MOBILE_BAR: "MOBILE_BAR",
  GALLERY: "GALLERY",
} as const;

export type PlacementAnalytics =
  (typeof PLACEMENTS_ANALYTICS)[keyof typeof PLACEMENTS_ANALYTICS];

export const LABEL_PLACEMENT: Record<string, string> = {
  SIDEBAR: "Card lateral",
  MOBILE_BAR: "Barra fixa (mobile)",
  GALLERY: "Galeria de fotos",
};

export function placementValido(valor: unknown): valor is PlacementAnalytics {
  return typeof valor === "string" && Object.hasOwn(PLACEMENTS_ANALYTICS, valor);
}

// -----------------------------------------------------------------------
// O QUE CONTA COMO VISUALIZAÇÃO
// -----------------------------------------------------------------------
// Uma visualização válida é: um evento disparado por JAVASCRIPT EXECUTADO
// NO BROWSER, depois de a página do imóvel ter montado, deduplicado por
// (visitante, imóvel) dentro da JANELA_DEDUP_MINUTOS.
//
// O que isso exclui, POR CONSTRUÇÃO e sem precisar de heurística:
//   - crawler/bot que não executa JS (a maioria);
//   - prefetch do Next.js (baixa o payload, não monta o componente);
//   - HEAD, geração de metadata, render de SSR (não há browser);
//   - health check e link preview (nunca executam o efeito do cliente);
//   - refresh repetitivo e voltar/avançar (caem na deduplicação);
//   - Playwright de monitoramento externo (não executaria o POST sem
//     interagir; e se executar, cai na deduplicação por visitante).
//
// É por isso que a contagem NUNCA acontece no Server Component da
// página: lá, todos os itens acima virariam "visualização".
export const JANELA_DEDUP_MINUTOS = 30;

// Por que 30 minutos, e não 1h/24h: é a duração clássica de "sessão" e
// separa bem as duas perguntas comerciais. Abaixo disso, um F5 ou um
// voltar-do-mapa vira audiência inflada. Acima disso (24h), alguém que
// visitou de manhã, pensou no assunto e voltou à noite — comportamento
// que o corretor QUER ver como interesse renovado — desapareceria da
// métrica. 30 min também limita por quanto tempo um identificador
// pseudônimo precisa ser correlacionável para cumprir sua função.
export const JANELA_DEDUP_MS = JANELA_DEDUP_MINUTOS * 60 * 1000;

// -----------------------------------------------------------------------
// VISITANTE ANÔNIMO — minimização por escopo
// -----------------------------------------------------------------------
// O browser guarda um id aleatório (crypto.randomUUID) em localStorage.
// Ele NUNCA é persistido no banco como veio: o servidor grava apenas
//
//     sha256(visitorId : organizationId : propertyId)
//
// truncado em 32 hex. A consequência é deliberada e é o ponto principal:
// o MESMO visitante em DOIS imóveis gera dois hashes sem relação
// computável entre si. A tabela serve perfeitamente para deduplicar
// ("esta pessoa já viu ESTE imóvel nos últimos 30 min?") e é inútil para
// reconstruir a navegação de alguém pelo site — que é exatamente o
// tracking que esta fase se recusa a fazer.
//
// Trade-off assumido e documentado: dá pra contar visitantes únicos POR
// IMÓVEL, não visitantes únicos do site. O funil desta fase não precisa
// disso, e a alternativa exigiria um identificador global persistido.
//
// Sem sal secreto de propósito: o valor de entrada já é um UUID aleatório
// de 122 bits, então não há espaço de busca para reverter, e um sal em
// variável de ambiente quebraria toda a deduplicação a cada rotação.
export function calcularVisitorHash(
  visitorId: string,
  organizationId: string,
  propertyId: string
): string {
  return createHash("sha256")
    .update(`${visitorId}:${organizationId}:${propertyId}`)
    .digest("hex")
    .slice(0, 32);
}

// O id do visitante é gerado pelo browser, então chega como input não
// confiável. Aceita apenas o formato que a própria aplicação emite
// (UUID v4), o que impede tanto payload gigante quanto alguém tentar
// enfiar um e-mail/telefone neste campo achando que vira identidade.
const FORMATO_VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function visitorIdValido(valor: unknown): valor is string {
  return typeof valor === "string" && FORMATO_VISITOR_ID.test(valor);
}
