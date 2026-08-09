import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { platformAuthConfig } from "@/lib/platform/auth.config";

// Next.js só permite um arquivo de middleware — as duas áreas (/app,
// identidade de OrganizationMember; /platform, identidade de
// PlatformOperator) são ramificadas por pathname aqui. Cada instância
// continua edge-safe (sem providers), só lê o JWT do cookie próprio de
// cada uma. Isso é só a primeira camada: toda page/action de /platform
// TAMBÉM chama requirePlatformOperator() (que revalida no banco), nunca
// confiando só nesta checagem de middleware.
const { auth: authApp } = NextAuth(authConfig);
const { auth: authPlatform } = NextAuth(platformAuthConfig);

const appMiddleware = authApp((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/app/login";
  // Página pública de aceitação de convite do OWNER — isenta de sessão,
  // mesmo tratamento que /app/login já recebe.
  const isConvitePage = req.nextUrl.pathname.startsWith("/app/convite/");

  if (!isLoggedIn && !isLoginPage && !isConvitePage) {
    const loginUrl = new URL("/app/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/app", req.nextUrl.origin));
  }

  return NextResponse.next();
});

const platformMiddleware = authPlatform((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/platform/login";

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/platform/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/platform", req.nextUrl.origin));
  }

  return NextResponse.next();
});

// O tipo de retorno de auth() colapsa a união NextAuthMiddleware |
// AppRouteHandlerFn de um jeito que o TS infere um 2º parâmetro
// incompatível com o uso real de middleware — não usamos esse parâmetro
// (nenhuma lógica aqui depende de waitUntil/params), então a assinatura é
// normalizada uma vez aqui em vez de um cast poluindo cada chamada.
type MiddlewareFn = (req: NextRequest) => ReturnType<typeof appMiddleware>;

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/platform")) {
    return (platformMiddleware as MiddlewareFn)(req);
  }
  return (appMiddleware as MiddlewareFn)(req);
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*"],
};
