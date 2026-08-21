import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ContadoresAgenda } from "@/lib/agenda";

// Redesenho da Agenda — mesmo padrão visual dos 4 cards de KPI de
// ClientesKpiCards/PipelineKpiCards. Puramente apresentacional: os 4
// números já vêm calculados por contarAgenda (Hoje/Próximas/Atrasadas) +
// contarResumoDiario (Concluídas hoje) — mesmas queries que já existiam
// na Agenda antes do redesenho, só agora chamadas sempre (não só na aba
// "hoje"), pra os KPIs ficarem visíveis em qualquer aba, como em
// Clientes/Pipeline. Nenhuma query nova, nenhum cálculo novo.
export function AgendaKpiCards({
  contadores,
  concluidasHoje,
}: {
  contadores: ContadoresAgenda;
  concluidasHoje: number;
}) {
  const temAtrasadas = contadores.atrasadas > 0;

  const cards = [
    {
      icone: CalendarDays,
      corIcone: "bg-primary/10 text-primary",
      titulo: "Hoje",
      valor: contadores.hoje,
      legenda: contadores.hoje === 1 ? "1 compromisso" : `${contadores.hoje} compromissos`,
    },
    {
      icone: Clock,
      corIcone: "bg-violet-100 text-violet-700",
      titulo: "Próximas",
      valor: contadores.proximas,
      legenda: "agendadas",
    },
    {
      icone: AlertTriangle,
      // Destaque sóbrio (não vibrante) só quando há atrasadas de fato —
      // mesmo racional de "Perdidos" em PipelineKpiCards, sem badge extra.
      corIcone: temAtrasadas ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground",
      titulo: "Atrasadas",
      valor: contadores.atrasadas,
      legenda: temAtrasadas ? "precisam de ação" : "nenhuma",
    },
    {
      icone: CheckCircle2,
      corIcone: "bg-success-muted text-success-muted-foreground",
      titulo: "Concluídas",
      valor: concluidasHoje,
      legenda: "hoje",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.titulo} size="sm" className="min-w-0">
          <CardContent className="flex items-start gap-3">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${card.corIcone}`}>
              <card.icone className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{card.titulo}</p>
              <p className="text-2xl font-semibold leading-tight">{card.valor}</p>
              <p className="text-xs text-muted-foreground truncate">{card.legenda}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
