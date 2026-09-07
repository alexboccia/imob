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
import type { ParticipacaoComissao } from "@/lib/analytics-comercial";

// Participação na comissão (Fase 12).
//
// DIMENSÃO SEPARADA de "Performance por responsável", que continua acima
// e não foi substituída: aquela responde quem CONDUZIU a negociação,
// esta responde quem PARTICIPA do dinheiro. A mesma pessoa pode aparecer
// nas duas com números diferentes — e isso é o dado, não um erro.
//
// NOMENCLATURA: "comissão atribuída", nunca "recebida" nem "receita".
// O domínio não registra pagamento, imposto, repasse nem inadimplência,
// então afirmar recebimento seria inventar um fato.
//
// O saldo não distribuído é DECLARADO, jamais atribuído a alguém.
export function AnalyticsParticipacao({
  participacao,
  periodoLabel,
}: {
  participacao: ParticipacaoComissao;
  periodoLabel: string;
}) {
  const {
    participantes,
    comissaoAtribuida,
    comissaoNaoDistribuida,
    ganhosComComissaoSemDivisao,
    semDivisao,
  } = participacao;

  return (
    <Card className="min-w-0" role="region" aria-labelledby="analytics-participacao-titulo">
      <CardHeader>
        <CardTitle className="text-base" id="analytics-participacao-titulo">
          Participação na comissão
        </CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          {periodoLabel} · como a comissão dos negócios ganhos foi dividida
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Comissão atribuída</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {formatarPreco(comissaoAtribuida)}
            </dd>
            <p className="text-xs text-muted-foreground">
              soma das parcelas informadas para participantes
            </p>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Não distribuída</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {formatarPreco(comissaoNaoDistribuida)}
            </dd>
            <p className="text-xs text-muted-foreground">
              comissão registrada que ainda não tem destino declarado
            </p>
          </div>
        </dl>

        {semDivisao ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma negociação ganha neste período tem divisão de comissão registrada. Nada foi
            distribuído automaticamente — nem para o responsável pela negociação.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Participante</TableHead>
                  <TableHead scope="col" className="w-0 text-right">
                    Negócios
                  </TableHead>
                  <TableHead scope="col" className="w-0 text-right whitespace-nowrap">
                    Comissão atribuída
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participantes.map((linha) => (
                  <TableRow key={linha.memberId}>
                    <TableCell className="whitespace-normal font-medium">
                      {linha.nome}
                      {/* Membro desativado continua com a participação
                          histórica e o nome próprio — nunca é colapsado
                          nem tem a parcela redistribuída. */}
                      {linha.inativo && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          (inativo)
                        </span>
                      )}
                      {linha.semParcela > 0 && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          · {formatarNumero(linha.semParcela)} sem parcela definida
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarNumero(linha.negocios)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                      {/* Participação registrada sem parcela não vira R$ 0
                          — a coluna mostra "—" e o rótulo ao lado do nome
                          diz quantas ficaram sem valor. */}
                      {linha.comissaoAtribuida > 0 ? formatarPreco(linha.comissaoAtribuida) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {ganhosComComissaoSemDivisao > 0 && (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            {formatarNumero(ganhosComComissaoSemDivisao)}{" "}
            {ganhosComComissaoSemDivisao === 1
              ? "negociação ganha tem comissão registrada e nenhum participante"
              : "negociações ganhas têm comissão registrada e nenhum participante"}{" "}
            — o valor aparece inteiro em “Não distribuída”, sem destino inventado.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          “Comissão atribuída” é o que a equipe declarou para cada participante — não é valor
          recebido: o sistema não registra pagamento, imposto nem repasse. Participar da comissão é
          diferente de ser responsável pela negociação, e as duas coisas aparecem em blocos
          separados. Negociações sem comissão registrada não têm saldo: não entram em “Não
          distribuída”.
        </p>
      </CardContent>
    </Card>
  );
}
