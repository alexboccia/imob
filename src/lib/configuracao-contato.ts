import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { LOGO_ALTURA_PADRAO, LOGO_RODAPE_ALTURA_PADRAO } from "@/lib/logo";
import { tagConfiguracao } from "@/lib/cache-tags";

async function buscarConfiguracaoContatoSemCache(organizationId: string) {
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
    logoRodape: settings?.footerLogoUrl ?? null,
    logoRodapeAltura: settings?.footerLogoHeight ?? LOGO_RODAPE_ALTURA_PADRAO,
    heroImage: settings?.heroImageUrl ?? null,
  };
}

// Muda raramente (só quando alguém salva Configurações) — cacheado com
// tag por organização, invalidada explicitamente em
// salvarConfiguracaoContato (configuracoes/actions.ts) via updateTag.
// organizationId é passado como argumento (não só capturado por closure)
// de propósito: é isso que garante que o Next derive uma entrada de cache
// por organização — nunca a mesma chave pra duas organizações diferentes.
export async function buscarConfiguracaoContato(organizationId: string) {
  return unstable_cache(
    buscarConfiguracaoContatoSemCache,
    ["configuracao-contato", organizationId],
    { tags: [tagConfiguracao(organizationId)] }
  )(organizationId);
}
