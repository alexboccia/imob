import { cache } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getOrganizationBySlug } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { resolverBasePath } from "@/lib/site-url";
import { buscarHostnameCustomAtivo } from "@/lib/platform/organization-domain";
import {
  caminhoPerfilCorretor,
  contatosPublicosDoCorretor,
  hrefEmail,
  hrefTelefone,
  resolverCorretorPublico,
} from "@/lib/perfil-publico-corretor";
import { formatarTelefone } from "@/lib/telefone";
import { linkWhatsApp } from "@/lib/whatsapp";
import { paraImovelCard } from "@/lib/imovel-card";
import { SecaoImoveis } from "@/components/SecaoImoveis";
import { buttonVariants } from "@/components/ui/button";
import {
  IconeEmail,
  IconePessoa,
  IconeTelefone,
  IconeWhatsApp,
} from "@/components/icons";
import { TITULO_DETALHE, TITULO_SECAO } from "@/lib/site-typography";

// Perfil público do corretor.
//
// Existe porque o card da ficha do imóvel apresentava o profissional sem
// ter para onde levar quem quisesse conhecê-lo. É a mesma identidade,
// com espaço para respirar e com a carteira dele logo abaixo.
//
// O PORTÃO É O MESMO DE SEMPRE, e isso é deliberado: publicação é
// `publicProfileEnabled`, e nada mais. Ser OWNER, ser responsável por um
// imóvel, ter foto ou WhatsApp cadastrado não publica ninguém. Com a
// flag desligada esta rota responde 404 — não uma página vazia, não um
// "perfil indisponível": do lado de fora, o perfil não existe.
export const revalidate = 60;

// Quantos imóveis do corretor a página mostra. Vitrine, não catálogo:
// quem quiser o acervo inteiro tem a listagem pública, e é para lá que o
// "Ver tudo" aponta. Sem paginação nesta fase — ela só faria sentido se
// existisse filtro por corretor na listagem, que é outra decisão.
const MAX_IMOVEIS_DO_CORRETOR = 6;

// UMA consulta, escopada ao tenant desde o `where` — nunca "busca o
// membro e depois confere a organização". Um id de membro de outra
// organização não encontra nada aqui, que é o comportamento pedido
// contra IDOR. `publicProfileEnabled: true` está no where pelo mesmo
// motivo: perfil despublicado não é "encontrado e escondido", ele não é
// encontrado.
//
// O select traz SÓ o que pode ser publicado. O e-mail de login, o
// WhatsApp operacional e o contactEmail não estão aqui — o que não é
// buscado não tem como vazar para o HTML, para o payload do RSC ou para
// o bundle do cliente.
const buscarCorretor = cache(async (membroId: string, organizationId: string) => {
  return prisma.organizationMember.findFirst({
    where: { id: membroId, organizationId, publicProfileEnabled: true },
    select: {
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
  });
});

function descricaoDoPerfil(
  corretor: { nome: string; bio: string | null; creci: string | null },
  nomeOrganizacao: string
): string {
  if (corretor.bio) return corretor.bio.slice(0, 160);
  const registro = corretor.creci ? ` (${corretor.creci})` : "";
  return `${corretor.nome}${registro}, corretor(a) de imóveis na ${nomeOrganizacao}.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}): Promise<Metadata> {
  const { orgSlug, id } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) return {};

  const membro = await withOrganization(organization.id, () =>
    buscarCorretor(id, organization.id)
  );
  const corretor = resolverCorretorPublico(membro);
  // Perfil não publicado não ganha título, descrição nem canonical: para
  // um crawler, esta URL não descreve nada.
  if (!corretor) return {};

  const basePath = resolverBasePath(orgSlug);
  const hostnameCustom = await buscarHostnameCustomAtivo(organization.id);
  const caminho = caminhoPerfilCorretor(basePath, id);
  const canonical = hostnameCustom
    ? `https://${hostnameCustom}${caminhoPerfilCorretor("", id)}`
    : caminho;

  const titulo = `${corretor.nome} | Corretor(a) de imóveis | ${organization.name}`;
  const descricao = descricaoDoPerfil(corretor, organization.name);

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical },
    openGraph: {
      title: titulo,
      description: descricao,
      type: "profile",
      siteName: organization.name,
      // Só a foto que o próprio profissional publicou. Sem ela, nenhuma
      // imagem — nunca o avatar do painel, que é dado interno.
      images: corretor.foto ? [{ url: corretor.foto }] : undefined,
    },
  };
}

export default async function PerfilCorretorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) notFound();
  const organizationId = organization.id;
  const basePath = resolverBasePath(orgSlug);

  const { corretor, imoveis } = await withOrganization(organizationId, async () => {
    const membro = await buscarCorretor(id, organizationId);
    const corretor = resolverCorretorPublico(membro);
    if (!membro || !corretor) return { corretor: null, imoveis: [] };

    // Mesmo critério público do resto do site: só AVAILABLE. Rascunho,
    // inativo, reservado, vendido e alugado não aparecem aqui pela mesma
    // razão que não aparecem na listagem.
    const imoveis = await prisma.property.findMany({
      where: {
        organizationId,
        status: "AVAILABLE",
        responsibleMemberId: membro.id,
      },
      select: {
        id: true,
        title: true,
        type: true,
        purpose: true,
        neighborhood: true,
        city: true,
        state: true,
        price: true,
        rentPrice: true,
        bedrooms: true,
        totalArea: true,
        bathrooms: true,
        parkingSpots: true,
        isLaunch: true,
        isFeatured: true,
        isOpportunity: true,
        media: { where: { type: "PHOTO" }, select: { url: true }, orderBy: [{ isCover: "desc" }, { order: "asc" }] },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_IMOVEIS_DO_CORRETOR,
    });

    return {
      corretor: { ...corretor, id: membro.id, contatos: contatosPublicosDoCorretor(membro) },
      imoveis,
    };
  });

  if (!corretor) notFound();

  // Número PESSOAL do corretor. Sem ele o botão não existe — esta página
  // afirma, com nome e rosto, que o visitante vai falar com esta pessoa;
  // cair no número da imobiliária seria uma mentira educada.
  const whatsappHref = linkWhatsApp(
    corretor.contatos.whatsapp,
    `Olá, ${corretor.nome}! Vi seu perfil no site e gostaria de mais informações.`
  );
  const telefoneHref = hrefTelefone(corretor.contatos.telefone);
  const emailHref = hrefEmail(corretor.contatos.email);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav aria-label="Você está aqui" className="mb-6 text-sm text-gray-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href={basePath || "/"} className="hover:underline">
              Início
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={`${basePath}/imoveis`} className="hover:underline">
              Imóveis
            </Link>
          </li>
          <li aria-hidden>/</li>
          {/* aria-current: para quem navega por leitor de tela, é o que
              diz que este item é a página atual, e não mais um link. */}
          <li aria-current="page" className="min-w-0 truncate text-gray-700">
            {corretor.nome}
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <span className="relative size-28 shrink-0 overflow-hidden rounded-full border bg-secondary sm:size-32">
          {corretor.foto ? (
            <Image
              src={corretor.foto}
              alt={`Foto de ${corretor.nome}`}
              fill
              sizes="(min-width: 640px) 128px, 112px"
              className="object-cover"
              priority
            />
          ) : (
            <span aria-hidden className="flex size-full items-center justify-center text-primary">
              <IconePessoa className="size-12" />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className={TITULO_DETALHE}>{corretor.nome}</h1>
          <p className="mt-1 text-base text-gray-600">Corretor(a) de imóveis</p>
          {corretor.creci && (
            <p className="mt-0.5 text-sm text-gray-500">{corretor.creci}</p>
          )}

          {corretor.bio && (
            <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed whitespace-pre-line text-gray-700">
              {corretor.bio}
            </p>
          )}

          {/* Sem rastreio de analytics em nenhum destes: o evento exige
              propertyId e aqui não há imóvel — ver analytics-eventos.ts.
              Os links são os de sempre, só não geram evento.

              Cada botão só existe se o profissional publicou aquele
              contato. Nenhum deles cai no contato institucional. */}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {whatsappHref && (
            <div>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Falar no WhatsApp com ${corretor.nome}`}
                className={buttonVariants({
                  size: "lg",
                  className:
                    "w-full bg-whatsapp-brand text-white hover:bg-whatsapp-brand-hover active:bg-whatsapp-brand-active sm:w-auto",
                })}
              >
                <IconeWhatsApp className="size-5" aria-hidden />
                Falar no WhatsApp
              </a>
            </div>
          )}

          {telefoneHref && (
            <a
              href={telefoneHref}
              aria-label={`Ligar para ${corretor.nome}`}
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "w-full sm:w-auto",
              })}
            >
              <IconeTelefone className="size-5" aria-hidden />
              {formatarTelefone(corretor.contatos.telefone!)}
            </a>
          )}

          {emailHref && (
            <a
              href={emailHref}
              aria-label={`Enviar e-mail para ${corretor.nome}`}
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "w-full sm:w-auto",
              })}
            >
              <IconeEmail className="size-5" aria-hidden />
              E-mail
            </a>
          )}
          </div>
        </div>
      </div>

      <section className="mt-12" aria-labelledby="imoveis-do-corretor">
        <h2 id="imoveis-do-corretor" className={`${TITULO_SECAO} mb-6`}>
          Imóveis deste corretor
        </h2>
        {imoveis.length > 0 ? (
          <SecaoImoveis
            titulo=""
            imoveis={imoveis.map(paraImovelCard)}
            verTudoHref={`${basePath}/imoveis`}
            verTudoRotulo="Ver todos os imóveis"
            basePath={basePath}
          />
        ) : (
          // Estado vazio honesto: o profissional existe e está publicado,
          // só não tem imóvel disponível agora. Nada de card fantasma.
          <p className="text-sm text-gray-500">
            Nenhum imóvel disponível no momento.{" "}
            <Link href={`${basePath}/imoveis`} className="text-link hover:underline">
              Ver todos os imóveis
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
