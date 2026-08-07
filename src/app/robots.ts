import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Site público inteiro é indexável (home, /imoveis, /imoveis/[id],
// /vendidos, /anuncie, /contato) — só a área autenticada (/app), as rotas
// de API (inclui /api/auth) e o proxy de assets internos ficam de fora.
// /_next/static e /_next/image NÃO entram no disallow de propósito: são
// os assets que o próprio Googlebot precisa buscar pra renderizar a
// página corretamente.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
