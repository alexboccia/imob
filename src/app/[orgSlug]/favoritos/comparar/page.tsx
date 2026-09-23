import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { metadataPaginaPublica } from "@/lib/seo";
import { TITULO_PAGINA } from "@/lib/site-typography";
import { Comparador } from "@/components/favoritos/Comparador";

// Comparação de imóveis favoritos (Fase 59).
//
// Rota própria, e não um modal dentro de /favoritos, por três razões
// concretas: o botão voltar do navegador passa a significar "sair da
// comparação"; a experiência é de tela cheia (uma tabela larga dentro de
// um diálogo em 320px seria pior que a página); e a página de favoritos
// mantém sua própria posição de rolagem ao voltar.
//
// A SELEÇÃO NÃO VEM DA URL: ela mora no sessionStorage do navegador (ver
// comparador-selecao.ts). O servidor entrega só a moldura; a ilha de
// cliente lê os ids e resolve os imóveis em POST /api/imoveis/comparar,
// que revalida organização e ficha pública.
//
// Página pessoal: noindex (não é landing page), follow (os links para as
// fichas continuam valendo). Nenhum id passa pela metadata.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  return {
    ...metadataPaginaPublica({
      title: "Comparar imóveis",
      description: "Compare os imóveis que você salvou.",
      path: `${resolverBasePath(orgSlug)}/favoritos/comparar`,
      siteName: organization?.name,
    }),
    robots: { index: false, follow: true },
  };
}

export default async function CompararPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) notFound();
  const basePath = resolverBasePath(orgSlug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className={TITULO_PAGINA}>Comparar imóveis</h1>
      <div className="mt-6">
        <Comparador orgSlug={orgSlug} basePath={basePath} />
      </div>
    </div>
  );
}
