import type { AcaoOperacionalVisita } from "@/lib/scheduled-activity-date";
import type { ItemAgenda } from "@/lib/agenda";

// Mapeamento puramente apresentacional — client-safe por construção
// (zero import de @/lib/agenda ou @/lib/prisma), compartilhado entre
// AgendaCard e AgendaDetalhesDrawer pra nunca divergir o rótulo de um
// mesmo status/ação entre os dois lugares que o mostram. Mesmo padrão de
// prioridade-visual.ts no redesenho do Pipeline.
//
// `import type { ItemAgenda }` acima é só de tipo (apagado na compilação,
// nunca puxa @/lib/agenda — que importa @/lib/prisma — pro bundle do
// client) — mesmo raciocínio já usado em AgendaItemCard.tsx/
// AgendaDetalhesDrawer.tsx.

// Forma client-safe de ItemAgenda: troca scheduledAt (Date) por
// scheduledAtISO (string) na fronteira Server -> Client Component. Datas
// brutas cruzando essa fronteira funcionam (o protocolo Flight do React
// Server Components suporta Date nativamente), mas divergiam do padrão
// defensivo do resto do projeto — nenhum outro componente cliente recebe
// Date bruto, todos recebem ISO string e convertem localmente quando
// precisam de fato de um objeto Date (mesmo padrão de
// CardPipeline.tsx: `new Date(item.proximaVisita.scheduledAtISO)`).
export type ItemAgendaClient = Omit<ItemAgenda, "scheduledAt"> & { scheduledAtISO: string };
export const STATUS_VISITA_LABEL: Record<string, string> = {
  SCHEDULED: "Agendada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const ACAO_OPERACIONAL_LABEL: Record<Exclude<AcaoOperacionalVisita, null>, string> = {
  PREPARAR_VISITA: "Preparar visita",
  VISITA_AGORA: "Visita agora",
  REGISTRAR_RESULTADO: "Registrar resultado",
  RESOLVER_PENDENCIA: "Resolver pendência",
};
