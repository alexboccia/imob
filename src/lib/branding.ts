import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tagBranding } from "@/lib/cache-tags";

async function buscarBrandingSemCache(organizationId: string) {
  const branding = await prisma.organizationBranding.findUnique({
    where: { organizationId },
  });

  return {
    themeId: branding?.themeId ?? null,
    faviconUrl: branding?.faviconUrl ?? null,
  };
}

// Mesmo padrão de buscarConfiguracaoContato (configuracao-contato.ts):
// cacheado com tag por organização, invalidada em salvarConfiguracaoContato
// (configuracoes/actions.ts) via updateTag. themeId null é um retorno
// válido — quem consome isto resolve pro tema padrão via resolverTema(),
// nunca aqui.
export async function buscarBranding(organizationId: string) {
  return unstable_cache(
    buscarBrandingSemCache,
    ["branding", organizationId],
    { tags: [tagBranding(organizationId)] }
  )(organizationId);
}
