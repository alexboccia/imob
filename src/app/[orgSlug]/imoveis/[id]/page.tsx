import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  FINALIDADE_LABEL,
  formatarCodigoImovel,
  formatarTempoRelativo,
  rotulosAtivos,
} from "@/lib/format";
import { linkWhatsApp } from "@/lib/whatsapp";
import {
  resolverCorretorPublico,
  resolverWhatsAppDoImovel,
} from "@/lib/perfil-publico-corretor";
import {
  enderecoPublico,
  mensagemFormularioImovel,
  mensagemWhatsAppImovel,
} from "@/lib/imovel-contato";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { distanciaEmKm, formatarDistancia } from "@/lib/geo";
import { paraImovelCard } from "@/lib/imovel-card";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { withOrganization } from "@/lib/tenant-context";
import { buscarHostnameCustomAtivo } from "@/lib/platform/organization-domain";
import { GaleriaFotos } from "@/components/GaleriaFotos";
import { BotaoCompartilhar } from "@/components/BotaoCompartilhar";
import { EvolucaoObra } from "@/components/EvolucaoObra";
import { CarrosselPlantas } from "@/components/CarrosselPlantas";
import { ImovelCard } from "@/components/ImovelCard";
import {
  CaracteristicasImovel,
  CaracteristicasCondominio,
} from "@/components/imovel/CaracteristicasImovel";
import { CardContatoImovel } from "@/components/imovel/CardContatoImovel";
import { RastreioVisualizacaoImovel } from "@/components/analytics/RastreioVisualizacaoImovel";
import { ResumoComercialImovel } from "@/components/imovel/ResumoComercialImovel";
import { BarraCtaImovel } from "@/components/imovel/BarraCtaImovel";
import {
  ehLancamento,
  estaEmObra,
  previsaoEntregaPorExtenso,
  rotuloEstagioObra,
} from "@/lib/imovel-lancamento";
import { Badge } from "@/components/ui/badge";
import { TITULO_DETALHE, TITULO_BLOCO, TITULO_SECAO } from "@/lib/site-typography";

// Página de detalhe não tem tag de invalidação própria (preço/status
// mudam por edição de imóvel, sem updateTag associado) — sem
// force-dynamic (removido do layout), um segmento dinâmico como este
// tende a ficar estático após a primeira visita. O revalidate curto
// evita que um imóvel vendido/alterado continue aparecendo desatualizado
// por tempo indefinido.
export const revalidate = 60;

const buscarImovel = cache(async (id: string, organizationId: string) => {
  return prisma.property.findUnique({
    where: { id, organizationId },
    include: {
      media: { orderBy: [{ isCover: "desc" }, { order: "asc" }] },
      // Só o que pode ser publicado. O WhatsApp operacional do membro,
      // o contactEmail e o User.avatarUrl (foto do painel) ficam
      // deliberadamente FORA do select: se não chegam à página, não há
      // caminho por onde vazem pra renderização, mesmo por engano.
      responsibleMember: {
        select: {
          publicProfileEnabled: true,
          publicCreci: true,
          publicPhotoUrl: true,
          publicBio: true,
          publicWhatsapp: true,
          user: { select: { name: true } },
        },
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

  // Correção AU — mesma decisão de src/app/[orgSlug]/page.tsx: URL
  // absoluta sob o domínio customizado ACTIVE (ignora metadataBase),
  // preserva o formato relativo original em qualquer outro caso.
  const hostnameCustom = await buscarHostnameCustomAtivo(organizationId);
  const canonical = hostnameCustom
    ? `https://${hostnameCustom}/imoveis/${id}`
    : `${basePath}/imoveis/${id}`;

  return {
    title: imovel.title,
    description: descricao,
    alternates: { canonical },
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

  // Identidade comercial pública: null a menos que o membro responsável
  // tenha OPT-IN explícito. Sem isso, a página se comporta como se não
  // houvesse profissional e mostra só a imobiliária — papel (OWNER/ADMIN)
  // e ser responsável pelo imóvel não publicam ninguém.
  const corretorPublico = resolverCorretorPublico(imovel.responsibleMember);

  // WhatsApp público do profissional quando publicado, senão o da
  // organização, senão nenhum. linkWhatsApp devolve NULL no último caso —
  // e é isso que faz todo CTA de WhatsApp desaparecer, em vez de
  // renderizar "wa.me/?text=..." (link que abre erro no WhatsApp).
  const whatsappNumero = resolverWhatsAppDoImovel(
    imovel.responsibleMember,
    configContato.whatsapp
  );

  const whatsappHref = linkWhatsApp(
    whatsappNumero,
    mensagemWhatsAppImovel(imovel, configContato.codigoImovelPrefixo)
  );

  const enderecoCompleto = enderecoPublico(imovel);

  const temCoordenadas = imovel.latitude !== null && imovel.longitude !== null;
  const linkGoogleMaps = temCoordenadas
    ? `https://www.google.com/maps/search/?api=1&query=${imovel.latitude},${imovel.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${enderecoCompleto}, ${imovel.city} - ${imovel.state}`
      )}`;

  const mensagemContato = mensagemFormularioImovel(imovel, organization.name);

  // Âncora usada pela barra fixa do mobile pra saltar direto pro
  // formulário do card, em vez de duplicar o formulário na barra.
  const idFormulario = "contato-imovel";

  // Lançamento/em construção: mesma rota, mesma composição de sempre —
  // o que muda é a PRIORIDADE. Prazo de entrega, estágio e construtora
  // deixam de ser metadado no rodapé do cabeçalho e sobem, porque são
  // exatamente o que decide a compra de um imóvel que ainda não existe.
  // Tudo continua condicionado a dado real: sem estágio, sem previsão ou
  // sem construtora cadastrados, cada peça simplesmente não aparece.
  const lancamento = ehLancamento(imovel);
  const estagioObra = rotuloEstagioObra(imovel);
  const previsaoEntrega = previsaoEntregaPorExtenso(imovel.deliveryForecast);
  const emObra = estaEmObra(imovel);

  return (
    <>
      {/* Hierarquia do topo: tipo/finalidade e rótulos primeiro (o que o
          visitante usa pra saber se a página é pra ele), título e
          localização em seguida, e a data de publicação por último, mais
          discreta — antes ela competia em peso com o endereço. O código
          saiu da mesma linha dos rótulos e virou item de metadado, onde
          é procurado quando alguém já decidiu ligar. Mesmos dados de
          sempre, nenhum campo novo. */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-600">
            {imovel.type} · {FINALIDADE_LABEL[imovel.purpose] ?? imovel.purpose}
          </p>
          {rotulosAtivos({
            lancamento: imovel.isLaunch,
            destaque: imovel.isFeatured,
            oportunidade: imovel.isOpportunity,
          }).map((rotulo) => (
            <Badge key={rotulo.chave} className={rotulo.className}>
              {rotulo.label}
            </Badge>
          ))}
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className={TITULO_DETALHE}>{imovel.title}</h1>
          {/* Compartilhar também aqui, não só dentro da galeria: um imóvel
              sem foto não renderiza galeria nenhuma e ficava sem nenhuma
              forma de compartilhar o link. */}
          <BotaoCompartilhar
            titulo={imovel.title}
            className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border text-gray-600 outline-none transition-colors hover:border-primary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <p className="mt-2 text-base text-gray-600">
          {enderecoCompleto ? `${enderecoCompleto}, ` : ""}
          {imovel.city} - {imovel.state}
        </p>

        {/* Num lançamento, estágio e prazo saem do metadado e viram
            informação de primeira linha: quem olha um imóvel que ainda
            não existe decide por "quando fica pronto" tanto quanto por
            preço. Cada item só existe se o campo estiver preenchido —
            estágio vem do enum real (três valores, sem percentual) e a
            entrega respeita a granularidade mês/ano do formulário. */}
        {lancamento && (estagioObra || previsaoEntrega || imovel.developer) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {estagioObra && (
              <p className="text-gray-700">
                <span className="text-gray-500">Obra:</span>{" "}
                <strong className="font-semibold">{estagioObra}</strong>
              </p>
            )}
            {previsaoEntrega && (
              <p className="text-gray-700">
                <span className="text-gray-500">Previsão de entrega:</span>{" "}
                <strong className="font-semibold">{previsaoEntrega}</strong>
              </p>
            )}
            {imovel.developer && (
              <p className="text-gray-700">
                <span className="text-gray-500">Construtora:</span>{" "}
                <strong className="font-semibold">{imovel.developer}</strong>
              </p>
            )}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
          <span>
            Cód.{" "}
            {formatarCodigoImovel(imovel.code, configContato.codigoImovelPrefixo)}
          </span>
          {/* Construtora continua aqui SÓ pra imóvel que não é lançamento
              (o campo é opcional e pode estar preenchido de qualquer
              forma) — no lançamento ela já apareceu acima, e repetir
              seria ruído. */}
          {!lancamento && imovel.developer && (
            <span>Responsável pela obra: {imovel.developer}</span>
          )}
          {imovel.publishedAt && (
            <span>
              Publicado {formatarTempoRelativo(imovel.publishedAt)}, atualizado{" "}
              {formatarTempoRelativo(imovel.updatedAt)}
            </span>
          )}
        </div>
      </div>

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

      {/* O espaço pra barra fixa de conversão é reservado no <body>
          (ver globals.css), não aqui: o rodapé fica fora deste container
          e também precisa escapar da barra. */}
      <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Leitura rápida logo abaixo da galeria: atributos físicos do
          imóvel, e some por inteiro quando não há nenhum deles. Obra e
          entrega ficam DE FORA de propósito — já aparecem em destaque no
          cabeçalho e voltam, com contexto, na timeline logo abaixo;
          repetir aqui seria a mesma informação três vezes na mesma tela. */}
      <ResumoComercialImovel
        totalArea={imovel.totalArea}
        privateArea={imovel.privateArea}
        bedrooms={imovel.bedrooms}
        suites={imovel.suites}
        bathrooms={imovel.bathrooms}
        parkingSpots={imovel.parkingSpots}
      />

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

      {/* Duas colunas só a partir de lg: entre 640 e 1023px o card
          lateral espremia a coluna de conteúdo em 2/3 de uma tela já
          estreita, deixando descrição e características com linhas
          curtíssimas. Abaixo de lg tudo empilha e a barra fixa do rodapé
          cobre a conversão. */}
      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {/* Com obra em andamento, a evolução vem ANTES da descrição:
              é a pergunta que o visitante faz primeiro num imóvel que
              ainda está sendo construído. Pronto (ou sem estágio
              cadastrado), o bloco continua na posição de sempre, mais
              abaixo — ver EvolucaoObra adiante, que só renderiza uma vez
              porque a condição das duas posições é mutuamente exclusiva. */}
          {emObra && (
            <EvolucaoObra
              estagioObra={imovel.constructionStage}
              previsaoEntrega={imovel.deliveryForecast}
            />
          )}

          {imovel.description && (
            <section>
              <h2 className={`${TITULO_BLOCO} mb-3`}>Descrição</h2>
              {/* max-w-prose limita a linha a ~65 caracteres: sem isso,
                  em 1280px+ a descrição virava linhas longas demais pra
                  leitura confortável. leading-relaxed e whitespace-pre-line
                  preservam a quebra de parágrafo que o corretor escreveu. */}
              <p className="max-w-prose whitespace-pre-line leading-relaxed text-gray-700">
                {imovel.description}
              </p>
            </section>
          )}
          <CaracteristicasImovel imovel={imovel} />

          <CaracteristicasCondominio itens={imovel.condoFeatures} />

          {!emObra && (
            <EvolucaoObra
              estagioObra={imovel.constructionStage}
              previsaoEntrega={imovel.deliveryForecast}
            />
          )}

          {plantas.length > 0 && (
            <div>
              <CarrosselPlantas plantas={plantas} />
            </div>
          )}

          <section>
            <h2 className={`${TITULO_BLOCO} mb-3`}>Localização</h2>
            <p className="mb-3 text-sm text-gray-700">
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
              className="text-sm text-link hover:underline"
            >
              Ver no Google Maps
            </a>
          </section>
        </div>

        <CardContatoImovel
          imovel={imovel}
          imovelId={imovel.id}
          orgSlug={orgSlug}
          whatsappHref={whatsappHref}
          mensagemFormulario={mensagemContato}
          corretor={corretorPublico}
          idFormulario={idFormulario}
        />
      </div>

      {imoveisProximos.length > 0 && (
        <section className="mt-16 pt-8 border-t">
          <h2 className={`${TITULO_SECAO} mb-6`}>
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

      <BarraCtaImovel
        price={imovel.price}
        rentPrice={imovel.rentPrice}
        whatsappHref={whatsappHref}
        orgSlug={orgSlug}
        imovelId={imovel.id}
        hrefFormulario={`#${idFormulario}`}
      />

      {/* Visualização válida (Fase 6): componente de cliente que não
          renderiza nada e só dispara o evento depois de a página montar
          num browser de verdade. Nunca no Server Component — lá, crawler,
          prefetch, HEAD, metadata e health check virariam audiência. */}
      <RastreioVisualizacaoImovel orgSlug={orgSlug} imovelId={imovel.id} />
    </>
  );
}
