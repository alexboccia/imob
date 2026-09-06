// =======================================================================
// Atribuição comercial first-party (Fase 7)
// =======================================================================
// Responde "DE ONDE veio esta visita/este contato" — uma dimensão NOVA e
// independente das duas que já existiam:
//
//   Person.source        CANAL CADASTRAL da pessoa (enum LeadSource),
//                        escrito UMA vez na criação, curado pelo corretor.
//                        NÃO é tocado por esta fase — ver decisão (A) no
//                        relatório final.
//   Interaction.origin   CONTEXTO comercial do evento (IMOVEL/CONTATO/
//                        ANUNCIE). Inalterado.
//   Atribuição (aqui)    COMO o visitante chegou ao site nesta jornada.
//
// Os três coexistem. Um contato pode perfeitamente ser
// origin=IMOVEL + utm_source=google + Person.source=WEBSITE, e cada um
// desses três significa uma coisa diferente e verdadeira.
//
// -----------------------------------------------------------------------
// MODELO: ATRIBUIÇÃO DE SESSÃO (jornada), NÃO first-touch
// -----------------------------------------------------------------------
// A atribuição vale enquanto durar a jornada do visitante naquela aba e
// morre quando ela termina. NÃO é "a origem original do cliente" e a
// interface nunca deve chamá-la assim.
//
// Por que sessão e não first-touch: first-touch exigiria guardar a origem
// de alguém por semanas, o que é justamente o perfil global de visitante
// que a Fase 6 se recusou a construir. Sessão responde as perguntas
// comerciais desta fase ("esta campanha traz contato?") sem criar
// rastreamento persistente de pessoas.
// =======================================================================

// Limites rígidos. UTM é texto que um terceiro qualquer coloca numa URL:
// pode vir gigante, com caractere de controle, com HTML. Nada disso pode
// entrar no banco nem crescer sem teto.
export const LIMITE_UTM = 120;
export const LIMITE_HOST = 253; // maior nome DNS válido

export type Atribuicao = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrerHost: string | null;
};

export const ATRIBUICAO_VAZIA: Atribuicao = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  referrerHost: null,
};

// Normalização única, usada no cliente E no servidor (o servidor nunca
// confia no que o cliente normalizou):
//  - não-string vira null;
//  - remove caracteres de controle (inclusive quebra de linha, que
//    sujaria log e relatório);
//  - trim; vazio vira null;
//  - corta no limite — nunca rejeita o valor inteiro por ser longo, o
//    prefixo ainda identifica a campanha;
//  - minúsculas: "Google", "GOOGLE" e "google" são a mesma origem, e sem
//    isso o agrupamento do dashboard mostraria três linhas.
export function normalizarCampoAtribuicao(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.replace(/[\u0000-\u001f\u007f]/g, "").trim().toLowerCase();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

// Hostname do referrer, NUNCA a URL completa: uma URL de origem carrega
// query string, token de sessão, id de pedido e às vezes dado pessoal —
// nada disso tem função aqui. O host responde "veio do google" e só.
export function extrairHostReferrer(referrer: unknown): string | null {
  if (typeof referrer !== "string" || !referrer.trim()) return null;
  try {
    const url = new URL(referrer);
    // Descarta esquema não-http(s) para não guardar lixo (about:, data:).
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // "www." removido: www.google.com e google.com são a mesma origem
    // comercial, e separá-las só fragmentaria o relatório.
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host ? host.slice(0, LIMITE_HOST) : null;
  } catch {
    return null;
  }
}

export function temAtribuicao(a: Atribuicao | null | undefined): boolean {
  if (!a) return false;
  return Boolean(
    a.utmSource || a.utmMedium || a.utmCampaign || a.utmContent || a.utmTerm || a.referrerHost
  );
}

// -----------------------------------------------------------------------
// Sinal de chegada e a REGRA DE SOBRESCRITA
// -----------------------------------------------------------------------
export type SinalChegada = "UTM" | "REFERRER_EXTERNO" | "INTERNO" | "DIRETO";

// `hostAtual` é o hostname da página em que o visitante está. Comparar
// contra ele (em vez de uma lista fixa de domínios) resolve multi-tenant
// e domínio customizado de graça: o que importa é "veio de fora DESTE
// site", e cada tenant sabe qual é o seu próprio host.
export function classificarChegada(params: {
  utm: Atribuicao;
  referrerHost: string | null;
  hostAtual: string;
}): SinalChegada {
  const { utm, referrerHost, hostAtual } = params;
  if (utm.utmSource || utm.utmMedium || utm.utmCampaign) return "UTM";
  if (!referrerHost) return "DIRETO";
  const atual = hostAtual.toLowerCase().replace(/^www\./, "");
  if (referrerHost === atual) return "INTERNO";
  return "REFERRER_EXTERNO";
}

// Decide o que guardar. As regras, e o porquê de cada uma:
//
//  UTM               -> SOBRESCREVE. O visitante acabou de clicar num
//                       anúncio/link de campanha: essa é a origem desta
//                       visita, mesmo que ele já estivesse no site.
//                       (Última campanha da jornada vence.)
//  REFERRER_EXTERNO  -> SOBRESCREVE. Chegada externa nova.
//  INTERNO           -> NUNCA sobrescreve. Home -> imóvel não é aquisição
//                       nova; sem esta regra, toda navegação interna
//                       apagaria o Google/Instagram original e carimbaria
//                       o próprio domínio do tenant como "origem".
//  DIRETO            -> só grava se ainda NÃO houver atribuição. Voltar
//                       digitando a URL no meio de uma jornada não apaga
//                       a campanha que trouxe a pessoa.
export function decidirAtribuicao(params: {
  armazenada: Atribuicao | null;
  chegada: SinalChegada;
  candidata: Atribuicao;
}): Atribuicao | null {
  const { armazenada, chegada, candidata } = params;
  if (chegada === "UTM" || chegada === "REFERRER_EXTERNO") return candidata;
  if (armazenada && temAtribuicao(armazenada)) return armazenada;
  if (chegada === "DIRETO") return ATRIBUICAO_VAZIA;
  return armazenada;
}

// Monta a atribuição candidata a partir do que o browser observou.
// `referrerHost` só é preservado quando a chegada é externa — guardar o
// próprio host em navegação interna seria gravar ruído como se fosse
// origem.
export function montarAtribuicao(params: {
  parametros: Record<string, string | null | undefined>;
  referrer: string | null;
  hostAtual: string;
}): { atribuicao: Atribuicao; chegada: SinalChegada } {
  const { parametros, referrer, hostAtual } = params;
  const utm: Atribuicao = {
    utmSource: normalizarCampoAtribuicao(parametros.utm_source, LIMITE_UTM),
    utmMedium: normalizarCampoAtribuicao(parametros.utm_medium, LIMITE_UTM),
    utmCampaign: normalizarCampoAtribuicao(parametros.utm_campaign, LIMITE_UTM),
    utmContent: normalizarCampoAtribuicao(parametros.utm_content, LIMITE_UTM),
    utmTerm: normalizarCampoAtribuicao(parametros.utm_term, LIMITE_UTM),
    referrerHost: null,
  };
  const referrerHost = extrairHostReferrer(referrer);
  const chegada = classificarChegada({ utm, referrerHost, hostAtual });

  return {
    atribuicao: {
      ...utm,
      referrerHost: chegada === "REFERRER_EXTERNO" || chegada === "UTM" ? referrerHost : null,
    },
    chegada,
  };
}

// Saneamento no SERVIDOR de um payload que veio do navegador. Aceita
// qualquer coisa e devolve uma Atribuicao válida — nunca lança, porque
// atribuição inválida jamais pode derrubar um contato ou um evento.
export function sanearAtribuicaoRecebida(bruto: unknown): Atribuicao {
  if (typeof bruto !== "object" || bruto === null) return ATRIBUICAO_VAZIA;
  const o = bruto as Record<string, unknown>;
  return {
    utmSource: normalizarCampoAtribuicao(o.utmSource, LIMITE_UTM),
    utmMedium: normalizarCampoAtribuicao(o.utmMedium, LIMITE_UTM),
    utmCampaign: normalizarCampoAtribuicao(o.utmCampaign, LIMITE_UTM),
    utmContent: normalizarCampoAtribuicao(o.utmContent, LIMITE_UTM),
    utmTerm: normalizarCampoAtribuicao(o.utmTerm, LIMITE_UTM),
    referrerHost: normalizarCampoAtribuicao(o.referrerHost, LIMITE_HOST),
  };
}

// -----------------------------------------------------------------------
// CANAL — classificação DERIVADA, calculada na leitura
// -----------------------------------------------------------------------
// Nunca persistida: o dado gravado são os campos estruturados (utm_* e
// host). Se amanhã esta classificação estiver errada ou incompleta,
// corrige-se a função e todo o histórico passa a ser lido certo — nada se
// perdeu. Gravar o rótulo seria congelar um palpite como se fosse fato.
export const CANAIS = {
  ANUNCIOS: "ANUNCIOS",
  BUSCA: "BUSCA",
  SOCIAL: "SOCIAL",
  REFERENCIA: "REFERENCIA",
  DIRETO: "DIRETO",
  SEM_ATRIBUICAO: "SEM_ATRIBUICAO",
} as const;

export type Canal = (typeof CANAIS)[keyof typeof CANAIS];

export const LABEL_CANAL: Record<Canal, string> = {
  ANUNCIOS: "Anúncios pagos",
  BUSCA: "Busca orgânica",
  SOCIAL: "Redes sociais",
  REFERENCIA: "Outros sites",
  DIRETO: "Direto",
  SEM_ATRIBUICAO: "Sem atribuição",
};

// Ordem de exibição fixa — do canal mais "comprado" ao menos, com as duas
// caixas honestas no fim. Estável entre refreshes.
export const ORDEM_CANAIS: readonly Canal[] = [
  CANAIS.ANUNCIOS,
  CANAIS.BUSCA,
  CANAIS.SOCIAL,
  CANAIS.REFERENCIA,
  CANAIS.DIRETO,
  CANAIS.SEM_ATRIBUICAO,
];

// Listas curtas e explícitas, não regex esperta: um host novo cai em
// "Outros sites" (verdade honesta) em vez de ser adivinhado errado.
const MARCAS_BUSCA = ["google", "bing", "duckduckgo", "yahoo", "ecosia"];
const MARCAS_SOCIAL = [
  "instagram",
  "facebook",
  "linkedin",
  "youtube",
  "tiktok",
  "twitter",
  "pinterest",
];
const MEDIUMS_PAGOS = ["cpc", "ppc", "paid", "paid_social", "cpm", "display", "ads"];

function contemMarca(valor: string, marcas: readonly string[]): boolean {
  return marcas.some((m) => valor.includes(m));
}

// Ordem importa: mídia paga vence a plataforma. Um clique com
// utm_source=instagram&utm_medium=cpc é ANÚNCIO, não alcance orgânico de
// rede social — confundir os dois faria o corretor achar que o perfil
// dele está performando quando na verdade ele está pagando.
export function classificarCanal(atribuicao: Atribuicao | null | undefined): Canal {
  if (!atribuicao || !temAtribuicao(atribuicao)) return CANAIS.SEM_ATRIBUICAO;

  const { utmSource, utmMedium, referrerHost } = atribuicao;

  if (utmMedium && contemMarca(utmMedium, MEDIUMS_PAGOS)) return CANAIS.ANUNCIOS;

  const pista = utmSource ?? referrerHost;
  if (pista) {
    if (contemMarca(pista, MARCAS_SOCIAL)) return CANAIS.SOCIAL;
    if (contemMarca(pista, MARCAS_BUSCA)) return CANAIS.BUSCA;
  }

  if (utmMedium === "organic") return CANAIS.BUSCA;
  if (utmSource || referrerHost) return CANAIS.REFERENCIA;
  // Tem utm_campaign/content/term mas nenhuma pista de plataforma.
  return CANAIS.REFERENCIA;
}

export function rotuloCanal(canal: Canal): string {
  return LABEL_CANAL[canal] ?? LABEL_CANAL.SEM_ATRIBUICAO;
}
