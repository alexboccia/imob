"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity-log";
import { temPapel, PAPEIS_RESOLUCAO_IDENTIDADE } from "@/lib/authorization";
import {
  erroAcessoNegado,
  erroGenerico,
  sucesso,
  type ActionState,
} from "@/lib/action-result";

// =======================================================================
// Resolver uma captação pendente (Fase 24)
// =======================================================================
// O que esta action faz: liga um contato JÁ REGISTRADO a uma Person que
// a pessoa autorizada escolheu, criando a Interaction que o conflito
// impediu de criar no momento do envio.
//
// O que ela deliberadamente NÃO faz:
//
//   - não funde Person A com Person B (merge está fora de escopo);
//   - não sobrescreve e-mail nem telefone do cadastro escolhido — a
//     captação é um FATO recebido, não autorização para editar dado de
//     cliente sem consentimento;
//   - não torna quem resolveu autor da interação (memberId continua
//     null, Fase 15: o contato nasceu do visitante);
//   - não torna quem resolveu responsável por coisa alguma (Fase 11);
//   - não cria PropertyInterest — resolver identidade não é abrir
//     negociação.
//
// O que ela PRESERVA da captação original: o instante do envio, a
// origem, o imóvel e toda a atribuição de tráfego. Um contato de
// segunda-feira continua sendo de segunda-feira no Analytics mesmo que
// só tenha sido resolvido na quarta.

export async function resolverCaptacaoPendente(
  captacaoId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }
  // Camada gerencial: uma captação pendente não tem dono, e escolher a
  // identidade de um contato liga PII a um cadastro.
  if (!temPapel(session.user.role, PAPEIS_RESOLUCAO_IDENTIDADE)) {
    return erroAcessoNegado("Apenas administradores ou gestores podem identificar contatos.");
  }

  const personId = formData.get("personId");
  if (typeof personId !== "string" || !personId) {
    return erroGenerico("Escolha um cliente para vincular o contato.");
  }

  return withOrganization(organizationId, async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      // A Person alvo precisa ser DESTA organização. Um id de outro
      // tenant simplesmente não é encontrado — mesma mensagem genérica
      // de "não encontrado", nunca revelando que existe noutro lugar.
      const pessoa = await tx.person.findFirst({
        where: { id: personId, organizationId },
        select: { id: true },
      });
      if (!pessoa) return { tipo: "pessoa_invalida" as const };

      const captacao = await tx.leadCapture.findFirst({
        where: { id: captacaoId, organizationId },
        select: {
          id: true,
          message: true,
          origin: true,
          propertyId: true,
          occurredAt: true,
          status: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          utmContent: true,
          utmTerm: true,
          referrerHost: true,
        },
      });
      if (!captacao) return { tipo: "nao_encontrada" as const };
      if (captacao.status === "RESOLVED") return { tipo: "ja_resolvida" as const };

      // GUARDA ATÔMICA, e não "lê status depois atualiza": sob duas
      // resoluções simultâneas apenas uma casa a linha com
      // status: "PENDING" (row lock do Postgres), e a segunda vê
      // count: 0. É isso — mais o @unique em resolvedInteractionId —
      // que garante no máximo UMA Interaction por captação.
      const marcada = await tx.leadCapture.updateMany({
        where: { id: captacao.id, organizationId, status: "PENDING" },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolvedPersonId: pessoa.id,
          resolvedByMemberId: session.user.organizationMemberId ?? null,
        },
      });
      if (marcada.count === 0) return { tipo: "ja_resolvida" as const };

      const interacao = await tx.interaction.create({
        data: {
          organizationId,
          personId: pessoa.id,
          propertyId: captacao.propertyId,
          type: "MESSAGE",
          notes: captacao.message,
          origin: captacao.origin,
          // O CONTATO ACONTECEU QUANDO O VISITANTE ENVIOU.
          occurredAt: captacao.occurredAt,
          // memberId ausente => null. Quem resolveu não é o autor: o
          // contato nasceu do visitante (Fase 15).
          utmSource: captacao.utmSource,
          utmMedium: captacao.utmMedium,
          utmCampaign: captacao.utmCampaign,
          utmContent: captacao.utmContent,
          utmTerm: captacao.utmTerm,
          referrerHost: captacao.referrerHost,
        },
        select: { id: true },
      });

      // updateMany com organizationId explícito, e não update por id: o
      // guarda de tenant (src/lib/prisma.ts) exige o organizationId no
      // where de toda operação em model multi-tenant, e ele está certo —
      // um id sozinho não prova a qual organização a linha pertence.
      await tx.leadCapture.updateMany({
        where: { id: captacao.id, organizationId },
        data: { resolvedInteractionId: interacao.id },
      });

      return { tipo: "resolvida" as const, personId: pessoa.id, interactionId: interacao.id };
    });

    if (resultado.tipo === "pessoa_invalida" || resultado.tipo === "nao_encontrada") {
      return erroAcessoNegado("Contato não encontrado.");
    }
    if (resultado.tipo === "ja_resolvida") {
      // Estado, não erro: alguém chegou primeiro e nada foi duplicado.
      revalidatePath("/app/captacoes");
      revalidatePath("/app");
      return sucesso("Este contato já havia sido identificado.");
    }

    // ActivityLog com IDs e nada mais — nenhum nome, e-mail, telefone
    // ou mensagem é copiado para a trilha de auditoria.
    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "LeadCapture",
      entityId: captacaoId,
      action: "lead_identity_resolved",
      payload: { personId: resultado.personId, interactionId: resultado.interactionId },
    });

    revalidatePath("/app/captacoes");
    revalidatePath("/app");
    revalidatePath(`/app/clientes/${resultado.personId}`);
    return sucesso("Contato identificado e adicionado ao histórico do cliente.");
  });
}
