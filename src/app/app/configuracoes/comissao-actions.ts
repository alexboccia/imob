"use server";

// Fase 122-B (AUD-121-006) — Server Actions da configuração de
// percentual PADRÃO de comissão por imobiliária. Ver o racional completo
// (o que isto é e, principalmente, o que NÃO é) em
// src/lib/comissao-configuracao.ts.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { temPapel, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { type ActionState, erroAcessoNegado, erroGenerico, sucesso } from "@/lib/action-result";
import { interpretarPercentualComissaoPadrao } from "@/lib/comissao-configuracao";
import { decimalParaValor } from "@/lib/valor-fechamento";
import { logActivity, diffAuditavel } from "@/lib/activity-log";

// Leitura — usada para preencher o formulário de configuração e (no
// futuro, quando/if o produto decidir) sugerir o percentual na tela de
// negociação. null = organização não configurou nenhum padrão ainda.
export async function buscarComissaoPadrao(organizationId: string): Promise<number | null> {
  return withOrganization(organizationId, async () => {
    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { defaultCommissionPercent: true },
    });
    return decimalParaValor(settings?.defaultCommissionPercent);
  });
}

// Escrita — mesmo portão de permissão da tela de Configurações
// (PAPEIS_GESTAO_CONFIGURACOES, não um papel "financeiro" próprio: o
// produto não tem esse papel, ver a mesma limitação documentada em
// clientes/actions.ts para adicionarParticipante).
export async function salvarComissaoPadrao(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_CONFIGURACOES)) {
    return erroAcessoNegado();
  }

  const organizationId = await requireOrganizationId();

  const interpretado = interpretarPercentualComissaoPadrao(formData.get("percentualComissaoPadrao"));
  if (!interpretado.ok) return erroGenerico(interpretado.erro);

  await withOrganization(organizationId, async () => {
    // Antes da mudança, pra poder registrar o antes/depois — uma
    // configuração financeira (percentual de comissão padrão) é
    // exatamente o tipo de "alteração administrativa importante" que a
    // auditoria deve capturar (nunca tinha nenhum log até aqui).
    const anterior = await prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { defaultCommissionPercent: true },
    });
    const valorAnterior = decimalParaValor(anterior?.defaultCommissionPercent);

    // Upsert + log na mesma transação: se o log falhar, a mudança de
    // configuração reverte junto (ver src/lib/activity-log.ts).
    await prisma.$transaction(async (tx) => {
      await tx.organizationSettings.upsert({
        where: { organizationId },
        update: { defaultCommissionPercent: interpretado.valor },
        create: { organizationId, defaultCommissionPercent: interpretado.valor },
      });

      await logActivity(
        {
          organizationId,
          userId: session.user.id,
          entity: "OrganizationSettings",
          action: "default_commission_percent_updated",
          payload: diffAuditavel(
            { percentual: valorAnterior },
            { percentual: interpretado.valor },
            ["percentual"]
          ),
        },
        tx
      );
    });
  });

  revalidatePath("/app/configuracoes");
  return sucesso("Percentual padrão de comissão salvo.");
}
