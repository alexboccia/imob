import type { NextAuthConfig } from "next-auth";

// Config edge-safe (sem providers) da instância de auth de PLATAFORMA —
// identidade completamente separada de @/lib/auth.config.ts (que é da área
// /app, de OrganizationMember). Usada tanto pelo proxy (middleware, edge
// runtime, só lê o JWT) quanto embrulhada pelos providers reais em
// @/lib/platform/auth.ts (Node runtime).
//
// Nomes de cookie e secret PRÓPRIOS de propósito (nunca reaproveitar os de
// @/lib/auth.config.ts): garante que uma sessão de /app e uma sessão de
// /platform no mesmo navegador nunca colidam, e que rotacionar um secret
// não invalide sessões do outro. Ver plano em /Users/alexboccia/.claude/
// plans/glittery-noodling-harp.md, decisão #2.
const cookiePrefix = "platform";
const useSecureCookies = process.env.NODE_ENV === "production";

export const platformAuthConfig = {
  secret: process.env.PLATFORM_AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/platform/login",
  },
  providers: [],
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}-session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: `${cookiePrefix}-csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}-callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.platformOperatorId = user.platformOperatorId;
        token.platformRole = user.platformRole;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.user.id = token.sub as string;
      session.user.platformOperatorId = token.platformOperatorId as string | undefined;
      session.user.platformRole = token.platformRole as string | undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;
