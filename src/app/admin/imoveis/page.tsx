import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  FINALIDADE_LABEL,
  STATUS_IMOVEL_LABEL,
  TIPO_IMOVEL_LABEL,
  formatarCodigoImovel,
  formatarPreco,
  rotulosAtivos,
} from "@/lib/format";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";

export default async function AdminImoveisPage() {
  const [imoveis, configContato] = await Promise.all([
    prisma.imovel.findMany({
      orderBy: { criadoEm: "desc" },
      include: { corretorResponsavel: { select: { nome: true } } },
    }),
    buscarConfiguracaoContato(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Imóveis</h1>
        <Link
          href="/admin/imoveis/novo"
          className="bg-black text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-800 active:bg-gray-900 transition-colors"
        >
          + Novo imóvel
        </Link>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Finalidade</th>
              <th className="px-4 py-2">Cidade</th>
              <th className="px-4 py-2">Preço</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Corretor</th>
            </tr>
          </thead>
          <tbody>
            {imoveis.map((imovel) => (
              <tr key={imovel.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-500">
                  {formatarCodigoImovel(
                    imovel.codigo,
                    configContato.codigoImovelPrefixo
                  )}
                </td>
                <td className="px-4 py-2">
                  <Link
                    href={`/admin/imoveis/${imovel.id}`}
                    className="font-medium hover:underline"
                  >
                    {imovel.titulo}
                  </Link>
                  {rotulosAtivos(imovel).map((rotulo) => (
                    <span
                      key={rotulo.chave}
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${rotulo.className}`}
                    >
                      {rotulo.label}
                    </span>
                  ))}
                  {imovel.slideshow && (
                    <span className="ml-2 rounded-full bg-purple-600 text-white px-2 py-0.5 text-xs">
                      Slideshow
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {TIPO_IMOVEL_LABEL[imovel.tipo] ?? imovel.tipo}
                </td>
                <td className="px-4 py-2">
                  {FINALIDADE_LABEL[imovel.finalidade] ?? imovel.finalidade}
                </td>
                <td className="px-4 py-2">
                  {imovel.cidade} - {imovel.estado}
                </td>
                <td className="px-4 py-2">
                  {imovel.preco != null && formatarPreco(imovel.preco)}
                  {imovel.preco != null && imovel.precoAluguel != null && " · "}
                  {imovel.precoAluguel != null &&
                    `${formatarPreco(imovel.precoAluguel)}/mês`}
                  {imovel.preco == null && imovel.precoAluguel == null && "-"}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                    {STATUS_IMOVEL_LABEL[imovel.status] ?? imovel.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {imovel.corretorResponsavel?.nome ?? "-"}
                </td>
              </tr>
            ))}
            {imoveis.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Nenhum imóvel cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
