import Link from "next/link";
import { requireOrganizationId } from "@/lib/tenant";
import { buscarMetricasDashboard } from "@/lib/dashboard";
import { contarAgenda } from "@/lib/agenda";
import { DashboardKpiCards } from "@/components/admin/DashboardKpiCards";
import { DashboardCharts } from "@/components/admin/DashboardCharts";
import { Clock } from "lucide-react";

// Redesenho do Dashboard — mesmo padrão estrutural de Pipeline/Agenda/
// Usuários/Clientes: `<div className="space-y-5">` sem max-w (o <main>
// do layout já não tem largura máxima, ver src/app/app/layout.tsx),
// cabeçalho h1+subtítulo, KPIs, e o restante do conteúdo. Toda a lógica
// de cálculo (queries, janela de 6 meses, bucketização, composição) foi
// extraída pra src/lib/dashboard.ts — mesmo padrão já usado por
// src/lib/pipeline.ts/src/lib/agenda.ts, permitindo testar as funções
// puras isoladamente (dashboard.test.ts) sem precisar de banco.
export default async function DashboardPage() {
  const organizationId = await requireOrganizationId();

  const [metricas, agenda] = await Promise.all([
    buscarMetricasDashboard(organizationId),
    // Reaproveita contarAgenda (já existente, já testado via H.4/H.5) só
    // pra ler `.atrasadas` — nenhuma query nova, nenhuma lógica de
    // "atraso" duplicada aqui. Ver relatório final, seção "Atenção
    // necessária", sobre por que só este item (visitas atrasadas) entrou
    // nesta versão: é o único, dos exemplos conceituais do pedido, que
    // tem uma contagem já pronta e barata — "negociações que precisam de
    // atenção" (Pipeline) exigiria carregar o board aberto inteiro só
    // pra extrair um número, e "imóveis parados" já é um KPI acima.
    contarAgenda(organizationId),
  ]);

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        {/* break-words: a coluna real de conteúdo em 360px (atrás da
            sidebar fixa) tem só ~88px — menos que a largura natural da
            palavra "Dashboard" sozinha em text-2xl (~125px). Sem
            break-words a palavra (sem espaço pra quebrar) vaza da própria
            caixa em vez de quebrar — mesma proteção que já existia no
            h1 do Dashboard antes deste redesenho, mantida aqui. */}
        <h1 className="min-w-0 break-words text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da sua operação imobiliária.</p>
      </div>

      <DashboardKpiCards metricas={metricas} />

      {agenda.atrasadas > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
              <Clock className="size-4.5" />
            </div>
            <p className="text-sm">
              <span className="font-medium">
                {agenda.atrasadas === 1 ? "1 visita atrasada" : `${agenda.atrasadas} visitas atrasadas`}
              </span>{" "}
              <span className="text-muted-foreground">precisam de atenção.</span>
            </p>
          </div>
          <Link href="/app/agenda?aba=anteriores&status=ATRASADAS" className="text-sm font-medium text-primary hover:underline">
            Ver agenda →
          </Link>
        </div>
      )}

      <DashboardCharts
        tendencia={metricas.tendencia}
        composicaoTipo={metricas.composicaoTipo}
        composicaoBairro={metricas.composicaoBairro}
        composicaoStatus={metricas.composicaoStatus}
      />
    </div>
  );
}
