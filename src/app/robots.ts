import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

// Site público inteiro é indexável (home, /imoveis, /imoveis/[id],
// /vendidos, /anuncie, /contato — inclusive prefixados por /{orgSlug}) —
// só a área autenticada (/app), o painel (/platform), as rotas de API
// (inclui /api/auth) e o proxy de assets internos ficam de fora.
// /_next/static e /_next/image NÃO entram no disallow de propósito: são
// os assets que o próprio Googlebot precisa buscar pra renderizar a
// página corretamente.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/platform/", "/api/"],
    },
    sitemap: getSiteUrl("/sitemap.xml"),
  };
}
