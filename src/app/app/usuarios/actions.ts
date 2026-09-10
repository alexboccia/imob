"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import {
  camposDoPerfilPublico,
  perfilPublicoSchema,
} from "@/lib/perfil-publico-schema";
import { verificarLimiteUsuarios, LimiteDoPlanoError } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity-log";
import { normalizarEmail } from "@/lib/rate-limit";
import { CUSTO_BCRYPT, senhaSchema } from "@/lib/senha";
import {
  gerarTokenAcesso,
  hashToken,
  expiracaoConvite,
  linkConvite,
} from "@/lib/acesso-token";
import { enviarEmailConviteMembro } from "@/lib/email";
import { temPapel, PAPEIS_GESTAO_USUARIOS } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { urlDeUploadValida } from "@/lib/upload-url";
import {
  type ActionState,
  erroAcessoNegado,
  erroGenerico,
  erroValidacao,
  sucesso,
} from "@/lib/action-result";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "BROKER", "ASSISTANT"] as const;

const booleanCheckbox = z.preprocess((v) => v === "on", z.boolean());

const convidarUsuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  papel: z.enum(ROLES),
});

// =======================================================================
// Convidar membro (Fase 25) — era criarUsuario
// =======================================================================
// O que mudou, e por quê: antes, quem administrava DIGITAVA a senha do
// novo usuário e precisava transmiti-la por WhatsApp, papel ou voz. Isso
// significa que a senha inicial de toda conta do produto existia em
// texto claro fora do sistema, e que ninguém entrava sem o
// desenvolvedor ou o admin no meio.
//
// Agora o convidado recebe um segredo de uso único por e-mail e escolhe
// a própria senha. Ninguém — nem o OWNER, nem o Super Admin — chega a
// conhecê-la.
export async function convidarUsuario(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  // MESMO conjunto de papéis que já governava a criação de usuários
  // (OWNER/ADMIN). Convidar não é uma capacidade nova que precise de um
  // papel novo: é a mesma capacidade, exercida de forma segura. MANAGER
  // continua fora — gerir equipe comercial não é administrar acessos.
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)) {
    return erroAcessoNegado();
  }

  const parsed = convidarUsuarioSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;
  const email = normalizarEmail(dados.email) ?? dados.email;

  // Regra preservada: só quem já é OWNER concede o papel de OWNER.
  if (dados.papel === "OWNER" && session.user.role !== "OWNER") {
    return erroAcessoNegado("Apenas o proprietário pode conceder o papel de proprietário.");
  }

  const organizationId = await requireOrganizationId();

  const usuarioExistente = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, active: true },
  });

  // Vínculo NESTA organização. É a única coisa sobre a qual esta tela
  // pode falar: a existência do e-mail em OUTRA imobiliária não é
  // assunto de quem administra esta — dizer "já existe um usuário com
  // esse e-mail", como antes, entregava a um admin qualquer um oráculo
  // de quem tem conta no produto inteiro.
  const vinculoExistente = usuarioExistente
    ? await prisma.organizationMember.findFirst({
        where: { organizationId, userId: usuarioExistente.id },
        select: { id: true, status: true },
      })
    : null;

  if (vinculoExistente?.status === "ACTIVE") {
    return erroGenerico("Esta pessoa já faz parte da sua equipe.");
  }
  if (vinculoExistente?.status === "SUSPENDED") {
    // Nunca reativar por convite: reativar um acesso suspenso é uma
    // decisão deliberada, e ela já tem lugar próprio na listagem.
    return erroGenerico(
      "Esta pessoa já teve acesso e está suspensa. Reative o acesso pela lista de usuários."
    );
  }
  if (vinculoExistente?.status === "INVITED") {
    return erroGenerico("Já existe um convite pendente para esta pessoa. Use “Reenviar convite”.");
  }

  try {
    await verificarLimiteUsuarios(organizationId);
  } catch (erro) {
    if (erro instanceof LimiteDoPlanoError) return erroGenerico(erro.message);
    throw erro;
  }

  const token = gerarTokenAcesso();
  const tokenHash = hashToken(token);
  const expiresAt = expiracaoConvite();

  const criado = await prisma.$transaction(async (tx) => {
    let userId = usuarioExistente?.id ?? null;

    if (!userId) {
      // Senha SENTINELA: hash de um valor aleatório que ninguém digitou
      // e ninguém conhece. Não é "senha temporária" — não existe valor
      // recuperável em lugar nenhum. A barreira real é active:false,
      // que auth.ts já recusa.
      const sentinela = await bcrypt.hash(randomUUID(), CUSTO_BCRYPT);
      const novo = await tx.user.create({
        data: { name: dados.nome, email, passwordHash: sentinela, active: false },
        select: { id: true },
      });
      userId = novo.id;
    }
    // Para um User que JÁ existe, o nome digitado por quem convida é
    // ignorado de propósito: o nome é da identidade global da pessoa, e
    // um admin de uma imobiliária não renomeia alguém em todas as
    // outras.

    await tx.organizationMember.create({
      data: { organizationId, userId, role: dados.papel, status: "INVITED" },
    });
    await tx.inviteToken.create({
      data: { userId, organizationId, tokenHash, expiresAt },
    });
    return { userId };
  });

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "OrganizationMember",
    entityId: criado.userId,
    action: "member_invited",
    // Papel entra (é decisão administrativa auditável); e-mail não.
    payload: { role: dados.papel },
  });

  // ENVIO FORA DA TRANSACTION, sempre. Manter uma transaction aberta
  // enquanto se espera uma API externa prende conexão do pool pelo tempo
  // de rede de terceiro. E a ordem importa: o convite já está PERSISTIDO
  // quando o envio é tentado, então uma falha do Resend deixa um convite
  // válido e reenviável — nunca um estado incoerente.
  const { enviado } = await enviarConviteDoMembro(organizationId, email, token, session.user.name);

  revalidatePath("/app/usuarios");
  return sucesso(
    enviado
      ? "Convite enviado."
      : "Convite criado, mas o e-mail não pôde ser enviado agora. Use “Reenviar convite”."
  );
}

// Compartilhado por convidarUsuario e reenviarConviteUsuario.
async function enviarConviteDoMembro(
  organizationId: string,
  email: string,
  token: string,
  nomeQuemConvidou: string | null | undefined
): Promise<{ enviado: boolean }> {
  const [organizacao, usuario] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    prisma.user.findUnique({ where: { email }, select: { active: true } }),
  ]);
  return enviarEmailConviteMembro({
    organizationId,
    para: email,
    nomeOrganizacao: organizacao?.name ?? "sua imobiliária",
    nomeQuemConvidou: nomeQuemConvidou || "A administração",
    linkConvite: linkConvite(token),
    jaTemConta: Boolean(usuario?.active),
  });
}

// =======================================================================
// Reenviar convite (Fase 25)
// =======================================================================
// Semântica EXPLÍCITA, a mesma já provada no convite do Platform Admin:
// os convites não usados desta pessoa nesta organização são APAGADOS
// antes de o novo nascer. Nunca dois links válidos ao mesmo tempo —
// se existissem, revogar um convite deixaria de significar alguma coisa.
export async function reenviarConviteUsuario(
  membershipId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)) {
    return erroAcessoNegado();
  }

  const organizationId = await requireOrganizationId();
  // O vínculo precisa ser DESTA organização — id de outro tenant
  // simplesmente não é encontrado, com a mesma mensagem de sempre.
  const vinculo = await prisma.organizationMember.findFirst({
    where: { id: membershipId, organizationId, status: "INVITED" },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!vinculo) {
    return erroGenerico("Não há convite pendente para este usuário.");
  }

  const token = gerarTokenAcesso();
  const tokenHash = hashToken(token);
  const expiresAt = expiracaoConvite();

  await prisma.$transaction(async (tx) => {
    // LOCK DE LINHA no vínculo antes de mexer nos tokens. Sem ele, dois
    // reenvios simultâneos não enxergam as escritas um do outro (cada
    // transaction apaga o que via ANTES e insere o seu), e a organização
    // termina com DOIS convites válidos — o que faz "revogar o anterior"
    // deixar de significar alguma coisa. O vínculo é o mutex natural:
    // é exatamente o recurso que os dois pedidos disputam.
    await tx.$queryRaw`SELECT id FROM organization_members WHERE id = ${membershipId} FOR UPDATE`;
    await tx.inviteToken.deleteMany({
      where: { userId: vinculo.userId, organizationId, usedAt: null },
    });
    await tx.inviteToken.create({
      data: { userId: vinculo.userId, organizationId, tokenHash, expiresAt },
    });
  });

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "OrganizationMember",
    entityId: membershipId,
    action: "member_invite_resent",
  });

  const { enviado } = await enviarConviteDoMembro(
    organizationId,
    vinculo.user.email,
    token,
    session.user.name
  );

  revalidatePath("/app/usuarios");
  return enviado
    ? sucesso("Convite reenviado.")
    : erroGenerico("O e-mail não pôde ser enviado agora. Tente novamente em instantes.");
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
  // Mesma política de senha do convite e da recuperação (@/lib/senha) —
  // um único lugar decide o que é uma senha aceitável no produto.
  novaSenha: senhaSchema.optional().or(z.literal("")),
  // Perfil público do profissional. Aceita os campos SEMPRE (mesmo com a
  // exibição desmarcada) de propósito: dá pra montar o perfil antes de
  // publicar, e desmarcar depois não apaga nada. Quem decide o que vai ao
  // ar é só perfilPublicoAtivo, lido pelo site em
  // resolverCorretorPublico.
}).extend(perfilPublicoSchema.shape);

export async function atualizarUsuario(
  membershipId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)) {
    return erroAcessoNegado();
  }

  const parsed = atualizarUsuarioSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;

  // As fotos vêm de /api/admin/upload (autenticado, por papel, com
  // validação de arquivo) e voltam num campo escondido do formulário.
  // Como qualquer campo, uma chamada direta à action poderia mandar
  // outra URL — daí a checagem contra o host de upload do produto. A
  // foto pública é a que mais importa aqui: ela é renderizada no site.
  if (!urlDeUploadValida(dados.foto) || !urlDeUploadValida(dados.perfilPublicoFoto)) {
    return erroGenerico("Imagem inválida: envie a foto pelo próprio formulário.");
  }

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
      // Fase 25 — trocar a senha de alguém DERRUBA as sessões daquela
      // pessoa (passwordChangedAt, ver requireOrganizationId). É o
      // ponto: se um administrador precisou redefinir a senha de um
      // membro, quem estava usando a senha antiga tem de sair. Vale
      // inclusive para quem edita a si mesmo — que volta ao login.
      ...(dados.novaSenha
        ? {
            passwordHash: await bcrypt.hash(dados.novaSenha, CUSTO_BCRYPT),
            passwordChangedAt: new Date(),
          }
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
      // Mesmo mapeamento que a tela de autoatendimento usa — as duas não
      // podem divergir sobre o que é um perfil válido.
      ...camposDoPerfilPublico(dados),
    },
  });

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "User",
    entityId: membershipAlvo.userId,
    action: "updated",
  });

  // Publicar/despublicar um profissional é uma decisão de privacidade —
  // vale ter na trilha quem virou a chave e quando. Só o booleano entra
  // no payload: CRECI, apresentação, foto e telefone continuam fora do
  // log, seguindo o padrão do projeto de não guardar conteúdo sensível
  // na trilha técnica.
  if (membershipAlvo.publicProfileEnabled !== dados.perfilPublicoAtivo) {
    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "OrganizationMember",
      entityId: membershipId,
      action: dados.perfilPublicoAtivo
        ? "public_profile_enabled"
        : "public_profile_disabled",
    });
  }

  revalidatePath("/app/usuarios");
  revalidatePath(`/app/usuarios/${membershipId}`);
  // O detalhe público dos imóveis deste membro passa a mostrar (ou deixa
  // de mostrar) a identidade comercial — sem isto, publicar ou despublicar
  // só apareceria no site quando o revalidate de 60s do detalhe expirasse.
  revalidatePath("/[orgSlug]/imoveis/[id]", "page");
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
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)) {
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
