import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { platformAuthConfig } from "@/lib/platform/auth.config";
import { obterIpCliente } from "@/lib/client-ip";
import { obterKvStore } from "@/lib/kv-store";
import { verificarBloqueioLogin, registrarFalhaLogin, registrarSucessoLogin } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { PlatformRole } from "@/generated/prisma/client";

// Prefixo de chave PRÓPRIO no rate limit — uma conta de PlatformOperator
// comprometida tem blast radius de todos os tenants, então o balde de
// tentativas por IP/e-mail é isolado do login de /app, e o limiar é mais
// restritivo (3 em vez de 5).
const PREFIXO_RATE_LIMIT = "platform-login";
const TENTATIVAS_PERMITIDAS = 3;

// signIn()/signOut() SERVER-SIDE, não o client de next-auth/react — o
// client resolve a rota via um singleton de módulo (__NEXTAUTH.basePath)
// compartilhado entre requisições no processo Node, o que bateria na rota
// de /app sem tratamento especial. O form de login de /platform chama
// este `signIn` a partir de uma Server Action. Ver plano, decisão #2.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...platformAuthConfig,
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
          if (store) {
            await registrarFalhaLogin(
              store,
              { ip, email: emailNormalizado },
              PREFIXO_RATE_LIMIT,
              TENTATIVAS_PERMITIDAS
            );
          }
          return null;
        }

        // Diferente do login de /app: aqui não há um wrapper de rota HTTP
        // pra interceptar antes do NextAuth (signIn() server-side não faz
        // requisição real) — a checagem de bloqueio já ativo precisa
        // acontecer aqui dentro, antes de qualquer bcrypt/consulta.
        if (store) {
          const bloqueio = await verificarBloqueioLogin(
            store,
            { ip, email: emailNormalizado },
            PREFIXO_RATE_LIMIT
          );
          if (!bloqueio.permitido) {
            // Nível error (não warn): blast radius de uma conta de
            // plataforma comprometida é maior que o de um tenant.
            logger.error("Login de plataforma bloqueado por excesso de tentativas", undefined, {
              modulo: "platform-auth",
            });
            return null;
          }
        }

        if (!email || !senha) return falhou();

        const operador = await prisma.platformOperator.findUnique({ where: { email } });
        if (!operador || !operador.active) return falhou();

        const senhaValida = await bcrypt.compare(senha, operador.passwordHash);
        if (!senhaValida) return falhou();

        if (store) {
          await registrarSucessoLogin(store, { ip, email: emailNormalizado }, PREFIXO_RATE_LIMIT);
        }

        return {
          id: operador.id,
          name: operador.name,
          email: operador.email,
          platformOperatorId: operador.id,
          platformRole: operador.role,
        };
      },
    }),
  ],
});

// Funil único de autorização de /platform — mesma convenção de
// requireOrganizationId() em @/lib/tenant.ts. NUNCA confia só no claim do
// JWT: revalida PlatformOperator.active no banco a cada chamada, cobrindo
// a janela de um operador desativado depois do JWT já ter sido emitido.
export async function requirePlatformOperator(): Promise<{
  id: string;
  role: PlatformRole;
}> {
  const session = await auth();
  if (!session?.user?.platformOperatorId) redirect("/platform/login");

  const operador = await prisma.platformOperator.findUnique({
    where: { id: session.user.platformOperatorId },
    select: { id: true, role: true, active: true },
  });
  if (!operador || !operador.active) redirect("/platform/login");

  return { id: operador.id, role: operador.role };
}
