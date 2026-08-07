import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";
import { registrarErroJaReportado } from "@/lib/logger";

// Roda uma vez quando a instância do servidor Next sobe. Carrega o
// runtime certo (Node vs Edge) — proxy.ts e rotas `runtime: "edge"` caem
// no segundo caso, tudo o mais (Server Components, Route Handlers, Server
// Actions) cai no primeiro.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Mapeamento rota → módulo de negócio, pra dar o campo "modulo" (contexto
// permitido) automaticamente em todo erro capturado por aqui, sem precisar
// instrumentar individualmente cada Server Action/Route Handler/Server
// Component só pra isso.
function inferirModulo(routePath: string): string {
  if (routePath.startsWith("/app/clientes")) return "crm";
  if (routePath.startsWith("/app/imoveis")) return "properties";
  if (routePath.startsWith("/app/usuarios")) return "users";
  if (routePath.startsWith("/app/configuracoes")) return "settings";
  if (routePath.startsWith("/app/caracteristicas") || routePath.startsWith("/app/tipos-imovel")) {
    return "catalog";
  }
  if (routePath.startsWith("/api/admin/upload")) return "upload";
  if (routePath.startsWith("/api/auth") || routePath.startsWith("/app/login")) return "auth";
  if (routePath.startsWith("/api/debug")) return "observabilidade";
  if (routePath.startsWith("/app")) return "admin";
  return "public-site";
}

// Captura erro de Server Component (routeType "render"), Route Handler
// ("route"), Server Action ("action") e do proxy ("proxy") — os quatro
// `routeType` que o Next passa aqui. Chama Sentry.captureRequestError
// (helper oficial do SDK pra esse hook, já enriquece o evento com
// path/method/routeType) uma única vez, e usa o logger só pra linha
// estruturada de console — não logger.error(), porque isso mandaria o
// mesmo erro pra Sentry de novo.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const modulo = inferirModulo(context.routePath);

  Sentry.withScope((scope) => {
    scope.setTag("modulo", modulo);
    scope.setTag("route", context.routePath);
    scope.setTag("routeType", context.routeType);
    Sentry.captureRequestError(error, request, context);
  });

  registrarErroJaReportado("Erro não tratado capturado pelo Next.js", {
    route: context.routePath,
    action: context.routeType,
    modulo,
    method: request.method,
  });
};
