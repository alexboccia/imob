"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "BROKER", "ASSISTANT"] as const;
const PAPEIS_COM_GESTAO_DE_USUARIOS = new Set(["OWNER", "ADMIN"]);

const booleanCheckbox = z.preprocess((v) => v === "on", z.boolean());

type EstadoFormulario = { sucesso: boolean; erro?: string };

const criarUsuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  senha: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
  papel: z.enum(ROLES),
});

export async function criarUsuario(
  _prevState: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const session = await auth();
  if (!session) redirect("/admin/login");
  if (!PAPEIS_COM_GESTAO_DE_USUARIOS.has(session.user.role ?? "")) {
    return { sucesso: false, erro: "Apenas administradores podem criar usuários." };
  }

  const parsed = criarUsuarioSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      sucesso: false,
      erro: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const dados = parsed.data;

  const existente = await prisma.user.findUnique({
    where: { email: dados.email },
  });
  if (existente) {
    return { sucesso: false, erro: "Já existe um usuário com esse e-mail." };
  }

  const organizationId = await requireOrganizationId();
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

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
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
  _prevState: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const session = await auth();
  if (!session) redirect("/admin/login");
  if (!PAPEIS_COM_GESTAO_DE_USUARIOS.has(session.user.role ?? "")) {
    return { sucesso: false, erro: "Apenas administradores podem editar usuários." };
  }

  const parsed = atualizarUsuarioSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      sucesso: false,
      erro: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const dados = parsed.data;

  const organizationId = await requireOrganizationId();
  const membershipAlvo = await prisma.organizationMember.findFirst({
    where: { id: membershipId, organizationId },
  });
  if (!membershipAlvo) {
    return { sucesso: false, erro: "Usuário não encontrado." };
  }

  const ehVoceMesmo = membershipId === session.user.organizationMemberId;
  const eraAdmin = membershipAlvo.role === "OWNER" || membershipAlvo.role === "ADMIN";
  const continuaAdmin = dados.papel === "OWNER" || dados.papel === "ADMIN";

  if (ehVoceMesmo) {
    if (!dados.ativo) {
      return { sucesso: false, erro: "Você não pode desativar sua própria conta." };
    }
    if (!continuaAdmin) {
      return {
        sucesso: false,
        erro: "Você não pode remover seu próprio acesso de administrador.",
      };
    }
  } else if (eraAdmin && (!continuaAdmin || !dados.ativo)) {
    const outrosAdmins = await prisma.organizationMember.count({
      where: {
        organizationId,
        role: { in: ["OWNER", "ADMIN"] },
        status: "ACTIVE",
        id: { not: membershipId },
      },
    });
    if (outrosAdmins === 0) {
      return { sucesso: false, erro: "Precisa haver ao menos um administrador ativo." };
    }
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
      role: dados.papel,
      status: dados.ativo ? "ACTIVE" : "SUSPENDED",
      whatsapp: dados.whatsapp ? dados.whatsapp.replace(/\D/g, "") : null,
      contactEmail: dados.emailContato || null,
    },
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${membershipId}`);
  redirect("/admin/usuarios");
}
