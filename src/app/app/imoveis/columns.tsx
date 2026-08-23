"use client";

import Link from "next/link";
import {
  FINALIDADE_LABEL,
  STATUS_IMOVEL_LABEL,
  formatarLocalizacaoImovel,
  formatarPreco,
  rotulosAtivos,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ImovelColunaOrdenacao } from "@/components/admin/imoveis/ImovelColunaOrdenacao";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";

export type ImovelRow = {
  id: string;
  codigo: number;
  codigoFormatado: string;
  titulo: string;
  lancamento: boolean;
  destaque: boolean;
  oportunidade: boolean;
  slideshow: boolean;
  tipo: string;
  finalidade: string;
  bairro: string | null;
  cidade: string;
  estado: string;
  preco: number | null;
  precoAluguel: number | null;
  status: string;
};

// Badges (Lançamento/Destaque/Oportunidade/Slideshow) — mesma fonte
// (rotulosAtivos + slideshow avulso) e mesmas cores já usadas antes do
// redesenho, só reorganizadas visualmente. `flex-wrap` aqui é o que
// permite os badges quebrarem linha sob o título em vez de forçar a
// célula/tabela a crescer horizontalmente — parte da correção estrutural
// do overflow em mobile (ver ImovelCardMobile.tsx e relatório final para
// a causa raiz completa, que é mais sobre nº de colunas em 375px do que
// sobre este wrap isoladamente).
export function BadgesImovel({ imovel }: { imovel: { lancamento: boolean; destaque: boolean; oportunidade: boolean; slideshow: boolean } }) {
  const rotulos = rotulosAtivos(imovel);
  if (rotulos.length === 0 && !imovel.slideshow) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {rotulos.map((rotulo) => (
        <Badge key={rotulo.chave} className={rotulo.className}>
          {rotulo.label}
        </Badge>
      ))}
      {imovel.slideshow && <Badge className="bg-purple-600 text-white">Slideshow</Badge>}
    </div>
  );
}

export const imovelColumns: DataTableColumn<ImovelRow>[] = [
  {
    id: "imovel",
    header: () => <ImovelColunaOrdenacao />,
    cell: ({ row }) => (
      <div className="min-w-0 space-y-1">
        {/* break-words: mesma correção de ImovelCardMobile.tsx — ver
            relatório final. Aqui a tabela também tem overflow-x-auto como
            rede de segurança, mas o título nunca precisa forçar a coluna
            inteira a crescer só por causa de um token sem espaços. */}
        <Link
          href={`/app/imoveis/${row.original.id}`}
          className="break-words font-medium hover:underline"
        >
          {row.original.titulo}
        </Link>
        <p className="text-xs text-muted-foreground">{row.original.codigoFormatado}</p>
        <BadgesImovel imovel={row.original} />
      </div>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
  },
  {
    accessorKey: "finalidade",
    header: "Finalidade",
    cell: ({ row }) =>
      FINALIDADE_LABEL[
        row.original.finalidade as keyof typeof FINALIDADE_LABEL
      ] ?? row.original.finalidade,
  },
  {
    id: "localizacao",
    accessorFn: (row) => formatarLocalizacaoImovel(row.bairro, row.cidade, row.estado),
    header: "Localização",
  },
  {
    id: "preco",
    accessorFn: (row) => row.preco ?? row.precoAluguel ?? null,
    header: "Preço",
    cell: ({ row }) => {
      const { preco, precoAluguel } = row.original;
      if (preco == null && precoAluguel == null) return "-";
      return (
        <>
          {preco != null && formatarPreco(preco)}
          {preco != null && precoAluguel != null && " · "}
          {precoAluguel != null && `${formatarPreco(precoAluguel)}/mês`}
        </>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="secondary">
        {STATUS_IMOVEL_LABEL[
          row.original.status as keyof typeof STATUS_IMOVEL_LABEL
        ] ?? row.original.status}
      </Badge>
    ),
  },
];
