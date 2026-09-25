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
//
// Fase 68.1 — CAUSA REAL DO TRUNCAMENTO ENCONTRADA E CORRIGIDA: antes da
// Fase 68, este componente tinha o SEU PRÓPRIO card, e a legenda usava
// `break-words` (quebra em várias linhas). A migração para
// CartaoEstatistica trocou isso silenciosamente por `contexto`, cuja
// classe é `truncate` (uma linha, reticências) — correto para as legendas
// CURTAS dos outros sete consumidores do cartão (todas com menos de 20
// caracteres: "no portfólio", "há mais de 90 dias" etc.), mas as quatro
// legendas do Analytics têm 40-50 caracteres e passaram a ser cortadas
// silenciosamente.
//
// A correção fica AQUI, não em CartaoEstatistica: mudar o comportamento
// de `contexto` para todos os oito consumidores por causa de quatro
// textos longos numa única tela seria a superfície de mudança errada. Em
// vez disso, o texto completo vai no slot `detalhe` — que não trunca,
// porque quem o usa controla a própria marcação — devolvendo o
// comportamento de `break-words` que existia antes da Fase 68. `contexto`
// deixa de ser passado nestes quatro cards (evita duplicar o texto).
export function AnalyticsKpiCards({
  analytics,
  periodoLabel,
}: {
  analytics: AnalyticsComercial;
  periodoLabel: string;
}) {
  const direcao = direcaoVariacao(analytics.contatos);
  const IconeDirecao = ICONE_DIRECAO[direcao];

  return (
    <GradeEstatisticas>
      <CartaoEstatistica
        icone={MessageSquare}
        tom="marca"
        rotulo="Contatos recebidos"
        valor={formatarNumero(analytics.contatos.atual)}
        detalhe={
          <>
            {/* Variação: cor + ÍCONE + texto — a direção nunca depende só
                de cor. `SEM_BASE` (nenhum contato no período anterior)
                continua neutro, nunca lido como "sem variação" (0%). */}
            <p className={cn("mt-0.5 flex items-start gap-1 text-xs", COR_DIRECAO[direcao])}>
              <IconeDirecao className="mt-px size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{textoVariacao(analytics.contatos)}</span>
            </p>
            <p className="mt-0.5 min-w-0 break-words text-xs text-muted-foreground">
              pelos formulários do site · {periodoLabel.toLowerCase()}
            </p>
          </>
        }
      />
      <CartaoEstatistica
        icone={Users}
        tom="info"
        rotulo="Pessoas que procuraram"
        valor={formatarNumero(analytics.pessoasDistintas)}
        detalhe={
          // A distinção que evita o erro clássico de ler contatos como
          // leads: 18 contatos podem ser 12 pessoas.
          <p className="mt-0.5 min-w-0 break-words text-xs text-muted-foreground">
            pessoas diferentes por trás desses contatos
          </p>
        }
      />
      <CartaoEstatistica
        icone={Building2}
        tom="atencao"
        rotulo="Imóveis com contato"
        valor={formatarNumero(analytics.imoveisComContato)}
        detalhe={
          <p className="mt-0.5 min-w-0 break-words text-xs text-muted-foreground">
            imóveis que receberam ao menos 1 contato
          </p>
        }
      />
      <CartaoEstatistica
        icone={Megaphone}
        tom="positivo"
        rotulo="Querem anunciar"
        valor={formatarNumero(analytics.proprietariosAnunciando)}
        detalhe={
          <p className="mt-0.5 min-w-0 break-words text-xs text-muted-foreground">
            proprietários vindos de “Anuncie seu imóvel”
          </p>
        }
      />
    </GradeEstatisticas>
  );
}

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
