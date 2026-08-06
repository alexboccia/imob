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
import { Button } from "@/components/ui/button";

export type PontoTendencia = { mes: string; leads: number; negocios: number };
export type ItemComposicao = { nome: string; total: number };

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Leads e negócios fechados (6 meses)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendencia}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="leads"
                  name="Leads"
                  stroke="#171717"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="negocios"
                  name="Negócios fechados"
                  stroke="#2563eb"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Composição do portfólio</CardTitle>
          <div className="flex gap-1">
            {(Object.keys(DIMENSAO_LABEL) as Dimensao[]).map((chave) => (
              <Button
                key={chave}
                type="button"
                size="xs"
                variant={dimensao === chave ? "default" : "outline"}
                onClick={() => setDimensao(chave)}
              >
                {DIMENSAO_LABEL[chave]}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  width={100}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {dados.map((item, index) => (
                    <Cell key={item.nome} fill={CORES[index % CORES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
