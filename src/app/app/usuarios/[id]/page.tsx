import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { temPapel, PAPEIS_GESTAO_USUARIOS } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { EditarUsuarioForm } from "@/components/admin/EditarUsuarioForm";
import { caminhoPerfilCorretor } from "@/lib/perfil-publico-corretor";
import { resolverBasePath } from "@/lib/site-url";

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
    include: { user: true, organization: { select: { slug: true } } },
  });
  if (!membro) notFound();

  // Link para a página pública real — e só quando ela existe de fato. Com
  // a exibição desmarcada a rota devolve 404, então não há CTA nenhum:
  // preview que termina em erro é pior que preview nenhum.
  const perfilPublicoHref = membro.publicProfileEnabled
    ? caminhoPerfilCorretor(resolverBasePath(membro.organization.slug), membro.id)
    : null;

  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)) {
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
            telefone: membro.publicPhone,
            email: membro.publicEmail,
          },
        }}
        perfilPublicoHref={perfilPublicoHref}
        ehVoceMesmo={membro.id === session?.user.organizationMemberId}
        podeGerenciarOwner={session?.user.role === "OWNER"}
      />
    </div>
  );
}
