"use server";

import { revalidatePath, updateTag } from "next/cache";
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
import { tagFacetas } from "@/lib/cache-tags";

const criarSchema = z.object({
  nome: z.string().min(2, "Informe um nome com ao menos 2 caracteres."),
  categoria: z.enum(["RESIDENTIAL", "COMMERCIAL"]),
});

export async function criarTipoImovel(
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
    await prisma.propertyTypeOption.upsert({
      where: { organizationId_category_name: { organizationId, category: categoria, name: nome } },
      update: {},
      create: { organizationId, category: categoria, name: nome },
    });

    revalidatePath("/app/tipos-imovel");
    updateTag(tagFacetas(organizationId));
  });

  return sucesso();
}

export async function removerTipoImovel(id: string): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_CATALOGOS)) {
    return erroAcessoNegado();
  }

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.propertyTypeOption.delete({ where: { id, organizationId } });
    revalidatePath("/app/tipos-imovel");
    updateTag(tagFacetas(organizationId));
  });

  return sucesso();
}
