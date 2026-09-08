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

        // Um usuário PODE pertencer a várias organizações — e, desde a
        // Fase 25, isso deixou de ser hipótese: convidar alguém que já
        // tem conta cria um segundo vínculo de verdade.
        //
        // orderBy EXPLÍCITO por isso. Sem ele, `findFirst` devolvia um
        // vínculo qualquer entre os ativos, e a MESMA pessoa podia cair
        // em organizações diferentes a cada login — sem nada na tela
        // explicando por quê. Foi reproduzido: uma suíte inteira passou
        // a falhar porque o login de um usuário com dois vínculos
        // aterrissou no tenant errado.
        //
        // O critério é o vínculo MAIS ANTIGO: a organização onde a
        // pessoa já trabalhava continua sendo a casa dela, e aceitar um
        // convite novo não muda para onde ela entra. Escolher o mais
        // recente faria um convite mudar silenciosamente o destino do
        // login de alguém.
        //
        // Isto é determinismo, não seleção de tenant: um seletor de
        // organização de verdade (trocar de imobiliária dentro do
        // produto) continua sendo trabalho futuro — ver relatório.
        const membership = await prisma.organizationMember.findFirst({
          where: { userId: user.id, status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
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
