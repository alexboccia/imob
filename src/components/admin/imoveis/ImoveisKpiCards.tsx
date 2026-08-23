import { Card, CardContent } from "@/components/ui/card";
import { Building2, CheckCircle2, Sparkles, Star } from "lucide-react";

// Redesenho de Imóveis — mesmo padrão visual de DashboardKpiCards (ícone +
// número + legenda, flex-col abaixo de `sm`, `sm:flex-row` a partir daí,
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`). Reproduzido byte a byte —
// não `grid-cols-2` fixo (usado em Usuários/Clientes) — pela mesma razão
// já documentada em DashboardKpiCards.tsx: em ~88-118px de coluna real
// (atrás da sidebar fixa, 360-390px de viewport), 2 colunas fixas deixa
// menos espaço do que ícone (36px) + gap (12px) consomem, colapsando o
// título. Título com `break-words`, legenda com `truncate` — mesma
// correção do Finding MEDIUM do Dashboard, aplicada aqui desde o início
// (nunca reproduzida) porque o prompt deste redesenho pede explicitamente
// pra não repetir esse bug.
//
// "Total"/"Disponíveis"/"Oportunidades"/"Destaques" são os 4 KPIs
// propostos originalmente — e correspondem 1:1 a campos reais do domínio
// (Property.status === "AVAILABLE", Property.isOpportunity,
// Property.isFeatured), sem precisar de nenhuma substituição: ver
// investigação registrada no relatório final.
export function ImoveisKpiCards({
  total,
  disponiveis,
  oportunidades,
  destaques,
}: {
  total: number;
  disponiveis: number;
  oportunidades: number;
  destaques: number;
}) {
  const cards = [
    {
      icone: Building2,
      corIcone: "bg-primary/10 text-primary",
      titulo: "Total de imóveis",
      valor: total,
      legenda: "no portfólio",
    },
    {
      icone: CheckCircle2,
      corIcone: "bg-success-muted text-success-muted-foreground",
      titulo: "Disponíveis",
      valor: disponiveis,
      legenda: total > 0 ? `${disponiveis} de ${total} imóveis` : "Nenhum imóvel ainda",
    },
    {
      icone: Sparkles,
      corIcone: "bg-blue-100 text-blue-700",
      titulo: "Oportunidades",
      valor: oportunidades,
      legenda: "marcados como oportunidade",
    },
    {
      icone: Star,
      corIcone: "bg-orange-100 text-orange-700",
      titulo: "Destaques",
      valor: destaques,
      legenda: "marcados como destaque",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
