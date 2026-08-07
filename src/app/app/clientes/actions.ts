"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { telefoneValido } from "@/lib/telefone";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity-log";

type EstadoFormulario = { sucesso: boolean; erro?: string };

const pessoaSchema = z.object({
  nome: z.string().min(2, "Informe o nome."),
  email: z
    .string()
    .email("E-mail inválido.")
    .optional()
    .or(z.literal("")),
  telefone: z
    .string()
    .refine((v) => telefoneValido(v), "Telefone inválido.")
    .optional()
    .or(z.literal("")),
  papel: z.enum(["LEAD", "CLIENT", "OWNER"]),
  origem: z
    .enum(["WEBSITE", "REFERRAL", "PORTAL", "INSTAGRAM", "WHATSAPP", "OTHER"])
    .optional(),
  observacoes: z.string().optional(),
});

export async function criarPessoa(
  _prevState: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const parsed = pessoaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      sucesso: false,
      erro: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const dados = parsed.data;

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return { sucesso: false, erro: "CRM não incluído no seu plano." };
  }

  const pessoa = await withOrganization(organizationId, () =>
    prisma.person.create({
      data: {
        organizationId,
        name: dados.nome,
        email: dados.email || null,
        phone: dados.telefone || null,
        roles: [dados.papel],
        source: dados.origem || null,
        notes: dados.observacoes || null,
        assignedMemberId: session.user.organizationMemberId ?? null,
      },
    })
  );

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "Person",
    entityId: pessoa.id,
    action: "created",
    payload: { name: pessoa.name },
  });

  revalidatePath("/app/clientes");
  redirect("/app/clientes");
}

const estagioSchema = z.object({
  estagioFunil: z.enum([
    "NEW_LEAD",
    "CONTACTED",
    "VISIT_SCHEDULED",
    "PROPOSAL",
    "CLOSED",
    "LOST",
  ]),
});

export async function atualizarEstagioFunil(
  pessoaId: string,
  formData: FormData
) {
  const session = await auth();
  if (!session) redirect("/app/login");

  const { estagioFunil } = estagioSchema.parse(
    Object.fromEntries(formData.entries())
  );

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) return;

  await withOrganization(organizationId, async () => {
    await prisma.person.update({
      where: { id: pessoaId, organizationId },
      data: { pipelineStage: estagioFunil },
    });

    revalidatePath(`/app/clientes/${pessoaId}`);
  });
}

const interacaoSchema = z.object({
  tipo: z.enum(["VISIT", "CALL", "MESSAGE", "EMAIL", "OTHER"]),
  notas: z.string().optional(),
});

export async function registrarInteracao(pessoaId: string, formData: FormData) {
  const session = await auth();
  if (!session) redirect("/app/login");

  const dados = interacaoSchema.parse(Object.fromEntries(formData.entries()));

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) return;

  await withOrganization(organizationId, async () => {
    await prisma.interaction.create({
      data: {
        organizationId,
        personId: pessoaId,
        type: dados.tipo,
        notes: dados.notas || null,
        memberId: session.user.organizationMemberId ?? null,
      },
    });

    revalidatePath(`/app/clientes/${pessoaId}`);
  });
}
