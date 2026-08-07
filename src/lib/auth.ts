import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        senha: {},
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const senha = credentials?.senha as string | undefined;
        if (!email || !senha) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const senhaValida = await bcrypt.compare(senha, user.passwordHash);
        if (!senhaValida) return null;

        // Um usuário pode pertencer a várias organizações no futuro; por
        // enquanto, usamos o primeiro vínculo ativo.
        const membership = await prisma.organizationMember.findFirst({
          where: { userId: user.id, status: "ACTIVE" },
        });
        if (!membership) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          organizationId: membership.organizationId,
          organizationMemberId: membership.id,
          role: membership.role,
        };
      },
    }),
  ],
});
