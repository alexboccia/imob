import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { normalizarBusca, PAGE_SIZE_PADRAO } from "@/lib/pagination";
import { ESTAGIOS_INTERESSE } from "@/lib/property-interest-schema";
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
};

// Mapeamento puro (sem Prisma/I-O) — testável isoladamente, mesmo espírito
// de paraItemAgenda (src/lib/agenda.ts). Reaproveita obterProximaAcaoComercial
// direto, nunca reimplementa a lógica de próxima ação.
export function paraItemPipeline(linha: LinhaBrutaPipeline, organizationId: string): ItemPipeline {
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

  return {
    id: linha.id,
    stage: linha.stage,
    closedAtISO: linha.closedAt ? linha.closedAt.toISOString() : null,
    updatedAtISO: linha.updatedAt.toISOString(),
    person,
    property,
    proximaVisita,
    proximaAcao: property ? obterProximaAcaoComercial(linha.stage, property.status) : null,
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

    const itens = linhas.map((linha) => paraItemPipeline(linha, organizationId));
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
