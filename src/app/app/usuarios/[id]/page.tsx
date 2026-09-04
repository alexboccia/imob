import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { temPapel, PAPEIS_GESTAO_USUARIOS } from "@/lib/authorization";
import { EditarUsuarioForm } from "@/components/admin/EditarUsuarioForm";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const organizationId = await requireOrganizationId();

  const membro = await prisma.organizationMember.findFirst({
    where: { id, organizationId },
    include: { user: true },
  });
  if (!membro) notFound();

  if (!temPapel(session?.user.role, PAPEIS_GESTAO_USUARIOS)) {
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
          id: membro.id,
          nome: membro.user.name,
          email: membro.user.email,
          papel: membro.role,
          ativo: membro.status === "ACTIVE",
          foto: membro.user.avatarUrl,
          whatsapp: membro.whatsapp,
          emailContato: membro.contactEmail,
          perfilPublico: {
            publicado: membro.publicProfileEnabled,
            creci: membro.publicCreci,
            foto: membro.publicPhotoUrl,
            bio: membro.publicBio,
            whatsapp: membro.publicWhatsapp,
          },
        }}
        ehVoceMesmo={membro.id === session?.user.organizationMemberId}
        podeGerenciarOwner={session?.user.role === "OWNER"}
      />
    </div>
  );
}
