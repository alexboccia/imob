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
  "PersonPreference",
  "Property",
  "Media",
  "PropertyStatusHistory",
  "Interaction",
  "Deal",
  "PortalListing",
  "FeatureOption",
  "PropertyTypeOption",
  "OrganizationSettings",
  "OrganizationBranding",
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

function buildPrismaClients() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const base = new PrismaClient({ adapter });

  const scoped = base.$extends({
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

  return { base, scoped };
}

type ScopedPrismaClient = ReturnType<typeof buildPrismaClients>["scoped"];
type BasePrismaClient = ReturnType<typeof buildPrismaClients>["base"];

const globalForPrisma = globalThis as unknown as {
  prisma: ScopedPrismaClient | undefined;
  prismaPlatform: BasePrismaClient | undefined;
};

const clients =
  globalForPrisma.prisma && globalForPrisma.prismaPlatform
    ? { scoped: globalForPrisma.prisma, base: globalForPrisma.prismaPlatform }
    : buildPrismaClients();

export const prisma = clients.scoped;

// Via de escape cross-tenant explícita — deriva do MESMO client base (mesmo
// adapter/pool de conexão) que `prisma`, nunca instancia um segundo
// PrismaPg (isso dobraria o pool contra o Postgres/Neon por nada).
// Só deve ser importado dentro de src/app/platform/** ou
// src/lib/platform/**, e só depois de requirePlatformOperator() já ter
// validado a sessão — não é um atalho geral, é a única via cross-tenant
// prevista pra consultas que genuinamente precisam ignorar o escopo de
// organização (ex: contagem global de um model tenant-scoped). Toda
// consulta a um model NÃO tenant-scoped (Organization, Plan, User,
// OrganizationMember...) ou com organizationId explícito no where/data já
// funciona com o `prisma` normal, sem precisar disto. Ver plano em
// /Users/alexboccia/.claude/plans/glittery-noodling-harp.md, decisão #4.
export const prismaPlatform = clients.base;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = clients.scoped;
  globalForPrisma.prismaPlatform = clients.base;
}
