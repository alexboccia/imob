import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Cartão de indicador (KPI) do backoffice (Fase 65).
//
// Justificativa da abstração: existem HOJE oito componentes de KPI quase
// idênticos — DashboardKpiCards, PipelineKpiCards, ClientesKpiCards,
// ImoveisKpiCards, UsuariosKpiCards, AgendaKpiCards, AnalyticsKpiCards e
// CaracteristicasKpiCards. Cada um reimplementa o mesmo cartão e, com ele,
// os mesmos bugs de layout estreito. Esta fase cria o cartão comum e migra
// APENAS o Dashboard; os outros sete migram nas fases seguintes.
//
// O QUE ESTE COMPONENTE PRESERVA de achados anteriores, e por quê:
//
//  - `flex-col` abaixo de `sm`: com o ícone ao lado do texto, a coluna
//    real em 360-375px (~88-103px atrás da sidebar) deixa ~16-31px para o
//    rótulo depois do padding e da caixa de 36px do ícone, e títulos como
//    "Imóveis disponíveis" quebravam caractere a caractere. Empilhado, o
//    rótulo recebe a largura cheia. `sm:flex-row` restaura o layout
//    horizontal onde há espaço.
//  - `break-words` no rótulo: mesmo em largura cheia, "disponíveis"
//    sozinha ainda excede a caixa nas telas mais estreitas; sem isto ela
//    vaza em vez de quebrar.
//
// `tom` é semântico, não decorativo — diz o que a métrica significa
// (neutro, positivo, atenção), e por isso é um conjunto fechado em vez de
// uma classe livre.
export type TomEstatistica = "marca" | "info" | "positivo" | "atencao" | "negativo";

const TONS: Record<TomEstatistica, string> = {
  // A cor da própria identidade, via token configurável pela organização.
  marca: "bg-primary-light text-primary",
  info: "bg-blue-100 text-blue-700",
  positivo: "bg-success-muted text-success-muted-foreground",
  atencao: "bg-orange-100 text-orange-700",
  // Fase 66 — "negativo" é resultado adverso consumado (negócio perdido),
  // distinto de "atencao", que é algo a resolver (compromisso atrasado).
  // A separação existe justamente para o vermelho não ser gasto em atraso
  // operacional, que acontece todo dia.
  negativo: "bg-destructive/10 text-destructive",
};

export function CartaoEstatistica({
  icone: Icone,
  tom = "marca",
  rotulo,
  valor,
  contexto,
  detalhe,
  href,
}: {
  icone: LucideIcon;
  tom?: TomEstatistica;
  rotulo: string;
  valor: number | string;
  /** Período ou qualificação do número ("neste mês", "há mais de 90 dias"). */
  contexto?: string;
  /**
   * Fase 68 — linha extra ENTRE o valor e o contexto, para o que não é
   * texto simples. Existe por uma necessidade concreta: o card "Contatos
   * recebidos" do Analytics mostra a variação contra o período anterior
   * (seta + texto colorido), que não cabe em `contexto: string`. Aditivo:
   * nenhum chamador existente é afetado.
   */
  detalhe?: ReactNode;
  /**
   * Fase 65.1 — tela que investiga este número, quando existe uma. Sem
   * href o cartão é um fato legível e NÃO ganha afordância de clique:
   * card estático com hover seria um botão morto.
   */
  href?: string;
}) {
  const conteudo = (
    <Card
      size="sm"
      className={cn(
        "min-w-0",
        href && "h-full transition-colors hover:border-primary/40 hover:bg-primary-light/40"
      )}
    >
      <CardContent className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            TONS[tom]
          )}
        >
          <Icone aria-hidden className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p data-kpi-rotulo className="min-w-0 break-words text-sm text-muted-foreground">
            {rotulo}
          </p>
          <p data-kpi-valor className="text-2xl leading-tight font-semibold tabular-nums">
            {valor}
          </p>
          {detalhe}
          {contexto && (
            <p className="min-w-0 truncate text-xs text-muted-foreground">{contexto}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!href) return conteudo;

  return (
    <Link
      href={href}
      // O cartão inteiro é o alvo — o número e o rótulo já dizem para onde
      // se vai, então não há texto de link separado a acrescentar.
      className="block min-w-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {conteudo}
    </Link>
  );
}

// Grade padrão dos KPIs. `grid-cols-1` em mobile (não 2) é deliberado: em
// ~88-118px de coluna real, dividir em duas deixa menos espaço do que a
// caixa do ícone + gap consomem, e o rótulo colapsa para 0px — bug medido
// em UsuariosKpiCards/ClientesKpiCards e evitado aqui desde o início.
export function GradeEstatisticas({ children }: { children: React.ReactNode }) {
  return (
    <div data-grade-kpis className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}
