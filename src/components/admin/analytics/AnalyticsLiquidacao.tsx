import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarNumero, formatarPreco } from "@/lib/format";
import type { LiquidacaoComissao } from "@/lib/analytics-comercial";

// Liquidação de comissão (Fase 13) — o que foi efetivamente PAGO.
//
// TRÊS BLOCOS, TRÊS PERGUNTAS DIFERENTES, e nenhum substitui o outro:
//   "Performance por responsável"  quem CONDUZIU a negociação
//   "Participação na comissão"     quanto foi ATRIBUÍDO a cada um
//   este                           quanto foi PAGO
//
// COORTE POR paidAt, não por closedAt: um negócio fechado em janeiro e
// pago em março conta em março. É uma janela temporal diferente da dos
// outros blocos, e por isso o texto abaixo declara isso em vez de deixar
// o leitor supor.
//
// SÓ FLUXO. Saldo pendente é ESTOQUE atual e não aparece aqui: num bloco
// filtrado por 30 dias, misturar "pago no período" com "pendente hoje"
// juntaria duas naturezas distintas no mesmo cartão. O saldo vive na
// divisão da comissão, dentro da negociação.
//
// NOMENCLATURA: "comissão paga" — nunca receita, nunca lucro. O sistema
// registra que o pagamento ocorreu, e não imposto, repasse ou nota.
export function AnalyticsLiquidacao({
  liquidacao,
  periodoLabel,
}: {
  liquidacao: LiquidacaoComissao;
  periodoLabel: string;
}) {
  const { pagoNoPeriodo, pagamentos, participantes } = liquidacao;

  return (
    <Card className="min-w-0" role="region" aria-labelledby="analytics-liquidacao-titulo">
      <CardHeader>
        <CardTitle className="text-base" id="analytics-liquidacao-titulo">
          Liquidação de comissão
        </CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          {periodoLabel} · comissão efetivamente paga, pela data do pagamento
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Comissão paga</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatarPreco(pagoNoPeriodo)}</dd>
            <p className="text-xs text-muted-foreground">
              soma dos pagamentos registrados no período
            </p>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Pagamentos</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatarNumero(pagamentos)}</dd>
            <p className="text-xs text-muted-foreground">
              parcelas registradas — um negócio pode ser pago em várias
            </p>
          </div>
        </dl>

        {participantes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum pagamento de comissão registrado neste período. Comissão atribuída não é comissão
            paga — nada foi considerado pago sem registro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Participante</TableHead>
                  <TableHead scope="col" className="w-0 text-right">
                    Pagamentos
                  </TableHead>
                  <TableHead scope="col" className="w-0 text-right whitespace-nowrap">
                    Comissão paga
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participantes.map((linha) => (
                  <TableRow key={linha.memberId}>
                    <TableCell className="whitespace-normal font-medium">
                      {linha.nome}
                      {/* Membro desativado continua recebendo pagamento de
                          obrigação anterior — suspender não apaga dívida. */}
                      {linha.inativo && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          (inativo)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarNumero(linha.pagamentos)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                      {formatarPreco(linha.pago)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Este bloco usa a <strong>data do pagamento</strong>, não a data de fechamento do negócio —
          um negócio fechado antes do período e pago dentro dele conta aqui. Pagamentos cancelados
          não entram. “Comissão paga” é o valor que a equipe registrou como pago ao participante:
          não é receita, não é lucro, e o sistema não registra imposto, repasse nem nota fiscal. O
          saldo pendente de cada negócio aparece na divisão da comissão, dentro da negociação, por
          ser estoque atual e não movimento do período.
        </p>
      </CardContent>
    </Card>
  );
}
