"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { verificarLimiteImoveis, verificarLimiteFotos, LimiteDoPlanoError } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity-log";
import { type ActionState, erroGenerico } from "@/lib/action-result";
import {
  parseImovelFormData,
  parseMidias,
  camposImovel,
  midiasParaCriar,
} from "@/lib/property-mapper";
import { tagFacetas } from "@/lib/cache-tags";

export async function criarImovel(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const resultado = parseImovelFormData(formData);
  if (!resultado.ok) return resultado.estado;
  const { dados } = resultado;
  const midias = parseMidias(dados.midiasJson);

  const organizationId = await requireOrganizationId();
  try {
    await verificarLimiteImoveis(organizationId);
    // Fase P.9: validado ANTES da transação de criação — a lista de
    // mídias já é a submissão completa (nunca incremental), então checar
    // o tamanho aqui é suficiente, sem depender de count-then-create.
    await verificarLimiteFotos(organizationId, midias.length);
  } catch (erro) {
    if (erro instanceof LimiteDoPlanoError) return erroGenerico(erro.message);
    throw erro;
  }

  const imovel = await withOrganization(organizationId, () =>
    prisma.property.create({
      data: {
        organizationId,
        ...camposImovel(dados),
        // Só definido na criação: quem cadastra o imóvel vira o
        // responsável inicial. A edição não tem campo de UI para
        // reatribuir responsável, então não mexe nesse valor.
        responsibleMemberId: session.user.organizationMemberId ?? null,
        publishedAt: dados.status === "AVAILABLE" ? new Date() : null,
        media: { create: midiasParaCriar(midias, organizationId) },
        statusHistory: {
          create: { previousStatus: null, newStatus: dados.status, organizationId },
        },
      },
    })
  );

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "Property",
    entityId: imovel.id,
    action: "created",
    payload: { title: imovel.title },
  });

  revalidatePath("/app/imoveis");
  updateTag(tagFacetas(organizationId));
  // Redundância deliberada — mesma razão documentada em
  // configuracoes/actions.ts: não consegui confirmar ao vivo que
  // updateTag() dentro do callback aninhado invalida de fato a página
  // pública.
  revalidatePath("/imoveis");
  revalidatePath("/");
  redirect(`/app/imoveis/${imovel.id}?salvo=1`);
}

export async function atualizarImovel(
  imovelId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const resultado = parseImovelFormData(formData);
  if (!resultado.ok) return resultado.estado;
  const { dados } = resultado;
  const midias = parseMidias(dados.midiasJson);

  const organizationId = await requireOrganizationId();
  try {
    await verificarLimiteFotos(organizationId, midias.length);
  } catch (erro) {
    if (erro instanceof LimiteDoPlanoError) return erroGenerico(erro.message);
    throw erro;
  }

  await withOrganization(organizationId, async () => {
    const imovelAtual = await prisma.property.findUniqueOrThrow({
      where: { id: imovelId, organizationId },
      select: { status: true, publishedAt: true },
    });

    const statusMudou = imovelAtual.status !== dados.status;

    await prisma.$transaction([
      prisma.media.deleteMany({ where: { propertyId: imovelId, organizationId } }),
      prisma.property.update({
        where: { id: imovelId, organizationId },
        data: {
          ...camposImovel(dados),
          publishedAt:
            dados.status === "AVAILABLE" && !imovelAtual.publishedAt
              ? new Date()
              : undefined,
          media: { create: midiasParaCriar(midias, organizationId) },
          ...(statusMudou
            ? {
                statusHistory: {
                  create: {
                    previousStatus: imovelAtual.status,
                    newStatus: dados.status,
                    organizationId,
                  },
                },
              }
            : {}),
        },
      }),
    ]);
  });

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "Property",
    entityId: imovelId,
    action: "updated",
  });

  revalidatePath("/app/imoveis");
  revalidatePath(`/app/imoveis/${imovelId}`);
  revalidatePath(`/imoveis/${imovelId}`);
  updateTag(tagFacetas(organizationId));
  // Redundância deliberada — ver nota em criarImovel acima.
  revalidatePath("/imoveis");
  revalidatePath("/");
  redirect(`/app/imoveis/${imovelId}?salvo=1`);
}
