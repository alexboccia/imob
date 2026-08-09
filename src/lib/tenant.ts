import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Resolve o tenant da sessão autenticada (área /app). Redireciona pro
// login se não houver sessão — mesma convenção já usada em cada action.
export async function requireOrganizationId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/app/login");
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
