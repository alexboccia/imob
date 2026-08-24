import { Card, CardContent } from "@/components/ui/card";
import { ListChecks, Home, Building2 } from "lucide-react";

// Redesenho de Características — mesmo padrão visual de DashboardKpiCards/
// ImoveisKpiCards (ícone + número + legenda, flex-col abaixo de `sm`,
// `sm:flex-row` a partir daí, break-words no título, truncate na legenda,
// size-9 na caixa do ícone) — mesma correção do Finding MEDIUM do
// Dashboard, aplicada aqui desde o início. `grid-cols-1 sm:grid-cols-2
// lg:grid-cols-3` (3 KPIs, não 4) — em `sm` (2 colunas), o terceiro card
// fica sozinho na segunda linha, comportamento aceitável e já usado em
// grids de 3 itens no projeto (mesma lógica de wrap do grid-cols-2 usado
// em Usuários/Clientes, só que com um item a menos "sobrando").
//
// Total/Do imóvel/Do condomínio são derivados EM MEMÓRIA a partir do
// mesmo `findMany` que já busca as opções para renderizar as listas —
// zero query adicional (ver page.tsx).
export function CaracteristicasKpiCards({
  total,
  doImovel,
  doCondominio,
}: {
  total: number;
  doImovel: number;
  doCondominio: number;
}) {
  const cards = [
    {
      icone: ListChecks,
      corIcone: "bg-primary/10 text-primary",
      titulo: "Total",
      valor: total,
      legenda: total === 1 ? "opção cadastrada" : "opções cadastradas",
    },
    {
      icone: Home,
      corIcone: "bg-blue-100 text-blue-700",
      titulo: "Do imóvel",
      valor: doImovel,
      legenda: "características do imóvel",
    },
    {
      icone: Building2,
      corIcone: "bg-violet-100 text-violet-700",
      titulo: "Do condomínio",
      valor: doCondominio,
      legenda: "características do condomínio",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.titulo} size="sm" className="min-w-0">
          <CardContent className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${card.corIcone}`}>
              <card.icone className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="min-w-0 break-words text-sm text-muted-foreground">{card.titulo}</p>
              <p className="text-2xl font-semibold leading-tight">{card.valor}</p>
              <p className="text-xs text-muted-foreground truncate">{card.legenda}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
