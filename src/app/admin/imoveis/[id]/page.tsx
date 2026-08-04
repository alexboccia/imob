import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImovelForm } from "@/components/admin/ImovelForm";
import { atualizarImovel } from "@/app/admin/imoveis/actions";
import { buscarOpcoesCaracteristicas } from "@/lib/caracteristicas";

export default async function EditarImovelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [imovel, { opcoesImovel, opcoesCondominio }] = await Promise.all([
    prisma.imovel.findUnique({
      where: { id },
      include: { midias: { orderBy: [{ ehCapa: "desc" }, { ordem: "asc" }] } },
    }),
    buscarOpcoesCaracteristicas(),
  ]);

  if (!imovel) notFound();

  const atualizarComId = atualizarImovel.bind(null, imovel.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Editar imóvel</h1>
      <ImovelForm
        action={atualizarComId}
        valoresIniciais={imovel}
        midiasIniciais={imovel.midias.map((m) => ({
          tipo: m.tipo,
          url: m.url,
          ehCapa: m.ehCapa,
        }))}
        opcoesCaracteristicasImovel={opcoesImovel}
        opcoesCaracteristicasCondominio={opcoesCondominio}
      />
    </div>
  );
}
