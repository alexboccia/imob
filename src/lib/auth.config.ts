import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/app/login",
  },
  providers: [],
  callbacks: {
    jwt: ({ token, user, trigger, session }) => {
      if (user) {
        token.organizationId = user.organizationId;
        token.organizationMemberId = user.organizationMemberId;
        token.role = user.role;
      }
      // Fase 26 — TROCA DE ORGANIZAÇÃO. Este ramo só roda via
      // unstable_update, chamado por uma Server Action que já provou, no
      // banco, que o vínculo existe, está ACTIVE e é desta identidade.
      //
      // Este callback é edge-safe (roda também no proxy, sem Prisma) e
      // por isso NÃO pode validar nada por conta própria — quem valida é
      // a action. E a rede de segurança é outra: requireOrganizationId
      // revalida vínculo e identidade a cada requisição, então um JWT
      // com organizationId sem membership não concede acesso nenhum.
      //
      // Os três campos viajam JUNTOS de propósito: papel e vínculo
      // sempre pertencem à organização gravada no mesmo token, o que
      // torna impossível operar no tenant B com o papel do tenant A.
      if (trigger === "update" && session && typeof session === "object") {
        // As claims chegam DENTRO de `user`: é o formato que
        // unstable_update({ user: {...} }) entrega a este callback. Ler
        // a raiz não quebrava nada em voz alta — só fazia a troca de
        // organização não acontecer, com a tela voltando calada para a
        // organização anterior.
        const dados = (session as { user?: Record<string, unknown> }).user ?? {};
        const organizationId = typeof dados.organizationId === "string" ? dados.organizationId : undefined;
        const organizationMemberId =
          typeof dados.organizationMemberId === "string" ? dados.organizationMemberId : undefined;
        const role = typeof dados.role === "string" ? dados.role : undefined;
        if (organizationId && organizationMemberId && role) {
          token.organizationId = organizationId;
          token.organizationMemberId = organizationMemberId;
          token.role = role;
        }
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
