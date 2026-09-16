"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { temPapel, PAPEIS_GESTAO_CATALOGOS } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import {
  type ActionState,
  erroAcessoNegado,
  erroGenerico,
  erroValidacao,
  sucesso,
} from "@/lib/action-result";
import { empreendimentoSchema } from "@/lib/empreendimento";

// =======================================================================
// Gestão de empreendimentos (Fase 38)
// =======================================================================
// AUTORIZAÇÃO: PAPEIS_GESTAO_CATALOGOS (OWNER/ADMIN/MANAGER) — o MESMO
// conjunto que já governa os outros dois catálogos por organização
// (características e tipos de imóvel). Nenhum papel novo foi criado, e
// nenhuma permissão foi ampliada: BROKER e ASSISTANT não gerenciam
// catálogo hoje e continuam não gerenciando.
//
// Quem VINCULA uma unidade a um empreendimento é outra coisa: isso
// acontece no formulário do imóvel e segue o gate de quem já pode editar
// imóvel — ver atualizarImovel/criarImovel, inalterados nesse aspecto.
// A separação é deliberada: declarar que o empreendimento existe é
// gestão de catálogo; dizer a que empreendimento uma unidade pertence é
// cadastro de imóvel.
// =======================================================================

function revalidarEmpreendimentos() {
  revalidatePath("/app/empreendimentos");
  // O seletor do formulário de imóvel lê a mesma lista.
  revalidatePath("/app/imoveis");
}

export async function criarEmpreendimento(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_CATALOGOS)) {
    return erroAcessoNegado("Você não tem permissão para gerenciar empreendimentos.");
  }

  const parsed = empreendimentoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);

  const organizationId = await requireOrganizationId();
  return withOrganization(organizationId, async () => {
    try {
      await prisma.development.create({
        data: { organizationId, name: parsed.data.nome },
      });
    } catch (erro) {
      // @@unique([organizationId, name]) — nome repetido DENTRO desta
      // organização. Erro esperado e tratado, nunca um 500: dois
      // empreendimentos com o mesmo nome na mesma imobiliária seriam
      // indistinguíveis na hora de vincular a unidade.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        return erroGenerico("Já existe um empreendimento com esse nome.");
      }
      throw erro;
    }
    revalidarEmpreendimentos();
    return sucesso("Empreendimento criado.");
  });
}

export async function renomearEmpreendimento(
  developmentId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_CATALOGOS)) {
    return erroAcessoNegado("Você não tem permissão para gerenciar empreendimentos.");
  }

  const parsed = empreendimentoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);

  const organizationId = await requireOrganizationId();
  return withOrganization(organizationId, async () => {
    try {
      // updateMany com organizationId no WHERE: um id de outro tenant
      // casa ZERO linhas em vez de renomear o empreendimento alheio.
      const atualizado = await prisma.development.updateMany({
        where: { id: developmentId, organizationId },
        data: { name: parsed.data.nome },
      });
      if (atualizado.count === 0) {
        return erroAcessoNegado("Empreendimento não encontrado.");
      }
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        return erroGenerico("Já existe um empreendimento com esse nome.");
      }
      throw erro;
    }
    revalidarEmpreendimentos();
    return sucesso("Nome atualizado.");
  });
}

export async function removerEmpreendimento(
  developmentId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // Excluir não lê nada do formulário — o alvo é o id do binding.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_CATALOGOS)) {
    return erroAcessoNegado("Você não tem permissão para gerenciar empreendimentos.");
  }

  const organizationId = await requireOrganizationId();
  return withOrganization(organizationId, async () => {
    const alvo = await prisma.development.findFirst({
      where: { id: developmentId, organizationId },
      select: { id: true, _count: { select: { properties: true } } },
    });
    if (!alvo) return erroAcessoNegado("Empreendimento não encontrado.");

    // EXCLUIR EMPREENDIMENTO NUNCA MEXE EM IMÓVEL.
    //
    // A FK é SET NULL, então o banco desvincularia as unidades em
    // silêncio — e desvincular trinta imóveis de uma vez é destrutivo na
    // prática, mesmo sem apagar nenhuma linha. Por isso a action RECUSA
    // enquanto houver unidade vinculada, e diz o que fazer. Mesmo
    // raciocínio de removerParticipante, que recusa remover uma
    // participação com pagamento registrado.
    if (alvo._count.properties > 0) {
      return erroGenerico(
        alvo._count.properties === 1
          ? "Este empreendimento tem 1 unidade vinculada. Desvincule o imóvel antes de excluir."
          : `Este empreendimento tem ${alvo._count.properties} unidades vinculadas. Desvincule os imóveis antes de excluir.`
      );
    }

    await prisma.development.deleteMany({ where: { id: developmentId, organizationId } });
    revalidarEmpreendimentos();
    return sucesso("Empreendimento excluído.");
  });
}
