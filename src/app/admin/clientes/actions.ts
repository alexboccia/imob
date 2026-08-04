"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const pessoaSchema = z.object({
  nome: z.string().min(2),
  email: z.string().optional(),
  telefone: z.string().optional(),
  papel: z.enum(["LEAD", "CLIENTE", "PROPRIETARIO"]),
  origem: z
    .enum(["SITE", "INDICACAO", "PORTAL", "INSTAGRAM", "WHATSAPP", "OUTRO"])
    .optional(),
  observacoes: z.string().optional(),
});

export async function criarPessoa(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const dados = pessoaSchema.parse(Object.fromEntries(formData.entries()));

  await prisma.pessoa.create({
    data: {
      nome: dados.nome,
      email: dados.email || null,
      telefone: dados.telefone || null,
      papeis: [dados.papel],
      origem: dados.origem || null,
      observacoes: dados.observacoes || null,
      corretorAtribuidoId: session.user.id,
    },
  });

  revalidatePath("/admin/clientes");
  redirect("/admin/clientes");
}

const estagioSchema = z.object({
  estagioFunil: z.enum([
    "NOVO_LEAD",
    "CONTATO_FEITO",
    "VISITA_AGENDADA",
    "PROPOSTA",
    "FECHADO",
    "PERDIDO",
  ]),
});

export async function atualizarEstagioFunil(
  pessoaId: string,
  formData: FormData
) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const { estagioFunil } = estagioSchema.parse(
    Object.fromEntries(formData.entries())
  );

  await prisma.pessoa.update({
    where: { id: pessoaId },
    data: { estagioFunil },
  });

  revalidatePath(`/admin/clientes/${pessoaId}`);
}

const interacaoSchema = z.object({
  tipo: z.enum(["VISITA", "LIGACAO", "MENSAGEM", "EMAIL", "OUTRO"]),
  notas: z.string().optional(),
});

export async function registrarInteracao(pessoaId: string, formData: FormData) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const dados = interacaoSchema.parse(Object.fromEntries(formData.entries()));

  await prisma.interacao.create({
    data: {
      pessoaId,
      tipo: dados.tipo,
      notas: dados.notas || null,
      corretorId: session.user.id,
    },
  });

  revalidatePath(`/admin/clientes/${pessoaId}`);
}
