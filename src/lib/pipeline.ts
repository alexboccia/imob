import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { normalizarBusca, PAGE_SIZE_PADRAO } from "@/lib/pagination";
import { ESTAGIOS_INTERESSE, estagioInteresseEncerrado } from "@/lib/property-interest-schema";
import { obterProximaAcaoComercial, type ProximaAcaoComercial } from "@/lib/proxima-acao-comercial";
import { acaoOperacionalDaVisita } from "@/lib/scheduled-activity-date";
import type { Prisma, PropertyInterestStage, PropertyStatus } from "@/generated/prisma/client";

// Pipeline (Fase P.4) — projeção operacional de PropertyInterest, NUNCA uma
// segunda fonte de verdade: nenhuma tabela nova, nenhum campo persistido
// novo, nenhum estado paralelo a PropertyInterest.stage (fonte oficial
// desde a P.1). Deal e Person.pipelineStage continuam intocados e fora do
// caminho de leitura/escrita deste arquivo (dívidas arquiteturais já
// documentadas, não resolvidas silenciosamente aqui).

export type ColunaAberta = (typeof ESTAGIOS_INTERESSE)[number];
export const COLUNAS_ABERTAS = ESTAGIOS_INTERESSE;

export type ItemPipeline = {
  id: string;
  stage: PropertyInterestStage;
  closedAtISO: string | null;
  // Só usado como critério de DESEMPATE interno de ordenação (grupo "sem
  // visita" de ordenarColuna) — NUNCA exibido como "há X dias nesta
  // etapa". O schema atual não registra quando o stage mudou pela última
  // vez (só updatedAt, que muda em QUALQUER escrita — stage, notes,
  // favorited), então "tempo na etapa" não é um dado que a P.4 pode
  // apresentar corretamente. Limitação documentada, não contornada.
  updatedAtISO: string;
  // null só na anomalia de dado cross-tenant (FK simples de
  // PropertyInterest pra Person/Property, sem composição com
  // organizationId — mesmo achado do P.1/P.3): a linha continua
  // aparecendo (é legitimamente desta organização), só a relação anômala
  // é redigida, nunca vaza nome/título de outro tenant.
  person: { id: string; name: string } | null;
  property: { id: string; title: string; status: PropertyStatus } | null;
  proximaVisita: { id: string; scheduledAtISO: string } | null;
  // null quando property foi redigido acima (sem status pra calcular) —
  // nunca inferido/adivinhado.
  proximaAcao: ProximaAcaoComercial | null;
  // Fase P.6: texto curto de aging (ex: "Na etapa há 3 dias"), derivado de
  // PropertyInterestStageHistory — NUNCA de updatedAt. null quando não há
  // histórico (registro anterior à P.6, fundação sem backfill — aging
  // "indisponível" é semanticamente correto aqui, nunca uma origem
  // inventada) OU quando o stage atual é encerrado (WON/REJECTED usam
  // closedAtISO como data de referência, ver FechamentoInteresse).
  aging: string | null;
};

function selectItemPipeline(organizationId: string) {
  return {
    id: true,
    stage: true,
    closedAt: true,
    updatedAt: true,
    person: { select: { id: true, name: true, organizationId: true } },
    property: { select: { id: true, title: true, status: true, organizationId: true } },
    // organizationId explícito no where da relação — mesma defesa de
    // clientes/[id]/page.tsx e imoveis/[id]/page.tsx (H.2/P.2): mesmo sob
    // uma ScheduledActivity anômala (organizationId de outro tenant
    // apontando propertyInterestId pra uma linha desta organização, algo
    // que nenhum caminho da aplicação cria mas que a FK simples não
    // impede no banco), ela nunca casa este filtro, nunca influencia o
    // card.
    scheduledActivities: {
      where: { organizationId, status: "SCHEDULED" as const },
      orderBy: { scheduledAt: "asc" as const },
      take: 1,
      select: { id: true, scheduledAt: true },
    },
    // Fase P.6: última transição de stage registrada, batched (mesmo
    // padrão de scheduledActivities acima — uma única query extra pro
    // conjunto inteiro de cards, nunca uma por card). organizationId
    // explícito no where da relação, mesma defesa contra anomalia
    // cross-tenant.
    stageHistory: {
      where: { organizationId },
      orderBy: { changedAt: "desc" as const },
      take: 1,
      select: { newStage: true, changedAt: true },
    },
  } satisfies Prisma.PropertyInterestSelect;
}

type LinhaBrutaPipeline = {
  id: string;
  stage: PropertyInterestStage;
  closedAt: Date | null;
  updatedAt: Date;
  person: { id: string; name: string; organizationId: string };
  property: { id: string; title: string; status: PropertyStatus; organizationId: string };
  scheduledActivities: { id: string; scheduledAt: Date }[];
  stageHistory: { newStage: PropertyInterestStage; changedAt: Date }[];
};

// Fase P.6: encontra, dentro do histórico já carregado, a transição mais
// recente cujo newStage bate com o stage ATUAL informado — nunca assume
// que "a última linha retornada pela query" já é a certa (defesa em
// profundidade: mesmo com a escrita atômica garantindo consistência em
// todo caminho de produto, esta função nunca confia cegamente num dado
// que não bate). Sem entrada correspondente -> null (sem histórico).
export function obterInicioStageAtual(
  stageAtual: PropertyInterestStage,
  historico: readonly { newStage: PropertyInterestStage; changedAtISO: string }[]
): string | null {
  let maisRecente: string | null = null;
  for (const entrada of historico) {
    if (entrada.newStage !== stageAtual) continue;
    if (maisRecente === null || entrada.changedAtISO > maisRecente) {
      maisRecente = entrada.changedAtISO;
    }
  }
  return maisRecente;
}

// `agora` sempre explícito (nunca `new Date()` implícito aqui dentro —
// mesmo racional de ordenarColuna/resolverIntervaloPeriodo, testabilidade
// determinística). null = sem início conhecido OU changedAt no futuro
// (nunca aging negativo — anomalia puramente defensiva, changedAt é
// sempre gravado como new Date() no servidor em todo caminho de escrita).
export function calcularAgingStageMs(inicioISO: string | null, agora: Date): number | null {
  if (inicioISO === null) return null;
  const diffMs = agora.getTime() - new Date(inicioISO).getTime();
  return diffMs < 0 ? null : diffMs;
}

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

// Granularidade grosseira de propósito (não polui o card): minutos nunca
// aparecem. < 1h -> texto fixo; < 1 dia -> horas inteiras; >= 1 dia ->
// dias inteiros, singular/plural tratado.
export function formatarAgingStage(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < HORA_MS) return "Na etapa há menos de 1h";
  if (ms < DIA_MS) return `Na etapa há ${Math.floor(ms / HORA_MS)}h`;
  const dias = Math.floor(ms / DIA_MS);
  return `Na etapa há ${dias} dia${dias === 1 ? "" : "s"}`;
}

// Mapeamento puro (sem Prisma/I-O) — testável isoladamente, mesmo espírito
// de paraItemAgenda (src/lib/agenda.ts). Reaproveita obterProximaAcaoComercial
// direto, nunca reimplementa a lógica de próxima ação.
export function paraItemPipeline(
  linha: LinhaBrutaPipeline,
  organizationId: string,
  agora: Date = new Date()
): ItemPipeline {
  const person =
    linha.person.organizationId === organizationId
      ? { id: linha.person.id, name: linha.person.name }
      : null;
  const property =
    linha.property.organizationId === organizationId
      ? { id: linha.property.id, title: linha.property.title, status: linha.property.status }
      : null;
  const proximaVisita = linha.scheduledActivities[0]
    ? {
        id: linha.scheduledActivities[0].id,
        scheduledAtISO: linha.scheduledActivities[0].scheduledAt.toISOString(),
      }
    : null;

  // Fase P.6: aging nunca calculado pra estágios encerrados (WON/REJECTED
  // já têm closedAtISO como data de referência oficial — não substituir).
  const inicioStageAtual = estagioInteresseEncerrado(linha.stage)
    ? null
    : obterInicioStageAtual(
        linha.stage,
        linha.stageHistory.map((h) => ({ newStage: h.newStage, changedAtISO: h.changedAt.toISOString() }))
      );

  return {
    id: linha.id,
    stage: linha.stage,
    closedAtISO: linha.closedAt ? linha.closedAt.toISOString() : null,
    updatedAtISO: linha.updatedAt.toISOString(),
    person,
    property,
    proximaVisita,
    proximaAcao: property ? obterProximaAcaoComercial(linha.stage, property.status) : null,
    aging: formatarAgingStage(calcularAgingStageMs(inicioStageAtual, agora)),
  };
}

// Agrupa por coluna aberta — qualquer stage fora das 4 colunas (WON,
// REJECTED, ou um valor futuro do enum ainda não mapeado) é
// SILENCIOSAMENTE excluído, nunca lançado numa coluna por engano. É essa
// checagem (não o caller) que garante WON/REJECTED nunca aparecerem nas
// colunas abertas, mesmo que a lista de entrada não tenha sido
// pré-filtrada pela query.
export function agruparPorColuna(itens: readonly ItemPipeline[]): Record<ColunaAberta, ItemPipeline[]> {
  const grupos = Object.fromEntries(COLUNAS_ABERTAS.map((c) => [c, [] as ItemPipeline[]])) as Record<
    ColunaAberta,
    ItemPipeline[]
  >;
  for (const item of itens) {
    if ((COLUNAS_ABERTAS as readonly string[]).includes(item.stage)) {
      grupos[item.stage as ColunaAberta].push(item);
    }
  }
  return grupos;
}

// Prioridade de ordenação dentro de uma coluna (seção 13 do pedido da
// P.4): grupo 0 = pendência operacional real (visita SCHEDULED cujo dia
// já passou sem resultado registrado — mesmo conceito de
// acaoOperacionalDaVisita === "RESOLVER_PENDENCIA", H.7, reaproveitado
// sem reimplementar); grupo 1 = tem próxima visita futura, ordenado pela
// mais próxima primeiro; grupo 2 = sem nenhuma visita agendada, usando
// updatedAt só como desempate determinístico (mais antigo primeiro) —
// NUNCA apresentado como "tempo na etapa" (ver comentário de
// ItemPipeline.updatedAtISO).
function chavePrioridade(item: ItemPipeline, agora: Date): readonly [number, number] {
  if (item.proximaVisita) {
    const scheduledAt = new Date(item.proximaVisita.scheduledAtISO);
    const acao = acaoOperacionalDaVisita({ status: "SCHEDULED", scheduledAt }, agora);
    const grupo = acao === "RESOLVER_PENDENCIA" ? 0 : 1;
    return [grupo, scheduledAt.getTime()];
  }
  return [2, new Date(item.updatedAtISO).getTime()];
}

export function ordenarColuna(itens: readonly ItemPipeline[], agora: Date = new Date()): ItemPipeline[] {
  return [...itens].sort((a, b) => {
    const [grupoA, tempoA] = chavePrioridade(a, agora);
    const [grupoB, tempoB] = chavePrioridade(b, agora);
    if (grupoA !== grupoB) return grupoA - grupoB;
    return tempoA - tempoB;
  });
}

// -----------------------------------------------------------------------
// Filtros URL-driven (mesmo padrão de interpretarFiltrosAgenda) — nunca
// confia em input cru, sempre cai em default seguro.
// -----------------------------------------------------------------------

export type VisaoPipeline = "ABERTA" | "ENCERRADA";
export type ResultadoPipeline = "TODOS" | "GANHO" | "PERDIDO";

export type FiltrosPipeline = {
  busca: string;
  visao: VisaoPipeline;
  resultado: ResultadoPipeline;
};

export function interpretarFiltrosPipeline(params: {
  q?: string;
  visao?: string;
  resultado?: string;
}): FiltrosPipeline {
  const busca = normalizarBusca(params.q);
  const visaoBruta = (params.visao ?? "").trim().toUpperCase();
  const visao: VisaoPipeline = visaoBruta === "ENCERRADA" ? "ENCERRADA" : "ABERTA";
  const resultadoBruto = (params.resultado ?? "").trim().toUpperCase();
  const resultado: ResultadoPipeline =
    resultadoBruto === "GANHO" || resultadoBruto === "PERDIDO" ? resultadoBruto : "TODOS";
  return { busca, visao, resultado };
}

// Busca por nome do cliente OU título do imóvel — mesma técnica de
// condicaoBusca em agenda.ts (ILIKE no banco, organizationId reconfirmado
// dentro da relação pra fechar o mesmo canal de vazamento indireto
// documentado lá).
function condicaoBusca(busca: string, organizationId: string): Prisma.PropertyInterestWhereInput {
  return {
    OR: [
      { person: { is: { organizationId, name: { contains: busca, mode: "insensitive" } } } },
      { property: { is: { organizationId, title: { contains: busca, mode: "insensitive" } } } },
    ],
  };
}

function combinarWhere(
  base: Prisma.PropertyInterestWhereInput,
  busca: string,
  organizationId: string
): Prisma.PropertyInterestWhereInput {
  if (!busca) return base;
  // organizationId repetido no nível de topo (mesmo racional de
  // combinarWhere em agenda.ts): a extensão de tenant-scoping de
  // src/lib/prisma.ts só reconhece organizationId como chave direta do
  // where, não aninhado dentro de um AND.
  return { organizationId, AND: [base, condicaoBusca(busca, organizationId)] };
}

// Teto defensivo da visão "Em andamento" — mesmo racional de
// LIMITE_PROXIMAS (agenda.ts): V1 sem paginação real nesta visão (um board
// Kanban paginado não faz sentido), mas nunca sem limite algum. Se o
// volume real superar isso, é sinal de que a V1 precisa de paginação
// por coluna ou virtualização — decisão de fase futura, não desta.
export const LIMITE_PIPELINE_ABERTO = 300;

// Visão "Em andamento" — os 4 stages abertos, agrupados e ordenados por
// coluna. Única query real (mais a batched de scheduledActivities, ver
// selectItemPipeline) — nunca uma query por card.
export async function buscarPipelineAberto(
  organizationId: string,
  opcoes: { busca?: string; agora?: Date } = {}
): Promise<Record<ColunaAberta, ItemPipeline[]>> {
  const agora = opcoes.agora ?? new Date();
  const busca = opcoes.busca ?? "";

  return withOrganization(organizationId, async () => {
    const base: Prisma.PropertyInterestWhereInput = {
      organizationId,
      stage: { in: [...COLUNAS_ABERTAS] },
    };
    const where = combinarWhere(base, busca, organizationId);

    const linhas = await prisma.propertyInterest.findMany({
      where,
      orderBy: { updatedAt: "asc" },
      take: LIMITE_PIPELINE_ABERTO,
      select: selectItemPipeline(organizationId),
    });

    const itens = linhas.map((linha) => paraItemPipeline(linha, organizationId, agora));
    const grupos = agruparPorColuna(itens);
    for (const coluna of COLUNAS_ABERTAS) {
      grupos[coluna] = ordenarColuna(grupos[coluna], agora);
    }
    return grupos;
  });
}

// Visão "Encerradas" — WON/REJECTED, paginação real (mesmo
// PAGE_SIZE_PADRAO de toda listagem administrativa) porque este conjunto
// só cresce com o tempo, ao contrário do board de "em andamento".
export async function buscarPipelineEncerrado(
  organizationId: string,
  opcoes: { busca?: string; resultado?: ResultadoPipeline; skip?: number; take?: number } = {}
): Promise<{ itens: ItemPipeline[]; total: number }> {
  const busca = opcoes.busca ?? "";
  const resultado = opcoes.resultado ?? "TODOS";
  const skip = opcoes.skip ?? 0;
  const take = opcoes.take ?? PAGE_SIZE_PADRAO;

  return withOrganization(organizationId, async () => {
    const stagesEncerrados: PropertyInterestStage[] =
      resultado === "GANHO" ? ["WON"] : resultado === "PERDIDO" ? ["REJECTED"] : ["WON", "REJECTED"];
    const base: Prisma.PropertyInterestWhereInput = {
      organizationId,
      stage: { in: stagesEncerrados },
    };
    const where = combinarWhere(base, busca, organizationId);

    const [linhas, total] = await Promise.all([
      prisma.propertyInterest.findMany({
        where,
        orderBy: { closedAt: "desc" },
        skip,
        take,
        select: selectItemPipeline(organizationId),
      }),
      prisma.propertyInterest.count({ where }),
    ]);

    return { itens: linhas.map((linha) => paraItemPipeline(linha, organizationId)), total };
  });
}

// -----------------------------------------------------------------------
// Métricas do Pipeline (Fase P.5) — leitura/analytics pura sobre
// PropertyInterest, NUNCA uma segunda fonte de verdade: nenhuma tabela
// nova, nenhum contador persistido, nenhum cron/snapshot. Toda métrica é
// recalculada a cada request a partir do estado atual do banco.
//
// Duas partes deliberadamente independentes (nunca misturadas):
//   - "estoque atual" (emAndamento/porStage): sempre GLOBAL pra
//     organização, nunca afetado por período/busca/visão do Kanban — é
//     "quantas negociações existem AGORA em cada etapa aberta".
//   - "resultados" (ganhos/perdidos/taxa): sempre filtrado por closedAt
//     dentro do período escolhido (ou sem filtro nenhum em "todos") —
//     nunca por createdAt/updatedAt, únicos campos que representariam
//     corretamente "quando a negociação foi fechada" (mesmo racional já
//     documentado no comentário de PropertyInterest.closedAt no schema).
// -----------------------------------------------------------------------

export type PeriodoPipeline = "30d" | "90d" | "ANO" | "TODOS";

const PERIODOS_PIPELINE_VALIDOS: readonly PeriodoPipeline[] = ["30d", "90d", "ANO", "TODOS"];

export const PERIODO_PIPELINE_LABEL: Record<PeriodoPipeline, string> = {
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  ANO: "Este ano",
  TODOS: "Todo o período",
};

// URL-driven, mesmo padrão de interpretarFiltrosPipeline — nunca confia em
// input cru, sempre cai em default seguro (30d).
export function interpretarPeriodoPipeline(params: { periodo?: string }): PeriodoPipeline {
  const bruto = (params.periodo ?? "").trim().toUpperCase();
  const candidato = bruto === "30D" ? "30d" : bruto === "90D" ? "90d" : bruto;
  return (PERIODOS_PIPELINE_VALIDOS as readonly string[]).includes(candidato)
    ? (candidato as PeriodoPipeline)
    : "30d";
}

// Resolve o intervalo [inicio, fim] rolante/calendário do período — a
// janela em si não depende de qual campo será comparado contra ela
// (closedAt na P.5; changedAt/exitedAt na P.7, ver buscarAnalyticsHistoricoPipeline
// mais abaixo). null = sem filtro (só "todos" — decisão explícita da P.5,
// reaproveitada na P.7: "todo o período" responde "quantos no total", não
// "quantos dentro de uma janela de tempo").
//
// 30d/90d: janela rolante em milissegundos reais a partir de `agora`
// (closedAt é timestamp real de evento, não um datetime-local digitado
// como scheduledAt — não há "dia calendário" do usuário pra respeitar
// aqui, então não reaproveita inicioDoDiaUTC/fimDoDiaUTC de
// scheduled-activity-date.ts, que resolvem um problema diferente).
// ANO: única variante com semântica de calendário — início do ano UTC,
// mesma técnica Date.UTC(...) já estabelecida no projeto (H.3/H.4).
export function resolverIntervaloPeriodo(
  periodo: PeriodoPipeline,
  agora: Date = new Date()
): { inicio: Date; fim: Date } | null {
  if (periodo === "TODOS") return null;
  if (periodo === "30d") return { inicio: new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000), fim: agora };
  if (periodo === "90d") return { inicio: new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000), fim: agora };
  return { inicio: new Date(Date.UTC(agora.getUTCFullYear(), 0, 1, 0, 0, 0, 0)), fim: agora };
}

// 0/0 -> null (sem base pra calcular nada, nunca 0%/NaN%/Infinity%).
// Resto é só percentual simples — arredondamento/exibição ficam por conta
// de formatarPercentual, nunca duplicados aqui.
export function calcularTaxaGanho(ganhos: number, perdidos: number): number | null {
  const total = ganhos + perdidos;
  if (total === 0) return null;
  return (ganhos / total) * 100;
}

// pt-BR, no máximo 1 casa decimal (nunca preenchida artificialmente: 80 ->
// "80%", não "80,0%"). null -> "—" (nunca texto técnico tipo "N/A").
export function formatarPercentual(valor: number | null): string {
  if (valor === null) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor)}%`;
}

type LinhaGroupByStage = { stage: PropertyInterestStage; _count: { _all: number } };

// Mapeamento puro — Postgres GROUP BY nunca retorna linha pra um stage sem
// nenhuma ocorrência (0 registros), então qualquer stage ausente do
// resultado bruto do groupBy precisa ser preenchido com 0 explicitamente
// aqui, nunca deixado undefined.
export function paraContagemPorStage(linhas: readonly LinhaGroupByStage[]): Record<ColunaAberta, number> {
  const contagem = Object.fromEntries(COLUNAS_ABERTAS.map((c) => [c, 0])) as Record<ColunaAberta, number>;
  for (const linha of linhas) {
    if ((COLUNAS_ABERTAS as readonly string[]).includes(linha.stage)) {
      contagem[linha.stage as ColunaAberta] = linha._count._all;
    }
  }
  return contagem;
}

export type MetricasPipeline = {
  emAndamento: number;
  porStage: Record<ColunaAberta, number>;
  periodo: PeriodoPipeline;
  ganhos: number;
  perdidos: number;
  encerradas: number;
  taxaGanho: number | null;
};

// Única função de leitura de métricas — 2 queries `groupBy` estruturais
// (nunca uma por card, nunca reaproveita os até 300 itens já carregados
// pelo board de buscarPipelineAberto: aquele tem teto de exibição, este
// precisa do total real). organizationId sempre explícito no where — a
// extensão de tenant-scoping (src/lib/prisma.ts) já suporta `groupBy`
// (está em WHERE_OPERATIONS), então esta chamada é tão tenant-safe quanto
// qualquer findMany do projeto.
export async function buscarMetricasPipeline(
  organizationId: string,
  opcoes: { periodo?: PeriodoPipeline; agora?: Date } = {}
): Promise<MetricasPipeline> {
  const periodo = opcoes.periodo ?? "30d";
  const agora = opcoes.agora ?? new Date();
  const intervalo = resolverIntervaloPeriodo(periodo, agora);

  return withOrganization(organizationId, async () => {
    const [porStageBruto, resultadosBruto] = await Promise.all([
      prisma.propertyInterest.groupBy({
        by: ["stage"],
        where: { organizationId, stage: { in: [...COLUNAS_ABERTAS] } },
        _count: { _all: true },
      }),
      prisma.propertyInterest.groupBy({
        by: ["stage"],
        where: {
          organizationId,
          stage: { in: ["WON", "REJECTED"] },
          // closedAt: {gte,lte} exclui closedAt=null automaticamente por
          // semântica padrão de SQL (NULL nunca satisfaz comparação) —
          // nenhum código extra necessário pra excluir os legados sem
          // data. Ausente de propósito quando intervalo é null (período
          // "todos"): aí sim closedAt null conta, decisão explícita da
          // seção 33 do pedido.
          ...(intervalo ? { closedAt: { gte: intervalo.inicio, lte: intervalo.fim } } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const porStage = paraContagemPorStage(porStageBruto);
    const emAndamento = COLUNAS_ABERTAS.reduce((soma, coluna) => soma + porStage[coluna], 0);
    const ganhos = resultadosBruto.find((linha) => linha.stage === "WON")?._count._all ?? 0;
    const perdidos = resultadosBruto.find((linha) => linha.stage === "REJECTED")?._count._all ?? 0;

    return {
      emAndamento,
      porStage,
      periodo,
      ganhos,
      perdidos,
      encerradas: ganhos + perdidos,
      taxaGanho: calcularTaxaGanho(ganhos, perdidos),
    };
  });
}

// -----------------------------------------------------------------------
// Analytics históricos do Pipeline (Fase P.7) — derivados EXCLUSIVAMENTE
// de PropertyInterestStageHistory. Três conceitos nunca misturados:
//   - PropertyInterest.stage: estado ATUAL (P.1, intocado por esta fase);
//   - PropertyInterestStageHistory: eventos temporais reais (P.6);
//   - closedAt: data OFICIAL de fechamento (P.2/P.3, nunca substituída
//     por history — history só serve pra localizar o início da jornada
//     ao calcular tempo até fechamento, ver calcularTempoMedioAteFechamento).
// Registro legado sem NENHUM history nunca participa de métrica de
// jornada (episódio/tempo médio/tempo até fechamento) — continua
// participando normalmente das métricas atuais da P.5 (stage/closedAt),
// que este arquivo não altera.
// -----------------------------------------------------------------------

// Teto de PropertyInterest cuja jornada completa é carregada pra derivar
// episódios — mesmo racional de LIMITE_PIPELINE_ABERTO: nunca um volume
// ilimitado. Selecionados por updatedAt desc (proxy de "mais
// recentemente ativos"; updatedAt muda em qualquer escrita de stage
// também, não só as consideradas aqui — só como critério de seleção da
// amostra, nunca como substituto de changedAt nos cálculos). Organizações
// acima deste teto têm amostra não-exaustiva pras métricas de jornada —
// decisão V1 explícita, sinalizada na UI (ver amostraLimitada), nunca
// escondida.
export const LIMITE_ANALYTICS_HISTORICO = 500;

export type EpisodioEtapa = {
  propertyInterestId: string;
  stage: PropertyInterestStage;
  enteredAtISO: string;
  // null = episódio ainda aberto (nenhuma transição posterior
  // registrada — é o stage atual da jornada).
  exitedAtISO: string | null;
  // null quando o episódio está aberto OU quando os timestamps
  // envolvidos produziriam duração negativa (defensivo).
  duracaoMs: number | null;
};

export type EventoJornada = { newStage: PropertyInterestStage; changedAtISO: string; id: string };

// Ordena os eventos de UMA jornada por changedAt ASC, com `id` como
// desempate determinístico — nunca confia em ordem incidental do banco.
// Colisão de changedAt entre eventos da MESMA jornada é estruturalmente
// improvável (cada write é serializado pela transação que releu o stage
// antes de escrever, ver P.6), mas o desempate garante determinismo
// mesmo assim.
export function ordenarEventosDaJornada(eventos: readonly EventoJornada[]): EventoJornada[] {
  return [...eventos].sort((a, b) => {
    if (a.changedAtISO !== b.changedAtISO) return a.changedAtISO < b.changedAtISO ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// Deriva episódios de UMA jornada já ordenada — cada evento fecha o
// episódio anterior (se houver) e abre um novo cujo `stage` é o
// `newStage` observado. NUNCA usa `previousStage` pra decidir de que
// etapa um episódio é (a fonte de verdade é sempre o destino
// efetivamente escrito) — um `previousStage` inconsistente/anômalo nunca
// contamina o resultado. Reentrada na mesma etapa gera um episódio NOVO
// e independente, nunca fundido com uma passagem anterior. Histórico
// vazio -> [] (nenhum episódio inventado). `agora` sempre parâmetro
// explícito (mesmo racional de calcularAgingStageMs).
export function derivarEpisodiosDaJornada(
  propertyInterestId: string,
  jornadaOrdenada: readonly EventoJornada[],
  agora: Date
): EpisodioEtapa[] {
  const episodios: EpisodioEtapa[] = [];
  for (let i = 0; i < jornadaOrdenada.length; i++) {
    const atual = jornadaOrdenada[i];
    const proximo = jornadaOrdenada[i + 1];
    const enteredAtISO = atual.changedAtISO;
    const exitedAtISO = proximo ? proximo.changedAtISO : null;
    const fimMs = exitedAtISO !== null ? new Date(exitedAtISO).getTime() : agora.getTime();
    const diffMs = fimMs - new Date(enteredAtISO).getTime();
    episodios.push({
      propertyInterestId,
      stage: atual.newStage,
      enteredAtISO,
      exitedAtISO,
      duracaoMs: diffMs < 0 ? null : diffMs,
    });
  }
  return episodios;
}

export type TempoMedioPorEtapa = Record<ColunaAberta, number | null>;

function mediaDeGrupos(grupos: Record<ColunaAberta, { total: number; contagem: number }>): Record<ColunaAberta, number | null> {
  return Object.fromEntries(
    COLUNAS_ABERTAS.map((c) => [c, grupos[c].contagem === 0 ? null : grupos[c].total / grupos[c].contagem])
  ) as Record<ColunaAberta, number | null>;
}

// Tempo médio histórico por etapa — só episódios CONCLUÍDOS
// (exitedAtISO !== null), nunca o episódio aberto atual (esse é
// aging, métrica separada — ver calcularAgingAgregado). Terminal
// (WON/REJECTED) nunca aparece aqui por construção: um terminal nunca
// tem transição posterior, logo nunca tem exitedAtISO preenchido.
// Período filtra por exitedAtISO (fim do episódio) — a duração só é
// conhecida quando o episódio termina, nunca pelo início.
export function calcularTempoMedioPorEtapa(
  episodios: readonly EpisodioEtapa[],
  intervaloExit: { inicio: Date; fim: Date } | null
): TempoMedioPorEtapa {
  const grupos = Object.fromEntries(COLUNAS_ABERTAS.map((c) => [c, { total: 0, contagem: 0 }])) as Record<
    ColunaAberta,
    { total: number; contagem: number }
  >;
  for (const ep of episodios) {
    if (ep.exitedAtISO === null || ep.duracaoMs === null) continue;
    if (!(COLUNAS_ABERTAS as readonly string[]).includes(ep.stage)) continue;
    if (intervaloExit) {
      const exitedMs = new Date(ep.exitedAtISO).getTime();
      if (exitedMs < intervaloExit.inicio.getTime() || exitedMs > intervaloExit.fim.getTime()) continue;
    }
    const grupo = grupos[ep.stage as ColunaAberta];
    grupo.total += ep.duracaoMs;
    grupo.contagem += 1;
  }
  return mediaDeGrupos(grupos);
}

export type AgingAgregadoPorEtapa = Record<ColunaAberta, number | null>;

// Aging médio ATUAL por etapa — estoque presente, SEMPRE global, nunca
// filtrado por período (mesmo racional de "Em andamento"/distribuição
// atual, P.5). Só episódios ainda ABERTOS (exitedAtISO === null) — um
// registro sem history nenhum não produz episódio algum, logo nunca
// entra na média (nunca inventa 0). Nunca usa updatedAt/createdAt.
export function calcularAgingAgregado(episodios: readonly EpisodioEtapa[]): AgingAgregadoPorEtapa {
  const grupos = Object.fromEntries(COLUNAS_ABERTAS.map((c) => [c, { total: 0, contagem: 0 }])) as Record<
    ColunaAberta,
    { total: number; contagem: number }
  >;
  for (const ep of episodios) {
    if (ep.exitedAtISO !== null || ep.duracaoMs === null) continue;
    if (!(COLUNAS_ABERTAS as readonly string[]).includes(ep.stage)) continue;
    const grupo = grupos[ep.stage as ColunaAberta];
    grupo.total += ep.duracaoMs;
    grupo.contagem += 1;
  }
  return mediaDeGrupos(grupos);
}

export type Gargalo = { stage: ColunaAberta; agingMedioMs: number } | null;

// Gargalo V1 = etapa aberta com maior AGING MÉDIO ATUAL (estoque
// presente) — nunca o maior tempo médio histórico concluído (as duas
// noções nunca são misturadas). Operacionalmente é "onde as negociações
// estão paradas agora", não "onde historicamente demoravam mais".
// null quando nenhuma etapa tem dado suficiente. Empate: a etapa que
// aparece primeiro em COLUNAS_ABERTAS vence — determinístico.
export function calcularGargalo(agingAgregado: AgingAgregadoPorEtapa): Gargalo {
  let melhor: Gargalo = null;
  for (const stage of COLUNAS_ABERTAS) {
    const valor = agingAgregado[stage];
    if (valor === null) continue;
    if (melhor === null || valor > melhor.agingMedioMs) {
      melhor = { stage, agingMedioMs: valor };
    }
  }
  return melhor;
}

// Formatação genérica de duração (reaproveita a mesma granularidade
// grosseira de formatarAgingStage, sem o prefixo "Na etapa há" — usada em
// múltiplos rótulos de analytics, não só o card individual). null ->
// null, nunca "0" quando na verdade não há dado.
export function formatarDuracao(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < HORA_MS) return "menos de 1h";
  if (ms < DIA_MS) return `${Math.floor(ms / HORA_MS)}h`;
  const dias = Math.floor(ms / DIA_MS);
  return `${dias} dia${dias === 1 ? "" : "s"}`;
}

export type EntradasPorEtapa = Record<ColunaAberta, number>;

type LinhaGroupByNewStage = { newStage: PropertyInterestStage; _count: { _all: number } };

// Volume de TRANSIÇÕES pra cada etapa aberta (não é número de negócios
// únicos) — genesis (null -> INTERESTED) conta como entrada em
// INTERESTED, reentradas contam de novo. Escopo só às 4 etapas abertas
// (entrada em WON/REJECTED já é "ganhos"/"perdidos" da P.5 — não
// duplicado aqui).
export function paraEntradasPorEtapa(linhas: readonly LinhaGroupByNewStage[]): EntradasPorEtapa {
  const contagem = Object.fromEntries(COLUNAS_ABERTAS.map((c) => [c, 0])) as EntradasPorEtapa;
  for (const linha of linhas) {
    if ((COLUNAS_ABERTAS as readonly string[]).includes(linha.newStage)) {
      contagem[linha.newStage as ColunaAberta] = linha._count._all;
    }
  }
  return contagem;
}

export type TransicaoObservada = { de: PropertyInterestStage | null; para: PropertyInterestStage; quantidade: number };

type LinhaGroupByTransicao = {
  previousStage: PropertyInterestStage | null;
  newStage: PropertyInterestStage;
  _count: { _all: number };
};

// Lista bruta de pares (de,para) observados no período, com contagem —
// NUNCA convertida em percentual/"taxa de conversão" (decisão P.7: sob
// reentradas e movimentos não-lineares não existe denominador
// semanticamente sólido). Ordenado por quantidade desc; desempate
// determinístico pela chave textual do par.
export function paraTransicoesObservadas(linhas: readonly LinhaGroupByTransicao[]): TransicaoObservada[] {
  return linhas
    .map((linha) => ({ de: linha.previousStage, para: linha.newStage, quantidade: linha._count._all }))
    .sort((a, b) => {
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
      const chaveA = `${a.de ?? ""}->${a.para}`;
      const chaveB = `${b.de ?? ""}->${b.para}`;
      return chaveA < chaveB ? -1 : chaveA > chaveB ? 1 : 0;
    });
}

export type TempoAteFechamento = { ganho: number | null; perdido: number | null; todos: number | null };

type RegistroFechamento = {
  stage: PropertyInterestStage;
  closedAtISO: string;
  // null = sem genesis (histórico incompleto) -> nunca participa.
  genesisChangedAtISO: string | null;
};

// Tempo médio até fechamento — só participa quem (a) está encerrado
// (WON/REJECTED) via closedAt real, (b) tem genesis (histórico completo:
// sem isso não se sabe quando a jornada realmente começou), (c)
// closedAt >= genesis (defensivo, nunca duração negativa). Nunca
// substitui closedAt — history só localiza o início. Período filtra por
// closedAt (mesma semântica de "resultados" já usada na P.5).
export function calcularTempoMedioAteFechamento(
  registros: readonly RegistroFechamento[],
  intervaloClosedAt: { inicio: Date; fim: Date } | null
): TempoAteFechamento {
  const ganho: number[] = [];
  const perdido: number[] = [];
  const todos: number[] = [];
  for (const r of registros) {
    if (r.genesisChangedAtISO === null) continue;
    const closedMs = new Date(r.closedAtISO).getTime();
    if (intervaloClosedAt) {
      if (closedMs < intervaloClosedAt.inicio.getTime() || closedMs > intervaloClosedAt.fim.getTime()) continue;
    }
    const duracao = closedMs - new Date(r.genesisChangedAtISO).getTime();
    if (duracao < 0) continue;
    todos.push(duracao);
    if (r.stage === "WON") ganho.push(duracao);
    else if (r.stage === "REJECTED") perdido.push(duracao);
  }
  const media = (lista: number[]) => (lista.length === 0 ? null : lista.reduce((soma, v) => soma + v, 0) / lista.length);
  return { ganho: media(ganho), perdido: media(perdido), todos: media(todos) };
}

export type AnalyticsHistoricoPipeline = {
  periodo: PeriodoPipeline;
  // true quando o teto de LIMITE_ANALYTICS_HISTORICO foi atingido — a
  // amostra pode não ser exaustiva pras métricas de jornada (episódios,
  // tempo médio, aging agregado, gargalo, tempo até fechamento). Nunca
  // afeta entradasPorEtapa/transicoesObservadas (agregadas direto no
  // banco, sem teto).
  amostraLimitada: boolean;
  gargalo: Gargalo;
  agingAgregado: AgingAgregadoPorEtapa;
  tempoMedioHistorico: TempoMedioPorEtapa;
  entradasPorEtapa: EntradasPorEtapa;
  transicoesObservadas: TransicaoObservada[];
  tempoAteFechamento: TempoAteFechamento;
};

// Única função de leitura dos analytics históricos (Fase P.7) — 4 queries
// estruturais (2 groupBy em paralelo + 1 findMany de PropertyInterest com
// teto + 1 findMany de PropertyInterestStageHistory desses IDs), nunca
// uma por card/registro. organizationId sempre explícito no where.
// PropertyInterest.stage nunca é derivado do histórico aqui — os únicos
// dados de "estado atual" usados (stage/closedAt) vêm direto da tabela
// PropertyInterest.
export async function buscarAnalyticsHistoricoPipeline(
  organizationId: string,
  opcoes: { periodo?: PeriodoPipeline; agora?: Date } = {}
): Promise<AnalyticsHistoricoPipeline> {
  const periodo = opcoes.periodo ?? "30d";
  const agora = opcoes.agora ?? new Date();
  const intervalo = resolverIntervaloPeriodo(periodo, agora);

  return withOrganization(organizationId, async () => {
    const [entradasBruto, transicoesBruto] = await Promise.all([
      prisma.propertyInterestStageHistory.groupBy({
        by: ["newStage"],
        where: {
          organizationId,
          newStage: { in: [...COLUNAS_ABERTAS] },
          ...(intervalo ? { changedAt: { gte: intervalo.inicio, lte: intervalo.fim } } : {}),
        },
        _count: { _all: true },
      }),
      prisma.propertyInterestStageHistory.groupBy({
        by: ["previousStage", "newStage"],
        where: {
          organizationId,
          ...(intervalo ? { changedAt: { gte: intervalo.inicio, lte: intervalo.fim } } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const registros = await prisma.propertyInterest.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: LIMITE_ANALYTICS_HISTORICO,
      select: { id: true, stage: true, closedAt: true },
    });
    const amostraLimitada = registros.length === LIMITE_ANALYTICS_HISTORICO;
    const idsRegistros = registros.map((r) => r.id);

    const historyBruto =
      idsRegistros.length === 0
        ? []
        : await prisma.propertyInterestStageHistory.findMany({
            where: { organizationId, propertyInterestId: { in: idsRegistros } },
            select: { id: true, propertyInterestId: true, previousStage: true, newStage: true, changedAt: true },
          });

    // Único passo O(N): agrupa por jornada E localiza genesis ao mesmo
    // tempo — nunca um segundo scan de historyBruto (evitaria O(N²) sob
    // muitas jornadas).
    const porJornada = new Map<string, EventoJornada[]>();
    const genesisPorJornada = new Map<string, string>();
    for (const h of historyBruto) {
      const lista = porJornada.get(h.propertyInterestId) ?? [];
      lista.push({ newStage: h.newStage, changedAtISO: h.changedAt.toISOString(), id: h.id });
      porJornada.set(h.propertyInterestId, lista);
      if (h.previousStage === null) {
        genesisPorJornada.set(h.propertyInterestId, h.changedAt.toISOString());
      }
    }

    const todosEpisodios: EpisodioEtapa[] = [];
    for (const [propertyInterestId, eventos] of porJornada) {
      const ordenados = ordenarEventosDaJornada(eventos);
      todosEpisodios.push(...derivarEpisodiosDaJornada(propertyInterestId, ordenados, agora));
    }

    const registrosFechamento: RegistroFechamento[] = [];
    for (const r of registros) {
      if (!estagioInteresseEncerrado(r.stage) || r.closedAt === null) continue;
      registrosFechamento.push({
        stage: r.stage,
        closedAtISO: r.closedAt.toISOString(),
        genesisChangedAtISO: genesisPorJornada.get(r.id) ?? null,
      });
    }

    const agingAgregado = calcularAgingAgregado(todosEpisodios);

    return {
      periodo,
      amostraLimitada,
      gargalo: calcularGargalo(agingAgregado),
      agingAgregado,
      tempoMedioHistorico: calcularTempoMedioPorEtapa(todosEpisodios, intervalo),
      entradasPorEtapa: paraEntradasPorEtapa(entradasBruto),
      transicoesObservadas: paraTransicoesObservadas(transicoesBruto),
      tempoAteFechamento: calcularTempoMedioAteFechamento(registrosFechamento, intervalo),
    };
  });
}
