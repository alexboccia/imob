"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// formatarNumero vem de @/lib/format (módulo puro, sem imports) e NUNCA
// de @/lib/analytics-comercial: este é um client component, e importar um
// valor de lá arrastaria @/lib/prisma + node:async_hooks pro bundle do
// navegador. Os TIPOS podem vir de lá porque são apagados na compilação —
// mesmo padrão que DashboardCharts.tsx já usa com @/lib/dashboard.
import { formatarNumero } from "@/lib/format";
import type { PontoSerie, Granularidade } from "@/lib/analytics-comercial";

// Evolução dos contatos — recharts (já era a biblioteca de gráficos do
// projeto, usada pelo Dashboard; nenhuma dependência nova foi adicionada
// nesta fase).
//
// BarChart e não LineChart de propósito: uma linha entre dias sugere
// continuidade — "quantos contatos havia às 15h de terça" não é uma
// pergunta com resposta. Contatos são eventos discretos contados por
// balde; barra é a forma honesta disso, e um balde em ZERO aparece como
// ausência de barra num slot que continua existindo no eixo, em vez de a
// linha "pular" o dia.
//
// ACESSIBILIDADE — o gráfico NUNCA é a única forma de ler os dados:
// - o <svg> do recharts é aria-hidden (é decoração de uma tabela que
//   existe de verdade logo abaixo);
// - a mesma série está numa <table> semântica, aberta por um <button>
//   real (foco visível, operável por teclado, aria-expanded/aria-controls);
// - o resumo textual acima do gráfico (total, pico, dias sem contato) dá
//   a leitura principal sem depender de enxergar barra nenhuma.
export function AnalyticsSerieContatos({
  serie,
  granularidade,
  periodoLabel,
}: {
  serie: PontoSerie[];
  granularidade: Granularidade;
  periodoLabel: string;
}) {
  const [tabelaAberta, setTabelaAberta] = useState(false);

  const total = serie.reduce((soma, ponto) => soma + ponto.total, 0);
  const pico = serie.reduce<PontoSerie | null>(
    (maior, ponto) => (maior === null || ponto.total > maior.total ? ponto : maior),
    null
  );
  const baldesVazios = serie.filter((ponto) => ponto.total === 0).length;
  const unidade = granularidade === "SEMANA" ? "semana" : "dia";
  const unidadePlural = granularidade === "SEMANA" ? "semanas" : "dias";

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Evolução dos contatos</CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          {periodoLabel} · um ponto por {unidade}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          // Estado vazio explícito: um gráfico de 30 barras invisíveis não
          // comunica nada além de "quebrou".
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Ainda não há contatos neste período. Assim que alguém preencher um formulário do site,
            a evolução aparece aqui.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{formatarNumero(total)}</span>{" "}
              {total === 1 ? "contato no total" : "contatos no total"}
              {pico && pico.total > 0 ? (
                <>
                  {" · pico de "}
                  <span className="font-medium text-foreground">{formatarNumero(pico.total)}</span>
                  {` em ${pico.rotuloLongo}`}
                </>
              ) : null}
              {baldesVazios > 0
                ? ` · ${formatarNumero(baldesVazios)} ${baldesVazios === 1 ? unidade : unidadePlural} sem nenhum contato`
                : null}
            </p>
            {/* aria-hidden: a leitura acessível é o parágrafo acima + a
                tabela abaixo, nunca o desenho. */}
            <div className="h-64" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="rotulo"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    // Com 30 baldes diários, todo rótulo vira uma parede
                    // ilegível — o recharts decide sozinho quantos cabem.
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 13 }}
                    labelStyle={{ fontWeight: 600 }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.rotuloLongo ?? ""}
                    formatter={(valor) => [formatarNumero(Number(valor ?? 0)), "Contatos"]}
                  />
                  <Bar dataKey="total" name="Contatos" fill="#2563eb" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        <div>
          <button
            type="button"
            onClick={() => setTabelaAberta((aberta) => !aberta)}
            aria-expanded={tabelaAberta}
            aria-controls="analytics-serie-tabela"
            className="rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {tabelaAberta ? "Ocultar dados da série" : "Ver dados da série"}
          </button>
          {tabelaAberta && (
            // overflow-x-auto no wrapper: a tabela rola dentro do próprio
            // container em telas estreitas, nunca empurra a página.
            <div id="analytics-serie-tabela" className="mt-2 max-h-72 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{granularidade === "SEMANA" ? "Semana" : "Dia"}</TableHead>
                    <TableHead scope="col" className="text-right">
                      Contatos
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serie.map((ponto) => (
                    <TableRow key={ponto.chave}>
                      <TableCell>{ponto.rotuloLongo}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarNumero(ponto.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
