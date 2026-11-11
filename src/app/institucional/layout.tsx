import type { Metadata } from "next";
import { headers } from "next/headers";
import { hostnameInstitucional, normalizarHostname } from "@/lib/platform/hostname";

// =======================================================================
// Site institucional do SaaS — home comercial do produto Syntaks Imóveis
// =======================================================================
// Substitui a página oculta de Fase 116 (`sistema-imobiliario/`, removida
// nesta fase): aquela era deliberadamente não divulgada (noindex, sem
// link em lugar nenhum). Esta é o site real, pensado para ser indexado —
// mas SÓ quando acessada pelo host institucional de verdade
// (NEXT_PUBLIC_INSTITUTIONAL_URL, ver proxy.ts). Esta página continua
// tecnicamente alcançável em /institucional sob qualquer outro host (o
// Next não impede isso — é um diretório normal de app/), então o
// `robots` abaixo é host-aware: index só sob o host institucional,
// noindex em qualquer outro acesso (ex: demo.syntaks.com.br/institucional
// direto), pra nunca indexar conteúdo institucional duplicado sob o
// domínio de uma imobiliária cliente.
export async function generateMetadata(): Promise<Metadata> {
  const hostBruto = (await headers()).get("host");
  const host = hostBruto ? normalizarHostname(hostBruto) : null;
  const indexavel = host ? hostnameInstitucional(host) : false;

  const urlInstitucional = process.env.NEXT_PUBLIC_INSTITUTIONAL_URL;
  const titulo = "Syntaks Imóveis — Software de gestão imobiliária";
  const descricao =
    "CRM que organiza imóveis, clientes, negociações, agenda e comissões da sua imobiliária em um só lugar, com site próprio e gerador automático de divulgação.";

  return {
    title: { absolute: titulo },
    description: descricao,
    ...(urlInstitucional ? { metadataBase: new URL(urlInstitucional) } : {}),
    robots: indexavel ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Syntaks",
      title: titulo,
      description: descricao,
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descricao,
    },
  };
}

// dynamic = "force-dynamic": generateMetadata acima depende de headers()
// (host da requisição) — sem isso o Next poderia prerenderizar esta
// página no build e congelar o robots/metadataBase do momento do build,
// mesmo racional já documentado na página anterior (Fase 116).
export const dynamic = "force-dynamic";

// Paleta real extraída do logotipo oficial (public/brand/syntaks-logo.png)
// — azul #2D5BAA e cinza #6D6E71 — combinada com o azul-marinho e o fundo
// suave já validados na proposta visual (Etapa B). Escopada a este
// subtree via CSS custom properties, no mesmo espírito do tema por
// organização em [orgSlug]/layout.tsx: nunca vaza pra fora desta página,
// nunca é afetada pelo tema de nenhuma organização.
//
// --primary/--primary-foreground também são sobrescritas aqui (mesmos
// nomes que o shadcn/Button já consome) — assim <Button> e
// buttonVariants() padrão já saem na cor da marca, sem precisar de
// style inline em cada CTA. --primary-hover/--primary-light (globals.css)
// são derivadas via color-mix(…, var(--primary), …) e resolvem o
// --primary em vigor NESTE escopo automaticamente, sem precisar
// redeclará-las.
export default function InstitucionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          "--syntaks-blue": "#2D5BAA",
          "--syntaks-blue-dark": "#244A8C",
          "--syntaks-navy": "#13233E",
          "--syntaks-gray": "#6D6E71",
          "--syntaks-soft": "#F5F8FD",
          "--primary": "#2D5BAA",
          "--primary-foreground": "#FFFFFF",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
