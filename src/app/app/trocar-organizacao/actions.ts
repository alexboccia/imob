"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth, unstable_update } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { logActivity } from "@/lib/activity-log";
import { erroAcessoNegado, erroGenerico, type ActionState } from "@/lib/action-result";

// =======================================================================
// Trocar de organização (Fase 26)
// =======================================================================
// A única superfície que reescreve o tenant da sessão. Tudo que ela
// aceita do cliente é um organizationId — que por si só não vale nada:
// a autoridade é o VÍNCULO no banco, verificado aqui e revalidado de
// novo a cada requisição por requireOrganizationId.
export async function trocarOrganizacao(
  organizationId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/login");

  // Revalida a sessão ATUAL antes de qualquer coisa. Sem isto, trocar de
  // organização seria um caminho para reemitir um JWT — e portanto um
  // `iat` novo — a partir de uma sessão que já deveria ter morrido
  // (senha trocada, vínculo suspenso). A troca não pode ser a porta dos
  // fundos das invariantes da Fase 25.
  await requireOrganizationId();

  const alvo = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      userId: session.user.id,
      // As três condições que definem "acessível". Faltando qualquer
      // uma, o vínculo simplesmente não é encontrado — mesma mensagem
      // para inexistente, suspenso, de outra pessoa ou de organização
      // desativada. Nada é revelado sobre o que existe do outro lado.
      status: "ACTIVE",
      organization: { active: true },
    },
    select: { id: true, role: true, organizationId: true },
  });

  if (!alvo) {
    return erroAcessoNegado("Você não tem acesso a esta imobiliária.");
  }

  // Os três campos são reescritos JUNTOS. É o que impede o papel do
  // tenant anterior de sobreviver no tenant novo.
  const sessaoAtualizada = await unstable_update({
    user: {
      organizationId: alvo.organizationId,
      organizationMemberId: alvo.id,
      role: alvo.role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // AUSÊNCIA DE EXCEÇÃO NÃO É SUCESSO — e isto não é zelo teórico, é a
  // cicatriz de um bug real desta fase: as claims chegam dentro de
  // `user`, o callback do JWT lia a raiz, e a troca simplesmente não
  // acontecia. Nada lançava. A action redirecionava, a tela recarregava
  // e voltava calada para a organização anterior, como se o clique não
  // tivesse existido.
  //
  // A verificação é sobre o CONTEXTO EFETIVO: a sessão reemitida precisa
  // dizer que agora é a organização pedida. Se não disser, o usuário vê
  // um erro factual em vez de um sucesso silencioso.
  if (sessaoAtualizada?.user?.organizationId !== alvo.organizationId) {
    return erroGenerico(
      "Não foi possível trocar de imobiliária agora. Tente novamente em alguns instantes."
    );
  }

  await logActivity({
    organizationId: alvo.organizationId,
    userId: session.user.id,
    entity: "OrganizationMember",
    entityId: alvo.id,
    action: "organization_switched",
  });

  // O layout inteiro depende do tenant: nome no menu, itens por papel,
  // dados de toda tela. Revalidar a árvore de /app evita servir a
  // organização anterior a partir do cache de rota.
  revalidatePath("/app", "layout");
  redirect("/app");
}
