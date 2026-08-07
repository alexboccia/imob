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

// TODO Fase 3: resolver por orgSlug na URL (easymob.com/{orgSlug}). Até lá,
// o site público inteiro resolve para a única organização configurada.
const PUBLIC_ORG_SLUG = process.env.PUBLIC_ORG_SLUG ?? "boccia";

export async function getPublicOrganizationId(): Promise<string> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: PUBLIC_ORG_SLUG },
    select: { id: true },
  });
  return organization.id;
}
