import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Auditoria de ações administrativas da PLATAFORMA — separada de
// logActivity() (@/lib/activity-log.ts), que grava em ActivityLog e exige
// organizationId obrigatório (é tenant-scoped). Ações como
// PLATFORM_OPERATOR_CREATED não têm organização nenhuma associada. Ver
// plano em /Users/alexboccia/.claude/plans/glittery-noodling-harp.md,
// decisão #5. Nunca deve bloquear a operação principal — mesma filosofia
// de logActivity: falha ao gravar o log é só avisada, não propagada.
export async function logPlatformActivity(params: {
  platformOperatorId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  organizationId?: string | null;
  // Nunca senha/token/cookie/secret/connection string — só metadados de
  // negócio (ex: { planoAnterior: "BASICO", planoNovo: "PRO" }).
  metadata?: Record<string, string | number | boolean | null>;
}) {
  try {
    await prisma.platformAuditLog.create({
      data: {
        platformOperatorId: params.platformOperatorId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        organizationId: params.organizationId ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch (erro) {
    logger.error("Falha ao gravar PlatformAuditLog", erro, {
      platformOperatorId: params.platformOperatorId,
      action: params.action,
      modulo: "platform-audit",
    });
  }
}
