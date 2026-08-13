import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { normalizarBusca } from "@/lib/pagination";
import {
  inicioDoDiaUTC,
  fimDoDiaUTC,
  parseDataUTC,
  type StatusScheduledActivity,
} from "@/lib/scheduled-activity-date";
import type { Prisma } from "@/generated/prisma/client";

// Agenda do corretor (Fase H.3, evoluída na H.4) — projeção operacional de
// ScheduledActivity, nunca uma segunda fonte de verdade. Nenhuma tabela
// nova, nenhum estado paralelo: só consultas read-only sobre o model já
// existente da H.1, filtradas explicitamente por type="VISIT" (única
// variante hoje, mas o filtro fica explícito pra quando o enum crescer).

export type ItemAgenda = {
  id: string;
  status: StatusScheduledActivity;
  scheduledAt: Date;
  notes: string | null;
  propertyInterestId: string | null;
  // null tanto no caso normal de ausência (propertyId nulo na linha) quanto
  // na anomalia defensiva abaixo — a UI trata os dois casos da mesma forma
  // (fallback discreto), nunca falha.
  person: { id: string; name: string } | null;
  property: { id: string; title: string } | null;
};

export type ContadoresAgenda = { hoje: number; proximas: number; anteriores: number; atrasadas: number };

// Limites defensivos documentados (seção 19 da H.3, preservados na H.4) —
// "Hoje" carrega o dia inteiro sem limite (não é um caso real de
// crescimento ilimitado); Próximas usa um teto fixo sem paginação completa
// (não há UI de "próxima página" pra esta aba, mesmo com filtros ativos —
// um filtro só reduz o conjunto, nunca cresce além do teto); Anteriores
// usa paginação real via skip/take, resolvida pelo caller (page.tsx) com
// src/lib/pagination.ts, mesmo padrão de toda listagem administrativa.
export const LIMITE_PROXIMAS = 50;

const SELECT_ITEM_AGENDA = {
  id: true,
  status: true,
  scheduledAt: true,
  notes: true,
  propertyInterestId: true,
  // organizationId de Person/Property selecionado só pra reconferência
  // abaixo — nunca exposto no tipo de retorno ItemAgenda.
  person: { select: { id: true, name: true, organizationId: true } },
  property: { select: { id: true, title: true, organizationId: true } },
} as const;

type LinhaBruta = {
  id: string;
  status: StatusScheduledActivity;
  scheduledAt: Date;
  notes: string | null;
  propertyInterestId: string | null;
  person: { id: string; name: string; organizationId: string };
  property: { id: string; title: string; organizationId: string } | null;
};

// Estratégia pra relação cross-tenant anômala (seção 9 da H.3): a FK simples
// de ScheduledActivity.personId/propertyId não garante, por si só, que a
// Person/Property referenciada pertence à MESMA organização da própria
// linha (não existe FK composta pra isso — mesma lacuna já documentada e
// defendida nas Server Actions da H.2). Como este é um caminho de LEITURA
// (não de escrita), a defesa aqui não é rejeitar a operação inteira: é
// reconferir organizationId de cada relação individualmente e, se não
// bater, tratar o dado relacionado como ausente (nunca vazar nome/título
// de outro tenant). A ScheduledActivity em si continua aparecendo — ela é
// legitimamente dessa organização, só o dado relacionado anômalo é
// redigido.
function paraItemAgenda(linha: LinhaBruta, organizationId: string): ItemAgenda {
  return {
    id: linha.id,
    status: linha.status,
    scheduledAt: linha.scheduledAt,
    notes: linha.notes,
    propertyInterestId: linha.propertyInterestId,
    person:
      linha.person.organizationId === organizationId
        ? { id: linha.person.id, name: linha.person.name }
        : null,
    property:
      linha.property && linha.property.organizationId === organizationId
        ? { id: linha.property.id, title: linha.property.title }
        : null,
  };
}

// -----------------------------------------------------------------------
// Filtros operacionais (Fase H.4) — busca por cliente/imóvel, período e
// status. Interpretação pura de searchParams: nunca confia em input cru,
// sempre cai em defaults seguros, nunca gera exception/500 por causa de
// parâmetro malformado.
// -----------------------------------------------------------------------

export type FiltroStatusAgenda = "TODAS" | "AGENDADAS" | "CONCLUIDAS" | "CANCELADAS" | "ATRASADAS";

const STATUS_AGENDA_VALIDOS: readonly FiltroStatusAgenda[] = [
  "TODAS",
  "AGENDADAS",
  "CONCLUIDAS",
  "CANCELADAS",
  "ATRASADAS",
];

export type FiltrosAgenda = {
  busca: string;
  de: Date | null;
  ate: Date | null;
  // true quando `de` e `ate` foram ambos informados e `de` é depois de
  // `ate` — nesse caso as duas datas são IGNORADAS (nunca trocadas
  // silenciosamente entre si) e o caller deve avisar o usuário. Não é
  // "erro" no sentido de 500: a consulta segue normalmente, só sem filtro
  // de período.
  intervaloInvalido: boolean;
  status: FiltroStatusAgenda;
};

function ehFiltroStatusValido(valor: string): valor is FiltroStatusAgenda {
  return (STATUS_AGENDA_VALIDOS as readonly string[]).includes(valor);
}

export function interpretarFiltrosAgenda(params: {
  q?: string;
  de?: string;
  ate?: string;
  status?: string;
}): FiltrosAgenda {
  const busca = normalizarBusca(params.q);

  const deBruta = params.de ? parseDataUTC(params.de) : null;
  const ateBruta = params.ate ? parseDataUTC(params.ate) : null;
  const intervaloInvalido = deBruta !== null && ateBruta !== null && deBruta > ateBruta;

  const statusBruto = (params.status ?? "").trim().toUpperCase();
  const status = ehFiltroStatusValido(statusBruto) ? statusBruto : "TODAS";

  return {
    busca,
    de: intervaloInvalido ? null : deBruta,
    ate: intervaloInvalido ? null : ateBruta,
    intervaloInvalido,
    status,
  };
}

type WhereAgenda = Prisma.ScheduledActivityWhereInput;

// Busca por nome do cliente OU título do imóvel — case-insensitive via
// ILIKE do Postgres (`mode: "insensitive"`), sempre no banco, nunca
// carregando registros pra filtrar em JavaScript. `organizationId` é
// reconfirmado DENTRO do relacionamento (não só no nível da própria
// ScheduledActivity): sem isso, uma linha com relação cross-tenant
// anômala (ver H.3 seção 13-15) poderia "responder" a uma busca por um
// nome que só existe em outra organização, revelando indiretamente que
// tal Person/Property existe lá — mesmo com o card final redigindo o
// dado. Reconferir aqui fecha esse canal antes mesmo da query rodar.
function condicaoBusca(busca: string, organizationId: string): WhereAgenda | null {
  if (!busca) return null;
  return {
    OR: [
      { person: { is: { organizationId, name: { contains: busca, mode: "insensitive" } } } },
      { property: { is: { organizationId, title: { contains: busca, mode: "insensitive" } } } },
    ],
  };
}

// Interseção do período informado com `scheduledAt` — como sibling de
// `OR`/outras chaves no `where` (nunca dentro de um `AND` isolado só por
// si), o Prisma já aplica isso como "E" sobre qualquer outra condição do
// mesmo objeto, inclusive as 3 variantes do OR de Anteriores.
function condicaoIntervalo(filtros: FiltrosAgenda): WhereAgenda | null {
  if (!filtros.de && !filtros.ate) return null;
  return {
    scheduledAt: {
      ...(filtros.de ? { gte: inicioDoDiaUTC(filtros.de) } : {}),
      ...(filtros.ate ? { lte: fimDoDiaUTC(filtros.ate) } : {}),
    },
  };
}

// Combina o `where` base de uma aba com busca/período. Usa `AND: [...]`
// explícito (nunca funde objetos com spread) porque o `where` base de
// Anteriores já tem sua própria chave `OR` — misturar um segundo `OR` no
// mesmo nível sobrescreveria o primeiro em vez de combinar os dois.
//
// `organizationId` é sempre repetido também no nível de topo do objeto
// retornado (redundante com o que já está dentro de `base`, mas
// inofensivo — é o mesmo valor, só reforça a interseção): a extensão de
// tenant-scoping de src/lib/prisma.ts só reconhece `organizationId`
// quando ele é uma chave direta do `where`, não quando está aninhado
// dentro de um `AND`. Sem isso, qualquer busca/período ativo faria a
// consulta cair no guard "sem organizationId explícito" e lançar.
function combinarWhere(base: WhereAgenda, filtros: FiltrosAgenda, organizationId: string): WhereAgenda {
  const extras = [condicaoBusca(filtros.busca, organizationId), condicaoIntervalo(filtros)].filter(
    (condicao): condicao is WhereAgenda => condicao !== null
  );
  if (extras.length === 0) return base;
  return { organizationId, AND: [base, ...extras] };
}

// HOJE e PRÓXIMAS só contêm SCHEDULED por definição (H.3) — um filtro de
// status pedindo CONCLUIDAS/CANCELADAS é logicamente incompatível com
// essas abas (mesmo que exista uma ScheduledActivity COMPLETED com
// scheduledAt dentro de hoje, ela é classificada em Anteriores, nunca em
// Hoje — decisão da H.3 preservada). ATRASADAS também nunca aparece aqui:
// Hoje exige o dia de hoje, Próximas exige um dia futuro, "atrasada" exige
// um dia passado — mutuamente exclusivos por definição. Em vez de
// desabilitar a opção na UI, a combinação simplesmente retorna lista
// vazia de forma previsível (comportamento documentado, não um bug).
function statusIncompativelComHojeOuProximas(status: FiltroStatusAgenda): boolean {
  return status === "CONCLUIDAS" || status === "CANCELADAS" || status === "ATRASADAS";
}

// Dentro de Anteriores, "AGENDADAS" e "ATRASADAS" são o MESMO subconjunto
// (só existe SCHEDULED em Anteriores quando o dia já passou — é a própria
// definição de atrasada). TODAS mantém a união original (COMPLETED |
// CANCELLED | SCHEDULED atrasada) já usada desde a H.3.
function condicaoStatusAnteriores(status: FiltroStatusAgenda, agora: Date): WhereAgenda {
  const inicioHoje = inicioDoDiaUTC(agora);
  if (status === "CONCLUIDAS") return { status: "COMPLETED" };
  if (status === "CANCELADAS") return { status: "CANCELLED" };
  if (status === "AGENDADAS" || status === "ATRASADAS") {
    return { status: "SCHEDULED", scheduledAt: { lt: inicioHoje } };
  }
  return {
    OR: [
      { status: "COMPLETED" },
      { status: "CANCELLED" },
      { status: "SCHEDULED", scheduledAt: { lt: inicioHoje } },
    ],
  };
}

// HOJE: SCHEDULED + scheduledAt dentro do dia UTC-literal atual. Sem
// limite — o volume de visitas de um único dia nunca é grande o bastante
// pra justificar paginação.
export async function buscarAgendaHoje(
  organizationId: string,
  opcoes: { agora?: Date; filtros?: FiltrosAgenda } = {}
): Promise<ItemAgenda[]> {
  const agora = opcoes.agora ?? new Date();
  const filtros = opcoes.filtros;
  if (filtros && statusIncompativelComHojeOuProximas(filtros.status)) return [];

  return withOrganization(organizationId, async () => {
    const base: WhereAgenda = {
      organizationId,
      type: "VISIT",
      status: "SCHEDULED",
      scheduledAt: { gte: inicioDoDiaUTC(agora), lte: fimDoDiaUTC(agora) },
    };
    const where = filtros ? combinarWhere(base, filtros, organizationId) : base;
    const linhas = await prisma.scheduledActivity.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      select: SELECT_ITEM_AGENDA,
    });
    return linhas.map((linha) => paraItemAgenda(linha, organizationId));
  });
}

// PRÓXIMAS: SCHEDULED + scheduledAt depois do fim de hoje. Limite defensivo
// fixo (LIMITE_PROXIMAS), sem paginação completa nesta aba — preservado
// tal qual a H.3 mesmo com filtros ativos: um filtro só reduz o conjunto
// candidato, nunca justifica paginação nova aqui.
export async function buscarAgendaProximas(
  organizationId: string,
  opcoes: { agora?: Date; limite?: number; filtros?: FiltrosAgenda } = {}
): Promise<ItemAgenda[]> {
  const agora = opcoes.agora ?? new Date();
  const limite = opcoes.limite ?? LIMITE_PROXIMAS;
  const filtros = opcoes.filtros;
  if (filtros && statusIncompativelComHojeOuProximas(filtros.status)) return [];

  return withOrganization(organizationId, async () => {
    const base: WhereAgenda = {
      organizationId,
      type: "VISIT",
      status: "SCHEDULED",
      scheduledAt: { gt: fimDoDiaUTC(agora) },
    };
    const where = filtros ? combinarWhere(base, filtros, organizationId) : base;
    const linhas = await prisma.scheduledActivity.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      take: limite,
      select: SELECT_ITEM_AGENDA,
    });
    return linhas.map((linha) => paraItemAgenda(linha, organizationId));
  });
}

// ANTERIORES: COMPLETED, CANCELLED, ou SCHEDULED cujo dia já passou
// (atrasada). Nunca faz UPDATE nem reclassifica status — é só leitura.
// Ordenado por scheduledAt desc (mais recente primeiro). Paginação real via
// skip/take, resolvida pelo caller com src/lib/pagination.ts.
export async function buscarAgendaAnteriores(
  organizationId: string,
  opcoes: { agora?: Date; skip?: number; take?: number; filtros?: FiltrosAgenda } = {}
): Promise<ItemAgenda[]> {
  const agora = opcoes.agora ?? new Date();
  const skip = opcoes.skip ?? 0;
  const take = opcoes.take;
  const filtros = opcoes.filtros;

  return withOrganization(organizationId, async () => {
    const base: WhereAgenda = {
      organizationId,
      type: "VISIT",
      ...condicaoStatusAnteriores(filtros?.status ?? "TODAS", agora),
    };
    const where = filtros ? combinarWhere(base, filtros, organizationId) : base;
    const linhas = await prisma.scheduledActivity.findMany({
      where,
      orderBy: { scheduledAt: "desc" },
      skip,
      take,
      select: SELECT_ITEM_AGENDA,
    });
    return linhas.map((linha) => paraItemAgenda(linha, organizationId));
  });
}

// Contagem por aba pra badges na navegação e pro resumo operacional do
// topo da página — sempre GLOBAL (não aplica busca/período/status): são
// números de "visão geral do dia", não "quantos bateram com o filtro
// atual". 4 counts baratos (o mesmo índice @@index([organizationId,
// status, scheduledAt]) da H.1 cobre os quatro), nunca uma query por
// linha.
export async function contarAgenda(
  organizationId: string,
  opcoes: { agora?: Date } = {}
): Promise<ContadoresAgenda> {
  const agora = opcoes.agora ?? new Date();
  return withOrganization(organizationId, async () => {
    const [hoje, proximas, anteriores, atrasadas] = await Promise.all([
      prisma.scheduledActivity.count({
        where: {
          organizationId,
          type: "VISIT",
          status: "SCHEDULED",
          scheduledAt: { gte: inicioDoDiaUTC(agora), lte: fimDoDiaUTC(agora) },
        },
      }),
      prisma.scheduledActivity.count({
        where: {
          organizationId,
          type: "VISIT",
          status: "SCHEDULED",
          scheduledAt: { gt: fimDoDiaUTC(agora) },
        },
      }),
      prisma.scheduledActivity.count({
        where: {
          organizationId,
          type: "VISIT",
          OR: [
            { status: "COMPLETED" },
            { status: "CANCELLED" },
            { status: "SCHEDULED", scheduledAt: { lt: inicioDoDiaUTC(agora) } },
          ],
        },
      }),
      prisma.scheduledActivity.count({
        where: {
          organizationId,
          type: "VISIT",
          status: "SCHEDULED",
          scheduledAt: { lt: inicioDoDiaUTC(agora) },
        },
      }),
    ]);
    return { hoje, proximas, anteriores, atrasadas };
  });
}
