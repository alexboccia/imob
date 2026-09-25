import { Coins, Handshake, Target, Trophy, Wallet, XCircle } from "lucide-react";
import {
  CartaoEstatistica,
  GradeEstatisticas,
} from "@/components/admin/ui/CartaoEstatistica";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import { BotaoVerAbaAnalytics } from "@/components/admin/analytics/BotaoVerAbaAnalytics";
import { formatarNumero, formatarPreco } from "@/lib/format";
import { formatarTaxa, type ResultadoComercial } from "@/lib/analytics-comercial";

// Síntese comercial da aba "Visão geral" (Fase 68.1).
//
// A Fase 68 tinha colocado o AnalyticsResultado INTEIRO aqui — 10+
// indicadores, explicações de atribuição e notas metodológicas, o mesmo
// conteúdo que já existe (e continua existindo, intocado) na aba
// Comercial. A Visão geral virou "a aba Comercial copiada", quando devia
// ser um resumo para decidir ONDE investigar.
//
// NENHUM CÁLCULO NOVO: as seis métricas abaixo (Oportunidades, Ganhas,
// Perdidas, Taxa de ganho, Valor fechado, Ticket médio) são lidas
// diretamente do MESMO objeto `resultado: ResultadoComercial` que
// AnalyticsResultado usa — o mesmo `buscarAnalyticsComercial`, chamado
// uma vez por carregamento (ver AbasAnalytics). "Taxa de ganho" É
// `taxaOportunidadeParaGanho` (ganhas ÷ oportunidades criadas) — não é
// uma fórmula nova, é o mesmo campo com o nome que a síntese usa.
//
// O QUE FICOU DE FORA DE PROPÓSITO, e onde continua existindo:
//   - Comissão registrada/média/efetiva -> aba Comissões (Participação e
//     Liquidação) e, em detalhe, ainda dentro de AnalyticsResultado na
//     aba Comercial. A síntese nunca fala de comissão: comissão atribuída
//     não é valor recebido, e misturá-la aqui sugeriria uma relação
//     causal com o resultado comercial que os dados não sustentam.
//   - Contato→oportunidade / Oportunidade→ganho (taxas de conversão) ->
//     ficam só no detalhe da aba Comercial. São limitadas por atribuição
//     (contatosElegiveis é uma coorte restrita) e explicar essa limitação
//     não cabe num resumo executivo.
//   - Toda nota metodológica (ausência de vínculo de origem, ganhos sem
//     valor/comissão) -> preservada palavra por palavra em
//     AnalyticsResultado (aba Comercial) e em "Entenda os indicadores".
//     Nada foi apagado, só tirado do caminho principal da síntese.
export function AnalyticsResumoComercial({
  resultado,
  periodoLabel,
}: {
  resultado: ResultadoComercial;
  periodoLabel: string;
}) {
  const { oportunidadesCriadas, fechamentosGanhos, fechamentosPerdidos, taxaOportunidadeParaGanho, valorFechado, ticketMedio } =
    resultado;

  // Mesma condição de AnalyticsResultado — "não há nada para resumir" é a
  // MESMA pergunta nos dois lugares.
  const semNadaNoPeriodo =
    oportunidadesCriadas === 0 && fechamentosGanhos === 0 && fechamentosPerdidos === 0;

  return (
    <div className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* <h2>: esta é uma seção PRINCIPAL do painel "Visão geral",
              lado a lado com "Evolução dos contatos" — precisa de heading
              real, não do <div> que CardTitle renderiza. */}
          <h2 className="font-heading text-base leading-snug font-medium">
            Resultado no período
          </h2>
          <p className="pt-1 text-sm text-muted-foreground">
            Resumo do avanço comercial no período selecionado.
          </p>
        </div>
        <BotaoVerAbaAnalytics aba="comercial" rotulo="Ver análise comercial" />
      </div>

      {semNadaNoPeriodo ? (
        <EstadoVazio
          icone={Handshake}
          titulo="Nenhuma oportunidade criada nem negociação encerrada neste período."
          descricao={periodoLabel}
        />
      ) : (
        <div className="space-y-3">
          {/* Camada 1 — avanço comercial: quantas oportunidades, quantas
              se resolveram (ganhas e perdidas, para contexto honesto da
              taxa) e a taxa que resume as duas. */}
          <GradeEstatisticas>
            <CartaoEstatistica
              icone={Handshake}
              tom="marca"
              rotulo="Oportunidades"
              valor={formatarNumero(oportunidadesCriadas)}
              contexto="criadas no período"
            />
            <CartaoEstatistica
              icone={Trophy}
              tom="positivo"
              rotulo="Ganhas"
              valor={formatarNumero(fechamentosGanhos)}
              contexto="encerradas como ganhas"
            />
            <CartaoEstatistica
              icone={XCircle}
              // Resultado adverso consumado — mesma semântica do Pipeline.
              tom="negativo"
              rotulo="Perdidas"
              valor={formatarNumero(fechamentosPerdidos)}
              contexto="contexto da taxa ao lado"
            />
            <CartaoEstatistica
              icone={Target}
              tom="info"
              rotulo="Taxa de ganho"
              valor={formatarTaxa(taxaOportunidadeParaGanho)}
              contexto="ganhas ÷ oportunidades"
            />
          </GradeEstatisticas>

          {/* Camada 2 — resultado financeiro. Grade PRÓPRIA de 2 colunas,
              não GradeEstatisticas (calibrada para 4): usá-la aqui
              deixaria duas colunas vazias. */}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <CartaoEstatistica
              icone={Wallet}
              tom="marca"
              rotulo="Valor fechado"
              valor={formatarPreco(valorFechado)}
              contexto="ganhos com valor registrado"
            />
            <CartaoEstatistica
              icone={Coins}
              tom="marca"
              rotulo="Ticket médio"
              // null (nenhum ganho com valor) -> "—", NUNCA R$ 0 — mesma
              // regra de AnalyticsResultado.
              valor={ticketMedio === null ? "—" : formatarPreco(ticketMedio)}
              contexto="valor fechado ÷ ganhos com valor"
            />
          </div>
        </div>
      )}
    </div>
  );
}
