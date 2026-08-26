"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { temPapel, PAPEIS_GESTAO_CATALOGOS } from "@/lib/authorization";
import {
  type ActionState,
  erroAcessoNegado,
  erroValidacao,
  sucesso,
} from "@/lib/action-result";
import { tagFacetas } from "@/lib/cache-tags";

const criarSchema = z.object({
  nome: z.string().min(2, "Informe um nome com ao menos 2 caracteres."),
  categoria: z.enum(["RESIDENTIAL", "COMMERCIAL"]),
});

export async function criarTipoImovel(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_CATALOGOS)) {
    return erroAcessoNegado();
  }

  const parsed = criarSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const { nome, categoria } = parsed.data;

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    // organizationId repetido no nível raiz do `where` (redundante com o
    // já presente dentro de `organizationId_category_name`) — mesmo bug e
    // mesma correção já aplicados em criarCaracteristica
    // (src/app/app/caracteristicas/actions.ts): o middleware de
    // tenant-scoping (src/lib/prisma.ts) só reconhece "tem organizationId"
    // olhando as chaves de PRIMEIRO NÍVEL do objeto; aninhado só dentro da
    // chave composta, caía no fallback via AsyncLocalStorage — documentado
    // como não confiável — e lançava erro em toda criação real (HTTP 500,
    // reproduzido via UI real antes desta correção). Mesma regra de
    // negócio (upsert idempotente por org+categoria+nome), nenhuma
    // mudança de domínio.
    await prisma.propertyTypeOption.upsert({
      where: { organizationId_category_name: { organizationId, category: categoria, name: nome }, organizationId },
      update: {},
      create: { organizationId, category: categoria, name: nome },
    });

    revalidatePath("/app/tipos-imovel");
    updateTag(tagFacetas(organizationId));
  });

  return sucesso();
}

export async function removerTipoImovel(id: string): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_CATALOGOS)) {
    return erroAcessoNegado();
  }

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.propertyTypeOption.delete({ where: { id, organizationId } });
    revalidatePath("/app/tipos-imovel");
    updateTag(tagFacetas(organizationId));
  });

  return sucesso();
}
