"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { verificarLimiteUsuarios, LimiteDoPlanoError } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity-log";
import { temPapel, PAPEIS_GESTAO_USUARIOS } from "@/lib/authorization";
import {
  type ActionState,
  erroAcessoNegado,
  erroGenerico,
  erroValidacao,
  sucesso,
} from "@/lib/action-result";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "BROKER", "ASSISTANT"] as const;

const booleanCheckbox = z.preprocess((v) => v === "on", z.boolean());

const criarUsuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  senha: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
  papel: z.enum(ROLES),
});

export async function criarUsuario(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_USUARIOS)) {
    return erroAcessoNegado();
  }

  const parsed = criarUsuarioSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;

  // Só quem já é OWNER pode conceder o papel de OWNER a alguém — um ADMIN
  // não pode criar um usuário já nascendo com o papel mais alto.
  if (dados.papel === "OWNER" && session.user.role !== "OWNER") {
    return erroAcessoNegado(
      "Apenas o proprietário pode conceder o papel de proprietário."
    );
  }

  const existente = await prisma.user.findUnique({
    where: { email: dados.email },
  });
  if (existente) {
    return erroGenerico("Já existe um usuário com esse e-mail.");
  }

  const organizationId = await requireOrganizationId();
  try {
    await verificarLimiteUsuarios(organizationId);
  } catch (erro) {
    if (erro instanceof LimiteDoPlanoError) {
      return erroGenerico(erro.message);
    }
    throw erro;
  }

  const senhaHash = await bcrypt.hash(dados.senha, 10);

  const user = await prisma.user.create({
    data: {
      name: dados.nome,
      email: dados.email,
      passwordHash: senhaHash,
    },
  });

  await prisma.organizationMember.create({
    data: { organizationId, userId: user.id, role: dados.papel },
  });

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "User",
    entityId: user.id,
    action: "created",
    payload: { email: user.email, role: dados.papel },
  });

  // Redesenho de Usuários — não redireciona mais (era redirect("/app/usuarios"),
  // que forçava uma navegação de página inteira mesmo quando o formulário
  // agora abre dentro de um Sheet lateral, NovoUsuarioSheet). Mesmo padrão já
  // adotado em criarPessoa (Fase de redesenho de Clientes): devolve sucesso
  // e deixa o componente cliente decidir o que fazer (fechar o Sheet), a
  // revalidação de path continua garantindo que a listagem reflita o novo
  // usuário assim que a página for revisitada/revalidada.
  revalidatePath("/app/usuarios");
  return sucesso("Usuário cadastrado.");
}

// Compartilhado entre atualizarUsuario e alternarStatusUsuario — nunca
// deixa a organização sem nenhum OWNER/ADMIN ativo. `membershipId` é
// sempre excluído da contagem porque a checagem só roda quando ELE é quem
// está perdendo a condição de admin ativo (rebaixado e/ou desativado).
async function garantirNaoUltimoAdminAtivo(
  organizationId: string,
  membershipId: string
): Promise<ActionState | null> {
  const outrosAdmins = await prisma.organizationMember.count({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN"] },
      status: "ACTIVE",
      id: { not: membershipId },
    },
  });
  if (outrosAdmins === 0) {
    return erroGenerico("Precisa haver ao menos um administrador ativo.");
  }
  return null;
}

const atualizarUsuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome."),
  papel: z.enum(ROLES),
  ativo: booleanCheckbox,
  foto: z.string().optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
  emailContato: z
    .string()
    .email("E-mail de contato inválido.")
    .optional()
    .or(z.literal("")),
  novaSenha: z
    .string()
    .min(6, "A nova senha precisa ter ao menos 6 caracteres.")
    .optional()
    .or(z.literal("")),
});

export async function atualizarUsuario(
  membershipId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_USUARIOS)) {
    return erroAcessoNegado();
  }

  const parsed = atualizarUsuarioSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;

  const organizationId = await requireOrganizationId();
  const membershipAlvo = await prisma.organizationMember.findFirst({
    where: { id: membershipId, organizationId },
  });
  if (!membershipAlvo) {
    return erroGenerico("Usuário não encontrado.");
  }

  const ehVoceMesmo = membershipId === session.user.organizationMemberId;

  // Defesa em profundidade: um usuário nunca altera o próprio papel por
  // esta action, mesmo que o cliente envie um valor diferente no FormData
  // (o formulário já esconde esse campo na edição de si mesmo, mas a
  // garantia de verdade tem que ser no servidor). Isso também elimina
  // qualquer caminho de autoescalação de privilégio.
  const papelFinal = ehVoceMesmo ? membershipAlvo.role : dados.papel;

  // Só quem já é OWNER pode conceder OU remover o papel de OWNER de
  // alguém — cobre tanto promover um membro para OWNER quanto rebaixar um
  // OWNER existente.
  const envolveOwner = membershipAlvo.role === "OWNER" || papelFinal === "OWNER";
  if (envolveOwner && session.user.role !== "OWNER") {
    return erroAcessoNegado(
      "Apenas o proprietário pode conceder ou remover o papel de proprietário."
    );
  }

  const eraAdmin = membershipAlvo.role === "OWNER" || membershipAlvo.role === "ADMIN";
  const continuaAdmin = papelFinal === "OWNER" || papelFinal === "ADMIN";

  if (ehVoceMesmo) {
    if (!dados.ativo) {
      return erroGenerico("Você não pode desativar sua própria conta.");
    }
  } else if (eraAdmin && (!continuaAdmin || !dados.ativo)) {
    const erro = await garantirNaoUltimoAdminAtivo(organizationId, membershipId);
    if (erro) return erro;
  }

  await prisma.user.update({
    where: { id: membershipAlvo.userId },
    data: {
      name: dados.nome,
      avatarUrl: dados.foto || null,
      ...(dados.novaSenha
        ? { passwordHash: await bcrypt.hash(dados.novaSenha, 10) }
        : {}),
    },
  });

  await prisma.organizationMember.update({
    where: { id: membershipId, organizationId },
    data: {
      role: papelFinal,
      status: dados.ativo ? "ACTIVE" : "SUSPENDED",
      whatsapp: dados.whatsapp ? dados.whatsapp.replace(/\D/g, "") : null,
      contactEmail: dados.emailContato || null,
    },
  });

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "User",
    entityId: membershipAlvo.userId,
    action: "updated",
  });

  revalidatePath("/app/usuarios");
  revalidatePath(`/app/usuarios/${membershipId}`);
  redirect("/app/usuarios");
}

// Redesenho de Usuários — ação rápida da coluna "Ações" da listagem:
// alterna só OrganizationMember.status, sem passar pelo formulário
// completo de edição. Reaproveita EXATAMENTE as mesmas proteções de
// atualizarUsuario acima (auto-proteção, guard de OWNER, guard do último
// admin ativo, via garantirNaoUltimoAdminAtivo compartilhado) — nenhuma
// regra nova, só uma superfície de UI mais rápida pra uma capacidade que
// já existia (o checkbox "Usuário ativo" do formulário completo). Nunca
// toca em papel/nome/foto/senha — só o status.
export async function alternarStatusUsuario(
  membershipId: string,
  novoAtivo: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_USUARIOS)) {
    return erroAcessoNegado();
  }

  const organizationId = await requireOrganizationId();
  const membershipAlvo = await prisma.organizationMember.findFirst({
    where: { id: membershipId, organizationId },
  });
  if (!membershipAlvo) {
    return erroGenerico("Usuário não encontrado.");
  }

  const ehVoceMesmo = membershipId === session.user.organizationMemberId;
  if (ehVoceMesmo && !novoAtivo) {
    return erroGenerico("Você não pode desativar sua própria conta.");
  }

  // Mesma regra de atualizarUsuario: só quem já é OWNER pode ativar ou
  // desativar outro OWNER, independente da direção da mudança.
  if (membershipAlvo.role === "OWNER" && session.user.role !== "OWNER") {
    return erroAcessoNegado(
      "Apenas o proprietário pode ativar ou desativar outro proprietário."
    );
  }

  const eraAdmin = membershipAlvo.role === "OWNER" || membershipAlvo.role === "ADMIN";
  if (eraAdmin && !novoAtivo) {
    const erro = await garantirNaoUltimoAdminAtivo(organizationId, membershipId);
    if (erro) return erro;
  }

  await prisma.organizationMember.update({
    where: { id: membershipId, organizationId },
    data: { status: novoAtivo ? "ACTIVE" : "SUSPENDED" },
  });

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "User",
    entityId: membershipAlvo.userId,
    action: "updated",
    payload: { status: novoAtivo ? "ACTIVE" : "SUSPENDED" },
  });

  revalidatePath("/app/usuarios");
  return sucesso(novoAtivo ? "Usuário ativado." : "Usuário desativado.");
}
