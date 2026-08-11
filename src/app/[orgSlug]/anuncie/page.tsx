import type { Metadata } from "next";
import { AnuncieForm } from "@/components/AnuncieForm";
import { metadataPaginaPublica } from "@/lib/seo";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  const basePath = resolverBasePath(orgSlug);
  return metadataPaginaPublica({
    title: "Anuncie seu imóvel",
    description:
      "Conte um pouco sobre o seu imóvel e um corretor entrará em contato para avaliar e preparar o anúncio.",
    path: `${basePath}/anuncie`,
    siteName: organization?.name,
  });
}

export default async function AnunciePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Anuncie seu imóvel</h1>
      <p className="text-gray-500 mb-8">
        Conte um pouco sobre o seu imóvel e um corretor entrará em contato
        para avaliar e preparar o anúncio.
      </p>
      <AnuncieForm orgSlug={orgSlug} />
    </div>
  );
}
