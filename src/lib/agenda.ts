import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { normalizarBusca } from "@/lib/pagination";
import { type StatusScheduledActivity } from "@/lib/scheduled-activity-date";
import {
  intervaloDoDia,
  intervaloDaDataCalendario,
  parseDataCalendario,
  type DataCalendario,
} from "@/lib/fuso-horario";
import type { Prisma, ScheduledActivityType } from "@/generated/prisma/client";

// Agenda do corretor (Fase H.3, evoluída na H.4 e generalizada na Fase
// 19) — projeção operacional de ScheduledActivity, nunca uma segunda
// fonte de verdade. Nenhuma tabela nova, nenhum estado paralelo: só
// consultas read-only sobre o model já existente da H.1.
//
// FASE 19: o filtro `type: "VISIT"` foi REMOVIDO. Ele existia porque
// VISIT era o único tipo; agora a agenda comercial do corretor tem
// visitas e follow-ups, e esconder metade dela por causa de um filtro
// que sobrou seria o pior resultado possível desta fase. O tipo continua
// atravessando no item, para a tela dizer em TEXTO o que cada linha é.

export type ItemAgenda = {
  id: string;
  // Fase 19 — a Agenda passou a listar VISITA e FOLLOW-UP.
  type: ScheduledActivityType;
  // Só em FOLLOW_UP: o que precisa ser feito. null em VISIT.
  subject: string | null;
  status: StatusScheduledActivity;
  scheduledAt: Date;
  notes: string | null;
  propertyInterestId: string | null;
  // null tanto no caso normal de ausência (propertyId nulo na linha) quanto
  // na anomalia defensiva abaixo — a UI trata os dois casos da mesma forma
  // (fallback discreto), nunca falha.
  person: { id: string; name: string; phone: string | null } | null;
  property: { id: string; title: string; neighborhood: string } | null;
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
  type: true,
  subject: true,
  status: true,
  scheduledAt: true,
  notes: true,
  propertyInterestId: true,
  // organizationId de Person/Property selecionado só pra reconferência
  // abaixo — nunca exposto no tipo de retorno ItemAgenda.
  person: { select: { id: true, name: true, phone: true, organizationId: true } },
  property: { select: { id: true, title: true, neighborhood: true, organizationId: true } },
} as const;

type LinhaBruta = {
  id: string;
  type: ScheduledActivityType;
  subject: string | null;
  status: StatusScheduledActivity;
  scheduledAt: Date;
  notes: string | null;
  propertyInterestId: string | null;
  person: { id: string; name: string; phone: string | null; organizationId: string };
  property: { id: string; title: string; neighborhood: string; organizationId: string } | null;
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
    type: linha.type,
    subject: linha.subject,
    status: linha.status,
    scheduledAt: linha.scheduledAt,
    notes: linha.notes,
    propertyInterestId: linha.propertyInterestId,
    person:
      linha.person.organizationId === organizationId
        ? { id: linha.person.id, name: linha.person.name, phone: linha.person.phone }
        : null,
    property:
      linha.property && linha.property.organizationId === organizationId
        ? { id: linha.property.id, title: linha.property.title, neighborhood: linha.property.neighborhood }
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
  // DATE-ONLY (Fase 18): o que o usuário escolheu é uma data de
  // calendário, não um instante. Guardar como Date aqui obrigaria a
  // decidir o fuso no parse da URL, longe de onde a organização é
  // conhecida; a conversão para instantes acontece só na query, com o
  // fuso em mãos (ver condicaoIntervalo).
  de: DataCalendario | null;
  ate: DataCalendario | null;
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

  const deBruta = params.de ? parseDataCalendario(params.de) : null;
  const ateBruta = params.ate ? parseDataCalendario(params.ate) : null;
  // Comparação entre datas de calendário, sem passar por instante: a
  // ordem de duas datas não depende de fuso nenhum.
  const ordinal = (d: DataCalendario) => d.ano * 10_000 + d.mes * 100 + d.dia;
  const intervaloInvalido =
    deBruta !== null && ateBruta !== null && ordinal(deBruta) > ordinal(ateBruta);

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
function condicaoIntervalo(filtros: FiltrosAgenda, fuso: string): WhereAgenda | null {
  if (!filtros.de && !filtros.ate) return null;
  return {
    scheduledAt: {
      ...(filtros.de ? { gte: intervaloDaDataCalendario(filtros.de, fuso).inicio } : {}),
      ...(filtros.ate ? { lte: intervaloDaDataCalendario(filtros.ate, fuso).fim } : {}),
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
function combinarWhere(
  base: WhereAgenda,
  filtros: FiltrosAgenda,
  organizationId: string,
  fuso: string
): WhereAgenda {
  const extras = [condicaoBusca(filtros.busca, organizationId), condicaoIntervalo(filtros, fuso)].filter(
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
function condicaoStatusAnteriores(
  status: FiltroStatusAgenda,
  fuso: string,
  agora: Date
): WhereAgenda {
  const inicioHoje = intervaloDoDia(agora, fuso).inicio;
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

// HOJE: SCHEDULED + scheduledAt dentro do dia calendário da
// ORGANIZAÇÃO (Fase 18 — antes era o dia UTC literal). Sem
// limite — o volume de visitas de um único dia nunca é grande o bastante
// pra justificar paginação.
export async function buscarAgendaHoje(
  organizationId: string,
  // Fuso comercial da organização — obrigatório e sem padrão: todo
  // conceito de dia aqui é da organização, nunca do processo.
  fuso: string,
  opcoes: { agora?: Date; filtros?: FiltrosAgenda } = {}
): Promise<ItemAgenda[]> {
  const agora = opcoes.agora ?? new Date();
  const filtros = opcoes.filtros;
  if (filtros && statusIncompativelComHojeOuProximas(filtros.status)) return [];
  const hoje = intervaloDoDia(agora, fuso);

  return withOrganization(organizationId, async () => {
    const base: WhereAgenda = {
      organizationId,
      status: "SCHEDULED",
      scheduledAt: { gte: hoje.inicio, lte: hoje.fim },
    };
    const where = filtros ? combinarWhere(base, filtros, organizationId, fuso) : base;
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
  // Fuso comercial da organização — obrigatório e sem padrão: todo
  // conceito de dia aqui é da organização, nunca do processo.
  fuso: string,
  opcoes: { agora?: Date; limite?: number; filtros?: FiltrosAgenda } = {}
): Promise<ItemAgenda[]> {
  const agora = opcoes.agora ?? new Date();
  const limite = opcoes.limite ?? LIMITE_PROXIMAS;
  const filtros = opcoes.filtros;
  if (filtros && statusIncompativelComHojeOuProximas(filtros.status)) return [];
  const hoje = intervaloDoDia(agora, fuso);

  return withOrganization(organizationId, async () => {
    const base: WhereAgenda = {
      organizationId,
      status: "SCHEDULED",
      scheduledAt: { gt: hoje.fim },
    };
    const where = filtros ? combinarWhere(base, filtros, organizationId, fuso) : base;
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
  // Fuso comercial da organização — obrigatório e sem padrão: todo
  // conceito de dia aqui é da organização, nunca do processo.
  fuso: string,
  opcoes: { agora?: Date; skip?: number; take?: number; filtros?: FiltrosAgenda } = {}
): Promise<ItemAgenda[]> {
  const agora = opcoes.agora ?? new Date();
  const skip = opcoes.skip ?? 0;
  const take = opcoes.take;
  const filtros = opcoes.filtros;

  return withOrganization(organizationId, async () => {
    const base: WhereAgenda = {
      organizationId,
      ...condicaoStatusAnteriores(filtros?.status ?? "TODAS", fuso, agora),
    };
    const where = filtros ? combinarWhere(base, filtros, organizationId, fuso) : base;
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
  // Fuso comercial da organização — obrigatório e sem padrão: todo
  // conceito de dia aqui é da organização, nunca do processo.
  fuso: string,
  opcoes: { agora?: Date } = {}
): Promise<ContadoresAgenda> {
  const agora = opcoes.agora ?? new Date();
  const dia = intervaloDoDia(agora, fuso);
  return withOrganization(organizationId, async () => {
    const [hoje, proximas, anteriores, atrasadas] = await Promise.all([
      prisma.scheduledActivity.count({
        where: {
          organizationId,
              status: "SCHEDULED",
          scheduledAt: { gte: dia.inicio, lte: dia.fim },
        },
      }),
      prisma.scheduledActivity.count({
        where: {
          organizationId,
              status: "SCHEDULED",
          scheduledAt: { gt: dia.fim },
        },
      }),
      prisma.scheduledActivity.count({
        where: {
          organizationId,
              OR: [
            { status: "COMPLETED" },
            { status: "CANCELLED" },
            { status: "SCHEDULED", scheduledAt: { lt: dia.inicio } },
          ],
        },
      }),
      prisma.scheduledActivity.count({
        where: {
          organizationId,
              status: "SCHEDULED",
          scheduledAt: { lt: dia.inicio },
        },
      }),
    ]);
    return { hoje, proximas, anteriores, atrasadas };
  });
}

// -----------------------------------------------------------------------
// Resumo diário da aba Hoje (Fase H.5) — decoupled do resumo global de
// contarAgenda (Hoje/Próximas/Atrasadas, seção 9 da H.4): "Agendadas
// hoje" é o mesmo conceito de contadores.hoje, mas calculado aqui de
// novo por clareza (a intenção semântica dos dois resumos é diferente,
// mesmo a query de "agendadas" coincidindo). Baseado exclusivamente em
// scheduledAt (a DATA DA VISITA), nunca em completedAt/cancelledAt — ou
// seja, "Concluídas hoje"/"Canceladas hoje" significam "visitas cujo
// horário marcado era hoje e que terminaram concluídas/canceladas", não
// "ações realizadas hoje" (uma visita de ontem concluída agora NÃO entra
// aqui). Sempre GLOBAL: não aplica busca/período/status — os filtros
// visuais da H.4 nunca mudam este número (decisão H.5, seção 12).
// -----------------------------------------------------------------------

export type ResumoDiario = { agendadas: number; concluidas: number; canceladas: number };

export async function contarResumoDiario(
  organizationId: string,
  // Fuso comercial da organização — obrigatório e sem padrão: todo
  // conceito de dia aqui é da organização, nunca do processo.
  fuso: string,
  opcoes: { agora?: Date } = {}
): Promise<ResumoDiario> {
  const agora = opcoes.agora ?? new Date();
  const { inicio: inicioHoje, fim: fimHoje } = intervaloDoDia(agora, fuso);
  return withOrganization(organizationId, async () => {
    const [agendadas, concluidas, canceladas] = await Promise.all([
      prisma.scheduledActivity.count({
        where: { organizationId, status: "SCHEDULED", scheduledAt: { gte: inicioHoje, lte: fimHoje } },
      }),
      prisma.scheduledActivity.count({
        where: { organizationId, status: "COMPLETED", scheduledAt: { gte: inicioHoje, lte: fimHoje } },
      }),
      prisma.scheduledActivity.count({
        where: { organizationId, status: "CANCELLED", scheduledAt: { gte: inicioHoje, lte: fimHoje } },
      }),
    ]);
    return { agendadas, concluidas, canceladas };
  });
}
