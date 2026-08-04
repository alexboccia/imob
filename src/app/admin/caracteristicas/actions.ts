"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const criarSchema = z.object({
  nome: z.string().min(2),
  categoria: z.enum(["IMOVEL", "CONDOMINIO"]),
});

export async function criarCaracteristica(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const { nome, categoria } = criarSchema.parse(
    Object.fromEntries(formData.entries())
  );

  await prisma.caracteristicaOpcao.upsert({
    where: { categoria_nome: { categoria, nome } },
    update: {},
    create: { categoria, nome },
  });

  revalidatePath("/admin/caracteristicas");
}

export async function removerCaracteristica(id: string) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  await prisma.caracteristicaOpcao.delete({ where: { id } });

  revalidatePath("/admin/caracteristicas");
}
