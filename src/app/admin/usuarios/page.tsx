import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { CriarUsuarioForm } from "@/components/admin/CriarUsuarioForm";
import { usuarioColumns, type UsuarioRow } from "./columns";

export default async function UsuariosPage() {
  const session = await auth();
  const ehAdministrador = session?.user.papel === "ADMINISTRADOR";

  const usuarios = await prisma.usuario.findMany({ orderBy: { criadoEm: "asc" } });

  const linhas: UsuarioRow[] = usuarios.map((usuario) => ({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    ativo: usuario.ativo,
    ehVoceMesmo: usuario.id === session?.user.id,
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
