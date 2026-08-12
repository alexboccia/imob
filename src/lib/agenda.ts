import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { inicioDoDiaUTC, fimDoDiaUTC, type StatusScheduledActivity } from "@/lib/scheduled-activity-date";

// Agenda do corretor (Fase H.3) — projeção operacional de ScheduledActivity,
// nunca uma segunda fonte de verdade. Nenhuma tabela nova, nenhum estado
// paralelo: só consultas read-only sobre o model já existente da H.1,
// filtradas explicitamente por type="VISIT" (única variante hoje, mas o
// filtro fica explícito pra quando o enum crescer).

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

export type ContadoresAgenda = { hoje: number; proximas: number; anteriores: number };

// Limites defensivos documentados (seção 19 da H.3) — "Hoje" carrega o dia
// inteiro sem limite (não é um caso real de crescimento ilimitado); Próximas
// usa um teto fixo sem paginação completa (não há UI de "próxima página"
// pra esta aba); Anteriores usa paginação real via skip/take, resolvida
// pelo caller (page.tsx) com src/lib/pagination.ts, mesmo padrão de toda
// listagem administrativa do projeto.
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

// HOJE: SCHEDULED + scheduledAt dentro do dia UTC-literal atual. Sem
// limite — o volume de visitas de um único dia nunca é grande o bastante
// pra justificar paginação.
export async function buscarAgendaHoje(
  organizationId: string,
  opcoes: { agora?: Date } = {}
): Promise<ItemAgenda[]> {
  const agora = opcoes.agora ?? new Date();
  return withOrganization(organizationId, async () => {
    const linhas = await prisma.scheduledActivity.findMany({
      where: {
        organizationId,
        type: "VISIT",
        status: "SCHEDULED",
        scheduledAt: { gte: inicioDoDiaUTC(agora), lte: fimDoDiaUTC(agora) },
      },
      orderBy: { scheduledAt: "asc" },
      select: SELECT_ITEM_AGENDA,
    });
    return linhas.map((linha) => paraItemAgenda(linha, organizationId));
  });
}

// PRÓXIMAS: SCHEDULED + scheduledAt depois do fim de hoje. Limite defensivo
// fixo (LIMITE_PROXIMAS), sem paginação completa nesta aba.
export async function buscarAgendaProximas(
  organizationId: string,
  opcoes: { agora?: Date; limite?: number } = {}
): Promise<ItemAgenda[]> {
  const agora = opcoes.agora ?? new Date();
  const limite = opcoes.limite ?? LIMITE_PROXIMAS;
  return withOrganization(organizationId, async () => {
    const linhas = await prisma.scheduledActivity.findMany({
      where: {
        organizationId,
        type: "VISIT",
        status: "SCHEDULED",
        scheduledAt: { gt: fimDoDiaUTC(agora) },
      },
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
  opcoes: { agora?: Date; skip?: number; take?: number } = {}
): Promise<ItemAgenda[]> {
  const agora = opcoes.agora ?? new Date();
  const skip = opcoes.skip ?? 0;
  const take = opcoes.take;
  return withOrganization(organizationId, async () => {
    const linhas = await prisma.scheduledActivity.findMany({
      where: {
        organizationId,
        type: "VISIT",
        OR: [
          { status: "COMPLETED" },
          { status: "CANCELLED" },
          { status: "SCHEDULED", scheduledAt: { lt: inicioDoDiaUTC(agora) } },
        ],
      },
      orderBy: { scheduledAt: "desc" },
      skip,
      take,
      select: SELECT_ITEM_AGENDA,
    });
    return linhas.map((linha) => paraItemAgenda(linha, organizationId));
  });
}

// Contagem por aba pra badges na navegação — 3 counts baratos (mesmo índice
// @@index([organizationId, status, scheduledAt]) da H.1 cobre os três),
// nunca uma query por linha.
export async function contarAgenda(
  organizationId: string,
  opcoes: { agora?: Date } = {}
): Promise<ContadoresAgenda> {
  const agora = opcoes.agora ?? new Date();
  return withOrganization(organizationId, async () => {
    const [hoje, proximas, anteriores] = await Promise.all([
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
    ]);
    return { hoje, proximas, anteriores };
  });
}
