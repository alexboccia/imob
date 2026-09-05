import { MessageSquare, Users, Building2, Megaphone, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatarNumero } from "@/lib/format";
import {
  direcaoVariacao,
  textoVariacao,
  type AnalyticsComercial,
} from "@/lib/analytics-comercial";

// KPIs do Analytics comercial — quatro números, cada um com uma definição
// inequívoca escrita embaixo dele. Nenhum card decorativo, nenhum número
// sem fonte de dado real.
//
// A variação só existe no PRIMEIRO card (contatos recebidos): é a única
// métrica cuja janela anterior é buscada. Inventar "vs. período anterior"
// para os outros três exigiria três counts adicionais e, pior, sugeriria
// comparações que ninguém pediu — quando fizerem falta, entram com dado
// real, não com um traço decorativo.
//
// Grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 e o layout flex-col em
// mobile: mesmo padrão (e mesmo motivo documentado) de
// DashboardKpiCards — abaixo de `sm`, a coluna real atrás da sidebar é
// estreita demais pra o ícone disputar espaço horizontal com o título.

const ICONE_DIRECAO = {
  ALTA: TrendingUp,
  BAIXA: TrendingDown,
  ESTAVEL: Minus,
  SEM_BASE: TrendingUp,
} as const;

// Cor + ÍCONE + texto: a direção nunca é comunicada só por cor (a mesma
// informação está no ícone e na frase inteira ao lado).
const COR_DIRECAO = {
  ALTA: "text-success-muted-foreground",
  BAIXA: "text-destructive",
  ESTAVEL: "text-muted-foreground",
  SEM_BASE: "text-muted-foreground",
} as const;

export function AnalyticsKpiCards({
  analytics,
  periodoLabel,
}: {
  analytics: AnalyticsComercial;
  periodoLabel: string;
}) {
  const direcao = direcaoVariacao(analytics.contatos);
  const IconeDirecao = ICONE_DIRECAO[direcao];

  const cards = [
    {
      icone: MessageSquare,
      corIcone: "bg-primary/10 text-primary",
      titulo: "Contatos recebidos",
      valor: analytics.contatos.atual,
      legenda: `pelos formulários do site · ${periodoLabel.toLowerCase()}`,
      variacao: true,
    },
    {
      icone: Users,
      corIcone: "bg-blue-100 text-blue-700",
      titulo: "Pessoas que procuraram",
      // A distinção que evita o erro clássico de ler contatos como leads:
      // 18 contatos podem ser 12 pessoas.
      valor: analytics.pessoasDistintas,
      legenda: "pessoas diferentes por trás desses contatos",
      variacao: false,
    },
    {
      icone: Building2,
      corIcone: "bg-orange-100 text-orange-700",
      titulo: "Imóveis com contato",
      valor: analytics.imoveisComContato,
      legenda: "imóveis que receberam ao menos 1 contato",
      variacao: false,
    },
    {
      icone: Megaphone,
      corIcone: "bg-success-muted text-success-muted-foreground",
      titulo: "Querem anunciar",
      valor: analytics.proprietariosAnunciando,
      legenda: "proprietários vindos de “Anuncie seu imóvel”",
      variacao: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.titulo} size="sm" className="min-w-0">
          <CardContent className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start sm:gap-3">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${card.corIcone}`}>
              <card.icone className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="min-w-0 break-words text-sm text-muted-foreground">{card.titulo}</p>
              <p className="text-2xl font-semibold leading-tight tabular-nums">
                {formatarNumero(card.valor)}
              </p>
              {card.variacao ? (
                <p className={cn("mt-0.5 flex items-start gap-1 text-xs", COR_DIRECAO[direcao])}>
                  <IconeDirecao className="mt-px size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 break-words">{textoVariacao(analytics.contatos)}</span>
                </p>
              ) : null}
              <p className="mt-0.5 min-w-0 break-words text-xs text-muted-foreground">{card.legenda}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
