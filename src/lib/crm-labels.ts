// Rótulos em português dos enums do CRM de clientes — módulo plano (sem
// "use client"), importável de Server e Client Components (mesmo racional
// já documentado em property-interest-schema.ts para ESTAGIO_INTERESSE_LABEL:
// um objeto definido dentro de um arquivo "use client" só resolve
// corretamente dentro dele mesmo).
//
// Redesenho da tela de Clientes: ESTAGIO_LABEL (PipelineStage) estava
// duplicado em src/app/app/clientes/columns.tsx e
// src/app/app/clientes/[id]/page.tsx — consolidado aqui, único lugar.
// ORIGEM_LABEL/PAPEL_LABEL/TIPO_INTERACAO_LABEL não existiam antes (as
// telas mostravam o valor bruto do enum) — criados agora pela mesma razão.

// PipelineStage — funil do Person (nível cliente/lead), nunca confundir
// com PropertyInterestStage (funil da relação pessoa↔imóvel específico,
// ver ESTAGIO_INTERESSE_LABEL em property-interest-schema.ts).
export const ESTAGIO_LABEL: Record<string, string> = {
  NEW_LEAD: "Novo lead",
  CONTACTED: "Contato feito",
  VISIT_SCHEDULED: "Visita agendada",
  PROPOSAL: "Proposta",
  CLOSED: "Fechado",
  LOST: "Perdido",
};

export const ESTAGIOS_PIPELINE = [
  "NEW_LEAD",
  "CONTACTED",
  "VISIT_SCHEDULED",
  "PROPOSAL",
  "CLOSED",
  "LOST",
] as const;

// Classe de cor do badge por estágio — mesmo padrão de cor-por-status já
// usado em outros badges do projeto (classes Tailwind diretas, já que
// Badge (src/components/ui/badge.tsx) não tem variant para cada cor
// semântica de funil).
export const ESTAGIO_BADGE_CLASSE: Record<string, string> = {
  NEW_LEAD: "bg-blue-100 text-blue-700",
  CONTACTED: "bg-amber-100 text-amber-800",
  VISIT_SCHEDULED: "bg-violet-100 text-violet-700",
  PROPOSAL: "bg-cyan-100 text-cyan-800",
  CLOSED: "bg-success-muted text-success-muted-foreground",
  LOST: "bg-muted text-muted-foreground",
};

export const ORIGEM_LABEL: Record<string, string> = {
  WEBSITE: "Site",
  REFERRAL: "Indicação",
  PORTAL: "Portal",
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  OTHER: "Outro",
};

export const PAPEL_LABEL: Record<string, string> = {
  LEAD: "Lead",
  CLIENT: "Cliente",
  OWNER: "Proprietário",
};

export const TIPO_INTERACAO_LABEL: Record<string, string> = {
  VISIT: "Visita",
  CALL: "Ligação",
  MESSAGE: "Mensagem",
  EMAIL: "E-mail",
  OTHER: "Outro",
};

// Sanitiza um valor de filtro vindo da URL (?filters={...}) contra uma
// allowlist de valores reais — usado pelos 3 filtros de /app/clientes
// (estágio/origem/papel). `interpretarFiltros` (src/lib/pagination.ts) só
// valida FORMA (string não-vazia); sem esta checagem de CONTEÚDO, um valor
// manipulado na URL (ex: ?filters={"origem":"GARBAGE"}) chega cru ao
// Prisma como um enum inválido — PrismaClientValidationError, HTTP 500.
// Entrada inválida vira `undefined` (filtro ignorado), nunca lançada nem
// passada adiante.
export function sanitizarFiltro(
  valor: string | undefined,
  permitidos: ReadonlySet<string>
): string | undefined {
  return valor && permitidos.has(valor) ? valor : undefined;
}
