import { cache } from "react";
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
import { GaleriaFotos } from "@/components/GaleriaFotos";
import { ModalContato } from "@/components/ModalContato";
import { EvolucaoObra } from "@/components/EvolucaoObra";
import { CarrosselPlantas } from "@/components/CarrosselPlantas";
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
    include: { midias: { orderBy: [{ ehCapa: "desc" }, { ordem: "asc" }] } },
  });
});

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

  const configContato = await buscarConfiguracaoContato();

  const whatsappHref = `https://wa.me/${configContato.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
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
          <span
            key={rotulo.chave}
            className={`ml-2 text-xs px-2 py-1 rounded-full ${rotulo.className}`}
          >
            {rotulo.label}
          </span>
        ))}
        <span className="ml-2 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">
          # Cód:{" "}
          {formatarCodigoImovel(imovel.codigo, configContato.codigoImovelPrefixo)}
        </span>
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

      {plantas.length > 0 && (
        <div className="mt-6 border rounded-lg p-5">
          <CarrosselPlantas plantas={plantas} />
        </div>
      )}

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

        <aside className="border rounded-lg p-5 h-fit space-y-3">
          {imovel.preco != null && (
            <div>
              {imovel.finalidade === "VENDA_E_ALUGUEL" && (
                <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full mb-1">
                  Para comprar
                </span>
              )}
              <p className="text-2xl font-semibold">
                {formatarPreco(imovel.preco)}
              </p>
            </div>
          )}
          {imovel.precoAluguel != null && (
            <div>
              {imovel.finalidade === "VENDA_E_ALUGUEL" && (
                <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full mb-1">
                  Para alugar
                </span>
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
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center bg-green-600 text-white rounded-md px-4 py-2 font-medium hover:bg-green-700 active:bg-green-800 transition-colors"
          >
            Falar no WhatsApp
          </a>
          <ModalContato
            imovelId={imovel.id}
            mensagemPreenchida={mensagemContato}
            whatsappHref={whatsappHref}
            className="block w-full text-center border rounded-md px-4 py-2 font-medium hover:bg-gray-50"
          >
            Enviar mensagem
          </ModalContato>
        </aside>
      </div>
      </div>
    </>
  );
}
