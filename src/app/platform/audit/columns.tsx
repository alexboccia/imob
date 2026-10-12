"use client";

import { Badge } from "@/components/ui/badge";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";

export type AuditRow = {
  id: string;
  createdAt: string;
  operadorNome: string;
  action: string;
  entity: string;
  entityId: string | null;
  organizationId: string | null;
  metadata: Record<string, unknown> | null;
};

// Fase 114 — PRC-003: até aqui o metadata (valor anterior/novo de
// preço, limites, status) era gravado em todo PLAN_UPDATED/
// PLAN_OVERRIDE_UPDATED/PLAN_CREATED, mas NUNCA aparecia na tela —
// "consultar o histórico" era tecnicamente possível só lendo o banco
// direto. Esta função extrai os pares "xAntes"/"xDepois" do metadata
// (convenção já usada em todo logPlatformActivity relevante, ver
// actions.ts de plans/organizations) e monta um resumo legível, sem
// expor o Json cru.
function resumoMudancas(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const pares: string[] = [];
  for (const chave of Object.keys(metadata)) {
    if (!chave.endsWith("Antes")) continue;
    const base = chave.slice(0, -"Antes".length);
    const chaveDepois = `${base}Depois`;
    if (!(chaveDepois in metadata)) continue;
    const antes = metadata[chave];
    const depois = metadata[chaveDepois];
    if (antes === depois) continue; // sem mudança real nesse campo — não poluir o resumo
    pares.push(`${base}: ${String(antes ?? "—")} → ${String(depois ?? "—")}`);
  }
  // justificativa não é um par antes/depois — é uma nota administrativa
  // à parte (PRC-002), mostrada só quando preenchida.
  if (metadata.justificativa) {
    pares.push(`justificativa: ${String(metadata.justificativa)}`);
  }
  return pares.length > 0 ? pares.join(" · ") : null;
}

export const auditColumns: DataTableColumn<AuditRow>[] = [
  {
    accessorKey: "createdAt",
    header: "Quando",
    cell: ({ row }) =>
      new Date(row.original.createdAt).toLocaleString("pt-BR"),
  },
  {
    accessorKey: "operadorNome",
    header: "Operador",
  },
  {
    accessorKey: "action",
    header: "Ação",
    cell: ({ row }) => <Badge variant="secondary">{row.original.action}</Badge>,
  },
  {
    accessorKey: "entity",
    header: "Entidade",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.entity}
        {row.original.entityId ? ` · ${row.original.entityId.slice(0, 8)}…` : ""}
      </span>
    ),
  },
  {
    accessorKey: "metadata",
    header: "Detalhes",
    cell: ({ row }) => {
      const resumo = resumoMudancas(row.original.metadata);
      return resumo ? (
        <span className="text-xs text-muted-foreground">{resumo}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "organizationId",
    header: "Organization",
    cell: ({ row }) =>
      row.original.organizationId ? (
        <span className="text-muted-foreground">
          {row.original.organizationId.slice(0, 8)}…
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];
