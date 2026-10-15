import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Derivado do PRÓPRIO `prisma` (client extends, não o client gerado cru)
// — `Prisma.TransactionClient` do pacote gerado é um tipo DIFERENTE do
// client de transação que `prisma.$transaction(async (tx) => ...)`
// realmente entrega depois do `.$extends(...)` em src/lib/prisma.ts, e
// os dois não são atribuíveis entre si. Extrair o tipo a partir do
// próprio `$transaction` garante que bate sempre, mesmo que as
// extensions mudem no futuro.
type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Trilha técnica/segurança (quem fez o quê, quando) — separada de
// Interaction/PropertyStatusHistory, que continuam sendo o histórico
// funcional do funil visível pro corretor.
//
// ATOMICIDADE (Logs de Auditoria — correção pós-Etapa 2): por padrão
// (sem `tx`), continua exatamente como sempre foi — best-effort, nunca
// bloqueia a operação principal, qualquer falha só é avisada no console.
// Esse comportamento é o certo para a maioria dos 40+ pontos de uso
// existentes (ex.: "perfil público ativado", "convite reenviado") — não
// vale a pena reverter uma operação de negócio inteira por causa de uma
// falha momentânea ao gravar um log informativo.
//
// Só quando um `tx` (cliente de transação Prisma) é passado — usado
// deliberadamente nos fluxos de MAIOR risco (exclusões, arquivamento,
// exclusão definitiva) — a falha de gravação é RELANÇADA, propagando
// para fora do `prisma.$transaction(...)` que a chamou e revertendo
// também a operação de negócio junto. A escolha de usar `tx` ou não fica
// no call site, nunca aqui: esta função não decide sozinha quando algo é
// "crítico o suficiente" para isso.
export async function logActivity(
  params: {
    organizationId: string;
    userId?: string | null;
    entity: string;
    entityId?: string | null;
    action: string;
    payload?: Record<string, string | number | boolean | null>;
  },
  tx?: PrismaTransactionClient
) {
  const cliente = tx ?? prisma;
  try {
    await cliente.activityLog.create({
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
    if (tx) {
      // Dentro de uma transação crítica: a falha PRECISA propagar, pra
      // reverter a operação de negócio junto — é exatamente o ponto de
      // ter passado `tx` em vez de deixar no padrão best-effort.
      throw erro;
    }
    logger.error("Falha ao gravar ActivityLog", erro, {
      organizationId: params.organizationId,
      userId: params.userId ?? undefined,
      action: params.action,
      modulo: "database",
    });
  }
}

// Monta o payload "{campo}Antes"/"{campo}Depois" (mesma convenção já
// usada em PlatformAuditLog, ver src/app/platform/audit/columns.tsx) a
// partir de dois snapshots e uma allowlist de campos — nunca o objeto
// inteiro antes/depois (evita capturar um campo sensível por engano se
// alguém ampliar o snapshot no futuro sem atualizar a allowlist aqui).
// Campos sem mudança real são omitidos — um payload vazio ({}) quando
// nada relevante mudou é intencional, não um bug: nem todo "updated"
// precisa ter o que mostrar.
export function diffAuditavel<T extends Record<string, unknown>>(
  antes: T,
  depois: T,
  camposPermitidos: readonly (keyof T)[]
): Record<string, string | number | boolean | null> {
  const resultado: Record<string, string | number | boolean | null> = {};
  for (const campo of camposPermitidos) {
    // Normaliza ANTES de comparar, nunca depois: `price` (e qualquer
    // outro campo Decimal do Prisma) nunca é === entre duas instâncias,
    // mesmo com o MESMO valor numérico — comparar os valores crus
    // marcaria toda edição como "mudança de preço", mesmo quando nada
    // mudou (bug real, encontrado escrevendo o teste desta própria
    // função). Comparar as formas já normalizadas (string/number/
    // boolean/null) é o que garante que "300000" Decimal == "300000"
    // Decimal, não objetos iguais por valor mas diferentes por referência.
    const valorAntes = normalizarValorAuditoria(antes[campo]);
    const valorDepois = normalizarValorAuditoria(depois[campo]);
    if (valorAntes === valorDepois) continue;
    resultado[`${String(campo)}Antes`] = valorAntes;
    resultado[`${String(campo)}Depois`] = valorDepois;
  }
  return resultado;
}

function normalizarValorAuditoria(valor: unknown): string | number | boolean | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") return valor;
  if (valor instanceof Date) return valor.toISOString();
  // Decimal do Prisma (price, etc.) e qualquer outro objeto com toString
  // utilizável — nunca JSON.stringify de um objeto arbitrário aqui
  // (poderia vazar uma estrutura maior do que o pretendido).
  return String(valor);
}
