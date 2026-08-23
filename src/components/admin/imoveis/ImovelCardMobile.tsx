import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  FINALIDADE_LABEL,
  STATUS_IMOVEL_LABEL,
  formatarLocalizacaoImovel,
  formatarPreco,
} from "@/lib/format";
import { BadgesImovel } from "@/app/app/imoveis/columns";
import type { ImovelRow } from "@/app/app/imoveis/columns";

// Redesenho de Imóveis — card usado só abaixo de `md` (ver DataTable.tsx,
// prop `renderCard`), substituindo a tabela espremida em mobile pela
// causa estrutural real do finding de overflow: uma tabela com 6+ colunas
// não cabe em 360-375px sem rolagem horizontal, e forçar isso visualmente
// (overflow-x-hidden) esconderia informação em vez de resolver o
// problema. Mesmo DTO/regra de negócio da tabela desktop — nenhum valor
// recalculado aqui, só reorganizado em bloco (título/código/badges em
// cima, tipo·finalidade, localização, preço+status embaixo), reaproveita
// BadgesImovel (mesmo componente da tabela, ver prompt seção 27 — não
// duplicar regra entre table e mobile) e os mesmos formatters de
// format.ts. Server Component puro (sem "use client") — nenhum dos campos
// de ImovelRow é Decimal/Date/BigInt/objeto Prisma (page.tsx já converte
// price/rentPrice pra number antes de montar a linha), então não há
// necessidade de virar Client Component só por causa de serialização.
export function ImovelCardMobile({ imovel }: { imovel: ImovelRow }) {
  return (
    <div className="min-w-0 space-y-2 rounded-lg border p-3">
      <div className="min-w-0 space-y-1">
        {/* break-words: achado real do teste de responsividade (ver
            relatório final) — um título sem espaços perto do fim (ex.: um
            token longo colado) não quebra por padrão e empurra o card (e
            o documento) pra fora do viewport em 360px, mesmo mecanismo já
            corrigido no <h1>Dashboard</h1>/título do KPI do Dashboard. */}
        <Link href={`/app/imoveis/${imovel.id}`} className="break-words font-medium hover:underline">
          {imovel.titulo}
        </Link>
        <p className="text-xs text-muted-foreground">{imovel.codigoFormatado}</p>
        <BadgesImovel imovel={imovel} />
      </div>
      <p className="text-sm text-muted-foreground">
        {imovel.tipo} · {FINALIDADE_LABEL[imovel.finalidade] ?? imovel.finalidade}
      </p>
      <p className="text-sm text-muted-foreground">
        {formatarLocalizacaoImovel(imovel.bairro, imovel.cidade, imovel.estado)}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {imovel.preco == null && imovel.precoAluguel == null ? (
            "-"
          ) : (
            <>
              {imovel.preco != null && formatarPreco(imovel.preco)}
              {imovel.preco != null && imovel.precoAluguel != null && " · "}
              {imovel.precoAluguel != null && `${formatarPreco(imovel.precoAluguel)}/mês`}
            </>
          )}
        </p>
        <Badge variant="secondary">
          {STATUS_IMOVEL_LABEL[imovel.status] ?? imovel.status}
        </Badge>
      </div>
    </div>
  );
}
