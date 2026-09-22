import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { LOGO_ALTURA_PADRAO, LOGO_RODAPE_ALTURA_PADRAO } from "@/lib/logo";
import { tagConfiguracao } from "@/lib/cache-tags";
import type { ConfiguracaoCanais, ConfiguracaoHorario } from "@/lib/contatos-publicos";

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
    tiktok: settings?.tiktok ?? "",
    // Fase 58 — o MESMO valor de cada canal acima, agora acompanhado da
    // decisão de onde ele aparece. Montado aqui, num lugar só, para o
    // cabeçalho e o rodapé consumirem a mesma estrutura (ver
    // canaisDoLocal em contatos-publicos.ts). Sem linha de settings, os
    // defaults abaixo são os mesmos do schema — um tenant que nunca
    // salvou configuração continua com o site que sempre teve.
    canais: {
      telefone: {
        valor: settings?.phone ?? "",
        topo: settings?.phoneShowHeader ?? false,
        rodape: settings?.phoneShowFooter ?? false,
      },
      whatsapp: {
        valor: settings?.whatsapp ?? "",
        topo: settings?.whatsappShowHeader ?? false,
        rodape: settings?.whatsappShowFooter ?? false,
      },
      instagram: {
        valor: settings?.instagram ?? "",
        topo: settings?.instagramShowHeader ?? false,
        rodape: settings?.instagramShowFooter ?? true,
      },
      facebook: {
        valor: settings?.facebook ?? "",
        topo: settings?.facebookShowHeader ?? false,
        rodape: settings?.facebookShowFooter ?? true,
      },
      linkedin: {
        valor: settings?.linkedin ?? "",
        topo: settings?.linkedinShowHeader ?? false,
        rodape: settings?.linkedinShowFooter ?? true,
      },
      youtube: {
        valor: settings?.youtube ?? "",
        topo: settings?.youtubeShowHeader ?? false,
        rodape: settings?.youtubeShowFooter ?? true,
      },
      tiktok: {
        valor: settings?.tiktok ?? "",
        topo: settings?.tiktokShowHeader ?? false,
        rodape: settings?.tiktokShowFooter ?? true,
      },
    } satisfies ConfiguracaoCanais,
    // Fase 58.2 — horário de atendimento. Fora de `canais` porque não é
    // um canal (ver contatos-publicos.ts): não tem link nem ícone de
    // marca, e só existe no topo.
    horario: {
      valor: settings?.businessHours ?? "",
      topo: settings?.businessHoursShowHeader ?? false,
      rodape: settings?.businessHoursShowFooter ?? false,
    } satisfies ConfiguracaoHorario,
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
