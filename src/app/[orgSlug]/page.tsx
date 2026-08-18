import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImovelCard } from "@/components/ImovelCard";
import { SlideshowHome } from "@/components/SlideshowHome";
import { BuscaHome } from "@/components/BuscaHome";
import { paraImovelCard } from "@/lib/imovel-card";
import { buscarDadosFiltros } from "@/lib/filtros-imoveis-data";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { withOrganization } from "@/lib/tenant-context";
import { buscarHostnameCustomAtivo } from "@/lib/platform/organization-domain";
import { Button } from "@/components/ui/button";
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

function SecaoImoveis({
  titulo,
  imoveis,
  verTudoHref,
  basePath,
}: {
  titulo: string;
  imoveis: ReturnType<typeof paraImovelCard>[];
  verTudoHref?: string;
  basePath: string;
}) {
  if (imoveis.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        {verTudoHref && (
          <Button
            variant="link"
            className="h-auto p-0"
            nativeButton={false}
            render={<Link href={verTudoHref} />}
          >
            Ver tudo
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {imoveis.map((imovel) => (
          <ImovelCard key={imovel.id} imovel={imovel} basePath={basePath} />
        ))}
      </div>
    </section>
  );
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

  const [imoveisSlideshow, lancamentos, destaques, oportunidades, dadosFiltros] =
    await withOrganization(organizationId, () =>
      Promise.all([
        buscarImoveis(organizationId, { status: "AVAILABLE", hasSlideshow: true }, 10),
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
      ])
    );

  const temRotulos =
    lancamentos.length > 0 || destaques.length > 0 || oportunidades.length > 0;

  const geral = temRotulos
    ? []
    : await withOrganization(organizationId, () =>
        buscarImoveis(organizationId, { status: "AVAILABLE" }, 6)
      );

  return (
    <div>
      {imoveisSlideshow.length > 0 ? (
        <SlideshowHome
          imoveis={imoveisSlideshow.map((imovel) => ({
            id: imovel.id,
            titulo: imovel.title,
            tipo: imovel.type,
            finalidade: imovel.purpose,
            bairro: imovel.neighborhood,
            cidade: imovel.city,
            estado: imovel.state,
            preco: imovel.price?.toString() ?? null,
            precoAluguel: imovel.rentPrice?.toString() ?? null,
            midias: imovel.media.map((m) => ({ url: m.url })),
          }))}
          basePath={basePath}
        />
      ) : (
        <section className="border-b bg-gray-50">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center">
            <h1 className="text-3xl sm:text-4xl font-semibold">
              Encontre o imóvel ideal para comprar ou alugar
            </h1>
            <p className="mt-4 text-gray-600">
              Apartamentos, casas e imóveis comerciais selecionados para você.
            </p>
            <Button
              size="lg"
              className="mt-8"
              nativeButton={false}
              render={<Link href={`${basePath}/imoveis`} />}
            >
              Ver imóveis disponíveis
            </Button>
          </div>
        </section>
      )}

      <BuscaHome
        tipos={dadosFiltros.tipos}
        bairros={dadosFiltros.bairros}
        caracteristicas={dadosFiltros.caracteristicas}
        orgSlug={orgSlug}
        basePath={basePath}
      />

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
          <h2 className="text-xl font-semibold mb-6">Imóveis disponíveis</h2>
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
    </div>
  );
}
