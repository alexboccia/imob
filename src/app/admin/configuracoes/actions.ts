"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { LOGO_ALTURA_MIN, LOGO_ALTURA_MAX, LOGO_ALTURA_PADRAO } from "@/lib/logo";

function valorOuNulo(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function alturaLogo(formData: FormData) {
  const valor = Number(formData.get("logoAltura"));
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return Math.min(LOGO_ALTURA_MAX, Math.max(LOGO_ALTURA_MIN, Math.round(valor)));
}

export async function salvarConfiguracaoContato(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const dados = {
    phone: valorOuNulo(formData, "telefone"),
    email: valorOuNulo(formData, "email"),
    whatsapp: valorOuNulo(formData, "whatsapp"),
    instagram: valorOuNulo(formData, "instagram"),
    facebook: valorOuNulo(formData, "facebook"),
    youtube: valorOuNulo(formData, "youtube"),
    linkedin: valorOuNulo(formData, "linkedin"),
    propertyCodePrefix: valorOuNulo(formData, "codigoImovelPrefixo")?.toUpperCase() ?? null,
    logoUrl: valorOuNulo(formData, "logo"),
    logoHeight: alturaLogo(formData) ?? LOGO_ALTURA_PADRAO,
  };

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.organizationSettings.upsert({
      where: { organizationId },
      update: dados,
      create: { ...dados, organizationId },
    });

    revalidatePath("/admin/configuracoes");
    revalidatePath("/admin/imoveis");
    revalidatePath("/", "layout");
  });
}
