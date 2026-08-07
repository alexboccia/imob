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
  categoria: z.enum(["RESIDENTIAL", "COMMERCIAL"]),
});

export async function criarTipoImovel(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const { nome, categoria } = criarSchema.parse(
    Object.fromEntries(formData.entries())
  );

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.propertyTypeOption.upsert({
      where: { organizationId_category_name: { organizationId, category: categoria, name: nome } },
      update: {},
      create: { organizationId, category: categoria, name: nome },
    });

    revalidatePath("/admin/tipos-imovel");
  });
}

export async function removerTipoImovel(id: string) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.propertyTypeOption.delete({ where: { id, organizationId } });
    revalidatePath("/admin/tipos-imovel");
  });
}
