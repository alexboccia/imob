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

  // Fase 131 — mesmo esqueleto das outras telas administrativas de
  // conteúdo (Meu perfil público, Configurações): `space-y-5`, cabeçalho
  // em bloco próprio e NENHUMA largura máxima — quem limita a linha é o
  // <main> do layout do painel. O `max-w-lg` continua valendo só pro
  // estado de RECUSA acima (sem papel elegível), que é uma tela curta de
  // uma frase só, não de conteúdo.
  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight">
          Editar usuário
        </h1>
        <p className="text-sm text-muted-foreground">
          Dados de acesso, contatos e perfil público deste usuário.
        </p>
      </div>
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
