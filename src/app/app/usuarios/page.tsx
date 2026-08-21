import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { temPapel, PAPEIS_GESTAO_USUARIOS } from "@/lib/authorization";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import {
  interpretarPaginacao,
  interpretarOrdenacao,
  interpretarFiltros,
  normalizarBusca,
} from "@/lib/pagination";
import { construirWhereUsuarios } from "@/lib/listagens-admin-query";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { NovoUsuarioSheet } from "@/components/admin/usuarios/NovoUsuarioSheet";
import { UsuariosKpiCards } from "@/components/admin/usuarios/UsuariosKpiCards";
import { UsuariosFiltrosBar } from "@/components/admin/usuarios/UsuariosFiltrosBar";
import { usuarioColumns, type UsuarioRow } from "./columns";
import type { Prisma } from "@/generated/prisma/client";

// "nome"/"email" vivem no User relacionado, não em OrganizationMember —
// por isso o orderBy precisa de um mapeamento próprio (não dá pra usar
// {[campo]: direcao} genérico como nas outras listagens).
const CAMPOS_ORDENAVEIS = ["nome", "email", "papel", "ativo"] as const;
// Chave da coluna renderizada (columns.tsx) -> campo aceito pelo servidor.
// "nome" propositalmente FORA deste mapa: a coluna "Usuário" (id "nome")
// tem seu próprio cabeçalho de ordenação (UsuarioColunaOrdenacao, dois
// alvos clicáveis — Nome e E-mail), renderizado por columns.tsx. Se
// "nome" estivesse aqui, o DataTable embrulharia esse cabeçalho custom no
// próprio <button> dele (achado da auditoria pré-commit, Finding #1) —
// um botão dentro de outro botão, HTML inválido e clique quebrado.
const SORT_MAP: Record<string, string> = { papel: "papel", status: "ativo" };

function construirOrderBy(
  campo: string,
  direcao: "asc" | "desc"
): Prisma.OrganizationMemberOrderByWithRelationInput {
  switch (campo) {
    case "nome":
      return { user: { name: direcao } };
    case "email":
      return { user: { email: direcao } };
    case "papel":
      return { role: direcao };
    case "ativo":
      return { status: direcao };
    default:
      return { createdAt: "asc" };
  }
}

const PAPEIS_VALIDOS = new Set(Object.keys(PAPEL_USUARIO_LABEL));
const STATUS_VALIDOS = ["ACTIVE", "SUSPENDED"] as const;
const STATUS_VALIDOS_SET = new Set<string>(STATUS_VALIDOS);

type SearchParams = {
  page?: string;
  pageSize?: string;
  search?: string;
  sort?: string;
  filters?: string;
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const organizationId = await requireOrganizationId();
  const ehAdministrador = temPapel(session?.user.role, PAPEIS_GESTAO_USUARIOS);
  const sessaoEhOwner = session?.user.role === "OWNER";

  const params = await searchParams;
  // Times por organização são inerentemente pequenos (limitados pelo
  // plano) — não há necessidade real de páginas grandes aqui, mas segue o
  // mesmo contrato de paginação server-side das outras listagens.
  const { page, pageSize, skip, take } = interpretarPaginacao(params, { pageSizePadrao: 20 });
  const busca = normalizarBusca(params.search);
  const filtros = interpretarFiltros(params.filters, ["papel", "status"] as const);
  const papelFiltro = filtros.papel && PAPEIS_VALIDOS.has(filtros.papel) ? filtros.papel : undefined;
  const statusFiltro = filtros.status && STATUS_VALIDOS_SET.has(filtros.status) ? filtros.status : undefined;
  const ordenacao = interpretarOrdenacao(params.sort, CAMPOS_ORDENAVEIS, {
    campo: "nome",
    direcao: "asc",
  });

  const where = construirWhereUsuarios({ organizationId, busca, papelFiltro, statusFiltro });

  // KPIs (Hoje/Próximas/Atrasadas... equivalente de Usuários): 4 counts
  // baratos + a página atual da listagem, tudo num único Promise.all —
  // nenhuma query nova por card, nenhum N+1 por linha. Os 4 counts são
  // sempre GLOBAIS (não aplicam busca/papel/status), mesmo racional dos
  // KPIs de Clientes/Pipeline/Agenda: "visão geral do time", não "quantos
  // bateram com o filtro atual".
  const [membros, totalCount, totalGeral, administradores, corretores, ativos] = await Promise.all([
    prisma.organizationMember.findMany({
      where,
      orderBy: construirOrderBy(ordenacao.campo, ordenacao.direcao),
      skip,
      take,
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.organizationMember.count({ where }),
    prisma.organizationMember.count({ where: { organizationId } }),
    prisma.organizationMember.count({ where: { organizationId, role: { in: ["OWNER", "ADMIN"] } } }),
    prisma.organizationMember.count({ where: { organizationId, role: "BROKER" } }),
    prisma.organizationMember.count({ where: { organizationId, status: "ACTIVE" } }),
  ]);

  const linhas: UsuarioRow[] = membros.map((membro) => {
    const ehVoceMesmo = membro.id === session?.user.organizationMemberId;
    // Mesma regra de actions.ts (envolveOwner): só quem já é OWNER
    // consegue gerenciar (editar papel/status de) outro OWNER. A UI só
    // evita oferecer uma ação que a Server Action recusaria de qualquer
    // forma — a garantia de verdade continua sendo sempre no servidor.
    const podeGerenciar = ehAdministrador && (membro.role !== "OWNER" || sessaoEhOwner);
    return {
      id: membro.id,
      nome: membro.user.name,
      email: membro.user.email,
      papel: membro.role,
      status: membro.status,
      ativo: membro.status === "ACTIVE",
      ehVoceMesmo,
      podeGerenciar,
    };
  });

  const temFiltroOuBuscaAtivo = Boolean(busca || papelFiltro || statusFiltro);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os administradores, gestores e corretores que têm acesso ao painel.
          </p>
        </div>
        {ehAdministrador && <NovoUsuarioSheet />}
      </div>

      {!ehAdministrador && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Apenas administradores podem criar ou editar usuários.
          </CardContent>
        </Card>
      )}

      <UsuariosKpiCards
        total={totalGeral}
        administradores={administradores}
        corretores={corretores}
        ativos={ativos}
      />

      <UsuariosFiltrosBar statusValidos={STATUS_VALIDOS} />

      <DataTable
        columns={usuarioColumns}
        data={linhas}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortableColumns={SORT_MAP}
        searchPlaceholder="Buscar por nome ou e-mail..."
        emptyMessage={
          temFiltroOuBuscaAtivo ? (
            "Nenhum usuário encontrado com esses filtros."
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p>Nenhum usuário cadastrado ainda.</p>
              {ehAdministrador && (
                <NovoUsuarioSheet labelBotao="Cadastrar primeiro usuário" variantBotao="outline" />
              )}
            </div>
          )
        }
      />
    </div>
  );
}
