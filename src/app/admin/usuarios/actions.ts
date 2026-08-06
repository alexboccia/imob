"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const PAPEIS = ["ADMINISTRADOR", "GESTOR", "CORRETOR"] as const;

const booleanCheckbox = z.preprocess((v) => v === "on", z.boolean());

type EstadoFormulario = { sucesso: boolean; erro?: string };

const criarUsuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  senha: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
  papel: z.enum(PAPEIS),
});

export async function criarUsuario(
  _prevState: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const session = await auth();
  if (!session) redirect("/admin/login");
  if (session.user.papel !== "ADMINISTRADOR") {
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

  const existente = await prisma.usuario.findUnique({
    where: { email: dados.email },
  });
  if (existente) {
    return { sucesso: false, erro: "Já existe um usuário com esse e-mail." };
  }

  const senhaHash = await bcrypt.hash(dados.senha, 10);

  await prisma.usuario.create({
    data: {
      nome: dados.nome,
      email: dados.email,
      senhaHash,
      papel: dados.papel,
    },
  });

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

const atualizarUsuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome."),
  papel: z.enum(PAPEIS),
  ativo: booleanCheckbox,
  foto: z.string().optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
  novaSenha: z
    .string()
    .min(6, "A nova senha precisa ter ao menos 6 caracteres.")
    .optional()
    .or(z.literal("")),
});

export async function atualizarUsuario(
  usuarioId: string,
  _prevState: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const session = await auth();
  if (!session) redirect("/admin/login");
  if (session.user.papel !== "ADMINISTRADOR") {
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

  const usuarioAlvo = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuarioAlvo) {
    return { sucesso: false, erro: "Usuário não encontrado." };
  }

  const ehVoceMesmo = usuarioId === session.user.id;

  if (ehVoceMesmo) {
    if (!dados.ativo) {
      return { sucesso: false, erro: "Você não pode desativar sua própria conta." };
    }
    if (dados.papel !== "ADMINISTRADOR") {
      return {
        sucesso: false,
        erro: "Você não pode remover seu próprio acesso de administrador.",
      };
    }
  } else if (
    usuarioAlvo.papel === "ADMINISTRADOR" &&
    (dados.papel !== "ADMINISTRADOR" || !dados.ativo)
  ) {
    const outrosAdmins = await prisma.usuario.count({
      where: { papel: "ADMINISTRADOR", ativo: true, id: { not: usuarioId } },
    });
    if (outrosAdmins === 0) {
      return { sucesso: false, erro: "Precisa haver ao menos um administrador ativo." };
    }
  }

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      nome: dados.nome,
      papel: dados.papel,
      ativo: dados.ativo,
      foto: dados.foto || null,
      whatsapp: dados.whatsapp ? dados.whatsapp.replace(/\D/g, "") : null,
      ...(dados.novaSenha
        ? { senhaHash: await bcrypt.hash(dados.novaSenha, 10) }
        : {}),
    },
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${usuarioId}`);
  redirect("/admin/usuarios");
}
