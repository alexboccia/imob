import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatarNumero } from "@/lib/format";
import { formatarTaxa, type ResultadoComercial } from "@/lib/analytics-comercial";

// Resultado comercial (Fase 8) — CONTATO -> OPORTUNIDADE -> FECHAMENTO.
//
// NÃO existe receita nem comissão nesta tela, e isso é uma decisão, não
// um esquecimento: o produto não registra valor de negócio em lugar
// nenhum (o model Deal, que teria finalValue/commission, nunca é escrito
// por nenhum fluxo), e preço anunciado do imóvel não é receita da
// imobiliária. Números de dinheiro aqui seriam inventados.
export function AnalyticsResultado({
  resultado,
  periodoLabel,
}: {
  resultado: ResultadoComercial;
  periodoLabel: string;
}) {
  const {
    oportunidadesCriadas,
    oportunidadesComOrigem,
    fechamentosGanhos,
    fechamentosPerdidos,
    contatosElegiveis,
    contatosQueViraramOportunidade,
    taxaContatoParaOportunidade,
    taxaOportunidadeParaGanho,
    semVinculoDeOrigem,
  } = resultado;

  const semNadaNoPeriodo =
    oportunidadesCriadas === 0 && fechamentosGanhos === 0 && fechamentosPerdidos === 0;

  return (
    <Card className="min-w-0" role="region" aria-labelledby="analytics-resultado-titulo">
      <CardHeader>
        <CardTitle className="text-base" id="analytics-resultado-titulo">
          Resultado comercial
        </CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          {periodoLabel} · do contato à negociação fechada
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {semNadaNoPeriodo ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma oportunidade criada nem negociação encerrada neste período.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Oportunidades criadas</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {formatarNumero(oportunidadesCriadas)}
                </dd>
                <p className="text-xs text-muted-foreground">
                  {formatarNumero(oportunidadesComOrigem)} a partir de um contato do site
                </p>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Negociações ganhas</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {formatarNumero(fechamentosGanhos)}
                </dd>
                <p className="text-xs text-muted-foreground">encerradas como ganhas no período</p>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Negociações perdidas</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {formatarNumero(fechamentosPerdidos)}
                </dd>
                <p className="text-xs text-muted-foreground">
                  contexto para o número de ganhas ao lado
                </p>
              </div>
            </dl>

            <dl className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Contato vira oportunidade</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatarTaxa(taxaContatoParaOportunidade)}
                </dd>
                <p className="text-xs text-muted-foreground">
                  {formatarNumero(contatosQueViraramOportunidade)} de{" "}
                  {formatarNumero(contatosElegiveis)} contatos por página de imóvel recebidos neste
                  período
                </p>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Oportunidade vira ganho</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatarTaxa(taxaOportunidadeParaGanho)}
                </dd>
                <p className="text-xs text-muted-foreground">
                  ganhas ÷ oportunidades criadas no período
                </p>
              </div>
            </dl>
          </>
        )}

        {semVinculoDeOrigem && (
          // A distinção que evita a leitura errada: a coluna de origem
          // está vazia porque o vínculo passou a existir agora, não
          // porque nenhum canal converteu.
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Nenhuma oportunidade tem contato de origem registrado ainda. O vínculo passa a existir
            quando alguém usar “Criar oportunidade” no histórico de um contato do site —
            oportunidades criadas manualmente continuam sem origem, e nada foi atribuído para trás.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Sem valores em dinheiro: o sistema não registra valor fechado nem comissão, e o preço
          anunciado do imóvel não é receita.
        </p>
      </CardContent>
    </Card>
  );
}
