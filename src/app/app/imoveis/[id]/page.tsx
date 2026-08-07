import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImovelForm } from "@/components/admin/ImovelForm";
import { atualizarImovel } from "@/app/app/imoveis/actions";
import { buscarOpcoesCaracteristicas } from "@/lib/caracteristicas";
import { buscarOpcoesTiposImovel } from "@/lib/tipos-imovel";
import { ToastSalvo } from "@/components/admin/ToastSalvo";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

const MEDIA_TYPE_PARA_TIPO_MIDIA = {
  PHOTO: "FOTO",
  VIDEO: "VIDEO",
  FLOOR_PLAN: "PLANTA",
} as const;

export default async function EditarImovelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizationId = await requireOrganizationId();

  const [imovel, { opcoesImovel, opcoesCondominio }, { opcoesResidencial, opcoesComercial }] =
    await withOrganization(organizationId, () =>
      Promise.all([
        prisma.property.findUnique({
          where: { id, organizationId },
          include: { media: { orderBy: [{ isCover: "desc" }, { order: "asc" }] } },
        }),
        buscarOpcoesCaracteristicas(organizationId),
        buscarOpcoesTiposImovel(organizationId),
      ])
    );

  if (!imovel) notFound();

  const atualizarComId = atualizarImovel.bind(null, imovel.id);

  return (
    <div>
      <Suspense fallback={null}>
        <ToastSalvo />
      </Suspense>
      <h1 className="text-2xl font-semibold mb-6">Editar imóvel</h1>
      <ImovelForm
        action={atualizarComId}
        propertyId={imovel.id}
        valoresIniciais={{
          titulo: imovel.title,
          descricao: imovel.description,
          tipo: imovel.type,
          finalidade: imovel.purpose,
          status: imovel.status,
          cep: imovel.zipCode,
          logradouro: imovel.street,
          numero: imovel.number,
          complemento: imovel.complement,
          bairro: imovel.neighborhood,
          cidade: imovel.city,
          estado: imovel.state,
          latitude: imovel.latitude,
          longitude: imovel.longitude,
          preco: imovel.price,
          precoAluguel: imovel.rentPrice,
          precoCondominio: imovel.condoFee,
          precoIptu: imovel.propertyTax,
          areaTotal: imovel.totalArea,
          areaPrivativa: imovel.privateArea,
          quartos: imovel.bedrooms,
          suites: imovel.suites,
          banheiros: imovel.bathrooms,
          vagasGaragem: imovel.parkingSpots,
          caracteristicasImovel: imovel.propertyFeatures,
          caracteristicasCondominio: imovel.condoFeatures,
          lancamento: imovel.isLaunch,
          destaque: imovel.isFeatured,
          oportunidade: imovel.isOpportunity,
          slideshow: imovel.hasSlideshow,
          estagioObra: imovel.constructionStage,
          previsaoEntrega: imovel.deliveryForecast,
          construtora: imovel.developer,
        }}
        midiasIniciais={imovel.media.map((m) => ({
          tipo: MEDIA_TYPE_PARA_TIPO_MIDIA[m.type],
          url: m.url,
          ehCapa: m.isCover,
        }))}
        opcoesCaracteristicasImovel={opcoesImovel}
        opcoesCaracteristicasCondominio={opcoesCondominio}
        opcoesTiposResidencial={opcoesResidencial}
        opcoesTiposComercial={opcoesComercial}
      />
    </div>
  );
}
