"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { logPlatformActivity } from "@/lib/platform/audit";
import { gerarTokenConvite, hashToken, expiracaoConvite } from "@/lib/platform/invite";
import { enviarEmailConviteOwner } from "@/lib/email";
import { logger } from "@/lib/logger";
import { type ActionState, erroGenerico, erroValidacao } from "@/lib/action-result";

// Nunca podem colidir com um segmento de rota do sistema — mesma reserva
// já prevista no plano original de multi-tenancy (v2), agora realmente
// aplicada na única superfície que cria Organization.slug.
const SLUGS_RESERVADOS = new Set([
  "app",
  "api",
  "platform",
  "_next",
  "admin",
  "convite",
  "www",
  "imoveis",
  "contato",
  "anuncie",
  "vendidos",
]);

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
  const token = gerarTokenConvite();
  const tokenHash = hashToken(token);
  const expiresAt = expiracaoConvite();

  let organizationId: string;
  let userId: string;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dados.name,
          slug: dados.slug,
          cnpj: dados.cnpj || null,
          planId: dados.planId,
          active: true,
        },
      });

      // Fase P.9: trial é server-side, nunca aceita data do formulário —
      // início/fim sempre calculados aqui a partir de Plan.trialDays no
      // exato momento da criação. Só cria Subscription quando o plano
      // escolhido é de trial (plan.isTrial); planos pagos não geram
      // nenhuma linha de Subscription nesta fase (zero lógica de
      // cobrança real ainda, ver comentário do model no schema).
      if (plano.isTrial && plano.trialDays !== null) {
        const agora = new Date();
        await tx.subscription.create({
          data: {
            organizationId: organization.id,
            planId: dados.planId,
            status: "TRIALING",
            currentPeriodStart: agora,
            currentPeriodEnd: new Date(agora.getTime() + plano.trialDays * 24 * 60 * 60 * 1000),
          },
        });
      }

      // E-mail já existe como User (ex: mesma pessoa convidada pra outra
      // organização no futuro) -> reusa o User existente. A barreira real
      // de "não pode logar ainda NESTA org" é o status INVITED do
      // OrganizationMember criado abaixo — específico deste vínculo, nunca
      // um `active:false` global no User, que travaria acesso dele a
      // QUALQUER outra org onde já seja membro ativo.
      let user = await tx.user.findUnique({ where: { email: dados.responsavelEmail } });
      if (!user) {
        // Hash de um UUID aleatório — nunca alcançável por senha real
        // digitada por alguém. Defesa extra (auth.ts já barra
        // !user.active), não a barreira principal.
        const senhaSentinela = await bcrypt.hash(randomUUID(), 10);
        user = await tx.user.create({
          data: {
            name: dados.responsavelNome,
            email: dados.responsavelEmail,
            passwordHash: senhaSentinela,
            active: false,
          },
        });
      }

      const member = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: "OWNER",
          status: "INVITED",
        },
      });

      await tx.ownerInviteToken.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          tokenHash,
          expiresAt,
        },
      });

      return { organization, user, member };
    });

    organizationId = resultado.organization.id;
    userId = resultado.user.id;
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
