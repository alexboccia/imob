"use server";

import { revalidatePath } from "next/cache";
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

const criarSchema = z.object({
  nome: z.string().min(2, "Informe um nome com ao menos 2 caracteres."),
  categoria: z.enum(["PROPERTY", "CONDO"]),
});

export async function criarCaracteristica(
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
    // já presente dentro de `organizationId_category_name`) — achado real
    // ao escrever o teste E2E desta feature: o middleware de tenant-scoping
    // (src/lib/prisma.ts) só reconhece "tem organizationId" olhando as
    // chaves de PRIMEIRO NÍVEL do objeto; como aqui ele só existia
    // aninhado dentro da chave composta, a extensão caía no fallback via
    // AsyncLocalStorage (withOrganization/getCurrentOrganizationId) — que
    // o próprio prisma.ts já documenta como "NÃO confiável... testado e
    // confirmado que o contexto se perde mesmo em creates simples de uma
    // única operação" — e lançava exatamente esse erro (nunca coberto por
    // teste antes desta tarefa). Corrigido aqui por ser impossível
    // entregar o redesign com "Adicionar" funcionando sem isso — mesma
    // regra de negócio (upsert idempotente por org+categoria+nome),
    // nenhuma mudança de domínio. FeatureOptionWhereUniqueInput aceita
    // `organizationId` como filtro adicional ao lado da chave composta
    // (confirmado no client gerado). tipos-imovel/actions.ts tem o mesmo
    // padrão frágil — fora de escopo desta tarefa, registrado como
    // finding, não corrigido.
    await prisma.featureOption.upsert({
      where: { organizationId_category_name: { organizationId, category: categoria, name: nome }, organizationId },
      update: {},
      create: { organizationId, category: categoria, name: nome },
    });

    revalidatePath("/app/caracteristicas");
  });

  return sucesso();
}

export async function removerCaracteristica(id: string): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_CATALOGOS)) {
    return erroAcessoNegado();
  }

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.featureOption.delete({ where: { id, organizationId } });
    revalidatePath("/app/caracteristicas");
  });

  return sucesso();
}
