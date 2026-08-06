import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarCodigoImovel } from "@/lib/format";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { imovelColumns, type ImovelRow } from "./columns";

export default async function AdminImoveisPage() {
  const [imoveis, configContato] = await Promise.all([
    prisma.imovel.findMany({
      orderBy: { criadoEm: "desc" },
      include: { corretorResponsavel: { select: { nome: true } } },
    }),
    buscarConfiguracaoContato(),
  ]);

  const linhas: ImovelRow[] = imoveis.map((imovel) => ({
    id: imovel.id,
    codigo: imovel.codigo,
    codigoFormatado: formatarCodigoImovel(
      imovel.codigo,
      configContato.codigoImovelPrefixo
    ),
    titulo: imovel.titulo,
    lancamento: imovel.lancamento,
    destaque: imovel.destaque,
    oportunidade: imovel.oportunidade,
    slideshow: imovel.slideshow,
    tipo: imovel.tipo,
    finalidade: imovel.finalidade,
    cidade: imovel.cidade,
    estado: imovel.estado,
    preco: imovel.preco != null ? Number(imovel.preco) : null,
    precoAluguel: imovel.precoAluguel != null ? Number(imovel.precoAluguel) : null,
    status: imovel.status,
    corretor: imovel.corretorResponsavel?.nome ?? "-",
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
