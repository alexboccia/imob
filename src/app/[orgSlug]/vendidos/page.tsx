import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImovelCard } from "@/components/ImovelCard";
import { paraImovelCard } from "@/lib/imovel-card";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { withOrganization } from "@/lib/tenant-context";
import { metadataPaginaPublica } from "@/lib/seo";
import { TITULO_PAGINA } from "@/lib/site-typography";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  const basePath = resolverBasePath(orgSlug);
  return metadataPaginaPublica({
    title: "Vendidos e Alugados",
    description: "Confira alguns dos negócios que já concretizamos.",
    path: `${basePath}/vendidos`,
    siteName: organization?.name,
  });
}

export default async function VendidosAlugadosPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) notFound();
  const organizationId = organization.id;
  const basePath = resolverBasePath(orgSlug);
  const imoveis = await withOrganization(organizationId, () =>
    prisma.property.findMany({
      where: { organizationId, status: { in: ["SOLD", "RENTED"] } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: {
        media: {
          where: { type: "PHOTO" },
          orderBy: [{ isCover: "desc" }, { order: "asc" }],
          take: 5,
        },
      },
    })
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className={`${TITULO_PAGINA} mb-2`}>Vendidos e Alugados</h1>
      <p className="text-gray-500 mb-8">
        Alguns dos negócios que já concretizamos.
      </p>

      {imoveis.length === 0 ? (
        <p className="text-gray-500">Nenhum negócio concluído ainda.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {imoveis.map((imovel) => (
            <ImovelCard
              key={imovel.id}
              imovel={paraImovelCard(imovel)}
              basePath={basePath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
