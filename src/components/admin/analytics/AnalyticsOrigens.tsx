import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatarNumero } from "@/lib/format";
import type { ItemOrigem } from "@/lib/analytics-comercial";

// Origem dos contatos — decomposição de Interaction.origin (catálogo em
// src/lib/captacao.ts; nenhum rótulo é redigitado aqui).
//
// Sem biblioteca de gráfico: três barras horizontais em CSS puro dizem
// tudo que um donut diria, e o número absoluto + o percentual ficam
// escritos ao lado de cada uma — o dado é legível sem enxergar a barra,
// e a barra em si é aria-hidden por ser pura redundância visual.
//
// Componente burro, server-side: recebe `origens` já calculado por
// buscarAnalyticsComercial. Nenhum cálculo aqui.
export function AnalyticsOrigens({
  origens,
  total,
}: {
  origens: ItemOrigem[];
  total: number;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Origem dos contatos</CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          De qual página do site a pessoa decidiu falar com você.
        </p>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Ainda não há contatos neste período para distribuir por origem.
          </p>
        ) : (
          <dl className="space-y-3">
            {origens.map((item) => (
              <div key={item.origem} className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                  <dt className="min-w-0 break-words">{item.rotulo}</dt>
                  <dd className="shrink-0 tabular-nums">
                    <span className="font-medium">{formatarNumero(item.total)}</span>{" "}
                    <span className="text-muted-foreground">
                      ({Math.round(item.percentual)}%)
                    </span>
                  </dd>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary"
                    // Largura ZERO quando não há contato daquela origem —
                    // nunca um mínimo cosmético, que sugeriria movimento
                    // onde não houve nenhum.
                    style={{ width: `${item.percentual}%` }}
                  />
                </div>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
