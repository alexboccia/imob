import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Trilha técnica/segurança (quem fez o quê, quando) — separada de
// Interaction/PropertyStatusHistory, que continuam sendo o histórico
// funcional do funil visível pro corretor. Nunca deve bloquear a operação
// principal: qualquer falha ao gravar o log é só avisada no console.
export async function logActivity(params: {
  organizationId: string;
  userId?: string | null;
  entity: string;
  entityId?: string | null;
  action: string;
  payload?: Record<string, string | number | boolean | null>;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        entity: params.entity,
        entityId: params.entityId ?? null,
        action: params.action,
        payload: params.payload ?? undefined,
      },
    });
  } catch (erro) {
    logger.error("Falha ao gravar ActivityLog", erro, {
      organizationId: params.organizationId,
      userId: params.userId ?? undefined,
      action: params.action,
      modulo: "database",
    });
  }
}
