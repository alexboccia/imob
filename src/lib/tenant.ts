import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// cache() por request: requireOrganizationId() é chamado várias vezes na
// mesma requisição (várias actions/componentes) — sem isso, cada chamada
// repetiria a mesma query de "a org ainda está ativa?".
const buscarStatusOrganization = cache(async (organizationId: string) => {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    select: { active: true },
  });
});

// Resolve o tenant da sessão autenticada (área /app). Redireciona pro
// login se não houver sessão, e pra /app/suspenso se a organização foi
// suspensa pelo Super Admin (/platform) — mesmo cinto de segurança que já
// existia para "sem sessão", agora cobrindo "sessão válida, mas
// organização suspensa". Cobre automaticamente toda action/page/rota que
// já chama esta função (upload incluso), sem precisar espalhar a
// checagem. Ver plano em /Users/alexboccia/.claude/plans/
// glittery-noodling-harp.md, decisão #7.
export async function requireOrganizationId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/app/login");

  const organization = await buscarStatusOrganization(session.user.organizationId);
  if (!organization || !organization.active) redirect("/app/suspenso");

  return session.user.organizationId;
}

// Resolução do site público por slug de URL. cache() por request: várias
// pages/actions da mesma árvore [orgSlug] chamam isso na mesma requisição.
// Retorna null (não lança) pra slug inexistente — cada chamador decide o
// que fazer (layout faz notFound(), uma Server Action devolve erro
// genérico). NUNCA tratar o resultado desta função como "seguro só por ter
// vindo do banco" sem checar o campo `active` quando a operação exigir
// organização ativa — ver plano, seção "Modelo de isolamento e fronteira de
// segurança".
export const getOrganizationBySlug = cache(async (slug: string) => {
  return prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, active: true },
  });
});
