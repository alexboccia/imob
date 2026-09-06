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
import { formatarTaxa } from "@/lib/analytics-comercial";
import { SEM_RESPONSAVEL_CHAVE, type LinhaResponsavel } from "@/lib/responsavel-negociacao";

// Performance por responsável (Fase 11) — quem conduz cada negociação.
//
// NOMENCLATURA: "Comissão dos negócios sob responsabilidade", nunca
// "comissão recebida pelo corretor". Ownership diz quem CONDUZ o negócio;
// não existe split, co-broker nem percentual do corretor no domínio, então
// o sistema não sabe — e não afirma — quanto desse dinheiro chega a quem.
//
// COORTES SEPARADAS: "Oportunidades" são as CRIADAS no período;
// "Ganhos"/"Perdidos"/valores são os FECHADOS no período. A taxa de ganho
// usa somente a coorte de fechados (ganhos ÷ encerrados) — dividir ganhos
// por oportunidades criadas misturaria duas janelas diferentes e produziria
// um número que parece conversão sem ser.
//
// Tabela semântica, sem gráfico e sem avatar: o nome em texto é o dado.
export function AnalyticsResponsaveis({
  responsaveis,
  periodoLabel,
  // true enquanto NENHUMA negociação da organização tiver responsável.
  semOwnership,
}: {
  responsaveis: LinhaResponsavel[];
  periodoLabel: string;
  semOwnership: boolean;
}) {
  return (
    <Card className="min-w-0" role="region" aria-labelledby="analytics-responsaveis-titulo">
      <CardHeader>
        <CardTitle className="text-base" id="analytics-responsaveis-titulo">
          Performance por responsável
        </CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          {periodoLabel} · quem conduz cada negociação
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {semOwnership ? (
          // Estado inicial legítimo: ownership passou a existir agora e
          // nenhuma negociação anterior recebeu responsável — nada foi
          // atribuído retroativamente.
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma negociação tem responsável registrado ainda. As negociações anteriores não
            receberam responsável automaticamente — ninguém foi atribuído por suposição.
          </p>
        ) : responsaveis.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma oportunidade criada ou encerrada neste período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Responsável</TableHead>
                  <TableHead scope="col" className="w-0 text-right whitespace-nowrap">
                    Oport.
                  </TableHead>
                  <TableHead scope="col" className="w-0 text-right">
                    Ganhos
                  </TableHead>
                  <TableHead scope="col" className="w-0 text-right">
                    Perdidos
                  </TableHead>
                  <TableHead scope="col" className="w-0 text-right whitespace-nowrap">
                    Taxa de ganho
                  </TableHead>
                  <TableHead scope="col" className="w-0 text-right whitespace-nowrap">
                    Valor fechado
                  </TableHead>
                  <TableHead scope="col" className="w-0 text-right">
                    Comissão
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {responsaveis.map((linha) => (
                  <TableRow key={linha.chave}>
                    <TableCell className="whitespace-normal font-medium">
                      {linha.chave === SEM_RESPONSAVEL_CHAVE ? (
                        <span className="italic text-muted-foreground">{linha.nome}</span>
                      ) : (
                        linha.nome
                      )}
                      {/* Membro desativado continua com nome próprio na
                          tabela — nunca é colapsado em "Sem responsável",
                          que apagaria de quem foi o resultado. */}
                      {linha.inativo && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          (inativo)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarNumero(linha.oportunidades)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatarNumero(linha.ganhos)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatarNumero(linha.perdidos)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* null = nenhum fechamento no período. "—", nunca
                          0%, que afirmaria "encerrou tudo perdendo". */}
                      {formatarTaxa(linha.taxaGanho)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {linha.valorFechado > 0 ? formatarPreco(linha.valorFechado) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {linha.comissao > 0 ? formatarPreco(linha.comissao) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!semOwnership && responsaveis.length > 0 && (
          <p className="text-xs text-muted-foreground">
            “Oportunidades” são as criadas no período; ganhos, perdidos e valores são os{" "}
            <strong className="font-medium">encerrados</strong> no período — por isso a taxa de
            ganho divide ganhos pelos encerrados, e nunca pelas oportunidades criadas, que são
            outra coorte. “Comissão” é a soma das comissões dos negócios sob responsabilidade
            desta pessoa: é quem conduziu a negociação, não necessariamente quem recebe o valor —
            o sistema não registra como a comissão é dividida. Negociações sem responsável
            aparecem agrupadas em “Sem responsável”, sem atribuição retroativa a ninguém.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
