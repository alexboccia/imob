"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PontoTendencia, ItemComposicao } from "@/lib/dashboard";

export type { PontoTendencia, ItemComposicao };

const CORES = [
  "#171717",
  "#2563eb",
  "#f97316",
  "#9333ea",
  "#16a34a",
  "#ea580c",
  "#0891b2",
  "#db2777",
];

type Dimensao = "status" | "tipo" | "bairro";

const DIMENSAO_LABEL: Record<Dimensao, string> = {
  status: "Status",
  tipo: "Tipo",
  bairro: "Bairro",
};

// Redesenho do Dashboard — mesma biblioteca (recharts), mesmos dados e
// significado de antes, só apresentação renovada:
// - toggle Status/Tipo/Bairro virou pill real (mesmo tratamento visual de
//   PipelinePrioridadeChips: bg-primary quando ativo, bg-secondary
//   quando não), <button aria-pressed> em vez de <Button variant>
//   genérico — estado ativo agora é semanticamente anunciado, não só
//   visual;
// - card "Desempenho comercial" ganha os totais do período (soma de
//   leads/negócios já dentro do array `tendencia` recebido — nenhuma
//   query nova, só reduce local);
// - `type="monotone"` mantido de propósito na linha: entre pontos reais
//   (um por mês), monotone preserva monotonicidade e nunca "overshoota"
//   além do mínimo/máximo local dos dois pontos vizinhos — ao contrário
//   de uma curva catmull-rom, não pode sugerir um pico ou vale que não
//   existiu. Trocar pra "linear" só tornaria a leitura mais angulosa,
//   sem mudar nenhum valor implícito — avaliado e mantido.
// - estado vazio explícito no gráfico de composição (BarChart com
//   data=[] não é "quebrado", mas fica sem eixo Y/nenhuma barra — visual
//   confuso); a linha de tendência não precisa disso: uma linha em zero
//   nos 6 meses é a representação CORRETA de "sem leads/negócios no
//   período", não um gráfico quebrado.
export function DashboardCharts({
  tendencia,
  composicaoTipo,
  composicaoBairro,
  composicaoStatus,
}: {
  tendencia: PontoTendencia[];
  composicaoTipo: ItemComposicao[];
  composicaoBairro: ItemComposicao[];
  composicaoStatus: ItemComposicao[];
}) {
  const [dimensao, setDimensao] = useState<Dimensao>("status");
  const composicoes: Record<Dimensao, ItemComposicao[]> = {
    status: composicaoStatus,
    tipo: composicaoTipo,
    bairro: composicaoBairro,
  };
  const dados = composicoes[dimensao];

  const totalLeads = tendencia.reduce((soma, ponto) => soma + ponto.leads, 0);
  const totalNegocios = tendencia.reduce((soma, ponto) => soma + ponto.negocios, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Desempenho comercial</CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground">
            <span>Últimos 6 meses</span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#171717]" aria-hidden />
              Leads: <span className="font-medium text-foreground">{totalLeads}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#2563eb]" aria-hidden />
              Negócios fechados: <span className="font-medium text-foreground">{totalNegocios}</span>
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendencia} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 13 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                <Line
                  type="monotone"
                  dataKey="leads"
                  name="Leads"
                  stroke="#171717"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="negocios"
                  name="Negócios fechados"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Composição do portfólio</CardTitle>
          {/* flex-wrap: mesmo achado/correção já aplicado em
              UsuariosFiltrosBar (Finding #2 da auditoria de Usuários) —
              em ~88-118px de coluna real (360-390px atrás da sidebar
              fixa), as 3 pills (Status/Tipo/Bairro) não cabem numa única
              linha; sem flex-wrap aqui, isso empurrava o scrollWidth do
              DOCUMENTO inteiro (373 vs 360 medido). Aditivo: em telas
              largas as 3 continuam lado a lado normalmente. */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dimensão da composição do portfólio">
            {(Object.keys(DIMENSAO_LABEL) as Dimensao[]).map((chave) => (
              <button
                key={chave}
                type="button"
                aria-pressed={dimensao === chave}
                onClick={() => setDimensao(chave)}
                className={cn(
                  "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
                  dimensao === chave
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                )}
              >
                {DIMENSAO_LABEL[chave]}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {dados.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm text-muted-foreground">Nenhum imóvel cadastrado ainda.</p>
              <p className="text-xs text-muted-foreground">
                A composição por {DIMENSAO_LABEL[dimensao].toLowerCase()} aparece aqui assim que houver imóveis.
              </p>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={100}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(valor: string) => (valor.length > 14 ? `${valor.slice(0, 13)}…` : valor)}
                  />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {dados.map((item, index) => (
                      <Cell key={item.nome} fill={CORES[index % CORES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
