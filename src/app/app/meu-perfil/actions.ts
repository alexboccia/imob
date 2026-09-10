"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { papelAtual } from "@/lib/papel-atual";
import { temPapel, PAPEIS_PERFIL_PUBLICO_PROPRIO } from "@/lib/authorization";
import { logActivity } from "@/lib/activity-log";
import { erroGenerico, erroValidacao, type ActionState } from "@/lib/action-result";
import {
  camposDoPerfilPublico,
  lerPerfilPublicoDoFormulario,
  perfilPublicoSchema,
} from "@/lib/perfil-publico-schema";
import { validarUrlMidiaOrganizacao } from "@/lib/branding/favicon-url";

// =======================================================================
// Autoatendimento do perfil público
// =======================================================================
// A diferença que importa em relação a atualizarUsuario (gestão de
// usuários) NÃO é o conjunto de campos — é a superfície:
//
//   - esta action não recebe id de membro. Nenhum. O vínculo sai da
//     sessão, então não existe parâmetro para manipular e não há IDOR a
//     testar em cima de um alvo: não há alvo.
//   - o que ela escreve é só o que camposDoPerfilPublico devolve, que
//     por construção são apenas colunas public*. Papel, status, vínculo
//     e e-mail de login não estão ali, então não há mass assignment
//     possível nem por payload adulterado.
//   - a autorização é a estreita (PAPEIS_PERFIL_PUBLICO_PROPRIO), nunca
//     a de gestão de usuários. Editar a si mesmo continua não sendo
//     administrar ninguém.
export async function salvarMeuPerfilPublico(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  const membershipId = session?.user?.organizationMemberId;
  if (!membershipId) return erroGenerico("Sessão inválida. Entre novamente.");

  // Papel lido do vínculo ATUAL no banco, nunca do JWT (doutrina da
  // Fase 27: o token é contexto, a associação é autoridade).
  if (!temPapel(await papelAtual(), PAPEIS_PERFIL_PUBLICO_PROPRIO)) {
    return erroGenerico("Seu perfil de acesso não mantém perfil público.");
  }

  const organizationId = await requireOrganizationId();

  const parsed = perfilPublicoSchema.safeParse(lerPerfilPublicoDoFormulario(formData));
  if (!parsed.success) return erroValidacao(parsed.error);

  const campos = camposDoPerfilPublico(parsed.data);

  // A foto chega como URL num campo escondido. Ela precisa ser um objeto
  // DESTE bucket, DESTA organização e da pasta de perfil — o mesmo
  // validador de favicon/logo/materiais. Sem isso, um payload adulterado
  // apontaria a própria foto para o arquivo de outro tenant.
  if (
    campos.publicPhotoUrl &&
    !validarUrlMidiaOrganizacao(campos.publicPhotoUrl, organizationId, "perfil") &&
    !validarUrlMidiaOrganizacao(campos.publicPhotoUrl, organizationId, "usuarios")
  ) {
    return erroGenerico("Imagem inválida. Envie a foto novamente.");
  }

  // updateMany com organizationId no where: o vínculo da sessão já é
  // desta organização, e repetir o escopo aqui é a mesma defesa em
  // profundidade que o resto do produto aplica.
  const { count } = await prisma.organizationMember.updateMany({
    where: { id: membershipId, organizationId },
    data: campos,
  });
  if (count === 0) return erroGenerico("Não foi possível salvar. Entre novamente.");

  await logActivity({
    organizationId,
    userId: session!.user.id,
    entity: "OrganizationMember",
    entityId: membershipId,
    action: campos.publicProfileEnabled ? "perfil_publico_ativado" : "perfil_publico_desativado",
  });

  revalidatePath("/app/meu-perfil");
  // A ficha do imóvel e o perfil público leem estes campos.
  revalidatePath("/imoveis");
  return { success: true, message: "Perfil público atualizado." };
}
