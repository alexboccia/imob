import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { logActivity } from "@/lib/activity-log";
import { obterIpCliente } from "@/lib/client-ip";
import { obterKvStore } from "@/lib/kv-store";
import { registrarFalhaLogin, registrarSucessoLogin } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        senha: {},
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const senha = credentials?.senha as string | undefined;

        const store = obterKvStore();
        const ip = obterIpCliente(request.headers);
        const emailNormalizado = email ?? null;

        async function falhou() {
          // Só a checagem de falha incrementa o contador — um bloqueio já
          // ativo é tratado antes disso, no wrapper de src/app/api/auth/
          // [...nextauth]/route.ts, que devolve 429 sem sequer chegar aqui.
          if (store) await registrarFalhaLogin(store, { ip, email: emailNormalizado });
          return null;
        }

        if (!email || !senha) return falhou();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return falhou();

        const senhaValida = await bcrypt.compare(senha, user.passwordHash);
        if (!senhaValida) return falhou();

        // Um usuário pode pertencer a várias organizações no futuro; por
        // enquanto, usamos o primeiro vínculo ativo.
        const membership = await prisma.organizationMember.findFirst({
          where: { userId: user.id, status: "ACTIVE" },
          include: { organization: { select: { active: true } } },
        });
        // Checagem é da organização DESTE vínculo específico, não global —
        // suspender uma org não pode travar acesso do usuário a outra onde
        // ele também seja membro ativo. Ver plano, decisão #7.
        if (!membership || !membership.organization.active) return falhou();

        if (store) await registrarSucessoLogin(store, { ip, email: emailNormalizado });

        await logActivity({
          organizationId: membership.organizationId,
          userId: user.id,
          entity: "Session",
          action: "login",
        });

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
