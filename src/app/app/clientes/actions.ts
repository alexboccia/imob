"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { telefoneValido, normalizarTelefone } from "@/lib/telefone";
import { normalizarEmail } from "@/lib/rate-limit";
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

  // emailNormalized/phoneNormalized populados aqui só por consistência de
  // dado (senão uma Person cadastrada manualmente nunca seria encontrada
  // por uma deduplicação futura do formulário público) — cadastro manual
  // não tenta deduplicar sozinho, é uma ação explícita do corretor.
  let pessoa;
  try {
    pessoa = await withOrganization(organizationId, () =>
      prisma.person.create({
        data: {
          organizationId,
          name: dados.nome,
          email: dados.email || null,
          phone: dados.telefone || null,
          emailNormalized: dados.email ? normalizarEmail(dados.email) : null,
          phoneNormalized: dados.telefone ? normalizarTelefone(dados.telefone) : null,
          roles: [dados.papel],
          source: dados.origem || null,
          notes: dados.observacoes || null,
          assignedMemberId: session.user.organizationMemberId ?? null,
        },
      })
    );
  } catch (erro) {
    // Já existe uma Person com esse e-mail ou telefone nesta organização
    // (unique constraint em emailNormalized/phoneNormalized) — erro
    // esperado e tratado, nunca deve virar 500.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return {
        sucesso: false,
        erro: "Já existe um cliente com esse e-mail ou telefone nesta organização.",
      };
    }
    throw erro;
  }

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
    // pessoaId chega como argumento bindado de Server Action — input do
    // navegador como qualquer outro, não confiável. Sem essa checagem, um
    // personId de outra organização criaria uma Interaction cruzando
    // tenants (organizationId correto, mas personId apontando pra um
    // Person de outra org). Mesmo padrão de defesa já usado pro
    // propertyId em src/app/[orgSlug]/actions.ts. Falha silenciosa de
    // propósito (mesmo tratamento do hasModule acima): não revela se o
    // Person existe em outra organização.
    const pessoa = await prisma.person.findUnique({
      where: { id: pessoaId, organizationId },
      select: { id: true },
    });
    if (!pessoa) return;

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
