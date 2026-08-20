import type { MotivoPrioridadePipeline, NivelPrioridadePipeline } from "@/lib/pipeline";

// Mapeamento puramente apresentacional (classes Tailwind) — nunca em
// src/lib/pipeline.ts, que se mantém livre de qualquer detalhe visual
// (mesmo racional de ESTAGIO_BADGE_CLASSE em crm-labels.ts). Compartilhado
// entre PipelineCard e NegociacaoDrawer pra nunca divergir a cor/rótulo de
// um mesmo nível entre os dois lugares que o mostram.
export const PRIORIDADE_LABEL_CURTO: Record<NivelPrioridadePipeline, string> = {
  ALTA: "Alta",
  MEDIA: "Média",
  NORMAL: "Normal",
};

export const PRIORIDADE_BADGE_CLASSE: Record<NivelPrioridadePipeline, string> = {
  ALTA: "bg-destructive/10 text-destructive",
  MEDIA: "bg-amber-100 text-amber-800",
  NORMAL: "bg-secondary text-secondary-foreground",
};

// Duplicata deliberada de formatarMotivoPrioridade (src/lib/pipeline.ts),
// não uma reimportação: pipeline.ts importa @/lib/prisma no topo (pras
// funções de leitura Prisma que moram no mesmo arquivo), então qualquer
// import de VALOR de lá (não só de tipo) puxa esse módulo inteiro pro
// bundle do client — quebra o build (`pg`/Node built-ins não resolvem no
// browser). Este arquivo é "use client"-safe por construção (nenhum
// import de Prisma), por isso a mesma função pura de 4 linhas é
// duplicada aqui em vez de movida (mover exigiria migrar
// MotivoPrioridadePipeline e todos os callers server-side também, escopo
// maior do que este redesenho precisa). Texto idêntico ao original —
// nunca deixar divergir.
export function formatarMotivoPrioridade(motivo: MotivoPrioridadePipeline): string {
  switch (motivo.tipo) {
    case "ATIVIDADE_VENCIDA":
      return "Atividade vencida";
    case "PROPOSTA_SEM_PROXIMA_ACAO":
      return "Proposta sem próxima ação agendada";
    case "VISITADO_SEM_PROXIMA_ACAO":
      return "Sem próxima ação agendada";
    case "AGING_ACIMA_DA_MEDIA":
      return "Na etapa há mais tempo que a média histórica";
  }
}
