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
import { FiltroDropdown } from "@/components/admin/data-table/FiltroDropdown";
import { CriarUsuarioForm } from "@/components/admin/CriarUsuarioForm";
import { usuarioColumns, type UsuarioRow } from "./columns";
import type { Prisma } from "@/generated/prisma/client";

// "nome"/"email" vivem no User relacionado, não em OrganizationMember —
// por isso o orderBy precisa de um mapeamento próprio (não dá pra usar
// {[campo]: direcao} genérico como nas outras listagens).
const CAMPOS_ORDENAVEIS = ["nome", "email", "papel", "ativo"] as const;
const SORT_MAP: Record<string, string> = { nome: "nome", email: "email", papel: "papel", ativo: "ativo" };

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

  const params = await searchParams;
  // Times por organização são inerentemente pequenos (limitados pelo
  // plano) — não há necessidade real de páginas grandes aqui, mas segue o
  // mesmo contrato de paginação server-side das outras listagens.
  const { page, pageSize, skip, take } = interpretarPaginacao(params, { pageSizePadrao: 20 });
  const busca = normalizarBusca(params.search);
  const filtros = interpretarFiltros(params.filters, ["papel"] as const);
  const papelFiltro = filtros.papel && PAPEIS_VALIDOS.has(filtros.papel) ? filtros.papel : undefined;
  const ordenacao = interpretarOrdenacao(params.sort, CAMPOS_ORDENAVEIS, {
    campo: "nome",
    direcao: "asc",
  });

  const where = construirWhereUsuarios({ organizationId, busca, papelFiltro });

  const [membros, totalCount] = await Promise.all([
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
  ]);

  const linhas: UsuarioRow[] = membros.map((membro) => ({
    id: membro.id,
    nome: membro.user.name,
    email: membro.user.email,
    papel: membro.role,
    ativo: membro.status === "ACTIVE",
    ehVoceMesmo: membro.id === session?.user.organizationMemberId,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Usuários</h1>
      <p className="text-muted-foreground mb-6">
        Gerencie os administradores, gestores e corretores que têm acesso ao
        painel.
      </p>

      {ehAdministrador ? (
        <CriarUsuarioForm />
      ) : (
        <Card className="mb-6">
          <CardContent className="text-sm text-muted-foreground">
            Apenas administradores podem criar ou editar usuários.
          </CardContent>
        </Card>
      )}

      <div className="mb-3">
        <FiltroDropdown
          chave="papel"
          label="Papel"
          opcoes={Object.entries(PAPEL_USUARIO_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <DataTable
        columns={usuarioColumns}
        data={linhas}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortableColumns={SORT_MAP}
        searchPlaceholder="Buscar por nome ou e-mail..."
        emptyMessage="Nenhum usuário cadastrado ainda."
      />
    </div>
  );
}
