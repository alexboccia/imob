import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { platformAuthConfig } from "@/lib/platform/auth.config";
import { normalizarHostname, hostnameReservado } from "@/lib/platform/hostname";
import { resolverOrgSlugPorHostname } from "@/lib/platform/organization-domain";

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

// Fase P.10 — tenant resolver por host (custom domain / subdomínio
// easymob). Roda SÓ pra paths fora de /app e /platform (ver dispatch em
// proxy() abaixo) — /app e /platform continuam 100% host-agnósticos,
// nenhuma mudança de comportamento ali. Reaproveita 100% do sistema de
// resolução por slug já existente ([orgSlug]/layout.tsx e cada
// page.tsx por baixo dele, inalterados) — o único trabalho novo aqui é
// traduzir Host → slug e reescrever o pathname, nunca resolver tenant
// por conta própria.
//
// Decisão de header confiável (P.10.2.1): só request.headers.get("host")
// é usado — nunca X-Forwarded-Host (spoofável pelo cliente; mesmo
// racional já documentado pra IP em src/lib/client-ip.ts, que só confia
// em do-connecting-ip, nunca no primeiro x-forwarded-for). Isto assume
// que o Host recebido pelo processo Node já é o hostname original do
// cliente — comportamento padrão de custom domain na DigitalOcean App
// Platform, mas ainda NÃO verificado contra infra real (README confirma
// que nenhum domínio customizado está configurado lá hoje). A primeira
// ativação de um domínio customizado real em produção deve confirmar
// isso antes de liberar tráfego de fato (ver relatório da Fase P.10).
async function resolverTenantPorHost(req: NextRequest): Promise<NextResponse | undefined> {
  const hostBruto = req.headers.get("host");
  if (!hostBruto) return undefined;

  const host = normalizarHostname(hostBruto);
  if (!host) return undefined;

  // Fast path: host conhecido/reservado (domínio canônico da plataforma,
  // origin da DigitalOcean, localhost) — zero query nova, delega pro
  // comportamento atual (rewrites de next.config.ts pro PUBLIC_ORG_SLUG,
  // ou 404 natural). Cobre 100% do tráfego de hoje sem custo adicional —
  // só requisições pra um host desconhecido chegam a consultar o banco
  // (ver P.10.15).
  if (hostnameReservado(host)) return undefined;

  const slug = await resolverOrgSlugPorHostname(host);
  if (!slug) {
    // Domínio desconhecido, ou cadastrado mas ainda PENDING/FAILED/
    // DISABLED — nunca serve o conteúdo de NENHUMA organização (nem a
    // padrão) sob um host não reconhecido/não confirmado como tenant
    // ativo (ver P.10.2).
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = req.nextUrl.clone();
  url.pathname = url.pathname === "/" ? `/${slug}` : `/${slug}${url.pathname}`;
  return NextResponse.rewrite(url);
}

export default async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/platform")) {
    return (platformMiddleware as MiddlewareFn)(req);
  }
  if (req.nextUrl.pathname.startsWith("/app")) {
    return (appMiddleware as MiddlewareFn)(req);
  }

  const resposta = await resolverTenantPorHost(req);
  return resposta ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/platform/:path*",
    // Fase P.10 — todo o resto (site público), exceto /app, /platform,
    // /api, assets internos do Next e arquivos estáticos (qualquer path
    // com extensão) — mesmo padrão de negative-matching recomendado pela
    // doc oficial de Proxy, ver node_modules/next/dist/docs.
    "/((?!app|platform|api|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)",
  ],
};
