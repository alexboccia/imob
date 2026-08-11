import { cache } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  FINALIDADE_LABEL,
  formatarCodigoImovel,
  formatarPreco,
  formatarTempoRelativo,
  rotulosAtivos,
} from "@/lib/format";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { distanciaEmKm, formatarDistancia } from "@/lib/geo";
import { paraImovelCard } from "@/lib/imovel-card";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { withOrganization } from "@/lib/tenant-context";
import { GaleriaFotos } from "@/components/GaleriaFotos";
import { FormularioContato } from "@/components/FormularioContato";
import { EvolucaoObra } from "@/components/EvolucaoObra";
import { CarrosselPlantas } from "@/components/CarrosselPlantas";
import { ImovelCard } from "@/components/ImovelCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  IconeCheck,
  IconeArea,
  IconeQuartos,
  IconeSuite,
  IconeBanheiro,
  IconeVaga,
} from "@/components/icons";
import { IconeCaracteristica } from "@/lib/caracteristicas-icones";

// Página de detalhe não tem tag de invalidação própria (preço/status
// mudam por edição de imóvel, sem updateTag associado) — sem
// force-dynamic (removido do layout), um segmento dinâmico como este
// tende a ficar estático após a primeira visita. O revalidate curto
// evita que um imóvel vendido/alterado continue aparecendo desatualizado
// por tempo indefinido.
export const revalidate = 60;

function ItemCaracteristica({
  icon: Icone = IconeCheck,
  children,
}: {
  icon?: (props: { className?: string }) => React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      <Icone className="w-4 h-4 text-success shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function ItemCaracteristicaCatalogo({ nome }: { nome: string }) {
  return (
    <li className="flex items-center gap-2">
      <IconeCaracteristica
        nome={nome}
        className="w-4 h-4 text-success shrink-0"
      />
      <span>{nome}</span>
    </li>
  );
}

const buscarImovel = cache(async (id: string, organizationId: string) => {
  return prisma.property.findUnique({
    where: { id, organizationId },
    include: {
      media: { orderBy: [{ isCover: "desc" }, { order: "asc" }] },
      responsibleMember: {
        select: { whatsapp: true, user: { select: { name: true, avatarUrl: true } } },
      },
    },
  });
});

async function buscarImoveisProximos(
  organizationId: string,
  imovel: {
    id: string;
    neighborhood: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
  }
) {
  const candidatos = await prisma.property.findMany({
    where: {
      organizationId,
      status: "AVAILABLE",
      id: { not: imovel.id },
      city: imovel.city,
    },
    include: {
      media: {
        where: { type: "PHOTO" },
        orderBy: [{ isCover: "desc" }, { order: "asc" }],
        take: 5,
      },
    },
    take: 30,
  });

  const comDistancia = candidatos.map((candidato) => ({
    imovel: candidato,
    distanciaKm:
      imovel.latitude != null &&
      imovel.longitude != null &&
      candidato.latitude != null &&
      candidato.longitude != null
        ? distanciaEmKm(
            imovel.latitude,
            imovel.longitude,
            candidato.latitude,
            candidato.longitude
          )
        : null,
  }));

  comDistancia.sort((a, b) => {
    if (a.distanciaKm != null && b.distanciaKm != null) {
      return a.distanciaKm - b.distanciaKm;
    }
    if (a.distanciaKm != null) return -1;
    if (b.distanciaKm != null) return 1;
    const aMesmoBairro = a.imovel.neighborhood === imovel.neighborhood;
    const bMesmoBairro = b.imovel.neighborhood === imovel.neighborhood;
    return aMesmoBairro === bMesmoBairro ? 0 : aMesmoBairro ? -1 : 1;
  });

  return comDistancia.slice(0, 3);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}): Promise<Metadata> {
  const { orgSlug, id } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) return {};
  const organizationId = organization.id;
  const basePath = resolverBasePath(orgSlug);
  const imovel = await withOrganization(organizationId, () =>
    buscarImovel(id, organizationId)
  );

  if (!imovel || imovel.status === "DRAFT" || imovel.status === "INACTIVE") {
    return {};
  }

  const capa = imovel.media.find((m) => m.type === "PHOTO")?.url;
  const descricao = imovel.description
    ? imovel.description.slice(0, 160)
    : `${imovel.type} em ${imovel.neighborhood}, ${imovel.city} - ${imovel.state}.`;

  return {
    title: imovel.title,
    description: descricao,
    alternates: { canonical: `${basePath}/imoveis/${id}` },
    openGraph: {
      title: imovel.title,
      description: descricao,
      type: "website",
      siteName: organization.name,
      images: capa ? [{ url: capa, width: 1200, height: 900 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: imovel.title,
      description: descricao,
      images: capa ? [capa] : undefined,
    },
  };
}

export default async function DetalheImovelPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) notFound();
  const organizationId = organization.id;
  const basePath = resolverBasePath(orgSlug);

  const { imovel, configContato, imoveisProximos } = await withOrganization(
    organizationId,
    async () => {
      const imovel = await buscarImovel(id, organizationId);

      if (!imovel || imovel.status === "DRAFT" || imovel.status === "INACTIVE") {
        notFound();
      }

      const [configContato, imoveisProximos] = await Promise.all([
        buscarConfiguracaoContato(organizationId),
        buscarImoveisProximos(organizationId, imovel),
      ]);

      return { imovel, configContato, imoveisProximos };
    }
  );

  const fotos = imovel.media.filter((m) => m.type === "PHOTO");
  const videos = imovel.media.filter((m) => m.type === "VIDEO");
  const plantas = imovel.media.filter((m) => m.type === "FLOOR_PLAN");

  const whatsappNumero =
    imovel.responsibleMember?.whatsapp || configContato.whatsapp;

  const whatsappHref = `https://wa.me/${whatsappNumero.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Olá! Tenho interesse no imóvel "${imovel.title}" (${imovel.neighborhood}, ${imovel.city}).`
  )}`;

  const enderecoCompleto = [
    imovel.street && imovel.number
      ? `${imovel.street}, ${imovel.number}`
      : imovel.street,
    imovel.neighborhood,
  ]
    .filter(Boolean)
    .join(" - ");

  const temCoordenadas = imovel.latitude !== null && imovel.longitude !== null;
  const linkGoogleMaps = temCoordenadas
    ? `https://www.google.com/maps/search/?api=1&query=${imovel.latitude},${imovel.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${enderecoCompleto}, ${imovel.city} - ${imovel.state}`
      )}`;

  const verboFinalidade =
    imovel.purpose === "RENT"
      ? "alugar"
      : imovel.purpose === "SALE_AND_RENT"
        ? "comprar ou alugar"
        : "comprar";

  const precoPrincipal = imovel.price ?? imovel.rentPrice;

  const mensagemContato = `Olá, gostaria de ter mais informações para ${verboFinalidade}: ${
    imovel.type.toLowerCase()
  }, ${formatarPreco(precoPrincipal)}, ${enderecoCompleto ? `${enderecoCompleto}, ` : ""}${
    imovel.city
  } - ${imovel.state} que encontrei no site da ${organization.name}. Aguardo seu contato.`;

  return (
    <>
      <GaleriaFotos
        fotos={fotos}
        titulo={imovel.title}
        imovelId={imovel.id}
        whatsappHref={whatsappHref}
        mensagemContato={mensagemContato}
        temVideo={videos.length > 0}
        orgSlug={orgSlug}
        nome={organization.name}
      />

      <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-sm text-gray-500 mb-2">
        {imovel.type} ·{" "}
        {FINALIDADE_LABEL[imovel.purpose] ?? imovel.purpose}
        {rotulosAtivos({
          lancamento: imovel.isLaunch,
          destaque: imovel.isFeatured,
          oportunidade: imovel.isOpportunity,
        }).map((rotulo) => (
          <Badge key={rotulo.chave} className={`ml-2 ${rotulo.className}`}>
            {rotulo.label}
          </Badge>
        ))}
        <Badge variant="secondary" className="ml-2">
          # Cód:{" "}
          {formatarCodigoImovel(imovel.code, configContato.codigoImovelPrefixo)}
        </Badge>
      </p>
      <h1 className="text-2xl font-semibold">{imovel.title}</h1>
      {imovel.developer && (
        <p className="text-sm text-gray-600 mt-1">
          Responsável pela obra: <strong>{imovel.developer}</strong>
        </p>
      )}
      <p className="text-gray-500 mt-1">
        {enderecoCompleto ? `${enderecoCompleto}, ` : ""}
        {imovel.city} - {imovel.state}
      </p>
      {imovel.publishedAt && (
        <p className="text-xs text-gray-400 mt-1">
          Publicado {formatarTempoRelativo(imovel.publishedAt)}, atualizado{" "}
          {formatarTempoRelativo(imovel.updatedAt)}.
        </p>
      )}

      {videos.length > 0 && (
        <div id="videos" className="mt-6 space-y-4 scroll-mt-6">
          {videos.map((video) => (
            <div key={video.id} className="aspect-video">
              <iframe
                src={video.url}
                className="w-full h-full rounded-lg"
                allowFullScreen
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <EvolucaoObra
          estagioObra={imovel.constructionStage}
          previsaoEntrega={imovel.deliveryForecast}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mt-10">
        <div className="sm:col-span-2 space-y-6">
          <div>
            <h2 className="font-semibold mb-2">Descrição</h2>
            <p className="text-gray-700 whitespace-pre-line">
              {imovel.description ?? "Sem descrição disponível."}
            </p>
          </div>
          <div>
            <h2 className="font-semibold mb-2">Características do imóvel</h2>
            <ul className="grid grid-cols-2 gap-y-1 text-sm text-gray-700">
              {imovel.totalArea && (
                <ItemCaracteristica icon={IconeArea}>
                  Área total: {imovel.totalArea} m²
                </ItemCaracteristica>
              )}
              {imovel.privateArea && (
                <ItemCaracteristica icon={IconeArea}>
                  Área privativa: {imovel.privateArea} m²
                </ItemCaracteristica>
              )}
              {imovel.bedrooms !== null && (
                <ItemCaracteristica icon={IconeQuartos}>
                  Quartos: {imovel.bedrooms}
                </ItemCaracteristica>
              )}
              {imovel.suites !== null && (
                <ItemCaracteristica icon={IconeSuite}>
                  Suítes: {imovel.suites}
                </ItemCaracteristica>
              )}
              {imovel.bathrooms !== null && (
                <ItemCaracteristica icon={IconeBanheiro}>
                  Banheiros: {imovel.bathrooms}
                </ItemCaracteristica>
              )}
              {imovel.parkingSpots !== null && (
                <ItemCaracteristica icon={IconeVaga}>
                  Vagas de garagem: {imovel.parkingSpots}
                </ItemCaracteristica>
              )}
              {imovel.propertyFeatures.map((c) => (
                <ItemCaracteristicaCatalogo key={c} nome={c} />
              ))}
            </ul>
          </div>

          {imovel.condoFeatures.length > 0 && (
            <div>
              <h2 className="font-semibold mb-2">Características do condomínio</h2>
              <ul className="grid grid-cols-2 gap-y-1 text-sm text-gray-700">
                {imovel.condoFeatures.map((c) => (
                  <ItemCaracteristicaCatalogo key={c} nome={c} />
                ))}
              </ul>
            </div>
          )}

          {plantas.length > 0 && (
            <div>
              <CarrosselPlantas plantas={plantas} />
            </div>
          )}

          <div>
            <h2 className="font-semibold mb-2">Localização</h2>
            <p className="text-sm text-gray-700 mb-3">
              {enderecoCompleto ? `${enderecoCompleto}, ` : ""}
              {imovel.city} - {imovel.state}
            </p>
            {temCoordenadas && (
              <div className="aspect-video rounded-lg overflow-hidden border mb-2">
                <iframe
                  title="Mapa de localização"
                  className="w-full h-full"
                  src={`https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}&output=embed`}
                />
              </div>
            )}
            <a
              href={linkGoogleMaps}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Ver no Google Maps
            </a>
          </div>
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-3">
            {imovel.price != null && (
              <div>
                {imovel.purpose === "SALE_AND_RENT" && (
                  <Badge variant="secondary" className="mb-1">
                    Para comprar
                  </Badge>
                )}
                <p className="text-2xl font-semibold">
                  {formatarPreco(imovel.price)}
                </p>
              </div>
            )}
            {imovel.rentPrice != null && (
              <div>
                {imovel.purpose === "SALE_AND_RENT" && (
                  <Badge variant="secondary" className="mb-1">
                    Para alugar
                  </Badge>
                )}
                <p className="text-2xl font-semibold">
                  {formatarPreco(imovel.rentPrice)}
                  <span className="text-sm font-normal text-gray-500">/mês</span>
                </p>
              </div>
            )}
            {imovel.condoFee && (
              <p className="text-sm text-gray-500">
                Condomínio: {formatarPreco(imovel.condoFee)}
              </p>
            )}
            {imovel.propertyTax && (
              <p className="text-sm text-gray-500">
                IPTU: {formatarPreco(imovel.propertyTax)}
              </p>
            )}
            <Button
              size="lg"
              className="w-full bg-whatsapp-brand hover:bg-whatsapp-brand-hover active:bg-whatsapp-brand-active"
              nativeButton={false}
              render={
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" />
              }
            >
              Falar no WhatsApp
            </Button>
            {imovel.responsibleMember && (
              <div className="flex flex-col items-center text-center pt-3 border-t">
                <div className="relative w-16 h-16 rounded-full overflow-hidden border bg-gray-100 shrink-0">
                  {imovel.responsibleMember.user.avatarUrl ? (
                    <Image
                      src={imovel.responsibleMember.user.avatarUrl}
                      alt={imovel.responsibleMember.user.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground font-semibold">
                      {imovel.responsibleMember.user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="mt-2 font-medium text-sm">
                  {imovel.responsibleMember.user.name}
                </p>
                <p className="text-xs text-gray-500">Corretor(a) responsável</p>
              </div>
            )}
            <div className="pt-3 border-t space-y-3">
              <p className="font-medium text-sm">Enviar mensagem</p>
              <FormularioContato
                imovelId={imovel.id}
                mensagemPreenchida={mensagemContato}
                idPrefixo="aside-"
                orgSlug={orgSlug}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {imoveisProximos.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-semibold mb-6">
            Imóveis próximos que você pode gostar
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {imoveisProximos.map(({ imovel: proximo, distanciaKm }) => (
              <ImovelCard
                key={proximo.id}
                imovel={paraImovelCard(proximo)}
                distancia={
                  distanciaKm != null ? formatarDistancia(distanciaKm) : undefined
                }
                basePath={basePath}
              />
            ))}
          </div>
        </section>
      )}
      </div>
    </>
  );
}
