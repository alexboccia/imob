import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getCurrentOrganizationId } from "@/lib/tenant-context";

// Models cujas linhas pertencem a exatamente uma organização. TODO call site
// que consulta esses models DEVE passar organizationId explicitamente no
// where/data (veja @/lib/tenant.ts + os call sites em src/app/**) — esse é
// o mecanismo real de isolamento, não opcional.
//
// O fallback via AsyncLocalStorage (withOrganization/getCurrentOrganizationId
// em @/lib/tenant-context) NÃO é confiável neste projeto: testado e
// confirmado que o contexto se perde mesmo em creates simples de uma única
// operação (não só em queries com include relacional) — provavelmente
// relacionado a como o driver adapter/pool do pg agenda as continuações
// internas do Prisma. Por isso o fallback nunca deve ser a única fonte de
// organizationId; ele só evita reescrever tudo com "as never" e ainda serve
// pra lançar um erro alto (em vez de vazar dado) se algum call site futuro
// esquecer de passar organizationId explicitamente.
const TENANT_SCOPED_MODELS = new Set([
  "Person",
  "Property",
  "Media",
  "PropertyStatusHistory",
  "Interaction",
  "Deal",
  "PortalListing",
  "FeatureOption",
  "PropertyTypeOption",
  "OrganizationSettings",
  "ActivityLog",
  "Notification",
  "AiUsage",
  "BillingEvent",
  "Subscription",
  "Invoice",
]);

const WHERE_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

function temOrganizationId(valor: unknown): boolean {
  return typeof valor === "object" && valor !== null && "organizationId" in valor;
}

function resolverOrganizationId(model: string, operation: string): string {
  const organizationId = getCurrentOrganizationId();
  if (!organizationId) {
    throw new Error(
      `Consulta em ${model}.${operation} sem organizationId explícito e fora de um ` +
        `contexto withOrganization() — passe organizationId no where/data ou envolva ` +
        `a chamada em withOrganization(organizationId, ...).`
    );
  }
  return organizationId;
}

function buildPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

  return new PrismaClient({ adapter }).$extends({
    name: "tenant-scoping",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const scopedArgs = { ...(args as Record<string, unknown>) };

          if (WHERE_OPERATIONS.has(operation)) {
            const where = scopedArgs.where as object | undefined;
            if (!temOrganizationId(where)) {
              const organizationId = resolverOrganizationId(model, operation);
              scopedArgs.where = { ...where, organizationId };
            }
          }

          if (operation === "create") {
            const data = scopedArgs.data as object | undefined;
            if (!temOrganizationId(data)) {
              const organizationId = resolverOrganizationId(model, operation);
              scopedArgs.data = { ...data, organizationId };
            }
          }

          if (operation === "createMany") {
            const data = scopedArgs.data;
            if (Array.isArray(data)) {
              if (!data.every(temOrganizationId)) {
                const organizationId = resolverOrganizationId(model, operation);
                scopedArgs.data = data.map((item) => ({ ...item, organizationId }));
              }
            } else if (!temOrganizationId(data)) {
              const organizationId = resolverOrganizationId(model, operation);
              scopedArgs.data = { ...(data as object | undefined), organizationId };
            }
          }

          if (operation === "upsert") {
            const where = scopedArgs.where as object | undefined;
            const create = scopedArgs.create as object | undefined;
            if (!temOrganizationId(where) || !temOrganizationId(create)) {
              const organizationId = resolverOrganizationId(model, operation);
              scopedArgs.where = { ...where, organizationId };
              scopedArgs.create = { ...create, organizationId };
            }
          }

          return query(scopedArgs as never);
        },
      },
    },
  });
}

type ScopedPrismaClient = ReturnType<typeof buildPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ScopedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? buildPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
