"use client";

import Link from "next/link";
import {
  FINALIDADE_LABEL,
  STATUS_IMOVEL_LABEL,
  formatarLocalizacaoImovel,
  formatarPreco,
  rotulosAtivos,
} from "@/lib/format";
import { MapPin } from "lucide-react";
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
// redesenho, só reorganizadas visualmente. `flex-wrap` no container
// permite os badges quebrarem linha entre si sob o título, em vez de
// forçar a célula/tabela a crescer horizontalmente.
//
// min-w-0 whitespace-normal [overflow-wrap:anywhere] h-auto min-h-5 em
// CADA badge — achado real da investigação do overflow de 360px no
// runner Linux da CI.
//
// Causa raiz real (confirmada por medição de container, não só por
// screenshot): a sidebar fixa (`w-56` = 224px, layout.tsx, pré-existente
// e fora do escopo deste redesign) nunca colapsa em mobile — em 360px de
// viewport, a área de conteúdo real (`main`) fica com só ~136px, e o
// card (`p-3`) com ~88px úteis. O badge "Oportunidade" (rótulo mais
// longo, ~95px numa linha só) genuinamente NÃO cabe nessa largura real —
// não é uma diferença de fonte entre macOS/Linux, é geometria: o card
// inteiro já é estreito o bastante pra que o PRÓPRIO TÍTULO do imóvel
// quebre em várias linhas (visível em qualquer screenshot desta tela em
// 360px). O bug real do badge nunca foi "é um pouco estreito demais" —
// foi que ele não tinha NENHUM mecanismo de quebra (`shrink-0` +
// `whitespace-nowrap` + `overflow-hidden`, todos herdados da base de
// Badge), então em vez de quebrar como o título já faz, ele vazava por
// cima do limite do card e ia parar perto da borda do documento.
//
// Duas iterações de auto-revisão antes de finalizar, ambas só percebidas
// com screenshot real (geometria sozinha mascarou os dois problemas):
// 1) só `[overflow-wrap:anywhere]` não bastava: `white-space: nowrap`
//    suprime todo ponto de quebra, então o texto não tinha como quebrar —
//    só estourava a caixa e era CORTADO pelo `overflow-hidden` da base
//    (confirmado visualmente: "Lançamento"/"Oportunidade" apareciam sem a
//    primeira letra). Corrigido com `whitespace-normal` + `h-auto min-h-5`
//    (permite altura crescer pra 2 linhas em vez de cortar verticalmente
//    a altura fixa de 1 linha).
// 2) `max-w-full` funcionava, mas `min-w-0` é o mecanismo mais robusto e
//    já usado no resto do projeto (mesmo padrão do `break-words` no
//    título logo abaixo) — trocado por consistência, comportamento final
//    idêntico.
//
// Resultado real: os 4 badges quebram em 2 linhas em 360px quando o
// rótulo é mais longo (mesmo comportamento que o título do imóvel já
// tinha) — legível, sem corte, documento nunca estoura. Em 375/768/1440
// (card com mais espaço) continuam numa linha só, sem nenhuma mudança
// visual.
export function BadgesImovel({ imovel }: { imovel: { lancamento: boolean; destaque: boolean; oportunidade: boolean; slideshow: boolean } }) {
  const rotulos = rotulosAtivos(imovel);
  if (rotulos.length === 0 && !imovel.slideshow) return null;
  const classeProtecaoLargura = "h-auto min-h-5 min-w-0 whitespace-normal [overflow-wrap:anywhere]";
  return (
    <div className="flex flex-wrap gap-1">
      {rotulos.map((rotulo) => (
        <Badge key={rotulo.chave} className={`${classeProtecaoLargura} ${rotulo.className}`}>
          {rotulo.label}
        </Badge>
      ))}
      {imovel.slideshow && (
        <Badge className={`${classeProtecaoLargura} bg-purple-600 text-white`}>Slideshow</Badge>
      )}
    </div>
  );
}

// Tratamento visual dos SEIS status reais do produto (STATUS_IMOVEL_LABEL:
// DRAFT, AVAILABLE, RESERVED, SOLD, RENTED, INACTIVE) — todos verificados
// antes de decidir, não só o "Disponível" do print.
//
// Deliberadamente CONTIDO: nada de verde saturado só porque um imóvel está
// disponível. Disponível é o estado NORMAL do portfólio; se ele gritasse,
// a coluna inteira gritaria. A cor aqui é um apoio discreto — o rótulo em
// texto continua sendo o que comunica o estado, e cada badge o carrega.
function classeStatus(status: string): string {
  switch (status) {
    // O estado saudável e mais comum: um verde de baixa saturação.
    case "AVAILABLE":
      return "border-success-muted-border bg-success-muted text-success-muted-foreground";
    // Compromissado, ainda não concluído — atenção, não erro.
    case "RESERVED":
      return "border-orange-200 bg-orange-50 text-orange-800";
    // Negócios concluídos: neutros, sem competir com o que está ativo.
    case "SOLD":
    case "RENTED":
      return "border-border bg-muted text-muted-foreground";
    // Fora do ar (rascunho/inativo): o mais apagado da escala.
    case "DRAFT":
    case "INACTIVE":
    default:
      return "border-dashed border-border bg-transparent text-muted-foreground";
  }
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
    // accessorFn PRESERVADO: é o que alimenta a ordenação por cidade
    // (SORT_MAP) e o valor bruto da célula. O `cell` abaixo só muda a
    // apresentação — mesmo texto, com um marcador de lugar para deixar de
    // ser mais uma linha cinza idêntica às vizinhas.
    accessorFn: (row) => formatarLocalizacaoImovel(row.bairro, row.cidade, row.estado),
    header: "Localização",
    cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <MapPin aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 break-words">
          {formatarLocalizacaoImovel(row.original.bairro, row.original.cidade, row.original.estado)}
        </span>
      </span>
    ),
  },
  {
    id: "preco",
    accessorFn: (row) => row.preco ?? row.precoAluguel ?? null,
    header: "Preço",
    cell: ({ row }) => {
      const { preco, precoAluguel } = row.original;
      if (preco == null && precoAluguel == null) return "-";
      // `tabular-nums`: dígitos de mesma largura alinham os valores
      // verticalmente numa coluna de preços. Nenhum valor é recalculado
      // ou normalizado — a formatação continua sendo formatarPreco.
      return (
        <span className="whitespace-nowrap tabular-nums">
          {preco != null && formatarPreco(preco)}
          {preco != null && precoAluguel != null && " · "}
          {precoAluguel != null && `${formatarPreco(precoAluguel)}/mês`}
        </span>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="outline" className={classeStatus(row.original.status)}>
        {STATUS_IMOVEL_LABEL[
          row.original.status as keyof typeof STATUS_IMOVEL_LABEL
        ] ?? row.original.status}
      </Badge>
    ),
  },
];
