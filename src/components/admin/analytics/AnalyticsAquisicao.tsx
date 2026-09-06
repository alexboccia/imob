import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarNumero } from "@/lib/format";
import type { Aquisicao } from "@/lib/analytics-comercial";

// Canal de aquisição (Fase 7) — de ONDE veio o tráfego.
//
// Título deliberadamente diferente de "Origem dos contatos": aquele card
// responde em QUE PÁGINA o contato nasceu (imóvel / contato / anuncie),
// este responde COMO a pessoa chegou ao site (Google, Instagram, anúncio,
// direto). São duas perguntas distintas sobre o mesmo contato, e usar o
// mesmo nome para as duas tornaria ambas ilegíveis.
//
// A linha diz "atribuição da visita atual", nunca "origem original do
// cliente": o modelo é de SESSÃO, e chamar de first-touch seria mentir
// sobre o que o dado significa.
//
// Sem gráfico: tabela semântica com números absolutos. O dado é legível
// sem depender de cor nem de desenho.
export function AnalyticsAquisicao({
  aquisicao,
  periodoLabel,
  // Fase 8 — quando NENHUMA oportunidade da organização tem contato de
  // origem, as duas colunas de resultado mostram "—" (não medido) em vez
  // de "0" (medido e deu zero). A diferença importa: "0" afirmaria que o
  // canal não converteu, quando na verdade o vínculo ainda não existe.
  semVinculoDeOrigem,
}: {
  aquisicao: Aquisicao;
  periodoLabel: string;
  semVinculoDeOrigem: boolean;
}) {
  const { canais, campanhas } = aquisicao;

  return (
    <Card className="min-w-0" role="region" aria-labelledby="analytics-aquisicao-titulo">
      <CardHeader>
        <CardTitle className="text-base" id="analytics-aquisicao-titulo">
          Canal de aquisição
        </CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          {periodoLabel} · como as pessoas chegaram ao site nesta visita
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canais.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Ainda não há visitas ou contatos com origem registrada neste período.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Canal</TableHead>
                <TableHead scope="col" className="w-0 text-right">
                  Views
                </TableHead>
                <TableHead scope="col" className="w-0 text-right">
                  %
                </TableHead>
                <TableHead scope="col" className="w-0 text-right">
                  Contatos
                </TableHead>
                <TableHead scope="col" className="w-0 text-right whitespace-nowrap">
                  Oport.
                </TableHead>
                <TableHead scope="col" className="w-0 text-right">
                  Ganhos
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {canais.map((linha) => (
                <TableRow key={linha.canal}>
                  <TableCell className="whitespace-normal font-medium">{linha.rotulo}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarNumero(linha.visualizacoes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {Math.round(linha.percentualVisualizacoes)}%
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatarNumero(linha.contatos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {semVinculoDeOrigem ? (
                      <span title="Ainda não medido">—</span>
                    ) : (
                      formatarNumero(linha.oportunidades)
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {semVinculoDeOrigem ? (
                      <span title="Ainda não medido">—</span>
                    ) : (
                      formatarNumero(linha.fechamentos)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {campanhas.length > 0 && (
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Campanhas</h3>
            <p className="pb-1 text-xs text-muted-foreground">
              Valor de <code>utm_campaign</code>, como veio no link.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Campanha</TableHead>
                  <TableHead scope="col" className="w-0 text-right">
                    Views
                  </TableHead>
                  <TableHead scope="col" className="w-0 text-right">
                    Contatos
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campanhas.map((linha) => (
                  <TableRow key={linha.campanha}>
                    <TableCell className="whitespace-normal break-words">{linha.campanha}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarNumero(linha.visualizacoes)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatarNumero(linha.contatos)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Atribuição da <strong>visita atual</strong>, não do histórico da pessoa: vale enquanto
          dura a navegação e é substituída se ela voltar por outra campanha. “Sem atribuição” são
          visitas e contatos anteriores a esta medição, ou em que o navegador não informou origem —
          nada foi estimado. Oportunidades e ganhos só entram num canal quando nasceram de um
          contato do site; as criadas manualmente ficam em “Sem atribuição”.
        </p>
      </CardContent>
    </Card>
  );
}
