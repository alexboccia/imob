"use client";

import { ChevronDown } from "lucide-react";
import type { CriterioMatch } from "@/lib/property-matching";

// Fase 98 — explicabilidade visual do matching. Extraído de
// RecomendacaoImovelItem/RecomendacaoClienteItem, que tinham exatamente o
// mesmo bloco duplicado: um único lugar para a UI de "por que este
// resultado?", reaproveitado nos dois sentidos do matching (Fase E/F) sem
// duplicar a regra de agrupamento nem o texto.
//
// NENHUM cálculo mora aqui — `criteria` já vem pronto de
// calcularCompatibilidade (src/lib/property-matching.ts), a única fonte
// de verdade da compatibilidade. Este componente só agrupa e formata o
// que a função pura já decidiu: active/matched/percentualAtendido nunca
// são recalculados, só lidos.
//
// Requisitos (hard filters, weight=0) continuam sempre visíveis — são no
// máximo 3 (finalidade/tipo/preço) e só aparecem aqui quando o resultado
// já é compatible=true, então nunca há um "requisito não atendido" nesta
// lista. Compatibilidade (soft criteria, weight>0) pode chegar a 8 itens
// e é o que de fato explica o score — fica atrás de um <details> nativo
// (mesmo padrão já usado em PipelineInsights.tsx: focável/expansível por
// teclado de graça, sem biblioteca nova, sem JS de estado), recolhido por
// padrão para o card não crescer verticalmente à toa em telas estreitas.
function simboloCriterio(criterio: CriterioMatch): string {
  if (!criterio.matched) return "✕";
  // Só features (propertyFeatures/condoFeatures) podem ter
  // percentualAtendido entre 0 e 1 com matched=true (qualquer
  // sobreposição já conta como "atende" pra fins de destaque) — os
  // demais critérios são estritamente booleanos (percentualAtendido é
  // sempre 0 ou 1). O "~" existe só para não mostrar o mesmo símbolo de
  // um match total (4 de 4) e de um parcial (1 de 4): o texto já
  // distinguia os dois, o símbolo passa a distinguir também.
  if (criterio.percentualAtendido != null && criterio.percentualAtendido < 1) return "~";
  return "✓";
}

export function CriteriosCompatibilidade({ criteria }: { criteria: CriterioMatch[] }) {
  const requisitos = criteria.filter((c) => c.active && c.weight === 0);
  const criteriosCompatibilidade = criteria.filter((c) => c.active && c.weight > 0);

  if (requisitos.length === 0 && criteriosCompatibilidade.length === 0) return null;

  return (
    <div className="min-w-0 space-y-2">
      {requisitos.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Requisitos atendidos</p>
          <ul className="text-sm space-y-1">
            {requisitos.map((criterio) => (
              <li key={criterio.key} className="min-w-0 break-words">
                ✓ {criterio.detail ?? criterio.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {criteriosCompatibilidade.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            Ver critérios de compatibilidade
            <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {criteriosCompatibilidade.map((criterio) => (
              <li
                key={criterio.key}
                className={
                  "min-w-0 break-words " +
                  (criterio.matched ? "text-foreground" : "text-muted-foreground")
                }
              >
                {simboloCriterio(criterio)} {criterio.detail ?? criterio.label}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
