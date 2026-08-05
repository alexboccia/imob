"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const criarSchema = z.object({
  nome: z.string().min(2),
  categoria: z.enum(["RESIDENCIAL", "COMERCIAL"]),
});

export async function criarTipoImovel(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const { nome, categoria } = criarSchema.parse(
    Object.fromEntries(formData.entries())
  );

  await prisma.tipoImovelOpcao.upsert({
    where: { categoria_nome: { categoria, nome } },
    update: {},
    create: { categoria, nome },
  });

  revalidatePath("/admin/tipos-imovel");
}

export async function removerTipoImovel(id: string) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  await prisma.tipoImovelOpcao.delete({ where: { id } });

  revalidatePath("/admin/tipos-imovel");
}
