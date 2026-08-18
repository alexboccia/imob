import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { getSiteUrl, resolverBasePath } from "@/lib/site-url";
import { resolverOrigemPublicacao } from "@/lib/platform/organization-domain";

// sitemap.js é um "special Route Handler" — cacheado por padrão A MENOS
// QUE use uma Request-time API (ver doc oficial de sitemap.js,
// node_modules/next/dist/docs/.../sitemap.md). headers() abaixo é
// exatamente isso: torna esta rota dinâmica de propósito, pra poder
// responder hostnames diferentes com sitemaps diferentes (correção AU).
export const revalidate = 3600;

const LIMITE_IMOVEIS_NO_SITEMAP = 5000;

// Só imóveis "disponíveis" entram no sitemap — mesma regra de status já
// aplicada pela listagem pública (src/app/[orgSlug]/imoveis/page.tsx).
// Rascunho (DRAFT) e inativo (INACTIVE) nem são acessíveis publicamente
// (a página de detalhe devolve 404); vendido (SOLD) e alugado (RENTED)
// são acessíveis (aparecem em /vendidos) mas deliberadamente ficam fora
// do sitemap — não têm valor de busca e podem confundir quem chega pelo
// Google atrás de um imóvel que não está mais disponível. RESERVED
// também fica fora: a própria busca/listagem pública não mostra imóveis
// reservados hoje, então não faz sentido um crawler achar uma URL que
// não aparece em nenhuma navegação normal do site.
const STATUS_INCLUIDO_NO_SITEMAP = "AVAILABLE" as const;

// Páginas públicas estáticas (não-imóvel) de UMA organização. `construirUrl`
// é injetado (não hardcoda getSiteUrl) — correção AU: sob domínio
// customizado ACTIVE, as URLs são absolutas sob esse domínio, nunca sob
// o domínio global.
function paginasEstaticas(basePath: string, construirUrl: (path: string) => string): MetadataRoute.Sitemap {
  const agora = new Date();
  return [
    { url: construirUrl(basePath || "/"), lastModified: agora, changeFrequency: "daily", priority: 1 },
    { url: construirUrl(`${basePath}/imoveis`), lastModified: agora, changeFrequency: "daily", priority: 0.9 },
    { url: construirUrl(`${basePath}/vendidos`), lastModified: agora, changeFrequency: "weekly", priority: 0.3 },
    { url: construirUrl(`${basePath}/anuncie`), lastModified: agora, changeFrequency: "monthly", priority: 0.5 },
    { url: construirUrl(`${basePath}/contato`), lastModified: agora, changeFrequency: "monthly", priority: 0.5 },
  ];
}

// Entradas de imóveis de UMA organização — extraído pra ser reaproveitado
// tanto pelo sitemap global (várias organizations) quanto pelo sitemap de
// um domínio customizado (uma organization só), sem duplicar a lógica de
// busca/filtro/formatação.
async function entradasDaOrganizacao(
  organization: { id: string; slug: string },
  basePath: string,
  construirUrl: (path: string) => string
): Promise<MetadataRoute.Sitemap> {
  const imoveis = await withOrganization(organization.id, () =>
    prisma.property.findMany({
      where: { organizationId: organization.id, status: STATUS_INCLUIDO_NO_SITEMAP },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: LIMITE_IMOVEIS_NO_SITEMAP,
    })
  );

  const entradasImoveis: MetadataRoute.Sitemap = imoveis.map((imovel) => ({
    url: construirUrl(`${basePath}/imoveis/${imovel.id}`),
    lastModified: imovel.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...paginasEstaticas(basePath, construirUrl), ...entradasImoveis];
}

// Correção AU (auditoria pré-commit da Fase P.10): o sitemap agora
// depende do Host da requisição —
//
// - Host reservado/canônico da plataforma ("global"): comportamento
//   ORIGINAL preservado — todas as organizations ativas, cada uma sob
//   getSiteUrl(basePath) — MAS agora excluindo qualquer organização que
//   já tenha um domínio customizado ACTIVE (ela publica o próprio
//   sitemap sob o próprio domínio; listá-la aqui também criaria conteúdo
//   duplicado indexável simultaneamente sob dois hosts, ver P.10.11/AU3).
// - Host de domínio customizado ACTIVE ("custom"): sitemap de UMA ÚNICA
//   organização (a dona do domínio), todas as URLs absolutas sob esse
//   mesmo domínio — nunca inclui nenhuma outra organização.
// - Host não reconhecido ("desconhecido"): sitemap vazio — nunca expõe
//   dado de nenhuma organização sob um host não verificado (ver P.10.16
//   risco AU9/AU8), nem cai silenciosamente no sitemap global.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origem = await resolverOrigemPublicacao((await headers()).get("host"));

  if (origem.tipo === "desconhecido") {
    return [];
  }

  if (origem.tipo === "custom") {
    const organization = await prisma.organization.findUnique({
      where: { id: origem.organizationId, active: true },
      select: { id: true, slug: true },
    });
    if (!organization) return [];

    const construirUrl = (path: string) => `https://${origem.hostname}${path}`;
    return entradasDaOrganizacao(organization, "", construirUrl);
  }

  const organizacoesAtivas = await prisma.organization.findMany({
    where: {
      active: true,
      domains: { none: { type: "CUSTOM", status: "ACTIVE" } },
    },
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });

  const entradasPorOrganizacao = await Promise.all(
    organizacoesAtivas.map((organization) =>
      entradasDaOrganizacao(organization, resolverBasePath(organization.slug), getSiteUrl)
    )
  );

  return entradasPorOrganizacao.flat();
}
