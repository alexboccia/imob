import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { CriarUsuarioForm } from "@/components/admin/CriarUsuarioForm";
import { usuarioColumns, type UsuarioRow } from "./columns";

export default async function UsuariosPage() {
  const session = await auth();
  const organizationId = await requireOrganizationId();
  const ehAdministrador = session?.user.role === "OWNER" || session?.user.role === "ADMIN";

  const membros = await prisma.organizationMember.findMany({
    where: { organizationId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

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

      <DataTable
        columns={usuarioColumns}
        data={linhas}
        searchPlaceholder="Buscar por nome ou e-mail..."
        emptyMessage="Nenhum usuário cadastrado ainda."
      />
    </div>
  );
}
