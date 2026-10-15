import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { temPapel, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { interpretarPaginacao, interpretarFiltros, normalizarBusca } from "@/lib/pagination";
import { construirWhereAuditoria } from "@/lib/listagens-admin-query";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { FiltroDropdown } from "@/components/admin/data-table/FiltroDropdown";
import { PeriodoFiltro } from "./PeriodoFiltro";
import { auditoriaColumns, type AuditoriaRow } from "./columns";

type SearchParams = {
  page?: string;
  pageSize?: string;
  search?: string;
  filters?: string;
  de?: string;
  ate?: string;
};

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const organizationId = await requireOrganizationId();

  // Gate de PÁGINA, mesmo padrão de /app/configuracoes: nenhuma consulta
  // abaixo roda se o papel não for autorizado. Reaproveita
  // PAPEIS_GESTAO_CONFIGURACOES (OWNER/ADMIN) — já coberto por testes em
  // src/lib/authorization.test.ts, nenhum conjunto novo foi necessário.
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_CONFIGURACOES)) {
    return (
      <div className="max-w-lg">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Logs de Auditoria</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Apenas administradores podem consultar os logs de auditoria da imobiliária.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const { page, pageSize, skip, take } = interpretarPaginacao(params);
  // "search" existe no padrão de searchParams desta aplicação, mas não é
  // usado aqui: ActivityLog não tem nenhum campo de texto livre que valha
  // a pena indexar para ILIKE (entity/action já são allowlist via
  // dropdown, entityId é um cuid opaco). Mantido fora do `where` para não
  // fingir uma busca que não existiria de verdade.
  normalizarBusca(params.search);
  const filtros = interpretarFiltros(params.filters, ["userId", "entity", "action"] as const);

  const where = construirWhereAuditoria({
    organizationId,
    userIdFiltro: filtros.userId,
    entityFiltro: filtros.entity,
    actionFiltro: filtros.action,
    de: params.de,
    ate: params.ate,
  });

  const [logs, totalCount, membros, entidadesDistintas, acoesDistintas] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.activityLog.count({ where }),
    // Opções do filtro "Usuário" — membros da PRÓPRIA organização, nunca
    // todos os usuários do sistema (isso vazaria nomes de outras
    // imobiliárias no dropdown, mesmo sem vazar os logs em si).
    prisma.organizationMember.findMany({
      where: { organizationId },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.activityLog.findMany({
      where: { organizationId },
      select: { entity: true },
      distinct: ["entity"],
      orderBy: { entity: "asc" },
    }),
    prisma.activityLog.findMany({
      where: { organizationId },
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    }),
  ]);

  // userId em ActivityLog é um id solto (sem relation no Prisma — ver
  // diagnóstico, seção 2.1), então o nome é resolvido à parte, só para os
  // userIds que realmente aparecem nesta página — nunca uma consulta
  // "todos os usuários" nem um include que o schema não suporta.
  const userIdsNaPagina = [...new Set(logs.map((log) => log.userId).filter((id): id is string => !!id))];
  const usuarios = userIdsNaPagina.length
    ? await prisma.user.findMany({
        where: { id: { in: userIdsNaPagina } },
        select: { id: true, name: true },
      })
    : [];
  const nomePorUserId = new Map(usuarios.map((u) => [u.id, u.name]));

  const linhas: AuditoriaRow[] = logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    usuarioNome: log.userId ? (nomePorUserId.get(log.userId) ?? null) : null,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    payload: log.payload as Record<string, unknown> | null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Logs de Auditoria</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Histórico de operações realizadas pelos usuários da sua imobiliária. Somente leitura.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodoFiltro />
        <FiltroDropdown
          chave="userId"
          label="Usuário"
          opcoes={membros
            .filter((m): m is { user: { id: string; name: string } } => m.user !== null)
            .map((m) => ({ value: m.user.id, label: m.user.name }))}
        />
        <FiltroDropdown
          chave="entity"
          label="Módulo"
          opcoes={entidadesDistintas.map((e) => ({ value: e.entity, label: e.entity }))}
        />
        <FiltroDropdown
          chave="action"
          label="Ação"
          opcoes={acoesDistintas.map((a) => ({ value: a.action, label: a.action }))}
        />
      </div>

      <DataTable
        columns={auditoriaColumns}
        data={linhas}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        hideSearchBar
        emptyMessage="Nenhum evento de auditoria registrado ainda."
      />
    </div>
  );
}
