import {
  SlidersHorizontal,
  Building2,
  MapPin,
  Flag,
  CircleDollarSign,
  Ruler,
  Wrench,
} from "lucide-react";
import { formatarPreco, FINALIDADE_LABEL } from "@/lib/format";

// Redesenho da ficha do cliente — resumo compacto das preferências de
// imóvel (aba Visão geral, item 7.3 da autorização), em formato de lista
// rotulada (ícone + rótulo + valor), uma linha por critério — a lista
// completa, com busca/chips editáveis, continua intocada na aba
// Preferências. "+N" resume o que não cabe na linha, nunca a lista
// inteira permanentemente aberta.
function comOverflow(valores: string[]): string {
  if (valores.length === 0) return "—";
  const [primeiro, ...resto] = valores;
  return resto.length > 0 ? `${primeiro} +${resto.length}` : primeiro;
}

function Linha({
  icone: Icone,
  rotulo,
  valor,
}: {
  icone: typeof SlidersHorizontal;
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0 last:pb-0">
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Icone className="size-4 shrink-0" aria-hidden />
        {rotulo}
      </span>
      <span className="min-w-0 truncate text-right font-medium text-foreground">{valor}</span>
    </div>
  );
}

export function ResumoPreferencias({
  preferencia,
}: {
  preferencia: {
    transactionType: string | null;
    propertyTypes: string[];
    cities: string[];
    neighborhoods: string[];
    minPrice: string | null;
    maxPrice: string | null;
    minArea: number | null;
    maxArea: number | null;
    desiredPropertyFeatures: string[];
    desiredCondoFeatures: string[];
  } | null;
}) {
  if (!preferencia) {
    return <p className="text-sm text-muted-foreground">Nenhuma preferência cadastrada ainda.</p>;
  }

  const faixaPreco =
    preferencia.minPrice || preferencia.maxPrice
      ? `${preferencia.minPrice ? formatarPreco(Number(preferencia.minPrice)) : "sem mínimo"} – ${
          preferencia.maxPrice ? formatarPreco(Number(preferencia.maxPrice)) : "sem máximo"
        }`
      : "Não informada";

  const faixaArea =
    preferencia.minArea != null || preferencia.maxArea != null
      ? `${preferencia.minArea ?? "sem mínimo"} – ${preferencia.maxArea ?? "sem máximo"} m²`
      : "Não informada";

  const caracteristicas = [...preferencia.desiredPropertyFeatures, ...preferencia.desiredCondoFeatures];

  return (
    <div>
      <Linha
        icone={SlidersHorizontal}
        rotulo="Finalidade"
        valor={
          preferencia.transactionType
            ? (FINALIDADE_LABEL[preferencia.transactionType] ?? preferencia.transactionType)
            : "Qualquer"
        }
      />
      <Linha icone={Building2} rotulo="Tipos de imóvel" valor={comOverflow(preferencia.propertyTypes)} />
      <Linha icone={MapPin} rotulo="Cidades" valor={comOverflow(preferencia.cities)} />
      <Linha icone={Flag} rotulo="Bairros" valor={comOverflow(preferencia.neighborhoods)} />
      <Linha icone={CircleDollarSign} rotulo="Faixa de preço" valor={faixaPreco} />
      <Linha icone={Ruler} rotulo="Área privativa" valor={faixaArea} />
      <Linha icone={Wrench} rotulo="Características" valor={comOverflow(caracteristicas)} />
    </div>
  );
}
