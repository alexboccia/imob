import { MessageSquare, Users, Building2, Megaphone, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  CartaoEstatistica,
  GradeEstatisticas,
} from "@/components/admin/ui/CartaoEstatistica";
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

  // Fase 68 — migrado para o cartão compartilhado do backoffice. Os
  // quatro números, seus rótulos, suas legendas e a variação continuam os
  // MESMOS: tudo já vem calculado de buscarAnalyticsComercial, e nenhuma
  // fórmula foi tocada.
  //
  // A variação contra o período anterior aparece só no primeiro card,
  // como antes — é a única métrica com base comparável calculada
  // (analytics.contatos traz atual e anterior). Ela vai no slot `detalhe`,
  // não convertida em texto: a seta e a cor fazem parte da leitura, e o
  // TEXTO ao lado diz a direção, então não depende de cor.
  return (
    <GradeEstatisticas>
      <CartaoEstatistica
        icone={MessageSquare}
        tom="marca"
        rotulo="Contatos recebidos"
        valor={formatarNumero(analytics.contatos.atual)}
        detalhe={
          <p className={cn("mt-0.5 flex items-start gap-1 text-xs", COR_DIRECAO[direcao])}>
            <IconeDirecao className="mt-px size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{textoVariacao(analytics.contatos)}</span>
          </p>
        }
        contexto={`pelos formulários do site · ${periodoLabel.toLowerCase()}`}
      />
      <CartaoEstatistica
        icone={Users}
        tom="info"
        rotulo="Pessoas que procuraram"
        valor={formatarNumero(analytics.pessoasDistintas)}
        // A distinção que evita o erro clássico de ler contatos como
        // leads: 18 contatos podem ser 12 pessoas.
        contexto="pessoas diferentes por trás desses contatos"
      />
      <CartaoEstatistica
        icone={Building2}
        tom="atencao"
        rotulo="Imóveis com contato"
        valor={formatarNumero(analytics.imoveisComContato)}
        contexto="imóveis que receberam ao menos 1 contato"
      />
      <CartaoEstatistica
        icone={Megaphone}
        tom="positivo"
        rotulo="Querem anunciar"
        valor={formatarNumero(analytics.proprietariosAnunciando)}
        contexto="proprietários vindos de “Anuncie seu imóvel”"
      />
    </GradeEstatisticas>
  );
}
