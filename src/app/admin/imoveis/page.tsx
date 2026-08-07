import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarCodigoImovel } from "@/lib/format";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { imovelColumns, type ImovelRow } from "./columns";

export default async function AdminImoveisPage() {
  const organizationId = await requireOrganizationId();
  const [imoveis, configContato] = await withOrganization(organizationId, () =>
    Promise.all([
      prisma.property.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        include: { responsibleMember: { include: { user: { select: { name: true } } } } },
      }),
      buscarConfiguracaoContato(organizationId),
    ])
  );

  const linhas: ImovelRow[] = imoveis.map((imovel) => ({
    id: imovel.id,
    codigo: imovel.code,
    codigoFormatado: formatarCodigoImovel(
      imovel.code,
      configContato.codigoImovelPrefixo
    ),
    titulo: imovel.title,
    lancamento: imovel.isLaunch,
    destaque: imovel.isFeatured,
    oportunidade: imovel.isOpportunity,
    slideshow: imovel.hasSlideshow,
    tipo: imovel.type,
    finalidade: imovel.purpose,
    cidade: imovel.city,
    estado: imovel.state,
    preco: imovel.price != null ? Number(imovel.price) : null,
    precoAluguel: imovel.rentPrice != null ? Number(imovel.rentPrice) : null,
    status: imovel.status,
    corretor: imovel.responsibleMember?.user.name ?? "-",
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Imóveis</h1>
        <Button render={<Link href="/admin/imoveis/novo" />}>
          + Novo imóvel
        </Button>
      </div>

      <DataTable
        columns={imovelColumns}
        data={linhas}
        searchPlaceholder="Buscar por código, título, tipo, cidade..."
        emptyMessage="Nenhum imóvel cadastrado ainda."
      />
    </div>
  );
}
