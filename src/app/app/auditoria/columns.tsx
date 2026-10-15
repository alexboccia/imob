"use client";

import { Badge } from "@/components/ui/badge";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";

export type AuditoriaRow = {
  id: string;
  createdAt: string;
  usuarioNome: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
};

// Etapa 3 (futura) vai preencher payload com pares "{campo}Antes"/
// "{campo}Depois" — mesma convenção já usada em PlatformAuditLog (ver
// src/app/platform/audit/columns.tsx, resumoMudancas()). Esta etapa só
// precisa mostrar o que já existe hoje: nenhuma exclusão das Etapas 1
// grava Antes/Depois (não são edições), então o resumo só aparece
// quando o payload realmente tiver esse formato — não inventa nada para
// o que não existe ainda.
function resumoMudancas(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const pares: string[] = [];
  for (const chave of Object.keys(payload)) {
    if (!chave.endsWith("Antes")) continue;
    const base = chave.slice(0, -"Antes".length);
    const chaveDepois = `${base}Depois`;
    if (!(chaveDepois in payload)) continue;
    const antes = payload[chave];
    const depois = payload[chaveDepois];
    if (antes === depois) continue;
    pares.push(`${base}: ${String(antes ?? "—")} → ${String(depois ?? "—")}`);
  }
  if (pares.length > 0) return pares.join(" · ");

  // Payload sem o formato Antes/Depois (ex.: { name: "Residencial Alpha" }
  // das exclusões da Etapa 1) — mostra os pares crus, nunca o JSON bruto.
  const outros = Object.entries(payload).map(([chave, valor]) => `${chave}: ${String(valor ?? "—")}`);
  return outros.length > 0 ? outros.join(" · ") : null;
}

export const auditoriaColumns: DataTableColumn<AuditoriaRow>[] = [
  {
    accessorKey: "createdAt",
    header: "Quando",
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleString("pt-BR"),
  },
  {
    accessorKey: "usuarioNome",
    header: "Usuário",
    cell: ({ row }) => row.original.usuarioNome ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "entity",
    header: "Módulo",
    cell: ({ row }) => <Badge variant="outline">{row.original.entity}</Badge>,
  },
  {
    accessorKey: "action",
    header: "Ação",
    cell: ({ row }) => <Badge variant="secondary">{row.original.action}</Badge>,
  },
  {
    accessorKey: "entityId",
    header: "Registro",
    cell: ({ row }) =>
      row.original.entityId ? (
        <span className="text-muted-foreground">{row.original.entityId.slice(0, 8)}…</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "payload",
    header: "Detalhes",
    cell: ({ row }) => {
      const resumo = resumoMudancas(row.original.payload);
      return resumo ? (
        <span className="text-xs text-muted-foreground">{resumo}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
];
