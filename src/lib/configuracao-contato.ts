import { prisma } from "@/lib/prisma";
import { LOGO_ALTURA_PADRAO } from "@/lib/logo";

export async function buscarConfiguracaoContato(organizationId: string) {
  const settings = await prisma.organizationSettings.findFirst({ where: { organizationId } });

  return {
    telefone: settings?.phone ?? "",
    email: settings?.email ?? "",
    whatsapp: settings?.whatsapp ?? "",
    instagram: settings?.instagram ?? "",
    facebook: settings?.facebook ?? "",
    youtube: settings?.youtube ?? "",
    linkedin: settings?.linkedin ?? "",
    codigoImovelPrefixo: settings?.propertyCodePrefix ?? "",
    logo: settings?.logoUrl ?? null,
    logoAltura: settings?.logoHeight ?? LOGO_ALTURA_PADRAO,
  };
}
