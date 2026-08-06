import { prisma } from "@/lib/prisma";
import { LOGO_ALTURA_PADRAO } from "@/lib/logo";

export const ID_CONFIGURACAO_CONTATO = "singleton";

export async function buscarConfiguracaoContato() {
  const config = await prisma.configuracaoContato.findUnique({
    where: { id: ID_CONFIGURACAO_CONTATO },
  });

  return {
    telefone: config?.telefone ?? "",
    email: config?.email ?? "",
    whatsapp: config?.whatsapp ?? "",
    instagram: config?.instagram ?? "",
    facebook: config?.facebook ?? "",
    youtube: config?.youtube ?? "",
    linkedin: config?.linkedin ?? "",
    codigoImovelPrefixo: config?.codigoImovelPrefixo ?? "",
    logo: config?.logo ?? null,
    logoAltura: config?.logoAltura ?? LOGO_ALTURA_PADRAO,
  };
}
