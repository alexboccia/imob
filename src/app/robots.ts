import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSiteUrl } from "@/lib/site-url";
import { resolverOrigemPublicacao } from "@/lib/platform/organization-domain";

// Site público inteiro é indexável (home, /imoveis, /imoveis/[id],
// /vendidos, /anuncie, /contato — inclusive prefixados por /{orgSlug}) —
// só a área autenticada (/app), o painel (/platform), as rotas de API
// (inclui /api/auth) e o proxy de assets internos ficam de fora. Essas
// regras nunca dependem de domínio (só path), então nunca precisaram
// mudar na correção AU. /_next/static e /_next/image NÃO entram no
// disallow de propósito: são os assets que o próprio Googlebot precisa
// buscar pra renderizar a página corretamente.
//
// Correção AU (auditoria pré-commit P.10): o campo `sitemap` agora
// aponta pro sitemap do MESMO host da requisição — sob um domínio
// customizado ACTIVE, robots.txt precisa apontar pro sitemap desse
// próprio domínio (que só lista essa organização, ver src/app/sitemap.ts),
// nunca pro sitemap global da plataforma. headers() torna este arquivo
// dinâmico de propósito (mesmo racional documentado em sitemap.ts).
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origem = await resolverOrigemPublicacao((await headers()).get("host"));
  const sitemapUrl = origem.tipo === "custom" ? `https://${origem.hostname}/sitemap.xml` : getSiteUrl("/sitemap.xml");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/platform/", "/api/"],
    },
    sitemap: sitemapUrl,
  };
}
