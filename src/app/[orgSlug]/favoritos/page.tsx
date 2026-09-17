import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { metadataPaginaPublica } from "@/lib/seo";
import { TITULO_PAGINA } from "@/lib/site-typography";
import { ListaFavoritos } from "@/components/favoritos/ListaFavoritos";

// Central de favoritos (Fase 49). A lista é do NAVEGADOR (localStorage,
// Fase 47): o servidor entrega só a moldura, e a ilha de cliente lê os
// ids e resolve os imóveis em POST /api/imoveis/favoritos. Sem login.
//
// Página pessoal: noindex (não é landing page) e follow (os links para
// as fichas continuam valendo). Nenhum id favorito passa pela metadata.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  return {
    ...metadataPaginaPublica({
      title: "Favoritos",
      description: "Seus imóveis salvos em um só lugar.",
      path: `${resolverBasePath(orgSlug)}/favoritos`,
      siteName: organization?.name,
    }),
    robots: { index: false, follow: true },
  };
}

export default async function FavoritosPage({
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
      <h1 className={TITULO_PAGINA}>Favoritos</h1>
      <p className="mt-2 text-gray-500">Seus imóveis salvos em um só lugar.</p>
      <div className="mt-6">
        <ListaFavoritos orgSlug={orgSlug} basePath={basePath} />
      </div>
    </div>
  );
}
