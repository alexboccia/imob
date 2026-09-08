"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { logPlatformActivity } from "@/lib/platform/audit";
import { gerarTokenAcesso, hashToken, expiracaoConvite } from "@/lib/acesso-token";
import { enviarEmailConviteOwner } from "@/lib/email";
import { logger } from "@/lib/logger";
import { type ActionState, erroGenerico, erroValidacao } from "@/lib/action-result";
import { SLUGS_RESERVADOS } from "@/lib/platform/reserved-words";
import { bootstrapOrganizacao } from "@/lib/bootstrap-organizacao";

const criarOrganizationSchema = z.object({
  name: z.string().min(2, "Informe o nome da organização."),
  slug: z
    .string()
    .min(2, "Informe o slug.")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens.")
    .refine((valor) => !SLUGS_RESERVADOS.has(valor), {
      message: "Esse slug é reservado pelo sistema — escolha outro.",
    }),
  cnpj: z.string().optional().or(z.literal("")),
  planId: z.string().min(1, "Selecione um plano."),
  responsavelNome: z.string().min(2, "Informe o nome do responsável."),
  responsavelEmail: z.string().email("E-mail do responsável inválido."),
});

export type EstadoCriarOrganization = ActionState & { linkConvite?: string };

// Cria Organization + User (reusa se o e-mail já existir) + OrganizationMember
// (OWNER, status INVITED — não ACTIVE, é o convite que ativa) + o token de
// convite, tudo em UMA transação — se qualquer etapa falhar, rollback
// completo, nunca fica Organization pela metade. Ver plano, decisões #6
// e a seção "Create Organization".
export async function criarOrganization(
  _prevState: EstadoCriarOrganization,
  formData: FormData
): Promise<EstadoCriarOrganization> {
  const operador = await requirePlatformOperator();

  const parsed = criarOrganizationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;

  const slugExistente = await prisma.organization.findUnique({
    where: { slug: dados.slug },
    select: { id: true },
  });
  if (slugExistente) return erroGenerico("Esse slug já está em uso.");

  const plano = await prisma.plan.findUnique({
    where: { id: dados.planId },
    select: { id: true, active: true, isTrial: true, trialDays: true },
  });
  if (!plano) return erroGenerico("Plano inválido.");
  if (!plano.active) return erroGenerico("Este plano está inativo e não pode ser atribuído a novas organizações.");

  // Gerado ANTES da transação (função pura, não bate no banco) — só o
  // hash é persistido; o token bruto só existe em memória até o e-mail
  // ser montado logo abaixo, nunca é logado nem gravado em lugar nenhum.
  const token = gerarTokenAcesso();
  const tokenHash = hashToken(token);
  const expiresAt = expiracaoConvite();

  let organizationId: string;
  let userId: string;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Fase 26 — a criação em si saiu daqui para
      // src/lib/bootstrap-organizacao.ts, compartilhada com o cadastro
      // self-service. O que sobra aqui é o que é ESPECÍFICO do Super
      // Admin: o vínculo nasce INVITED (o dono ainda não provou posse do
      // e-mail) e um convite é emitido para que ele prove.
      const criado = await bootstrapOrganizacao(tx, {
        nomeOrganizacao: dados.name,
        slug: dados.slug,
        cnpj: dados.cnpj,
        plano: { id: plano.id, isTrial: plano.isTrial, trialDays: plano.trialDays },
        nomeResponsavel: dados.responsavelNome,
        emailResponsavel: dados.responsavelEmail,
        statusVinculo: "INVITED",
      });

      await tx.inviteToken.create({
        data: {
          userId: criado.userId,
          organizationId: criado.organizationId,
          tokenHash,
          expiresAt,
        },
      });

      return criado;
    });

    organizationId = resultado.organizationId;
    userId = resultado.userId;
  } catch (erro) {
    logger.error("Falha ao criar Organization — transação revertida, nada foi salvo", erro, {
      platformOperatorId: operador.id,
      modulo: "platform",
    });
    return erroGenerico(
      "Não foi possível criar a organização. Nenhum dado foi salvo — tente novamente."
    );
  }

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "ORGANIZATION_CREATED",
    entity: "Organization",
    entityId: organizationId,
    organizationId,
    metadata: { name: dados.name, slug: dados.slug, planId: dados.planId },
  });
  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "OWNER_CREATED",
    entity: "User",
    entityId: userId,
    organizationId,
    metadata: { email: dados.responsavelEmail },
  });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const linkConvite = `${baseUrl}/app/convite/${token}`;

  // Diferente do e-mail de contato de lead (fail-soft, ninguém percebe se
  // falhar): aqui o resultado é tratado explicitamente — se o envio
  // falhar, devolve o link pra UI mostrar, em vez de deixar o convite no
  // limbo sem ninguém saber que ele nunca chegou.
  const { enviado } = await enviarEmailConviteOwner({
    organizationId,
    para: dados.responsavelEmail,
    nomeOrganizacao: dados.name,
    linkConvite,
  });

  if (!enviado) {
    return {
      success: true,
      message:
        "Organização criada, mas o e-mail de convite não pôde ser enviado. Copie o link abaixo e envie manualmente.",
      linkConvite,
    };
  }

  return {
    success: true,
    message: `Organização criada. Convite enviado para ${dados.responsavelEmail}.`,
  };
}
