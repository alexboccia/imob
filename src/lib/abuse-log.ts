import { logger } from "@/lib/logger";

// Log estruturado de eventos de abuso/rate limiting. Deliberadamente NÃO
// grava no ActivityLog (tabela no Postgres): esses eventos podem acontecer
// milhares de vezes por dia sob ataque, e o ActivityLog é a trilha de
// auditoria funcional do produto (login, CRUD) — poluir ela com tentativas
// bloqueadas destrói sua utilidade e ainda gera carga de escrita no banco
// principal exatamente na hora em que o sistema já está sob pressão. Nível
// "warn" — nunca vai pra Sentry (só "error" vai, ver logger.ts), é volume
// de log estruturado normal, não uma condição de erro no sistema.
export function registrarAbuso(evento: {
  tipo: "login" | "contato" | "anuncie" | "upload";
  motivo: string;
  organizationId?: string;
  ip?: string;
  identificadorHash?: string;
}) {
  logger.warn("evento de abuso/rate limiting", { nivel: "abuso", ...evento });
}
