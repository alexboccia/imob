import Image from "next/image";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  formatarPreco,
  formatarLocalizacaoImovel,
  formatarCodigoImovel,
  STATUS_IMOVEL_LABEL,
  STATUS_IMOVEL_BADGE_CLASSE,
} from "@/lib/format";
import { BotaoVerFotos } from "@/components/admin/imoveis/BotaoVerFotos";

// Redesign da tela de edição de imóvel — card de resumo horizontal
// (item 5 da autorização), logo abaixo do cabeçalho. Puramente de
// composição: todo dado já vem resolvido da página (Server Component),
// nenhuma query aqui, nenhum dado inventado — placeholder só na FOTO,
// quando o imóvel não tem nenhuma (nunca no texto/valores).
export function ResumoImovelCard({
  titulo,
  bairro,
  cidade,
  estado,
  status,
  finalidade,
  preco,
  precoAluguel,
  precoCondominio,
  precoIptu,
  codigo,
  fotoCapaUrl,
  totalFotos,
}: {
  titulo: string;
  bairro: string | null;
  cidade: string;
  estado: string;
  status: string;
  /** "SALE" | "RENT" | "SALE_AND_RENT" — decide qual preço exibir primeiro. */
  finalidade: string;
  preco: number | null;
  precoAluguel: number | null;
  precoCondominio: number | null;
  precoIptu: number | null;
  codigo: number;
  fotoCapaUrl: string | null;
  totalFotos: number;
}) {
  // Venda e aluguel nunca aparecem como dois blocos "Aluguel"/"Venda"
  // ao mesmo tempo — um imóvel SALE_AND_RENT mostra o preço de venda
  // aqui (mesma prioridade que a ficha pública já usa), o de aluguel
  // continua editável normal na seção Valores, abaixo.
  const precoPrincipal = finalidade === "RENT" ? precoAluguel : preco;
  const rotuloPrecoPrincipal = finalidade === "RENT" ? "Aluguel" : "Venda";

  return (
    // md: (768px) estourava: a sidebar fixa de 224px some só abaixo de
    // 768px (ver layout.tsx), então a 768px de viewport a coluna de
    // texto some espremida entre ela e a foto de 400px — lg: (1024px) é
    // o primeiro ponto com largura de sobra de verdade (mesmo achado da
    // grade de financeiros logo abaixo).
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-4 lg:flex-row lg:p-5">
      <div className="relative h-[160px] w-full shrink-0 overflow-hidden rounded-xl bg-muted lg:h-[150px] lg:w-[400px]">
        {fotoCapaUrl ? (
          <Image
            src={fotoCapaUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 400px, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Building2 className="size-10" aria-hidden />
          </div>
        )}
        {totalFotos > 0 && <BotaoVerFotos total={totalFotos} />}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="min-w-0 truncate text-lg font-bold">{titulo}</h2>
            <p className="text-sm text-muted-foreground">
              {formatarLocalizacaoImovel(bairro, cidade, estado)}
            </p>
          </div>
          <Badge
            variant="secondary"
            className={STATUS_IMOVEL_BADGE_CLASSE[status] ?? ""}
          >
            {STATUS_IMOVEL_LABEL[status] ?? status}
          </Badge>
        </div>

        {/* sm: (640px) estourava a página em 768px, e lg: (1024px)
            ainda estourava — com a foto ao lado (400px) e a sidebar fixa
            de 224px (layout.tsx), a coluna de texto em 1024px de viewport
            segue estreita demais pros 4 blocos numa linha só; xl:
            (1280px) é o primeiro ponto com largura de sobra de verdade
            (mesmo achado já feito no cabeçalho da ficha do cliente,
            achado real, medido com Playwright). */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 xl:flex xl:items-start xl:divide-x xl:divide-border">
          <div className="xl:pr-4">
            <p className="text-xs text-muted-foreground">{rotuloPrecoPrincipal}</p>
            <p className="text-base font-bold">{formatarPreco(precoPrincipal)}</p>
          </div>
          <div className="xl:px-4">
            <p className="text-xs text-muted-foreground">Condomínio</p>
            <p className="text-base font-bold">{formatarPreco(precoCondominio)}</p>
          </div>
          <div className="xl:px-4">
            <p className="text-xs text-muted-foreground">IPTU</p>
            <p className="text-base font-bold">{formatarPreco(precoIptu)}</p>
          </div>
          <div className="flex items-end justify-end xl:flex-1 xl:pl-4">
            <p className="text-xs text-muted-foreground">
              ID: {formatarCodigoImovel(codigo)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
