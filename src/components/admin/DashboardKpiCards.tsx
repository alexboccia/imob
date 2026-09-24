import { Building2, UserPlus, Handshake, Clock } from "lucide-react";
import {
  CartaoEstatistica,
  GradeEstatisticas,
  type TomEstatistica,
} from "@/components/admin/ui/CartaoEstatistica";
import type { MetricasDashboard } from "@/lib/dashboard";

// KPIs do Dashboard.
//
// Fase 65 — o cartão em si passou para CartaoEstatistica, a fundação
// compartilhada do backoffice: este arquivo virou só a LISTA de métricas
// do Dashboard. Nenhum cálculo mudou; `metricas` continua vindo pronto de
// src/lib/dashboard.ts.
//
// Os achados de layout estreito que moravam aqui (grade de 1 coluna em
// mobile, ícone empilhado abaixo de `sm`, `break-words` no rótulo)
// migraram junto, documentados no componente compartilhado — é o que
// impede as outras sete telas de KPI de reintroduzirem os mesmos bugs
// quando forem migradas.
const CARDS: {
  icone: typeof Building2;
  tom: TomEstatistica;
  rotulo: string;
  chave: keyof Pick<
    MetricasDashboard,
    "imoveisDisponiveis" | "leadsNoMes" | "negociosFechadosNoMes" | "imoveisParados"
  >;
  contexto: string;
}[] = [
  {
    icone: Building2,
    tom: "marca",
    rotulo: "Imóveis disponíveis",
    chave: "imoveisDisponiveis",
    contexto: "disponíveis no portfólio",
  },
  {
    icone: UserPlus,
    tom: "info",
    rotulo: "Novos leads",
    chave: "leadsNoMes",
    contexto: "neste mês",
  },
  {
    icone: Handshake,
    tom: "positivo",
    rotulo: "Negócios fechados",
    chave: "negociosFechadosNoMes",
    contexto: "neste mês",
  },
  {
    icone: Clock,
    // Atenção, não erro: imóvel parado é um sinal para agir, não uma falha.
    tom: "atencao",
    rotulo: "Imóveis parados",
    chave: "imoveisParados",
    contexto: "há mais de 90 dias",
  },
];

export function DashboardKpiCards({ metricas }: { metricas: MetricasDashboard }) {
  return (
    <GradeEstatisticas>
      {CARDS.map((card) => (
        <CartaoEstatistica
          key={card.rotulo}
          icone={card.icone}
          tom={card.tom}
          rotulo={card.rotulo}
          valor={metricas[card.chave]}
          contexto={card.contexto}
        />
      ))}
    </GradeEstatisticas>
  );
}
