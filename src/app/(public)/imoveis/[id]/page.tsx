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
import { siteConfig } from "@/lib/site-config";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { distanciaEmKm, formatarDistancia } from "@/lib/geo";
import { paraImovelCard } from "@/lib/imovel-card";
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

function ItemCaracteristica({
  icon: Icone = IconeCheck,
  children,
}: {
  icon?: (props: { className?: string }) => React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      <Icone className="w-4 h-4 text-green-600 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function ItemCaracteristicaCatalogo({ nome }: { nome: string }) {
  return (
    <li className="flex items-center gap-2">
      <IconeCaracteristica
        nome={nome}
        className="w-4 h-4 text-green-600 shrink-0"
      />
      <span>{nome}</span>
    </li>
  );
}

const buscarImovel = cache(async (id: string) => {
  return prisma.imovel.findUnique({
    where: { id },
    include: {
      midias: { orderBy: [{ ehCapa: "desc" }, { ordem: "asc" }] },
      corretorResponsavel: { select: { nome: true, foto: true, whatsapp: true } },
    },
  });
});

async function buscarImoveisProximos(imovel: {
  id: string;
  bairro: string;
  cidade: string;
  latitude: number | null;
  longitude: number | null;
}) {
  const candidatos = await prisma.imovel.findMany({
    where: {
      status: "DISPONIVEL",
      id: { not: imovel.id },
      cidade: imovel.cidade,
    },
    include: {
      midias: {
        where: { tipo: "FOTO" },
        orderBy: [{ ehCapa: "desc" }, { ordem: "asc" }],
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
    const aMesmoBairro = a.imovel.bairro === imovel.bairro;
    const bMesmoBairro = b.imovel.bairro === imovel.bairro;
    return aMesmoBairro === bMesmoBairro ? 0 : aMesmoBairro ? -1 : 1;
  });

  return comDistancia.slice(0, 3);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const imovel = await buscarImovel(id);

  if (!imovel || imovel.status === "RASCUNHO" || imovel.status === "INATIVO") {
    return {};
  }

  const capa = imovel.midias.find((m) => m.tipo === "FOTO")?.url;
  const descricao = imovel.descricao
    ? imovel.descricao.slice(0, 160)
    : `${imovel.tipo} em ${imovel.bairro}, ${imovel.cidade} - ${imovel.estado}.`;

  return {
    title: imovel.titulo,
    description: descricao,
    openGraph: {
      title: imovel.titulo,
      description: descricao,
      type: "website",
      images: capa ? [{ url: capa, width: 1200, height: 900 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: imovel.titulo,
      description: descricao,
      images: capa ? [capa] : undefined,
    },
  };
}

export default async function DetalheImovelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const imovel = await buscarImovel(id);

  if (!imovel || imovel.status === "RASCUNHO" || imovel.status === "INATIVO") {
    notFound();
  }

  const fotos = imovel.midias.filter((m) => m.tipo === "FOTO");
  const videos = imovel.midias.filter((m) => m.tipo === "VIDEO");
  const plantas = imovel.midias.filter((m) => m.tipo === "PLANTA");

  const [configContato, imoveisProximos] = await Promise.all([
    buscarConfiguracaoContato(),
    buscarImoveisProximos(imovel),
  ]);

  const whatsappNumero =
    imovel.corretorResponsavel?.whatsapp || configContato.whatsapp;

  const whatsappHref = `https://wa.me/${whatsappNumero.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Olá! Tenho interesse no imóvel "${imovel.titulo}" (${imovel.bairro}, ${imovel.cidade}).`
  )}`;

  const enderecoCompleto = [
    imovel.logradouro && imovel.numero
      ? `${imovel.logradouro}, ${imovel.numero}`
      : imovel.logradouro,
    imovel.bairro,
  ]
    .filter(Boolean)
    .join(" - ");

  const temCoordenadas = imovel.latitude !== null && imovel.longitude !== null;
  const linkGoogleMaps = temCoordenadas
    ? `https://www.google.com/maps/search/?api=1&query=${imovel.latitude},${imovel.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${enderecoCompleto}, ${imovel.cidade} - ${imovel.estado}`
      )}`;

  const verboFinalidade =
    imovel.finalidade === "ALUGUEL"
      ? "alugar"
      : imovel.finalidade === "VENDA_E_ALUGUEL"
        ? "comprar ou alugar"
        : "comprar";

  const precoPrincipal = imovel.preco ?? imovel.precoAluguel;

  const mensagemContato = `Olá, gostaria de ter mais informações para ${verboFinalidade}: ${
    imovel.tipo.toLowerCase()
  }, ${formatarPreco(precoPrincipal)}, ${enderecoCompleto ? `${enderecoCompleto}, ` : ""}${
    imovel.cidade
  } - ${imovel.estado} que encontrei no site da ${siteConfig.nome}. Aguardo seu contato.`;

  return (
    <>
      <GaleriaFotos
        fotos={fotos}
        titulo={imovel.titulo}
        imovelId={imovel.id}
        whatsappHref={whatsappHref}
        mensagemContato={mensagemContato}
        temVideo={videos.length > 0}
      />

      <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-sm text-gray-500 mb-2">
        {imovel.tipo} ·{" "}
        {FINALIDADE_LABEL[imovel.finalidade] ?? imovel.finalidade}
        {rotulosAtivos(imovel).map((rotulo) => (
          <Badge key={rotulo.chave} className={`ml-2 ${rotulo.className}`}>
            {rotulo.label}
          </Badge>
        ))}
        <Badge variant="secondary" className="ml-2">
          # Cód:{" "}
          {formatarCodigoImovel(imovel.codigo, configContato.codigoImovelPrefixo)}
        </Badge>
      </p>
      <h1 className="text-2xl font-semibold">{imovel.titulo}</h1>
      {imovel.construtora && (
        <p className="text-sm text-gray-600 mt-1">
          Responsável pela obra: <strong>{imovel.construtora}</strong>
        </p>
      )}
      <p className="text-gray-500 mt-1">
        {enderecoCompleto ? `${enderecoCompleto}, ` : ""}
        {imovel.cidade} - {imovel.estado}
      </p>
      {imovel.publicadoEm && (
        <p className="text-xs text-gray-400 mt-1">
          Publicado {formatarTempoRelativo(imovel.publicadoEm)}, atualizado{" "}
          {formatarTempoRelativo(imovel.atualizadoEm)}.
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
          estagioObra={imovel.estagioObra}
          previsaoEntrega={imovel.previsaoEntrega}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mt-10">
        <div className="sm:col-span-2 space-y-6">
          <div>
            <h2 className="font-semibold mb-2">Descrição</h2>
            <p className="text-gray-700 whitespace-pre-line">
              {imovel.descricao ?? "Sem descrição disponível."}
            </p>
          </div>
          <div>
            <h2 className="font-semibold mb-2">Características do imóvel</h2>
            <ul className="grid grid-cols-2 gap-y-1 text-sm text-gray-700">
              {imovel.areaTotal && (
                <ItemCaracteristica icon={IconeArea}>
                  Área total: {imovel.areaTotal} m²
                </ItemCaracteristica>
              )}
              {imovel.areaPrivativa && (
                <ItemCaracteristica icon={IconeArea}>
                  Área privativa: {imovel.areaPrivativa} m²
                </ItemCaracteristica>
              )}
              {imovel.quartos !== null && (
                <ItemCaracteristica icon={IconeQuartos}>
                  Quartos: {imovel.quartos}
                </ItemCaracteristica>
              )}
              {imovel.suites !== null && (
                <ItemCaracteristica icon={IconeSuite}>
                  Suítes: {imovel.suites}
                </ItemCaracteristica>
              )}
              {imovel.banheiros !== null && (
                <ItemCaracteristica icon={IconeBanheiro}>
                  Banheiros: {imovel.banheiros}
                </ItemCaracteristica>
              )}
              {imovel.vagasGaragem !== null && (
                <ItemCaracteristica icon={IconeVaga}>
                  Vagas de garagem: {imovel.vagasGaragem}
                </ItemCaracteristica>
              )}
              {imovel.caracteristicasImovel.map((c) => (
                <ItemCaracteristicaCatalogo key={c} nome={c} />
              ))}
            </ul>
          </div>

          {imovel.caracteristicasCondominio.length > 0 && (
            <div>
              <h2 className="font-semibold mb-2">Características do condomínio</h2>
              <ul className="grid grid-cols-2 gap-y-1 text-sm text-gray-700">
                {imovel.caracteristicasCondominio.map((c) => (
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
              {imovel.cidade} - {imovel.estado}
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
            {imovel.preco != null && (
              <div>
                {imovel.finalidade === "VENDA_E_ALUGUEL" && (
                  <Badge variant="secondary" className="mb-1">
                    Para comprar
                  </Badge>
                )}
                <p className="text-2xl font-semibold">
                  {formatarPreco(imovel.preco)}
                </p>
              </div>
            )}
            {imovel.precoAluguel != null && (
              <div>
                {imovel.finalidade === "VENDA_E_ALUGUEL" && (
                  <Badge variant="secondary" className="mb-1">
                    Para alugar
                  </Badge>
                )}
                <p className="text-2xl font-semibold">
                  {formatarPreco(imovel.precoAluguel)}
                  <span className="text-sm font-normal text-gray-500">/mês</span>
                </p>
              </div>
            )}
            {imovel.precoCondominio && (
              <p className="text-sm text-gray-500">
                Condomínio: {formatarPreco(imovel.precoCondominio)}
              </p>
            )}
            {imovel.precoIptu && (
              <p className="text-sm text-gray-500">
                IPTU: {formatarPreco(imovel.precoIptu)}
              </p>
            )}
            <Button
              size="lg"
              className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800"
              render={
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" />
              }
            >
              Falar no WhatsApp
            </Button>
            {imovel.corretorResponsavel && (
              <div className="flex flex-col items-center text-center pt-3 border-t">
                <div className="relative w-16 h-16 rounded-full overflow-hidden border bg-gray-100 shrink-0">
                  {imovel.corretorResponsavel.foto ? (
                    <Image
                      src={imovel.corretorResponsavel.foto}
                      alt={imovel.corretorResponsavel.nome}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black text-white font-semibold">
                      {imovel.corretorResponsavel.nome.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="mt-2 font-medium text-sm">
                  {imovel.corretorResponsavel.nome}
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
              />
            ))}
          </div>
        </section>
      )}
      </div>
    </>
  );
}
