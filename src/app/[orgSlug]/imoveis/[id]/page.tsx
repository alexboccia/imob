import { cache } from "react";
import { notFound } from "next/navigation";
import { buscarVizinhosPublicos } from "@/lib/navegacao-imoveis-data";
import { hrefDoImovel } from "@/lib/navegacao-imoveis";
import { fichaEhPublica } from "@/lib/visibilidade-imovel";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  formatarCodigoImovel,
  formatarTempoRelativo,
  rotulosAtivos,
} from "@/lib/format";
import { linkWhatsApp } from "@/lib/whatsapp";
import {
  contatosPublicosDoCorretor,
  resolverCorretorPublico,
  resolverWhatsAppDoImovel,
  whatsappPublicoDoCorretor,
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
import { AcoesImovel } from "@/components/imovel/AcoesImovel";
import { urlCanonicaDoImovel } from "@/lib/compartilhar-imovel";
import { EvolucaoObra } from "@/components/EvolucaoObra";
import { RecursosImovel } from "@/components/RecursosImovel";
import { FraseDestaque } from "@/components/FraseDestaque";
import {
  recursosDoImovel,
  ANCORA_PLANTAS,
  ANCORA_VIDEOS,
} from "@/lib/recursos-imovel";
import { OutrasUnidades } from "@/components/OutrasUnidades";
import { LocaisProximos } from "@/components/LocaisProximos";
import {
  buscarOutrasUnidades,
  LIMITE_OUTRAS_UNIDADES,
} from "@/lib/empreendimento-consultas";
import { CarrosselPlantas } from "@/components/CarrosselPlantas";
import { ImovelCard } from "@/components/ImovelCard";
import { CaracteristicasDoImovel } from "@/components/imovel/Caracteristicas";
import { CardContatoImovel } from "@/components/imovel/CardContatoImovel";
import { BreadcrumbImovel, type SeloContexto } from "@/components/imovel/BreadcrumbImovel";
import { migalhasDoImovel } from "@/lib/breadcrumb-imovel";
import { CardCorretorImovel } from "@/components/imovel/CardCorretorImovel";
import { MateriaisImovel } from "@/components/imovel/MateriaisImovel";
import { RastreioVisualizacaoImovel } from "@/components/analytics/RastreioVisualizacaoImovel";
import { BarraCtaImovel } from "@/components/imovel/BarraCtaImovel";
import {
  ehLancamento,
  entregaPrevistaDoDestaque,
  previsaoEntregaPorExtenso,
  rotuloEstagioObra,
} from "@/lib/imovel-lancamento";
import { TITULO_DETALHE, TITULO_BLOCO, TITULO_SECAO } from "@/lib/site-typography";
import { blocoDeMateriaisVisivel } from "@/lib/materiais-imovel";
import { buscarMateriaisAtivos } from "@/lib/materiais-consultas";

// Página de detalhe não tem tag de invalidação própria (preço/status
// mudam por edição de imóvel, sem updateTag associado) — sem
// force-dynamic (removido do layout), um segmento dinâmico como este
// tende a ficar estático após a primeira visita. O revalidate curto
// evita que um imóvel vendido/alterado continue aparecendo desatualizado
// por tempo indefinido.
export const revalidate = 60;

// Fase 47 — a metadata e a página precisam da MESMA URL canônica (a da
// tag e a do botão de compartilhar); o cache faz as duas usarem uma única
// consulta por requisição.
const hostnameCustomAtivo = cache(buscarHostnameCustomAtivo);

const buscarImovel = cache(async (id: string, organizationId: string) => {
  return prisma.property.findUnique({
    where: { id, organizationId },
    include: {
      media: { orderBy: [{ isCover: "desc" }, { order: "asc" }] },
      // Fase 42 — escopado pela organização além do imóvel, e só as
      // colunas que a ficha mostra.
      nearbyPlaces: {
        where: { organizationId },
        orderBy: { order: "asc" },
        select: { id: true, category: true, name: true, distance: true, distanceUnit: true },
      },
      // Só o que pode ser publicado. O WhatsApp operacional do membro,
      // o contactEmail e o User.avatarUrl (foto do painel) ficam
      // deliberadamente FORA do select: se não chegam à página, não há
      // caminho por onde vazem pra renderização, mesmo por engano.
      responsibleMember: {
        select: {
          // Id só para montar a URL do perfil público — o mesmo
          // identificador que a rota /corretores/[id] usa, e que ela
          // valida contra a organização antes de renderizar qualquer
          // coisa.
          id: true,
          publicProfileEnabled: true,
          publicCreci: true,
          publicPhotoUrl: true,
          publicBio: true,
          publicWhatsapp: true,
          publicPhone: true,
          publicEmail: true,
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

  if (!imovel || !fichaEhPublica(imovel.status)) {
    return {};
  }

  const capa = imovel.media.find((m) => m.type === "PHOTO")?.url;
  const descricao = imovel.description
    ? imovel.description.slice(0, 160)
    : `${imovel.type} em ${imovel.neighborhood}, ${imovel.city} - ${imovel.state}.`;

  // Correção AU — mesma decisão de src/app/[orgSlug]/page.tsx: URL
  // absoluta sob o domínio customizado ACTIVE. Nos demais casos, a Fase 47
  // monta a absoluta sobre o mesmo NEXT_PUBLIC_SITE_URL do metadataBase —
  // o HTML final é o mesmo de antes, e o botão Compartilhar usa esta URL.
  const canonical = urlCanonicaDoImovel({
    hostnameCustom: await hostnameCustomAtivo(organizationId),
    basePath,
    imovelId: id,
  });

  return {
    title: imovel.title,
    description: descricao,
    alternates: { canonical },
    openGraph: {
      title: imovel.title,
      description: descricao,
      type: "website",
      // Fase 47 — a URL que o botão Compartilhar envia é esta mesma.
      url: canonical,
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

  const { imovel, configContato, imoveisProximos, materiais, outrasUnidades, vizinhos } =
    await withOrganization(organizationId, async () => {
      const imovel = await buscarImovel(id, organizationId);

      if (!imovel || !fichaEhPublica(imovel.status)) {
        notFound();
      }

      const [configContato, imoveisProximos, materiais, outrasUnidades, vizinhos] = await Promise.all([
        buscarConfiguracaoContato(organizationId),
        buscarImoveisProximos(organizationId, imovel),
        // Em paralelo com o que a página já buscava — não acrescenta
        // ida e volta à renderização.
        buscarMateriaisAtivos(imovel.id, organizationId),
        // Fase 38 — outras unidades do MESMO empreendimento. Só consulta
        // quando esta unidade pertence a um: sem vínculo não existe
        // pergunta a fazer, e a consulta nem sai.
        imovel.developmentId
          ? buscarOutrasUnidades(organizationId, imovel.developmentId, imovel.id)
          : Promise.resolve([]),
        // Fase 48 — anterior/próximo na ordem da listagem pública: duas
        // consultas de uma linha, no mesmo lote.
        buscarVizinhosPublicos(organizationId, imovel),
      ]);

      return { imovel, configContato, imoveisProximos, materiais, outrasUnidades, vizinhos };
    });

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

  // Botão do card do corretor: número PESSOAL dele, sem o fallback
  // institucional que os outros três CTAs usam. Ao lado do rosto e do
  // nome de alguém, um botão que abre conversa com o número da
  // imobiliária afirmaria que o visitante está falando com aquela pessoa
  // — ver whatsappPublicoDoCorretor. Mesma mensagem contextual dos
  // demais CTAs: nenhuma lógica de normalização duplicada.
  const whatsappCorretorHref = linkWhatsApp(
    whatsappPublicoDoCorretor(imovel.responsibleMember),
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

  // Fase 47 — o endereço que Compartilhar envia: o canônico da ficha.
  const urlCanonica = urlCanonicaDoImovel({
    hostnameCustom: await hostnameCustomAtivo(organizationId),
    basePath,
    imovelId: imovel.id,
  });

  // Fase 46 — breadcrumb e selos, só com dados já carregados.
  const migalhas = migalhasDoImovel(basePath, imovel);
  // Selos, na ordem: rótulos comerciais (a MESMA fonte de sempre —
  // "Lançamento" é o rótulo isLaunch, como no filtro ?lancamento=1),
  // estágio real da obra e o código público do imóvel.
  const selosContexto: SeloContexto[] = [
    ...rotulosAtivos({
      lancamento: imovel.isLaunch,
      destaque: imovel.isFeatured,
      oportunidade: imovel.isOpportunity,
    }).map((r) => ({ chave: r.chave, label: r.label, className: r.className, tipo: "rotulo" as const })),
    ...(estagioObra ? [{ chave: "obra", label: estagioObra, tipo: "obra" as const }] : []),
    {
      chave: "codigo",
      label: `Código: ${formatarCodigoImovel(imovel.code, configContato.codigoImovelPrefixo)}`,
      tipo: "codigo" as const,
    },
  ];

  return (
    <>
      {/* Hierarquia do topo: contexto primeiro (breadcrumb com tipo e
          bairro, e os selos — rótulos, obra, código — que dizem ao
          visitante se a página é pra ele), título e localização em
          seguida, e a data de publicação por último, mais discreta. */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        {/* Fase 43 — PRIMEIRA TELA COMERCIAL. A partir de lg o cabeçalho
            tem duas colunas: identidade à esquerda (o que já existia,
            intacto) e, à direita, preço + custos + ação. Abaixo de lg a
            coluna da direita não existe — a barra fixa do rodapé já faz
            esse papel no celular. */}
        {/* Fase 46 — BREADCRUMB COMERCIAL. Ocupa o lugar da antiga linha
            "tipo · finalidade + rótulos", que dizia a mesma coisa sem
            levar a lugar nenhum: o tipo virou um nível navegável, os
            rótulos continuam como selos, e estágio da obra e código saem
            de mais abaixo no cabeçalho para cá — no mesmo lugar, uma vez
            só. Largura toda, acima das duas colunas, alinhado ao
            conteúdo. */}
        <BreadcrumbImovel migalhas={migalhas} selos={selosContexto} />

        {/* Fase 52 — o cabeçalho é só identidade e ações. O bloco
            comercial que morava aqui (preço + CTA, coluna da direita,
            Fase 43) saiu: preço e WhatsApp já vivem no card lateral da
            Fase 51, e repeti-los acima da galeria empurrava as fotos
            para baixo e criava duas áreas comerciais na mesma tela.
            A grade continua a mesma, com uma linha só: título à
            esquerda, as quatro ações à direita, terminando na borda do
            conteúdo. Abaixo de lg a identidade vira `contents` para as
            ações ficarem entre o endereço e o metadado. */}
        <div
          data-cabecalho-imovel
          className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-10"
        >
        <div
          data-identidade-imovel
          className="contents lg:col-start-1 lg:row-start-1 lg:block lg:min-w-0"
        >
          {/* Título nunca truncado: quebra em quantas linhas precisar. */}
          <div className="order-1 min-w-0">
            <h1 className={`${TITULO_DETALHE} break-words`}>{imovel.title}</h1>
            <p className="mt-2 text-base text-gray-600">
              {enderecoCompleto ? `${enderecoCompleto}, ` : ""}
              {imovel.city} - {imovel.state}
            </p>
          </div>

          <div className="order-3 min-w-0">
        {/* Num lançamento, estágio e prazo saem do metadado e viram
            informação de primeira linha: quem olha um imóvel que ainda
            não existe decide por "quando fica pronto" tanto quanto por
            preço. Cada item só existe se o campo estiver preenchido —
            estágio vem do enum real (três valores, sem percentual) e a
            entrega respeita a granularidade mês/ano do formulário. */}
        {/* Fase 46 — o estágio da obra agora é um selo no breadcrumb; aqui
            ficam prazo e construtora. */}
        {lancamento && (previsaoEntrega || imovel.developer) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
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

        {/* Fase 46 — o código saiu daqui e é um selo no breadcrumb; sem
            ele, a linha pode não ter o que mostrar e não reserva espaço. */}
        {((!lancamento && imovel.developer) || imovel.publishedAt) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
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
        )}
          </div>
        </div>

        {/* Fase 47/48 — Compartilhar, Salvar, Imóvel anterior e Próximo
            imóvel. Este é o único Compartilhar fora do lightbox (Fase
            43), e existe mesmo sem foto. */}
        <AcoesImovel
          imovelId={imovel.id}
          orgSlug={orgSlug}
          titulo={imovel.title}
          url={urlCanonica}
          anteriorHref={vizinhos.anteriorId ? hrefDoImovel(basePath, vizinhos.anteriorId) : null}
          proximoHref={vizinhos.proximoId ? hrefDoImovel(basePath, vizinhos.proximoId) : null}
          className="order-2 mt-3 lg:order-none lg:col-start-2 lg:row-start-1 lg:mt-0 lg:justify-self-end"
        />
        </div>
      </div>

      <GaleriaFotos
        fotos={fotos}
        titulo={imovel.title}
        imovelId={imovel.id}
        whatsappHref={whatsappHref}
        mensagemContato={mensagemContato}
        orgSlug={orgSlug}
        basePath={basePath}
        nome={organization.name}
        urlCompartilhamento={urlCanonica}
        // Fase 45 — conteúdo editorial da foto de destaque. O selo de
        // entrega usa a MESMA regra do cabeçalho (lançamento + data).
        tituloDestaque={imovel.heroTitle}
        subtituloDestaque={imovel.heroSubtitle}
        entregaPrevista={entregaPrevistaDoDestaque(imovel)}
      />

      {/* O espaço pra barra fixa de conversão é reservado no <body>
          (ver globals.css), não aqui: o rodapé fica fora deste container
          e também precisa escapar da barra. */}
      <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Fase 39 — IMEDIATAMENTE abaixo da galeria: os recursos que este
          imóvel tem para explorar. Só aparecem os que existem de fato, e
          a barra inteira some quando não há nenhum.

          Planta e vídeo são ATALHOS para as seções que já vivem mais
          abaixo nesta mesma página (ancoradas com scroll-mt), nunca uma
          segunda exibição do mesmo material. O tour abre onde ele está
          hospedado, porque o produto guarda o endereço de uma
          experiência externa, não a experiência. */}
      <RecursosImovel recursos={recursosDoImovel(imovel.media)} />

      {/* Fase 41 — aqui havia uma faixa de "resumo" (área, quartos,
          suítes, banheiros, vagas). Saiu da FICHA porque repetia, com
          outro desenho, exatamente o que "Características da unidade"
          mostra logo abaixo: a mesma informação duas vezes na mesma tela.

          O resumo compacto dos CARDS (Home, /imoveis, próximos, outras
          unidades) é outro componente — a linha de atributos do
          ImovelCard — e continua lá, porque numa listagem ele serve para
          comparar imóveis lado a lado. */}

      {/* Duas colunas só a partir de lg: entre 640 e 1023px o card
          lateral espremia a coluna de conteúdo em 2/3 de uma tela já
          estreita, deixando descrição e características com linhas
          curtíssimas. Abaixo de lg tudo empilha e a barra fixa do rodapé
          cobre a conversão. */}
      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* space-y-10 (era 8): mais respiro entre os blocos da ficha —
            descrição, características, obra, plantas e localização
            passam a ser percebidos como blocos próprios, sem alongar a
            página com áreas vazias. */}
        <div className="space-y-10 lg:col-span-2">
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

          {/* Fase 40 — IMEDIATAMENTE abaixo da descrição, e antes das
              características. Fora da <section> da descrição de
              propósito: é um bloco editorial próprio, não um parágrafo
              dela.

              Independente da descrição existir: um imóvel sem texto
              longo ainda pode ter uma frase, e o componente some sozinho
              quando não há frase cadastrada. */}
          <FraseDestaque frase={imovel.highlightPhrase} />
          <CaracteristicasDoImovel imovel={imovel} />

          {/* Fase 43 — os vídeos moraram em largura total entre a barra de
              recursos e esta grade: cada um ocupava ~630px a 1280 e
              empurrava descrição, preço e formulário para longe da
              primeira tela. Agora são um bloco editorial da coluna, logo
              depois das características. O id continua o mesmo: é o
              destino do atalho "Vídeo" da barra de recursos. */}
          {videos.length > 0 && (
            <section id={ANCORA_VIDEOS} className="scroll-mt-6">
              <h2 className={`${TITULO_BLOCO} mb-3`}>
                {videos.length > 1 ? "Vídeos" : "Vídeo"}
              </h2>
              <div className="space-y-4">
                {videos.map((video, i) => (
                  <div key={video.id} className="aspect-video">
                    <iframe
                      src={video.url}
                      title={
                        videos.length > 1
                          ? `Vídeo do imóvel ${imovel.title} — ${i + 1}`
                          : `Vídeo do imóvel ${imovel.title}`
                      }
                      className="h-full w-full rounded-lg"
                      allowFullScreen
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* POSIÇÃO ÚNICA da evolução da obra: sempre depois de
              descrição e das duas listas de características (unidade e
              condomínio).
              Antes havia DUAS posições mutuamente exclusivas — em obra,
              o bloco subia para antes da descrição; pronto, ficava aqui.
              O bloco tinha assim uma posição que dependia do estágio, e
              a ficha mudava de forma conforme o imóvel.
              O componente já se autoprotege (devolve null quando não há
              estágio cadastrado), então não há condicional aqui: sem
              obra, nada renderiza e o `space-y-10` do container não abre
              espaço nenhum. */}
          <EvolucaoObra
            estagioObra={imovel.constructionStage}
            previsaoEntrega={imovel.deliveryForecast}
          />

          {plantas.length > 0 && (
            // Fase 39 — id + scroll-mt no MESMO padrão da seção de
            // vídeos, que já era ancorada: é o destino do atalho
            // "Planta" da barra logo abaixo da galeria.
            <div id={ANCORA_PLANTAS} className="scroll-mt-6">
              <CarrosselPlantas plantas={plantas} />
            </div>
          )}

          {/* Materiais vêm depois de descrição/características/plantas e
              logo antes da Localização: a essa altura o visitante já sabe
              o que é o imóvel e é aqui que ele quer se aprofundar. Só
              existe quando há material ativo de verdade — lançamento sem
              arquivo nenhum não ganha um CTA que promete o que não
              existe. */}
          {blocoDeMateriaisVisivel(materiais) && (
            <MateriaisImovel
              imovelId={imovel.id}
              isLaunch={imovel.isLaunch}
              materiais={materiais}
              orgSlug={orgSlug}
            />
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

          {/* Fase 42 — logo depois da Localização: o endereço diz onde,
              esta seção diz o que há em volta. Some sozinha sem locais. */}
          <LocaisProximos locais={imovel.nearbyPlaces} />

        </div>

        {/* Fase 51 — a lateral inteira: preço e CTAs, o corretor
            responsável, o formulário e a política de privacidade. */}
        <CardContatoImovel
          imovel={imovel}
          imovelId={imovel.id}
          orgSlug={orgSlug}
          basePath={basePath}
          mensagemFormulario={mensagemContato}
          idFormulario={idFormulario}
          corretor={
            corretorPublico && (
              <CardCorretorImovel
                corretor={corretorPublico}
                membroId={imovel.responsibleMember!.id}
                basePath={basePath}
                contatos={contatosPublicosDoCorretor(imovel.responsibleMember)}
                whatsappHref={whatsappCorretorHref}
                imovelId={imovel.id}
                orgSlug={orgSlug}
              />
            )
          }
        />
      </div>

      {/* Fase 38 — POSIÇÃO: depois de todo o conteúdo informativo da
          unidade (descrição, características, obra, plantas, materiais,
          localização) e ANTES de "Imóveis próximos".

          A ordem entre as duas é deliberada e é a própria hierarquia da
          informação: primeiro o que existe DENTRO deste empreendimento —
          a comparação mais relevante para quem já se interessou por ele —
          e só então o que existe por perto, que é sugestão mais ampla.

          Nenhuma das seções que acabamos de estabilizar mudou de lugar. */}
      <OutrasUnidades
        unidades={outrasUnidades.slice(0, LIMITE_OUTRAS_UNIDADES)}
        basePath={basePath}
        orgSlugFavorito={orgSlug}
      />

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
                orgSlugFavorito={orgSlug}
              />
            ))}
          </div>
        </section>
      )}
      </div>

      <BarraCtaImovel
        price={imovel.price}
        rentPrice={imovel.rentPrice}
        purpose={imovel.purpose}
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
