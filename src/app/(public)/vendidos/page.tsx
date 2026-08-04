import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ImovelCard } from "@/components/ImovelCard";
import { paraImovelCard } from "@/lib/imovel-card";

export const metadata: Metadata = {
  title: "Vendidos e Alugados",
  description: "Confira alguns dos negócios que já concretizamos.",
};

export default async function VendidosAlugadosPage() {
  const imoveis = await prisma.imovel.findMany({
    where: { status: { in: ["VENDIDO", "ALUGADO"] } },
    orderBy: { atualizadoEm: "desc" },
    take: 30,
    include: {
      midias: {
        where: { tipo: "FOTO" },
        orderBy: [{ ehCapa: "desc" }, { ordem: "asc" }],
        take: 5,
      },
    },
  });

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
