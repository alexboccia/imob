"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { temPapel, PAPEIS_GESTAO_CATALOGOS } from "@/lib/authorization";
import {
  type ActionState,
  erroAcessoNegado,
  erroValidacao,
  sucesso,
} from "@/lib/action-result";

const criarSchema = z.object({
  nome: z.string().min(2, "Informe um nome com ao menos 2 caracteres."),
  categoria: z.enum(["PROPERTY", "CONDO"]),
});

export async function criarCaracteristica(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_CATALOGOS)) {
    return erroAcessoNegado();
  }

  const parsed = criarSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const { nome, categoria } = parsed.data;

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.featureOption.upsert({
      where: { organizationId_category_name: { organizationId, category: categoria, name: nome } },
      update: {},
      create: { organizationId, category: categoria, name: nome },
    });

    revalidatePath("/app/caracteristicas");
  });

  return sucesso();
}

export async function removerCaracteristica(id: string): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_CATALOGOS)) {
    return erroAcessoNegado();
  }

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.featureOption.delete({ where: { id, organizationId } });
    revalidatePath("/app/caracteristicas");
  });

  return sucesso();
}
