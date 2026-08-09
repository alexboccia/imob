import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { construirHeadersSeguranca, R2_IMAGE_HOST } from "@/lib/security-headers";
import { PUBLIC_ORG_SLUG } from "@/lib/site-url";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: R2_IMAGE_HOST ? [R2_IMAGE_HOST] : [],
  },
  // Não anunciar "X-Powered-By: Next.js" pra quem estiver escaneando a
  // aplicação em busca de stack pra explorar vulnerabilidade conhecida da
  // versão.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: construirHeadersSeguranca() }];
  },
  // Compatibilidade com as URLs atuais em produção, agora que o site
  // público vive em /{orgSlug}/... — rewrite (não redirect), a URL na
  // barra do navegador não muda, zero impacto pra quem já tem essas URLs
  // indexadas/salvas. Cada [orgSlug]/page.tsx aponta o `canonical` de
  // volta pra cá quando orgSlug === PUBLIC_ORG_SLUG (resolverBasePath),
  // então não há conteúdo duplicado do ponto de vista do Google mesmo com
  // as duas formas de URL tecnicamente respondendo. Ver plano, decisões
  // #3 e #4.
  async rewrites() {
    return [
      { source: "/", destination: `/${PUBLIC_ORG_SLUG}` },
      { source: "/imoveis", destination: `/${PUBLIC_ORG_SLUG}/imoveis` },
      { source: "/imoveis/:id", destination: `/${PUBLIC_ORG_SLUG}/imoveis/:id` },
      { source: "/vendidos", destination: `/${PUBLIC_ORG_SLUG}/vendidos` },
      { source: "/contato", destination: `/${PUBLIC_ORG_SLUG}/contato` },
      { source: "/anuncie", destination: `/${PUBLIC_ORG_SLUG}/anuncie` },
    ];
  },
};

// Sem SENTRY_AUTH_TOKEN (dev local, CI da Fase 6 — nenhum dos dois tem
// esse secret), o plugin só avisa no log de build e pula upload de source
// map/criação de release — não falha o build. Ver README, seção
// Observabilidade, sobre onde configurar isso de verdade (build da
// DigitalOcean).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Cada evento aponta pro commit exato que rodava quando ele aconteceu —
  // o mesmo valor usado em runtime (Sentry.init({release: ...}) nos três
  // arquivos de instrumentação), pra o mapa de source map bater com o
  // release do evento.
  release: {
    name: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  },

  // Não expõe nada a mais publicamente: o plugin gera source map "hidden"
  // (nunca fica linkado no bundle servido), faz upload pra Sentry e apaga
  // do build de saída — deleteSourcemapsAfterUpload é o default, mantido
  // aqui só documentado.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Nenhuma telemetria própria da Sentry sobre o build, nenhum log verboso
  // quando os três campos acima já vêm vazios (dev local, CI).
  //
  // `disableLogger`/`automaticVercelMonitors` deliberadamente OMITIDOS:
  // o projeto builda com Turbopack (não webpack) e o próprio plugin avisa
  // que nenhum dos dois tem efeito nesse caso — mantê-los só gerava um
  // warning de depreciação sem fazer nada.
  telemetry: false,
  silent: !process.env.CI,
});
