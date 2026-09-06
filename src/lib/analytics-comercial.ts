import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import {
  formatarCodigoImovel,
  formatarLocalizacaoImovel,
  formatarNumero,
  formatarPercentualInteiro,
} from "@/lib/format";
import {
  ORIGENS_CAPTACAO,
  LABEL_ORIGEM_CAPTACAO,
  type OrigemCaptacao,
} from "@/lib/captacao";
import { inicioDoDiaUTC, fimDoDiaUTC } from "@/lib/scheduled-activity-date";
import { TIPOS_EVENTO_ANALYTICS } from "@/lib/analytics-eventos";
import { oportunidadeElegivel } from "@/lib/oportunidade";
import { agregarValorFechado, decimalParaValor } from "@/lib/valor-fechamento";
import { agregarComissao } from "@/lib/comissao";
import {
  agruparPorResponsavel,
  paraResponsavel,
  type LinhaResponsavel,
} from "@/lib/responsavel-negociacao";
import {
  classificarCanal,
  rotuloCanal,
  ORDEM_CANAIS,
  type Atribuicao,
  type Canal,
} from "@/lib/atribuicao";

// =======================================================================
// Analytics comercial (Fase 5) — primeira camada de análise de CAPTAÇÃO
// do easymob, calculada sob demanda a partir de eventos que o CRM já
// registra. Nenhuma tabela nova, nenhuma view materializada, nenhum
// cron/worker: só leitura agregada de Interaction/Property.
//
// -----------------------------------------------------------------------
// FONTE DE VERDADE — o que é um "contato comercial"
// -----------------------------------------------------------------------
// Auditoria dos QUATRO (e únicos) fluxos que criam Interaction hoje:
//
//   1. src/app/[orgSlug]/actions.ts  -> enviarContato
//      formulário público (página do imóvel ou /contato).
//      type=MESSAGE, memberId=null, origin=IMOVEL|CONTATO.
//   2. src/app/[orgSlug]/actions.ts  -> enviarAnuncioProprietario
//      formulário público /anuncie. type=MESSAGE, origin=ANUNCIE.
//   3. src/app/app/clientes/actions.ts -> registrarInteracao
//      registro MANUAL do corretor no painel. origin=null.
//   4. src/app/app/agendamentos/actions.ts -> concluir visita
//      atividade INTERNA da equipe. type=VISIT, origin=null.
//
// Só (1) e (2) são "o mercado procurando a imobiliária". (3) e (4) são a
// equipe registrando o próprio trabalho — contá-los como captação
// inflaria a métrica com o esforço interno, exatamente o erro que este
// dashboard existe para evitar.
//
// Logo:
//
//   CONTATO COMERCIAL := Interaction cuja `origin` pertence ao catálogo
//                        de ORIGENS_CAPTACAO (src/lib/captacao.ts).
//
// A regra é UMA só, mora aqui (whereContatoComercial / eOrigemComercial)
// e nunca é reescrita à mão em nenhuma página ou componente.
//
// -----------------------------------------------------------------------
// DADOS LEGADOS (origin = null) — por que ficam FORA, e não em "outros"
// -----------------------------------------------------------------------
// Interações anteriores à Fase 4 têm origin=null. Interações registradas
// à mão pelo corretor TAMBÉM têm origin=null, hoje e no futuro. As duas
// coisas são indistinguíveis no banco: não existe nenhum campo que separe
// "contato público antigo" de "nota interna de ontem" com segurança
// (memberId é null nas duas quando a sessão não tem organizationMemberId,
// e `type` não separa nada — MESSAGE é usado pelos dois lados).
//
// Por isso NÃO existe backfill, NÃO existe heurística por `notes`, e
// origin=null NÃO vira um balde "Sem origem" somado ao total: somar um
// conjunto que comprovadamente mistura captação com trabalho interno
// produziria um número errado com aparência de certo.
//
// O que existe é DIVULGAÇÃO: `interacoesSemOrigem` conta quantas
// interações do período ficaram de fora, e a tela diz isso em texto. O
// corretor nunca vê um total inexplicavelmente menor do que o histórico
// da ficha do cliente sugere.
//
// -----------------------------------------------------------------------
// PropertyInterest — auditado e DELIBERADAMENTE não usado aqui
// -----------------------------------------------------------------------
// Único ponto de criação em todo o produto: `relacionarImovel`
// (src/app/app/clientes/actions.ts) — o CORRETOR vinculando um imóvel à
// ficha de um cliente pelo painel. Nenhum formulário público cria
// PropertyInterest. Ou seja: é a intenção declarada da EQUIPE sobre uma
// negociação (e a projeção operacional disso já é o Pipeline), não um
// evento de demanda do mercado. Misturá-lo com contatos recebidos
// contaria o mesmo relacionamento duas vezes, com semânticas diferentes.
// Fica fora desta fase, por decisão, não por esquecimento.
//
// -----------------------------------------------------------------------
// Person.source vs Interaction.origin — nunca intercambiáveis
// -----------------------------------------------------------------------
// Person.source (LeadSource: WEBSITE, PORTAL, INSTAGRAM...) = o CANAL de
// aquisição daquela PESSOA, gravado uma vez. Interaction.origin = o
// CONTEXTO daquele EVENTO. A mesma pessoa (source=WEBSITE) pode gerar um
// contato pela página de um imóvel hoje e outro por /anuncie amanhã.
// Este módulo lê exclusivamente `origin`, e nunca escreve nem interpreta
// `source`.
//
// -----------------------------------------------------------------------
// TIMEZONE
// -----------------------------------------------------------------------
// O projeto inteiro trata datas na convenção UTC-literal (ver
// src/lib/scheduled-activity-date.ts e scheduled-activity-schema.ts:
// Organization ainda NÃO tem timezone configurável). Manter a mesma
// convenção aqui é o que garante que um contato e a visita dele caiam no
// mesmo "dia" nas duas telas. Todo bucket é fatiado com getUTC*/Date.UTC,
// nunca com getters locais — o resultado independe do TZ do processo
// Node (provado em analytics-comercial.test.ts sob UTC/São Paulo/Tóquio).
// Quando existir timezone por organização, este arquivo e
// scheduled-activity-date.ts mudam juntos.
// =======================================================================

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Ordem canônica do catálogo — usada só pra desempate estável quando dois
// origens têm a mesma contagem (a ordenação primária é por volume).
const ORDEM_ORIGENS: readonly OrigemCaptacao[] = [
  ORIGENS_CAPTACAO.IMOVEL,
  ORIGENS_CAPTACAO.CONTATO,
  ORIGENS_CAPTACAO.ANUNCIE,
];

// Filtro Prisma da definição acima, em um lugar só. `in` (não
// `not: null`): um valor fora do catálogo — gravado por uma versão futura
// e depois revertida, ou por um registro adulterado — não vira contato
// comercial só por ser diferente de null.
// Função (não constante compartilhada): cada chamada devolve um array
// novo e mutável — o `in` do Prisma não aceita `readonly`, e uma
// constante única correria o risco de ser mutada por um chamador.
export function whereContatoComercial(): { origin: { in: string[] } } {
  return { origin: { in: [...ORDEM_ORIGENS] } };
}

export function eOrigemComercial(origin: string | null | undefined): origin is OrigemCaptacao {
  return typeof origin === "string" && (ORDEM_ORIGENS as readonly string[]).includes(origin);
}

// -----------------------------------------------------------------------
// Período
// -----------------------------------------------------------------------
// "13s" (13 semanas = 91 dias) em vez de um "90d" solto DE PROPÓSITO: a
// série de um trimestre precisa ser semanal (90 pontos diários viram
// ruído ilegível), e 90 não é divisível por 7 — o último balde teria 6
// dias e desenharia uma queda que nunca existiu. 91 = 13 × 7 exatos:
// todo balde tem o mesmo peso, e a janela anterior (outros 91 dias) é
// exatamente comparável. O rótulo diz "13 semanas", nunca "90 dias".
export type PeriodoAnalytics = "7d" | "30d" | "13s";

export const PERIODOS_ANALYTICS_OPCOES: readonly PeriodoAnalytics[] = ["7d", "30d", "13s"];

export const PERIODO_ANALYTICS_LABEL: Record<PeriodoAnalytics, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "13s": "Últimas 13 semanas",
};

// Rótulo curto para o chip de filtro (o longo não cabe em 375px).
export const PERIODO_ANALYTICS_CHIP: Record<PeriodoAnalytics, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "13s": "13 semanas",
};

export const PERIODO_ANALYTICS_DIAS: Record<PeriodoAnalytics, number> = {
  "7d": 7,
  "30d": 30,
  "13s": 91,
};

export const PERIODO_ANALYTICS_PADRAO: PeriodoAnalytics = "30d";

// URL-driven, mesmo contrato de interpretarPeriodoPipeline: nunca confia
// no input cru, sempre cai em default seguro (30 dias).
export function interpretarPeriodoAnalytics(params: { periodo?: string }): PeriodoAnalytics {
  const bruto = (params.periodo ?? "").trim().toLowerCase();
  return (PERIODOS_ANALYTICS_OPCOES as readonly string[]).includes(bruto)
    ? (bruto as PeriodoAnalytics)
    : PERIODO_ANALYTICS_PADRAO;
}

export type JanelaAnalytics = { inicio: Date; fim: Date };
export type JanelasAnalytics = { dias: number; atual: JanelaAnalytics; anterior: JanelaAnalytics };

// Janela em DIAS CALENDÁRIO UTC fechados (não milissegundos rolantes como
// resolverIntervaloPeriodo do Pipeline): a série temporal precisa de
// baldes de dia inteiro, e uma janela rolante faria o primeiro balde
// nascer pela metade — um dia real apareceria menor do que foi só por
// causa da hora em que o corretor abriu a tela.
//
// O período ANTERIOR é a janela de MESMO comprimento imediatamente antes,
// colada (termina 1ms antes do início da atual) — nunca "o mês passado"
// nem nada de comprimento diferente. É isso que torna a comparação
// legítima.
//
// O último dia da janela atual é o dia de HOJE, ainda em curso — fato
// inerente a qualquer janela "até agora", e dito explicitamente na tela
// (ver AnalyticsPeriodoResumo).
export function resolverJanelasAnalytics(
  periodo: PeriodoAnalytics,
  agora: Date = new Date()
): JanelasAnalytics {
  const dias = PERIODO_ANALYTICS_DIAS[periodo];

  const fimAtual = fimDoDiaUTC(agora);
  const inicioAtual = inicioDoDiaUTC(new Date(agora.getTime() - (dias - 1) * MS_POR_DIA));

  const fimAnterior = new Date(inicioAtual.getTime() - 1);
  const inicioAnterior = new Date(inicioAtual.getTime() - dias * MS_POR_DIA);

  return {
    dias,
    atual: { inicio: inicioAtual, fim: fimAtual },
    anterior: { inicio: inicioAnterior, fim: fimAnterior },
  };
}

// -----------------------------------------------------------------------
// Comparação com o período anterior (e a divisão por zero)
// -----------------------------------------------------------------------
export type ComparacaoPeriodo = {
  atual: number;
  anterior: number;
  diferenca: number;
  // null = SEM BASE de comparação (período anterior em zero). Nunca
  // Infinity, nunca NaN, nunca 9999% — não existe "aumento percentual"
  // sobre zero, e fingir que existe é o jeito mais fácil de um dashboard
  // mentir.
  percentual: number | null;
};

export function compararComPeriodoAnterior(atual: number, anterior: number): ComparacaoPeriodo {
  return {
    atual,
    anterior,
    diferenca: atual - anterior,
    percentual: anterior === 0 ? null : ((atual - anterior) / anterior) * 100,
  };
}

export type DirecaoVariacao = "ALTA" | "BAIXA" | "ESTAVEL" | "SEM_BASE";

// Direção é derivada da DIFERENÇA ABSOLUTA, não do percentual: quando não
// há base (anterior=0) ainda dá pra dizer honestamente que subiu de 0
// para 5 — só não dá pra dizer "+500%".
export function direcaoVariacao(comparacao: ComparacaoPeriodo): DirecaoVariacao {
  if (comparacao.diferenca === 0) return "ESTAVEL";
  if (comparacao.percentual === null) return "SEM_BASE";
  return comparacao.diferenca > 0 ? "ALTA" : "BAIXA";
}

// Texto único da variação — nunca "+∞%", nunca "NaN%". Quando não há
// base, diz exatamente isso em português, e a diferença absoluta (que
// CONTINUA sendo verdade) aparece no lugar do percentual.
export function textoVariacao(comparacao: ComparacaoPeriodo): string {
  const direcao = direcaoVariacao(comparacao);
  if (direcao === "ESTAVEL") return "Sem variação vs. período anterior";
  if (direcao === "SEM_BASE") {
    const plural = Math.abs(comparacao.diferenca) === 1 ? "contato" : "contatos";
    return `${formatarNumero(comparacao.diferenca)} ${plural} — sem contatos no período anterior`;
  }
  return `${formatarPercentualInteiro(comparacao.percentual!)} vs. período anterior`;
}

// -----------------------------------------------------------------------
// Série temporal
// -----------------------------------------------------------------------
export type Granularidade = "DIA" | "SEMANA";

// 7 e 30 dias -> 7 e 30 pontos diários (legível). 13 semanas -> 13 pontos
// semanais, nunca 91 diários.
export function granularidadeDe(periodo: PeriodoAnalytics): Granularidade {
  return periodo === "13s" ? "SEMANA" : "DIA";
}

export type PontoSerie = {
  chave: string;
  // Eixo X do gráfico — curto de propósito (cabe em 375px).
  rotulo: string;
  // Alternativa textual da tabela acessível: intervalo por extenso.
  rotuloLongo: string;
  total: number;
};

function diaMesUTC(data: Date): string {
  return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

function diaMesAnoUTC(data: Date): string {
  return `${diaMesUTC(data)}/${data.getUTCFullYear()}`;
}

// Baldes SEMPRE materializados do primeiro ao último, inclusive os
// vazios: um dia sem contato é a informação "ninguém procurou nesta
// terça", não um ponto que some e faz segunda ligar direto em quarta
// como se fossem consecutivos.
export function construirSerie(
  eventos: readonly { occurredAt: Date }[],
  janela: JanelaAnalytics,
  granularidade: Granularidade
): PontoSerie[] {
  const diasPorBalde = granularidade === "SEMANA" ? 7 : 1;
  const totalDias = Math.round((janela.fim.getTime() + 1 - janela.inicio.getTime()) / MS_POR_DIA);
  const quantidadeBaldes = Math.ceil(totalDias / diasPorBalde);

  const pontos: PontoSerie[] = [];
  for (let i = 0; i < quantidadeBaldes; i++) {
    const inicioBalde = new Date(janela.inicio.getTime() + i * diasPorBalde * MS_POR_DIA);
    const fimBalde = new Date(inicioBalde.getTime() + (diasPorBalde - 1) * MS_POR_DIA);
    pontos.push({
      chave: inicioBalde.toISOString().slice(0, 10),
      rotulo: diaMesUTC(inicioBalde),
      rotuloLongo:
        diasPorBalde === 1
          ? diaMesAnoUTC(inicioBalde)
          : `${diaMesUTC(inicioBalde)} a ${diaMesUTC(fimBalde)}`,
      total: 0,
    });
  }

  for (const evento of eventos) {
    const deslocamentoDias = Math.floor(
      (evento.occurredAt.getTime() - janela.inicio.getTime()) / MS_POR_DIA
    );
    // Defensivo: um evento fora da janela (nunca deveria chegar aqui, o
    // WHERE já filtra) é ignorado em vez de estourar o array.
    if (deslocamentoDias < 0) continue;
    const indice = Math.floor(deslocamentoDias / diasPorBalde);
    if (indice >= pontos.length) continue;
    pontos[indice].total += 1;
  }

  return pontos;
}

// -----------------------------------------------------------------------
// Distribuição por origem
// -----------------------------------------------------------------------
export type ItemOrigem = {
  origem: OrigemCaptacao;
  rotulo: string;
  total: number;
  percentual: number;
};

// Sempre devolve as TRÊS origens do catálogo, inclusive as zeradas: "0
// contatos pela página do imóvel" é um diagnóstico comercial, não uma
// linha que deve sumir da tela. Rótulos vêm de LABEL_ORIGEM_CAPTACAO —
// nenhuma string duplicada aqui.
export function distribuirPorOrigem(
  eventos: readonly { origin: string | null }[]
): ItemOrigem[] {
  const contagem = new Map<OrigemCaptacao, number>(ORDEM_ORIGENS.map((o) => [o, 0]));
  let total = 0;
  for (const evento of eventos) {
    if (!eOrigemComercial(evento.origin)) continue;
    contagem.set(evento.origin, (contagem.get(evento.origin) ?? 0) + 1);
    total += 1;
  }

  return ORDEM_ORIGENS.map((origem) => {
    const quantidade = contagem.get(origem) ?? 0;
    return {
      origem,
      rotulo: LABEL_ORIGEM_CAPTACAO[origem] ?? origem,
      total: quantidade,
      // total=0 -> 0%, nunca NaN (0/0).
      percentual: total === 0 ? 0 : (quantidade / total) * 100,
    };
  }).sort((a, b) => b.total - a.total || ORDEM_ORIGENS.indexOf(a.origem) - ORDEM_ORIGENS.indexOf(b.origem));
}

// -----------------------------------------------------------------------
// Contagens de distintos
// -----------------------------------------------------------------------
// 18 contatos NÃO são 18 pessoas: a mesma Person pode voltar várias vezes,
// e é justamente essa diferença que separa "movimento" de "demanda". Um
// único helper, usado para pessoas, imóveis e proprietários — nunca três
// loops parecidos espalhados.
export function contarDistintos<T>(
  itens: readonly T[],
  extrair: (item: T) => string | null | undefined
): number {
  const vistos = new Set<string>();
  for (const item of itens) {
    const chave = extrair(item);
    if (chave) vistos.add(chave);
  }
  return vistos.size;
}

export function contarContatosPorImovel(
  eventos: readonly { propertyId: string | null }[]
): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const evento of eventos) {
    if (!evento.propertyId) continue;
    contagem.set(evento.propertyId, (contagem.get(evento.propertyId) ?? 0) + 1);
  }
  return contagem;
}

export type LinhaMovimentoImovel = {
  propertyId: string;
  contatos: number;
  visualizacoes: number;
  cliquesWhatsapp: number;
};

// Ranking de MOVIMENTO do imóvel (Fase 6 — evolução do ranking da Fase 5,
// que ordenava só por contato).
//
// Por que passou a incluir imóvel com visualização e ZERO contato: esse é
// justamente o diagnóstico mais acionável que o funil digital
// desbloqueou. Um imóvel com 200 visualizações e nenhum contato é o
// anúncio que precisa de preço, foto ou texto novo — e no ranking antigo
// ele simplesmente não existia, porque a tabela só enxergava quem já
// tinha convertido.
//
// A ordem preserva a leitura da Fase 5: contato continua sendo o critério
// primário, então quem converteu aparece primeiro, como antes.
// Visualização só desempata e preenche as vagas restantes. Terceiro
// critério é o id, só pra a ordem ser determinística entre refreshes.
export function ranquearImoveisPorMovimento(
  contatos: ReadonlyMap<string, number>,
  eventos: ReadonlyMap<string, { visualizacoes: number; cliquesWhatsapp: number }>,
  teto: number
): LinhaMovimentoImovel[] {
  const ids = new Set<string>([...contatos.keys(), ...eventos.keys()]);
  return [...ids]
    .map((propertyId) => {
      const digitais = eventos.get(propertyId);
      return {
        propertyId,
        contatos: contatos.get(propertyId) ?? 0,
        visualizacoes: digitais?.visualizacoes ?? 0,
        cliquesWhatsapp: digitais?.cliquesWhatsapp ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.contatos - a.contatos ||
        b.visualizacoes - a.visualizacoes ||
        a.propertyId.localeCompare(b.propertyId)
    )
    .slice(0, teto);
}


// =======================================================================
// FUNIL DIGITAL (Fase 6) — VISUALIZAÇÃO -> INTENÇÃO -> CONTATO
// =======================================================================
// Três etapas, TRÊS fontes distintas e não sobrepostas:
//
//   Visualizações      PropertyAnalyticsEvent, type=PROPERTY_VIEW
//   Cliques WhatsApp   PropertyAnalyticsEvent, type=WHATSAPP_CLICK
//   Contatos do imóvel Interaction, origin=IMOVEL e propertyId != null
//
// -----------------------------------------------------------------------
// POR QUE NÃO É UM FUNIL LINEAR
// -----------------------------------------------------------------------
// Clicar no WhatsApp e enviar o formulário são CAMINHOS PARALELOS, não
// degraus consecutivos: quem clica no WhatsApp normalmente NÃO preenche
// o formulário, e vice-versa. Somar/encadear os dois como se fossem
// etapas de uma mesma escada produziria uma "taxa de conversão" que não
// significa nada. A tela mostra as três medidas lado a lado, cada uma
// com sua definição, e diz isso em texto.
//
// Um clique no WhatsApp TAMBÉM não prova conversa: ninguém, deste lado,
// sabe se a mensagem foi enviada. Por isso a métrica se chama "cliques
// no WhatsApp"/"intenção", nunca "leads pelo WhatsApp".
// =======================================================================

export type EtapaFunil = {
  chave: "VISUALIZACOES" | "WHATSAPP" | "CONTATOS";
  rotulo: string;
  // Frase curta que define a métrica na própria tela — nenhum número
  // aparece sem dizer o que ele conta.
  definicao: string;
  total: number;
};

// -----------------------------------------------------------------------
// A ÚNICA TAXA SEMANTICAMENTE DEFENSÁVEL DESTA FASE
// -----------------------------------------------------------------------
// Fórmula:
//
//   taxaContatoPorVisualizacao =
//       contatos com origin=IMOVEL e propertyId != null
//     / visualizações válidas de imóveis
//
// Numerador e denominador vivem no MESMO universo: ambos são eventos
// que nasceram na página de um imóvel. É por isso que o numerador NÃO é
// "todos os contatos": um contato com origin=CONTATO (página geral) ou
// origin=ANUNCIE (proprietário querendo anunciar) não nasceu de
// visualização de imóvel nenhuma, e incluí-lo inflaria a taxa com
// numerador que o denominador não cobre.
//
// Denominador zero -> null, nunca 0%. "0% de conversão" quando ninguém
// visitou o site é uma afirmação falsa sobre o desempenho do corretor;
// "—" é a verdade. Mesma regra já usada em compararComPeriodoAnterior.
export function calcularTaxa(numerador: number, denominador: number): number | null {
  if (denominador <= 0) return null;
  return (numerador / denominador) * 100;
}

// Percentual de taxa com 1 casa só quando ela agrega informação (2,4%),
// inteiro quando não (25%). Nunca "0,00%".
export function formatarTaxa(valor: number | null): string {
  if (valor === null) return "—";
  const casas = valor > 0 && valor < 10 ? 1 : 0;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(valor)}%`;
}

export type FunilDigital = {
  visualizacoes: ComparacaoPeriodo;
  cliquesWhatsapp: ComparacaoPeriodo;
  contatosDeImovel: ComparacaoPeriodo;
  taxaContatoPorVisualizacao: number | null;
  taxaWhatsappPorVisualizacao: number | null;
  etapas: EtapaFunil[];
  // true quando NÃO existe nenhum evento digital em toda a organização —
  // o que, logo após o deploy da Fase 6, é o estado normal e esperado.
  // A tela usa isso pra explicar que a medição começou agora, em vez de
  // mostrar zeros como se fossem desempenho ruim.
  semHistoricoDigital: boolean;
};

export type ContagemEventosImovel = { visualizacoes: number; cliquesWhatsapp: number };

// Agrega em memória, numa passada, a partir das linhas cruas já lidas —
// nunca uma query por imóvel (zero N+1).
export function agruparEventosPorImovel(
  eventos: readonly { propertyId: string; type: string }[]
): Map<string, ContagemEventosImovel> {
  const porImovel = new Map<string, ContagemEventosImovel>();
  for (const evento of eventos) {
    const atual = porImovel.get(evento.propertyId) ?? { visualizacoes: 0, cliquesWhatsapp: 0 };
    if (evento.type === TIPOS_EVENTO_ANALYTICS.PROPERTY_VIEW) atual.visualizacoes += 1;
    else if (evento.type === TIPOS_EVENTO_ANALYTICS.WHATSAPP_CLICK) atual.cliquesWhatsapp += 1;
    porImovel.set(evento.propertyId, atual);
  }
  return porImovel;
}

export function contarPorTipo(
  eventos: readonly { type: string }[],
  tipo: string
): number {
  let total = 0;
  for (const evento of eventos) if (evento.type === tipo) total += 1;
  return total;
}


// =======================================================================
// AQUISIÇÃO (Fase 7) — de ONDE vieram as visitas e os contatos
// =======================================================================
// Dimensão diferente de "Origem dos contatos" (que é CONTEXTO comercial:
// IMOVEL/CONTATO/ANUNCIE). Por isso a tela usa outro título — "Canal de
// aquisição" — e nunca reaproveita o rótulo antigo: são duas perguntas
// distintas sobre o mesmo contato, e confundi-las tornaria as duas
// inúteis.
//
// O canal é DERIVADO na leitura (classificarCanal), nunca gravado. Os
// campos estruturados (utm_* e referrerHost) são a fonte de verdade.
// =======================================================================

export type LinhaCanal = {
  canal: Canal;
  rotulo: string;
  visualizacoes: number;
  contatos: number;
  percentualVisualizacoes: number;
  // Fase 8 — resultado comercial atribuível. Contadas SÓ as oportunidades
  // com sourceInteractionId (criadas explicitamente a partir de um
  // contato); as manuais não têm origem e caem em SEM_ATRIBUICAO, que é a
  // verdade, não uma lacuna.
  oportunidades: number;
  fechamentos: number;
  // Fase 9 — soma dos ganhos DESTE canal que têm valor registrado.
  // Ganho sem valor entra em `fechamentos` mas não aqui: contá-lo como 0
  // afirmaria que o negócio valeu zero.
  valorFechado: number;
  // Fase 10 — mesma regra para a comissão: só soma o que foi registrado.
  comissao: number;
};

// Agrupa qualquer coleção com atribuição por canal. Uma passada, em
// memória, sobre linhas que já foram lidas para outros fins — nenhuma
// query adicional, nenhum N+1.
export function agruparPorCanal(
  eventos: readonly (Atribuicao & { type: string })[],
  interacoes: readonly Atribuicao[],
  // Fase 8 — cada oportunidade traz a atribuição da interação que a
  // originou (via sourceInteraction), ou null quando foi criada
  // manualmente pelo corretor.
  oportunidades: readonly {
    atribuicao: Atribuicao | null;
    fechada: boolean;
    closedValue?: number | null;
    commissionValue?: number | null;
  }[] = []
): LinhaCanal[] {
  const porCanal = new Map<
    Canal,
    {
      visualizacoes: number;
      contatos: number;
      oportunidades: number;
      fechamentos: number;
      valorFechado: number;
      comissao: number;
    }
  >(
    ORDEM_CANAIS.map((c) => [
      c,
      { visualizacoes: 0, contatos: 0, oportunidades: 0, fechamentos: 0, valorFechado: 0, comissao: 0 },
    ])
  );

  let totalVisualizacoes = 0;
  for (const evento of eventos) {
    if (evento.type !== TIPOS_EVENTO_ANALYTICS.PROPERTY_VIEW) continue;
    const canal = classificarCanal(evento);
    porCanal.get(canal)!.visualizacoes += 1;
    totalVisualizacoes += 1;
  }
  for (const interacao of interacoes) {
    porCanal.get(classificarCanal(interacao))!.contatos += 1;
  }
  for (const oportunidade of oportunidades) {
    const linha = porCanal.get(classificarCanal(oportunidade.atribuicao))!;
    linha.oportunidades += 1;
    if (oportunidade.fechada) {
      linha.fechamentos += 1;
      if (oportunidade.closedValue != null) linha.valorFechado += oportunidade.closedValue;
      if (oportunidade.commissionValue != null) linha.comissao += oportunidade.commissionValue;
    }
  }

  return ORDEM_CANAIS.map((canal) => {
    const dados = porCanal.get(canal)!;
    return {
      canal,
      rotulo: rotuloCanal(canal),
      visualizacoes: dados.visualizacoes,
      contatos: dados.contatos,
      oportunidades: dados.oportunidades,
      fechamentos: dados.fechamentos,
      // Centavos arredondados: somar floats de 2 casas acumula erro
      // binário e o total exibido precisa bater com a soma das linhas.
      valorFechado: Math.round(dados.valorFechado * 100) / 100,
      comissao: Math.round(dados.comissao * 100) / 100,
      // 0 quando não há visualização nenhuma — nunca NaN (0/0).
      percentualVisualizacoes:
        totalVisualizacoes === 0 ? 0 : (dados.visualizacoes / totalVisualizacoes) * 100,
    };
  })
    // Some as linhas totalmente vazias: mostrar seis canais em zero num
    // tenant novo é ruído, não diagnóstico. (Diferente da decomposição
    // por origem comercial, onde as 3 categorias são fixas e conhecidas.)
    .filter(
      (linha) =>
        linha.visualizacoes > 0 ||
        linha.contatos > 0 ||
        linha.oportunidades > 0 ||
        linha.fechamentos > 0 ||
        linha.valorFechado > 0 ||
        linha.comissao > 0
    );
}

export type LinhaCampanha = {
  campanha: string;
  visualizacoes: number;
  contatos: number;
  // Fase 9 — valor fechado atribuído a esta campanha. Só existe quando a
  // oportunidade nasceu de um contato que carregava a campanha.
  valorFechado: number;
  // Fase 10 — comissão registrada dos ganhos desta campanha.
  comissao: number;
};

const TETO_CAMPANHAS = 5;

// Campanhas com mais movimento. Somente LEITURA e agregação — esta fase
// não cria cadastro de campanha, CRUD nem integração com plataforma de
// anúncio. Ordena por visualização e depois por contato; desempate pelo
// nome mantém a ordem estável entre refreshes.
export function agruparPorCampanha(
  eventos: readonly (Atribuicao & { type: string })[],
  interacoes: readonly Atribuicao[],
  // Fase 9 — ganhos com a atribuição da interação de origem e o valor
  // fechado, quando houver.
  ganhos: readonly {
    atribuicao: Atribuicao | null;
    closedValue: number | null;
    commissionValue?: number | null;
  }[] = []
): LinhaCampanha[] {
  const porCampanha = new Map<
    string,
    { visualizacoes: number; contatos: number; valorFechado: number; comissao: number }
  >();
  const garantir = (nome: string) => {
    const atual =
      porCampanha.get(nome) ?? { visualizacoes: 0, contatos: 0, valorFechado: 0, comissao: 0 };
    porCampanha.set(nome, atual);
    return atual;
  };

  for (const evento of eventos) {
    if (!evento.utmCampaign) continue;
    if (evento.type !== TIPOS_EVENTO_ANALYTICS.PROPERTY_VIEW) continue;
    garantir(evento.utmCampaign).visualizacoes += 1;
  }
  for (const interacao of interacoes) {
    if (!interacao.utmCampaign) continue;
    garantir(interacao.utmCampaign).contatos += 1;
  }
  for (const ganho of ganhos) {
    const campanha = ganho.atribuicao?.utmCampaign;
    if (!campanha) continue;
    const linha = garantir(campanha);
    if (ganho.closedValue != null) linha.valorFechado += ganho.closedValue;
    if (ganho.commissionValue != null) linha.comissao += ganho.commissionValue;
  }

  return [...porCampanha.entries()]
    .map(([campanha, dados]) => ({
      campanha,
      ...dados,
      valorFechado: Math.round(dados.valorFechado * 100) / 100,
      comissao: Math.round(dados.comissao * 100) / 100,
    }))
    .sort(
      (a, b) =>
        b.visualizacoes - a.visualizacoes ||
        b.contatos - a.contatos ||
        a.campanha.localeCompare(b.campanha)
    )
    .slice(0, TETO_CAMPANHAS);
}

export type Aquisicao = {
  canais: LinhaCanal[];
  campanhas: LinhaCampanha[];
  // true quando NENHUM evento nem contato do período tem atribuição —
  // estado normal logo após o deploy desta fase, e para todo dado
  // histórico. A tela explica isso em vez de mostrar tudo zerado.
  semAtribuicao: boolean;
};


// =======================================================================
// RESULTADO COMERCIAL (Fase 8) — CONTATO -> OPORTUNIDADE -> FECHAMENTO
// =======================================================================
// Fontes de verdade, cada etapa com a sua e nenhuma inventada:
//
//   Oportunidade   PropertyInterest (criado pelo corretor)
//   Fechamento     PropertyInterest.stage = WON com closedAt preenchido
//                  — evento atômico, com PropertyInterestStageHistory
//   Origem         PropertyInterest.sourceInteractionId -> Interaction
//                  (só quando a oportunidade nasceu de um contato)
//
// O QUE ESTA FASE SE RECUSOU A MEDIR, e por quê:
//
//   RECEITA e COMISSÃO. O model `Deal` existe no schema com finalValue e
//   commission, mas é CÓDIGO MORTO: nenhum fluxo do produto jamais cria
//   um Deal (auditado — zero `.deal.create` em src/, nem nas fixtures).
//   PropertyInterest não tem campo de valor. Property.price é PREÇO
//   ANUNCIADO, que não é valor fechado nem receita da imobiliária.
//   Chamar preço de receita seria inventar dinheiro que o sistema nunca
//   observou, então nenhuma métrica de receita existe aqui.
//
//   Property.status = SOLD também NÃO é usado como fechamento: ele diz
//   que o imóvel saiu do mercado, não qual cliente comprou, qual
//   negociação venceu, nem por qual canal — atribuir venda a partir dele
//   seria adivinhação.
// =======================================================================

export type ResultadoComercial = {
  // Oportunidades criadas no período (todas, com origem ou sem).
  oportunidadesCriadas: number;
  // Delas, quantas nasceram explicitamente de um contato do site.
  oportunidadesComOrigem: number;
  // Fechadas como GANHAS no período (closedAt na janela).
  fechamentosGanhos: number;
  // Encerradas como perdidas no período — contexto honesto para o número
  // acima; sem isso, "3 ganhos" não diz se foram 3 de 4 ou 3 de 40.
  fechamentosPerdidos: number;
  // Dos contatos ELEGÍVEIS deste período (origin=IMOVEL com imóvel),
  // quantos viraram oportunidade — coorte, não mistura de janelas.
  contatosElegiveis: number;
  contatosQueViraramOportunidade: number;
  taxaContatoParaOportunidade: number | null;
  taxaOportunidadeParaGanho: number | null;
  // Fase 9 — resultado financeiro dos ganhos do período.
  //   valorFechado    soma dos ganhos COM valor registrado
  //   ticketMedio     valorFechado / ganhos COM valor (nunca / todos os
  //                   ganhos, nem / todas as oportunidades); null quando
  //                   não há nenhum ganho com valor — jamais R$ 0
  //   ganhosSemValor  ganhos anteriores a esta fase, ou fechados sem
  //                   valor. Contados como ganho, excluídos do dinheiro,
  //                   e declarados na tela.
  valorFechado: number;
  ticketMedio: number | null;
  ganhosComValor: number;
  ganhosSemValor: number;
  // Fase 10 — comissão REGISTRADA (nunca "receita": sem split no
  // domínio, este é o valor do negócio, não o que fica com a operação).
  //   comissaoTotal        soma das comissões informadas
  //   comissaoMedia        total ÷ ganhos COM comissão; null se nenhum
  //   comissaoEfetiva      comissão ÷ valor fechado, só nos negócios em
  //                        que os DOIS são conhecidos; null se nenhum
  //   ganhosSemComissao    ganhos sem comissão informada, declarados
  comissaoTotal: number;
  comissaoMedia: number | null;
  comissaoEfetiva: number | null;
  ganhosSemComissao: number;
  // true enquanto NENHUMA oportunidade da organização tiver origem —
  // estado normal logo após o deploy, já que o vínculo passa a existir
  // daqui pra frente e não houve backfill. A tela usa isso para explicar
  // que a coluna está vazia por ausência de medição, não por desempenho.
  semVinculoDeOrigem: boolean;
};

const TETO_TOP_IMOVEIS = 5;

export type ImovelMaisProcurado = {
  id: string;
  codigo: string;
  titulo: string;
  tipo: string;
  localizacao: string;
  contatos: number;
  // Fase 6 — métricas digitais do MESMO imóvel e do MESMO período.
  visualizacoes: number;
  cliquesWhatsapp: number;
  // contatos / visualizações daquele imóvel. null quando o imóvel não
  // teve visualização nenhuma no período: sem denominador não existe
  // taxa, e "0%" seria mentira.
  taxaConversao: number | null;
};

export type AnalyticsComercial = {
  periodo: PeriodoAnalytics;
  granularidade: Granularidade;
  janelas: JanelasAnalytics;
  contatos: ComparacaoPeriodo;
  pessoasDistintas: number;
  imoveisComContato: number;
  proprietariosAnunciando: number;
  // Divulgação de honestidade estatística — ver cabeçalho do arquivo.
  interacoesSemOrigem: number;
  serie: PontoSerie[];
  origens: ItemOrigem[];
  topImoveis: ImovelMaisProcurado[];
  funil: FunilDigital;
  aquisicao: Aquisicao;
  resultado: ResultadoComercial;
  // Fase 11 — uma linha por responsável de negociação, mais o balde
  // "Sem responsável". Vazio quando a organização não teve nenhuma
  // oportunidade criada nem fechada no período.
  responsaveis: LinhaResponsavel[];
  // true enquanto NENHUMA negociação da organização tiver responsável —
  // estado normal logo depois do deploy, já que ownership passa a existir
  // daqui pra frente e não houve backfill. A tela usa isso para explicar
  // o bloco vazio em vez de fingir que a equipe não produziu nada.
  semOwnership: boolean;
};

// -----------------------------------------------------------------------
// Agregado único da tela
// -----------------------------------------------------------------------
// 4 queries fixas (+1 cacheada de configurações), nunca por card e nunca
// por linha — zero N+1:
//
//   1. findMany dos contatos comerciais do período ATUAL, com apenas as 4
//      colunas escalares necessárias. É desta ÚNICA leitura que saem, em
//      uma passada de memória, a série temporal, a distribuição por
//      origem, as pessoas distintas, os imóveis distintos e o ranking.
//      Não é groupBy porque nenhum agrupamento por DIA é expressável no
//      groupBy do Prisma (exigiria date_trunc em SQL cru, que traria o
//      timezone do banco pra dentro de uma decisão que o produto já tomou
//      em UTC — ver seção TIMEZONE no topo). O volume é o de formulários
//      públicos de UMA imobiliária em até 91 dias: dezenas a centenas de
//      linhas, com 4 colunas escalares.
//   2. count do período ANTERIOR — só o número, nunca as linhas.
//   3. count das interações do período SEM origem — a divulgação.
//   4. findMany dos detalhes dos (no máximo) 5 imóveis do ranking, por
//      `id: { in: [...] }`. Uma query para os cinco, jamais uma por linha.
//
// organizationId explícito em TODAS elas, além do withOrganization —
// mesmo padrão defensivo em camadas do resto do projeto.
export async function buscarAnalyticsComercial(
  organizationId: string,
  opcoes: { periodo?: PeriodoAnalytics; agora?: Date } = {}
): Promise<AnalyticsComercial> {
  const periodo = opcoes.periodo ?? PERIODO_ANALYTICS_PADRAO;
  const janelas = resolverJanelasAnalytics(periodo, opcoes.agora ?? new Date());
  const granularidade = granularidadeDe(periodo);

  return withOrganization(organizationId, async () => {
    const [
      interacoes,
      contatosAnteriores,
      interacoesSemOrigem,
      eventosDigitais,
      eventosDigitaisAnteriores,
      totalEventosDigitaisOrg,
      oportunidadesCriadas,
      fechamentosDoPeriodo,
      algumaOportunidadeComOrigem,
      algumaNegociacaoComResponsavel,
      configContato,
    ] = await Promise.all([
      prisma.interaction.findMany({
        where: {
          organizationId,
          ...whereContatoComercial(),
          occurredAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim },
        },
        select: {
          // id: usado pela coorte da Fase 8 (quais destes contatos
          // viraram oportunidade) — nunca exposto na tela.
          id: true,
          occurredAt: true,
          origin: true,
          personId: true,
          propertyId: true,
          // Fase 7 — atribuição já vem nesta mesma leitura; nenhuma
          // query nova foi adicionada para o canal de aquisição.
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          utmContent: true,
          utmTerm: true,
          referrerHost: true,
        },
      }),
      prisma.interaction.count({
        where: {
          organizationId,
          ...whereContatoComercial(),
          occurredAt: { gte: janelas.anterior.inicio, lte: janelas.anterior.fim },
        },
      }),
      prisma.interaction.count({
        where: {
          organizationId,
          origin: null,
          occurredAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim },
        },
      }),
      // Fase 6 — eventos digitais do período atual. Uma leitura só, com
      // as 2 colunas necessárias: dela saem visualizações, cliques de
      // WhatsApp e o recorte por imóvel do ranking, tudo em memória.
      // Nunca uma query por imóvel (zero N+1).
      prisma.propertyAnalyticsEvent.findMany({
        where: {
          organizationId,
          occurredAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim },
        },
        select: {
          propertyId: true,
          type: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          utmContent: true,
          utmTerm: true,
          referrerHost: true,
        },
      }),
      // Período anterior: só as contagens por tipo, nunca as linhas.
      prisma.propertyAnalyticsEvent.groupBy({
        by: ["type"],
        where: {
          organizationId,
          occurredAt: { gte: janelas.anterior.inicio, lte: janelas.anterior.fim },
        },
        _count: { _all: true },
      }),
      // "Esta organização já tem QUALQUER evento digital?" — distingue
      // "ninguém acessou neste período" de "a medição começou agora e
      // não existe histórico", que é o estado logo após o deploy.
      // `take: 1` + select do id: nunca conta a tabela inteira.
      prisma.propertyAnalyticsEvent.findFirst({
        where: { organizationId },
        select: { id: true },
      }),
      // Fase 8 — oportunidades CRIADAS no período, com a atribuição da
      // interação de origem quando ela existir. `include` aninhado: uma
      // query só, nunca uma por oportunidade (zero N+1).
      prisma.propertyInterest.findMany({
        where: {
          organizationId,
          createdAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim },
        },
        select: {
          sourceInteractionId: true,
          sourceInteraction: {
            select: {
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
              utmContent: true,
              utmTerm: true,
              referrerHost: true,
            },
          },
          // Fase 11 — responsável no MESMO select (join batched), nunca
          // uma query por oportunidade.
          responsibleMember: {
            select: { id: true, status: true, organizationId: true, user: { select: { name: true } } },
          },
        },
      }),
      // Fechamentos do período — janela sobre closedAt (o instante real do
      // encerramento), nunca updatedAt, que muda em qualquer escrita.
      prisma.propertyInterest.findMany({
        where: {
          organizationId,
          closedAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim },
          stage: { in: ["WON", "REJECTED"] },
        },
        select: {
          stage: true,
          closedValue: true,
          commissionValue: true,
          // Fase 11 — mesmo join batched do bloco de oportunidades.
          responsibleMember: {
            select: { id: true, status: true, organizationId: true, user: { select: { name: true } } },
          },
          sourceInteraction: {
            select: {
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
              utmContent: true,
              utmTerm: true,
              referrerHost: true,
            },
          },
        },
      }),
      // "Esta organização já tem ALGUMA oportunidade com origem?" —
      // distingue "medimos e deu zero" de "o vínculo ainda não existe
      // para nenhuma oportunidade". take implícito de findFirst.
      prisma.propertyInterest.findFirst({
        where: { organizationId, sourceInteractionId: { not: null } },
        select: { id: true },
      }),
      // Fase 11 — mesma pergunta, para ownership: "esta organização já
      // tem ALGUMA negociação com responsável?". Distingue "medimos e a
      // equipe não produziu" de "o vínculo ainda não existe para
      // ninguém" (estado normal logo após o deploy, sem backfill).
      prisma.propertyInterest.findFirst({
        where: { organizationId, responsibleMemberId: { not: null } },
        select: { id: true },
      }),
      buscarConfiguracaoContato(organizationId),
    ]);

    const contagemPorImovel = contarContatosPorImovel(interacoes);
    const eventosPorImovel = agruparEventosPorImovel(eventosDigitais);
    const ranking = ranquearImoveisPorMovimento(
      contagemPorImovel,
      eventosPorImovel,
      TETO_TOP_IMOVEIS
    );

    // Detalhes só dos que entraram no ranking. `in: []` nunca chega aqui:
    // sem ranking, a query inteira é pulada.
    const detalhes = ranking.length
      ? await prisma.property.findMany({
          where: { organizationId, id: { in: ranking.map((r) => r.propertyId) } },
          select: {
            id: true,
            code: true,
            title: true,
            type: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        })
      : [];
    const detalhePorId = new Map(detalhes.map((d) => [d.id, d]));

    // ---- Funil digital (Fase 6) --------------------------------------
    const visualizacoes = contarPorTipo(eventosDigitais, TIPOS_EVENTO_ANALYTICS.PROPERTY_VIEW);
    const cliquesWhatsapp = contarPorTipo(eventosDigitais, TIPOS_EVENTO_ANALYTICS.WHATSAPP_CLICK);

    const anterioresPorTipo = new Map(
      eventosDigitaisAnteriores.map((linha) => [linha.type, linha._count._all])
    );

    // Numerador da taxa: SÓ contatos que nasceram na página de um imóvel
    // (origin=IMOVEL e propertyId preenchido) — o mesmo universo do
    // denominador. Contato geral e "anuncie" ficam de fora de propósito.
    const contatosDeImovelAtual = interacoes.filter(
      (i) => i.origin === ORIGENS_CAPTACAO.IMOVEL && i.propertyId !== null
    ).length;

    const funil: FunilDigital = {
      visualizacoes: compararComPeriodoAnterior(
        visualizacoes,
        anterioresPorTipo.get(TIPOS_EVENTO_ANALYTICS.PROPERTY_VIEW) ?? 0
      ),
      cliquesWhatsapp: compararComPeriodoAnterior(
        cliquesWhatsapp,
        anterioresPorTipo.get(TIPOS_EVENTO_ANALYTICS.WHATSAPP_CLICK) ?? 0
      ),
      // Sem comparação com o período anterior aqui: o número já é
      // recortado de `interacoes`, e buscar a janela anterior custaria
      // mais uma query só pra alimentar um segundo delta que a tela não
      // mostra. `anterior: 0` seria mentira, então repete o atual — o
      // componente nunca lê a variação desta etapa.
      contatosDeImovel: compararComPeriodoAnterior(contatosDeImovelAtual, contatosDeImovelAtual),
      taxaContatoPorVisualizacao: calcularTaxa(contatosDeImovelAtual, visualizacoes),
      taxaWhatsappPorVisualizacao: calcularTaxa(cliquesWhatsapp, visualizacoes),
      etapas: [
        {
          chave: "VISUALIZACOES",
          rotulo: "Visualizações",
          definicao: "Páginas de imóvel abertas no navegador",
          total: visualizacoes,
        },
        {
          chave: "WHATSAPP",
          rotulo: "Cliques no WhatsApp",
          definicao: "Intenção de conversa — não confirma mensagem enviada",
          total: cliquesWhatsapp,
        },
        {
          chave: "CONTATOS",
          rotulo: "Contatos pelo imóvel",
          definicao: "Formulário da página do imóvel registrado no CRM",
          total: contatosDeImovelAtual,
        },
      ],
      semHistoricoDigital: totalEventosDigitaisOrg === null,
    };

    // ---- Resultado comercial (Fase 8) --------------------------------
    // Coorte: dos contatos ELEGÍVEIS deste período (origin=IMOVEL com
    // imóvel — os únicos que podem virar oportunidade), quantos de fato
    // viraram. Numerador e denominador falam do MESMO conjunto de
    // contatos, em vez de cruzar duas janelas diferentes.
    const idsContatosElegiveis = new Set(
      interacoes.filter((i) => oportunidadeElegivel(i)).map((i) => i.id)
    );
    const contatosQueViraramOportunidade = contarDistintos(
      oportunidadesCriadas.filter(
        (o) => o.sourceInteractionId !== null && idsContatosElegiveis.has(o.sourceInteractionId)
      ),
      (o) => o.sourceInteractionId
    );

    const ganhos = fechamentosDoPeriodo.filter((f) => f.stage === "WON");
    // Decimal -> número, preservando null (nunca 0) para não confundir
    // "sem valor registrado" com "valeu zero".
    const ganhosComValorNumerico = ganhos.map((g) => ({
      atribuicao: g.sourceInteraction,
      closedValue: decimalParaValor(g.closedValue),
      commissionValue: decimalParaValor(g.commissionValue),
    }));
    const agregadoFinanceiro = agregarValorFechado(ganhosComValorNumerico);
    const agregadoComissao = agregarComissao(ganhosComValorNumerico);
    const oportunidadesComOrigem = oportunidadesCriadas.filter(
      (o) => o.sourceInteractionId !== null
    ).length;

    const resultado: ResultadoComercial = {
      oportunidadesCriadas: oportunidadesCriadas.length,
      oportunidadesComOrigem,
      fechamentosGanhos: ganhos.length,
      fechamentosPerdidos: fechamentosDoPeriodo.length - ganhos.length,
      contatosElegiveis: idsContatosElegiveis.size,
      contatosQueViraramOportunidade,
      taxaContatoParaOportunidade: calcularTaxa(
        contatosQueViraramOportunidade,
        idsContatosElegiveis.size
      ),
      taxaOportunidadeParaGanho: calcularTaxa(ganhos.length, oportunidadesCriadas.length),
      valorFechado: agregadoFinanceiro.total,
      ticketMedio: agregadoFinanceiro.ticketMedio,
      ganhosComValor: agregadoFinanceiro.ganhosComValor,
      ganhosSemValor: agregadoFinanceiro.ganhosSemValor,
      comissaoTotal: agregadoComissao.total,
      comissaoMedia: agregadoComissao.comissaoMedia,
      comissaoEfetiva: agregadoComissao.comissaoEfetiva,
      ganhosSemComissao: agregadoComissao.ganhosSemComissao,
      semVinculoDeOrigem: algumaOportunidadeComOrigem === null,
    };

    // ---- Aquisição (Fase 7 + resultado da Fase 8) --------------------
    // Reaproveita as MESMAS linhas já lidas acima — zero query nova.
    const oportunidadesPorCanal = [
      ...oportunidadesCriadas.map((o) => ({ atribuicao: o.sourceInteraction, fechada: false })),
      // Fechamento entra como linha própria porque a janela dele é
      // closedAt: uma oportunidade criada no mês passado e ganha agora
      // conta como fechamento DESTE período, mesmo não sendo criação
      // deste período.
      ...ganhosComValorNumerico.map((f) => ({
        atribuicao: f.atribuicao,
        fechada: true,
        closedValue: f.closedValue,
        commissionValue: f.commissionValue,
      })),
    ];
    // ---- Performance por responsável (Fase 11) -----------------------
    // Reaproveita as DUAS coleções já carregadas acima — nenhuma query
    // nova, nenhuma query por responsável. As coortes seguem separadas:
    // `oportunidadesCriadas` é a janela de createdAt, `fechamentosDoPeriodo`
    // é a de closedAt, e agruparPorResponsavel nunca divide uma pela outra.
    const responsaveis = agruparPorResponsavel(
      oportunidadesCriadas.map((o) => ({
        responsavel: paraResponsavel(o.responsibleMember, organizationId),
      })),
      fechamentosDoPeriodo.map((f) => ({
        responsavel: paraResponsavel(f.responsibleMember, organizationId),
        ganho: f.stage === "WON",
        closedValue: decimalParaValor(f.closedValue),
        commissionValue: decimalParaValor(f.commissionValue),
      }))
    );

    const canais = agruparPorCanal(eventosDigitais, interacoes, oportunidadesPorCanal);
    const campanhas = agruparPorCampanha(eventosDigitais, interacoes, ganhosComValorNumerico);
    const aquisicao: Aquisicao = {
      canais,
      campanhas,
      semAtribuicao: canais.every((c) => c.canal === "SEM_ATRIBUICAO"),
    };

    const topImoveis: ImovelMaisProcurado[] = ranking.flatMap((linha) => {
      const detalhe = detalhePorId.get(linha.propertyId);
      // Imóvel apagado entre a interação e agora (Interaction.propertyId é
      // SET NULL na exclusão, mas a corrida existe): sai do ranking em
      // silêncio, nunca vira uma linha "undefined" na tela.
      if (!detalhe) return [];
      return [
        {
          id: detalhe.id,
          codigo: formatarCodigoImovel(detalhe.code, configContato.codigoImovelPrefixo),
          titulo: detalhe.title,
          tipo: detalhe.type,
          localizacao: formatarLocalizacaoImovel(detalhe.neighborhood, detalhe.city, detalhe.state),
          contatos: linha.contatos,
          visualizacoes: linha.visualizacoes,
          cliquesWhatsapp: linha.cliquesWhatsapp,
          // Imóvel sem visualização no período (ex.: contato veio antes
          // do tracking existir) -> null, nunca 0%.
          taxaConversao: calcularTaxa(linha.contatos, linha.visualizacoes),
        },
      ];
    });

    return {
      periodo,
      granularidade,
      janelas,
      contatos: compararComPeriodoAnterior(interacoes.length, contatosAnteriores),
      pessoasDistintas: contarDistintos(interacoes, (e) => e.personId),
      imoveisComContato: contagemPorImovel.size,
      // Pessoas distintas com pelo menos um contato de ANUNCIE. Distinto
      // por personId de propósito: um proprietário que mandou três
      // imóveis é UM proprietário interessado, não três. Ele também pode
      // estar contado em `pessoasDistintas` (a mesma Person pode ser LEAD
      // e OWNER) — são dois recortes diferentes do mesmo período, nunca
      // parcelas de uma soma.
      proprietariosAnunciando: contarDistintos(
        interacoes.filter((e) => e.origin === ORIGENS_CAPTACAO.ANUNCIE),
        (e) => e.personId
      ),
      interacoesSemOrigem,
      serie: construirSerie(interacoes, janelas.atual, granularidade),
      origens: distribuirPorOrigem(interacoes),
      topImoveis,
      funil,
      aquisicao,
      resultado,
      responsaveis,
      semOwnership: algumaNegociacaoComResponsavel === null,
    };
  });
}
