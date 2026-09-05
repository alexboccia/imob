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

// Ordena por volume e corta no teto — desempate por id só pra a ordem ser
// determinística entre execuções (dois imóveis com 3 contatos cada nunca
// trocam de lugar a cada refresh).
export function ranquearImoveis(
  contagem: ReadonlyMap<string, number>,
  teto: number
): { propertyId: string; contatos: number }[] {
  return [...contagem.entries()]
    .map(([propertyId, contatos]) => ({ propertyId, contatos }))
    .sort((a, b) => b.contatos - a.contatos || a.propertyId.localeCompare(b.propertyId))
    .slice(0, teto);
}

const TETO_TOP_IMOVEIS = 5;

export type ImovelMaisProcurado = {
  id: string;
  codigo: string;
  titulo: string;
  tipo: string;
  localizacao: string;
  contatos: number;
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
    const [eventos, contatosAnteriores, interacoesSemOrigem, configContato] = await Promise.all([
      prisma.interaction.findMany({
        where: {
          organizationId,
          ...whereContatoComercial(),
          occurredAt: { gte: janelas.atual.inicio, lte: janelas.atual.fim },
        },
        select: { occurredAt: true, origin: true, personId: true, propertyId: true },
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
      buscarConfiguracaoContato(organizationId),
    ]);

    const contagemPorImovel = contarContatosPorImovel(eventos);
    const ranking = ranquearImoveis(contagemPorImovel, TETO_TOP_IMOVEIS);

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
        },
      ];
    });

    return {
      periodo,
      granularidade,
      janelas,
      contatos: compararComPeriodoAnterior(eventos.length, contatosAnteriores),
      pessoasDistintas: contarDistintos(eventos, (e) => e.personId),
      imoveisComContato: contagemPorImovel.size,
      // Pessoas distintas com pelo menos um contato de ANUNCIE. Distinto
      // por personId de propósito: um proprietário que mandou três
      // imóveis é UM proprietário interessado, não três. Ele também pode
      // estar contado em `pessoasDistintas` (a mesma Person pode ser LEAD
      // e OWNER) — são dois recortes diferentes do mesmo período, nunca
      // parcelas de uma soma.
      proprietariosAnunciando: contarDistintos(
        eventos.filter((e) => e.origin === ORIGENS_CAPTACAO.ANUNCIE),
        (e) => e.personId
      ),
      interacoesSemOrigem,
      serie: construirSerie(eventos, janelas.atual, granularidade),
      origens: distribuirPorOrigem(eventos),
      topImoveis,
    };
  });
}
