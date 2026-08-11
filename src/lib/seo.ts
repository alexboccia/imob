import type { Metadata } from "next";

// Metadata "básica" pras páginas públicas estáticas (não-imóvel): sem
// isso, uma página como /anuncie herdaria o openGraph/twitter genérico do
// root layout (nome do site + descrição da home) em vez do próprio
// título/descrição — o <title>/description da aba ficam certos mesmo sem
// isso, mas o preview ao compartilhar no WhatsApp/Twitter ficaria errado.
export function metadataPaginaPublica(opcoes: {
  title: string;
  description: string;
  path: string;
  // Opcional: nome da organização pra popular og:site_name — sem isso o
  // preview de compartilhamento (WhatsApp/Twitter) não mostra a marca,
  // já que openGraph não herda campo a campo do layout pai quando a
  // própria página define seu openGraph.
  siteName?: string;
}): Metadata {
  return {
    title: opcoes.title,
    description: opcoes.description,
    alternates: { canonical: opcoes.path },
    openGraph: {
      title: opcoes.title,
      description: opcoes.description,
      type: "website",
      url: opcoes.path,
      siteName: opcoes.siteName,
    },
    twitter: {
      card: "summary_large_image",
      title: opcoes.title,
      description: opcoes.description,
    },
  };
}
