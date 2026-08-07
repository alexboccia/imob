import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getPublicOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Sem isso, o arquivo é gerado uma vez no build e fica estático — imóvel
// novo, vendido ou atualizado só apareceria/sumiria no sitemap no próximo
// deploy. Não precisa ser tempo real (crawler não visita a cada minuto):
// 1h já evita o sitemap ficar visivelmente desatualizado sem regenerar a
// cada request.
export const revalidate = 3600;

// Bem abaixo do limite de 50.000 URLs por arquivo do protocolo de sitemap
// — não é pra evitar estourar esse limite agora (o catálogo atual está
// longe disso), é o teto que, se ultrapassado, é hora de paginar de
// verdade (ver comentário abaixo).
const LIMITE_IMOVEIS_NO_SITEMAP = 5000;

// Só imóveis "disponíveis" entram no sitemap — mesma regra de status já
// aplicada pela listagem pública (src/app/(public)/imoveis/page.tsx).
// Rascunho (DRAFT) e inativo (INACTIVE) nem são acessíveis publicamente
// (a página de detalhe devolve 404); vendido (SOLD) e alugado (RENTED)
// são acessíveis (aparecem em /vendidos) mas deliberadamente ficam fora
// do sitemap — não têm valor de busca e podem confundir quem chega pelo
// Google atrás de um imóvel que não está mais disponível. RESERVED
// também fica fora: a própria busca/listagem pública não mostra imóveis
// reservados hoje, então não faz sentido um crawler achar uma URL que
// não aparece em nenhuma navegação normal do site.
const STATUS_INCLUIDO_NO_SITEMAP = "AVAILABLE" as const;

// Páginas públicas estáticas (não-imóvel).
function paginasEstaticas(): MetadataRoute.Sitemap {
  const agora = new Date();
  return [
    { url: SITE_URL, lastModified: agora, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/imoveis`, lastModified: agora, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/vendidos`, lastModified: agora, changeFrequency: "weekly", priority: 0.3 },
    { url: `${SITE_URL}/anuncie`, lastModified: agora, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contato`, lastModified: agora, changeFrequency: "monthly", priority: 0.5 },
  ];
}

// TODO quando o roteamento público por organização (/{orgSlug}/...) for
// implementado: este arquivo passa a precisar gerar um conjunto de
// sitemaps por organização, não um único global — hoje existe uma única
// organização pública (getPublicOrganizationId, resolvida por
// PUBLIC_ORG_SLUG), então "não misturar tenants" já é garantido por
// definição: só existe UM tenant no sitemap público hoje, e a consulta
// abaixo é sempre explicitamente filtrada por organizationId.
//
// Paginação: deliberadamente NÃO uso generateSitemaps() aqui ainda — API
// do Next pra dividir em vários arquivos (app/sitemap.ts vira
// /sitemap/0.xml, /sitemap/1.xml...), MAS ela muda a URL de
// `/sitemap.xml` (o que robots.txt aponta, e o que o Google espera por
// convenção) para `/sitemap/0.xml` mesmo quando só existe uma "página"
// — confirmado rodando localmente (curl -I http://localhost:3100/sitemap.xml
// devolvia 404 com generateSitemaps() presente). Ativar isso agora
// quebraria a URL convencional sem nenhum ganho real, já que o catálogo
// atual está muito abaixo do limite. Quando o volume justificar: trocar
// `export default async function sitemap()` abaixo por um par
// `generateSitemaps()` + `sitemap({ id })` que fatia `buscarImoveis` por
// `skip`/`take` de LIMITE_IMOVEIS_NO_SITEMAP em LIMITE_IMOVEIS_NO_SITEMAP
// — a query já está isolada nesse formato de propósito, é só mover pra
// dentro dos dois exports.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const organizationId = await getPublicOrganizationId();

  const imoveis = await withOrganization(organizationId, () =>
    prisma.property.findMany({
      where: { organizationId, status: STATUS_INCLUIDO_NO_SITEMAP },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: LIMITE_IMOVEIS_NO_SITEMAP,
    })
  );

  const entradasImoveis: MetadataRoute.Sitemap = imoveis.map((imovel) => ({
    url: `${SITE_URL}/imoveis/${imovel.id}`,
    lastModified: imovel.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...paginasEstaticas(), ...entradasImoveis];
}
