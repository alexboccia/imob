import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/app/login",
  },
  providers: [],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.organizationId = user.organizationId;
        token.organizationMemberId = user.organizationMemberId;
        token.role = user.role;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.user.id = token.sub as string;
      session.user.organizationId = token.organizationId as string | undefined;
      session.user.organizationMemberId = token.organizationMemberId as string | undefined;
      session.user.role = token.role as string | undefined;
      // `iat` é preenchido pelo próprio Auth.js a cada emissão do JWT.
      // Repassá-lo para a sessão é o que permite a requireOrganizationId
      // recusar uma sessão anterior a uma troca de senha.
      session.user.emitidaEm = typeof token.iat === "number" ? token.iat : undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;
