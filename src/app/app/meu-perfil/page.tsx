import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { papelAtual } from "@/lib/papel-atual";
import { temPapel, PAPEIS_PERFIL_PUBLICO_PROPRIO } from "@/lib/authorization";
import { caminhoPerfilCorretor } from "@/lib/perfil-publico-corretor";
import { resolverBasePath } from "@/lib/site-url";
import { MeuPerfilPublicoForm } from "@/components/admin/MeuPerfilPublicoForm";

// Tela de autoatendimento do perfil público.
//
// Vive fora de /app/usuarios de propósito: aquela área é gestão de
// pessoas, e mandar um corretor editar a si mesmo por lá ensinaria que
// ele administra usuários — além de expor uma navegação que ele não pode
// usar. Aqui não existe id na URL: o vínculo é o da sessão.
export default async function MeuPerfilPublicoPage() {
  const session = await auth();
  const organizationId = await requireOrganizationId();
  const membershipId = session?.user?.organizationMemberId;

  if (!temPapel(await papelAtual(), PAPEIS_PERFIL_PUBLICO_PROPRIO) || !membershipId) {
    return (
      <div className="max-w-lg">
        <h1 className="mb-2 text-2xl font-semibold">Meu perfil público</h1>
        <p className="text-sm text-muted-foreground">
          Seu perfil de acesso não mantém um perfil público no site.
        </p>
      </div>
    );
  }

  // Só o próprio vínculo, e só as colunas do perfil público: nada de
  // papel, status ou dado de outro membro chega a esta tela.
  const membro = await prisma.organizationMember.findFirst({
    where: { id: membershipId, organizationId },
    select: {
      id: true,
      publicProfileEnabled: true,
      publicCreci: true,
      publicPhotoUrl: true,
      publicBio: true,
      publicWhatsapp: true,
      publicPhone: true,
      publicEmail: true,
      organization: { select: { slug: true } },
    },
  });

  if (!membro) {
    return (
      <div className="max-w-lg">
        <h1 className="mb-2 text-2xl font-semibold">Meu perfil público</h1>
        <p className="text-sm text-muted-foreground">
          Não encontramos seu vínculo nesta organização.
        </p>
      </div>
    );
  }

  const perfilPublicoHref = membro.publicProfileEnabled
    ? caminhoPerfilCorretor(resolverBasePath(membro.organization.slug), membro.id)
    : null;

  return (
    <div className="max-w-lg">
      <h1 className="mb-2 text-2xl font-semibold">Meu perfil público</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Estas informações aparecem no seu perfil público e nos imóveis em
        que você é apresentado como responsável. Nada aqui altera seus
        dados de acesso ao painel.
      </p>
      {!membro.publicProfileEnabled && (
        <p className="mb-4 text-sm text-muted-foreground" data-testid="perfil-nao-publicado">
          Seu perfil ainda não está publicado.
        </p>
      )}
      <MeuPerfilPublicoForm
        valores={{
          publicado: membro.publicProfileEnabled,
          creci: membro.publicCreci,
          foto: membro.publicPhotoUrl,
          bio: membro.publicBio,
          whatsapp: membro.publicWhatsapp,
          telefone: membro.publicPhone,
          email: membro.publicEmail,
        }}
        perfilPublicoHref={perfilPublicoHref}
      />
    </div>
  );
}
