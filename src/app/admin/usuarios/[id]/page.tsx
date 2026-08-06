import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EditarUsuarioForm } from "@/components/admin/EditarUsuarioForm";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) notFound();

  if (session?.user.papel !== "ADMINISTRADOR") {
    return (
      <div className="max-w-lg">
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem editar usuários.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">Editar usuário</h1>
      <EditarUsuarioForm
        usuario={{
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
          ativo: usuario.ativo,
          foto: usuario.foto,
        }}
        ehVoceMesmo={usuario.id === session.user.id}
      />
    </div>
  );
}
