import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { HeroHome } from "@/components/HeroHome";
import { PainelBuscaHome } from "@/components/PainelBuscaHome";
import { SecaoImoveis } from "@/components/SecaoImoveis";
import { FaixaConfianca } from "@/components/FaixaConfianca";
import { SecaoCaptacao } from "@/components/SecaoCaptacao";
import { BlocoInstitucional } from "@/components/BlocoInstitucional";
import { paraImovelCard } from "@/lib/imovel-card";
import { buscarDadosFiltros } from "@/lib/filtros-imoveis-data";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { withOrganization } from "@/lib/tenant-context";
import { buscarHostnameCustomAtivo } from "@/lib/platform/organization-domain";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { buscarBranding } from "@/lib/branding";
import { IMAGEM_HERO_PADRAO } from "@/lib/site-config";
import { TITULO_SECAO } from "@/lib/site-typography";
import type { Prisma } from "@/generated/prisma/client";

// Sem force-dynamic (removido do layout): as listas de imóveis desta
// página (slideshow/lançamentos/destaques/oportunidades) não têm tag de
// invalidação própria (só configurações e facetas têm, ver
// cache-tags.ts) — um revalidate curto garante que a home nunca fique
// mais que 1 minuto desatualizada em vez de ficar presa ao HTML gerado
// no último build.
export const revalidate = 60;

// Canonical: se a Organization tem um domínio customizado ACTIVE, o
// canonical passa a ser a URL ABSOLUTA sob esse domínio (nunca com o
// slug — o proxy já esconde isso, ver src/proxy.ts) — um `metadata`
// field com URL absoluta ignora `metadataBase` (comportamento oficial do
// Next, ver node_modules/next/dist/docs/.../generate-metadata.md), então
// isso nunca precisa tocar o metadataBase global do layout raiz.
// Comportamento ORIGINAL preservado 1:1 quando não há domínio customizado
// ACTIVE: relativo (resolvido contra metadataBase) — org padrão aponta
// pra URL sem prefixo, demais orgs pra versão prefixada, evitando
// conteúdo duplicado indexável entre as duas formas de acessar a mesma
// organização. Ver plano, decisão #4, e relatório da Fase P.10 (correção
// AU).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) return {};

  const hostnameCustom = await buscarHostnameCustomAtivo(organization.id);
  const canonical = hostnameCustom ? `https://${hostnameCustom}/` : resolverBasePath(orgSlug) || "/";
  return { alternates: { canonical } };
}

function buscarImoveis(
  organizationId: string,
  where: Prisma.PropertyWhereInput,
  take: number,
  orderBy: Prisma.PropertyOrderByWithRelationInput = { publishedAt: "desc" }
) {
  return prisma.property.findMany({
    where: { ...where, organizationId },
    orderBy,
    take,
    include: {
      media: {
        where: { type: "PHOTO" },
        orderBy: [{ isCover: "desc" }, { order: "asc" }],
        take: 5,
      },
    },
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) notFound();
  const organizationId = organization.id;
  const basePath = resolverBasePath(orgSlug);
  const ultimosCadastrados = { createdAt: "desc" } as const;

  const [lancamentos, destaques, oportunidades, dadosFiltros, config, branding] =
    await withOrganization(organizationId, () =>
      Promise.all([
        buscarImoveis(
          organizationId,
          { status: "AVAILABLE", isLaunch: true },
          3,
          ultimosCadastrados
        ),
        buscarImoveis(
          organizationId,
          { status: "AVAILABLE", isFeatured: true },
          3,
          ultimosCadastrados
        ),
        buscarImoveis(
          organizationId,
          { status: "AVAILABLE", isOpportunity: true },
          3,
          ultimosCadastrados
        ),
        buscarDadosFiltros(organizationId),
        buscarConfiguracaoContato(organizationId),
        buscarBranding(organizationId),
      ])
    );

  // Mesmo nome público que o header/footer e o <title> já usam (ver
  // [orgSlug]/layout.tsx): displayName quando configurado, senão o nome
  // da Organization, que nunca falta. Nenhuma imobiliária é citada em
  // código — o texto dos blocos comerciais é montado a partir daqui.
  const nomePublico = branding.displayName ?? organization.name;

  const temRotulos =
    lancamentos.length > 0 || destaques.length > 0 || oportunidades.length > 0;

  const geral = temRotulos
    ? []
    : await withOrganization(organizationId, () =>
        buscarImoveis(organizationId, { status: "AVAILABLE" }, 6)
      );

  // Imagem configurável por organização (Configurações → Identidade
  // visual → Imagem principal da Home) — cai no asset fixo de marca
  // (IMAGEM_HERO_PADRAO) quando a organização nunca customizou ou clicou
  // em "Restaurar imagem padrão". HeroHome também trata null (caindo num
  // gradiente neutro), mas na prática isso nunca acontece aqui: sempre
  // temos pelo menos o fallback estático.
  const imagemHero = config.heroImage ?? IMAGEM_HERO_PADRAO;

  return (
    <div>
      <HeroHome imagemUrl={imagemHero}>
        <PainelBuscaHome
          tipos={dadosFiltros.tipos}
          cidades={dadosFiltros.cidades}
          bairros={dadosFiltros.bairros}
          basePath={basePath}
        />
      </HeroHome>

      <FaixaConfianca />

      <SecaoImoveis
        titulo="Lançamentos"
        imoveis={lancamentos.map(paraImovelCard)}
        verTudoHref={`${basePath}/imoveis?lancamento=1`}
        basePath={basePath}
      />
      <SecaoImoveis
        titulo="Destaques"
        imoveis={destaques.map(paraImovelCard)}
        verTudoHref={`${basePath}/imoveis?destaque=1`}
        basePath={basePath}
      />
      <SecaoImoveis
        titulo="Oportunidades"
        imoveis={oportunidades.map(paraImovelCard)}
        verTudoHref={`${basePath}/imoveis?oportunidade=1`}
        basePath={basePath}
      />

      {temRotulos ? null : geral.length === 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className={`${TITULO_SECAO} mb-6`}>Imóveis disponíveis</h2>
          <p className="text-gray-500">
            Nenhum imóvel publicado ainda. Assim que forem cadastrados no
            painel administrativo, eles aparecerão aqui.
          </p>
        </section>
      ) : (
        <SecaoImoveis
          titulo="Imóveis disponíveis"
          imoveis={geral.map(paraImovelCard)}
          verTudoHref={`${basePath}/imoveis`}
          basePath={basePath}
        />
      )}

      <SecaoCaptacao
        basePath={basePath}
        nome={nomePublico}
        whatsapp={config.whatsapp}
      />

      <BlocoInstitucional
        nome={nomePublico}
        logo={config.logo}
        logoAltura={config.logoAltura}
        telefone={config.telefone}
        email={config.email}
        whatsapp={config.whatsapp}
        redesSociais={{
          instagram: config.instagram,
          facebook: config.facebook,
          youtube: config.youtube,
          linkedin: config.linkedin,
        }}
        basePath={basePath}
      />
    </div>
  );
}
