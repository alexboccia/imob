"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

const criarSchema = z.object({
  nome: z.string().min(2),
  categoria: z.enum(["PROPERTY", "CONDO"]),
});

export async function criarCaracteristica(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/app/login");

  const { nome, categoria } = criarSchema.parse(
    Object.fromEntries(formData.entries())
  );

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.featureOption.upsert({
      where: { organizationId_category_name: { organizationId, category: categoria, name: nome } },
      update: {},
      create: { organizationId, category: categoria, name: nome },
    });

    revalidatePath("/app/caracteristicas");
  });
}

export async function removerCaracteristica(id: string) {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.featureOption.delete({ where: { id, organizationId } });
    revalidatePath("/app/caracteristicas");
  });
}
