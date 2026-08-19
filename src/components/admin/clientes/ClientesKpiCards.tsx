import { Card, CardContent } from "@/components/ui/card";
import { Users, UserPlus, PhoneCall, CalendarClock } from "lucide-react";

// Redesenho da tela de Clientes — puramente apresentacional, os 5 números
// já vêm computados de page.tsx (contagens batched num único Promise.all,
// ver comentário lá — nunca uma query por card). Sem interatividade, por
// isso Server Component (não "use client").
export function ClientesKpiCards({
  total,
  novosLeads,
  novosLeadsSemana,
  emAtendimento,
  visitasProximos7Dias,
}: {
  total: number;
  novosLeads: number;
  novosLeadsSemana: number;
  emAtendimento: number;
  visitasProximos7Dias: number;
}) {
  const cards = [
    {
      icone: Users,
      corIcone: "bg-primary/10 text-primary",
      titulo: "Todos os clientes",
      valor: total,
      legenda: "Carteira total",
    },
    {
      icone: UserPlus,
      corIcone: "bg-success-muted text-success-muted-foreground",
      titulo: "Novos leads",
      valor: novosLeads,
      legenda: novosLeadsSemana > 0 ? `+${novosLeadsSemana} esta semana` : "Nenhum novo esta semana",
    },
    {
      icone: PhoneCall,
      corIcone: "bg-amber-100 text-amber-700",
      titulo: "Em atendimento",
      valor: emAtendimento,
      legenda: "Contato feito, visita ou proposta",
    },
    {
      icone: CalendarClock,
      corIcone: "bg-violet-100 text-violet-700",
      titulo: "Visitas agendadas",
      valor: visitasProximos7Dias,
      legenda: "Próximos 7 dias",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
