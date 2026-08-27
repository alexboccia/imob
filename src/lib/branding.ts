import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tagBranding } from "@/lib/cache-tags";
import { parseTokensTemaSeguro } from "@/lib/branding/tokens-tema-schema";

async function buscarBrandingSemCache(organizationId: string) {
  const branding = await prisma.organizationBranding.findUnique({
    where: { organizationId },
  });

  return {
    themeId: branding?.themeId ?? null,
    faviconUrl: branding?.faviconUrl ?? null,
    // Fase P.10 — nome público, quando diverge do Organization.name
    // "oficial"/legal. null é um retorno válido: quem consome resolve
    // pro Organization.name como fallback, nunca aqui.
    displayName: branding?.displayName ?? null,
    footerAppearance: branding?.footerAppearance ?? null,
    // Revalidado aqui (não só confiando em quem gravou) — ver comentário
    // de customTheme no schema.prisma. null quando ausente/inválido, quem
    // consome cai no fallback de sempre (resolverTemaEfetivo em temas.ts).
    customTheme: parseTokensTemaSeguro(branding?.customTheme),
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
