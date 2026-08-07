import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ImovelCard } from "@/components/ImovelCard";
import { paraImovelCard } from "@/lib/imovel-card";
import { getPublicOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { metadataPaginaPublica } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = metadataPaginaPublica({
  title: "Vendidos e Alugados",
  description: "Confira alguns dos negócios que já concretizamos.",
  path: "/vendidos",
});

export default async function VendidosAlugadosPage() {
  const organizationId = await getPublicOrganizationId();
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
      <h1 className="text-2xl font-semibold mb-2">Vendidos e Alugados</h1>
      <p className="text-gray-500 mb-8">
        Alguns dos negócios que já concretizamos.
      </p>

      {imoveis.length === 0 ? (
        <p className="text-gray-500">Nenhum negócio concluído ainda.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {imoveis.map((imovel) => (
            <ImovelCard key={imovel.id} imovel={paraImovelCard(imovel)} />
          ))}
        </div>
      )}
    </div>
  );
}
