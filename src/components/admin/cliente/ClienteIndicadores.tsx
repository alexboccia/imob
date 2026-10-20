import { Home, Star, Calendar } from "lucide-react";

// Redesenho da ficha do cliente — os 3 KPIs compactos ao lado do cartão
// de identificação (item 4 da autorização). Tiles verticais (ícone,
// número, rótulo), não o CartaoEstatistica padrão do backoffice: aqui
// eles vivem DENTRO do mesmo cartão do cabeçalho, lado a lado com a
// identificação, e precisam de uma pegada bem mais compacta que a grade
// de KPIs de outras telas. Todos os 3 números vêm de dados já carregados
// pela página — nenhuma contagem é aproximada ou fabricada.
function Indicador({
  icone: Icone,
  tom,
  valor,
  rotulo,
}: {
  icone: typeof Home;
  tom: "azul" | "laranja";
  valor: number | string;
  rotulo: string;
}) {
  return (
    <div className="flex w-28 flex-col items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-3 text-center">
      <span
        className={
          "flex size-8 items-center justify-center rounded-lg " +
          (tom === "azul" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700")
        }
      >
        <Icone className="size-4" aria-hidden />
      </span>
      <p className="text-lg leading-tight font-semibold tabular-nums">{valor}</p>
      <p className="text-xs leading-tight text-muted-foreground">{rotulo}</p>
    </div>
  );
}

export function ClienteIndicadores({
  totalRelacionados,
  totalRecomendados,
  ultimaInteracaoData,
}: {
  totalRelacionados: number;
  totalRecomendados: number;
  ultimaInteracaoData: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Indicador icone={Home} tom="azul" valor={totalRelacionados} rotulo="Imóveis relacionados" />
      <Indicador icone={Star} tom="laranja" valor={totalRecomendados} rotulo="Imóveis recomendados" />
      <Indicador icone={Calendar} tom="azul" valor={ultimaInteracaoData ?? "—"} rotulo="Última interação" />
    </div>
  );
}
