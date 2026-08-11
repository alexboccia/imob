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
import { erroAcessoNegado, sucesso, type ActionState } from "@/lib/action-result";
import {
  parsePersonPreferenceFormData,
  camposPreferencia,
} from "@/lib/person-preference-schema";

type EstadoFormulario = { sucesso: boolean; erro?: string };

// Confirma que todo item de propertyTypes/desiredPropertyFeatures/
// desiredCondoFeatures pertence a um catálogo (PropertyTypeOption/
// FeatureOption) da MESMA organizationId da sessão — nunca confia na UI
// nem no FormData sozinhos. Escopo por organizationId em toda query:
// um valor que só existe no catálogo de OUTRA organização é tratado como
// inexistente (mesmo efeito de não existir em lugar nenhum). Categoria
// importa: uma FeatureOption PROPERTY nunca valida um item de
// desiredCondoFeatures, e vice-versa, mesmo que o nome coincida — cada
// array é checado só contra o Set da categoria correspondente.
async function validarCatalogosPreferencia(
  organizationId: string,
  dados: { propertyTypes: string[]; desiredPropertyFeatures: string[]; desiredCondoFeatures: string[] }
): Promise<ActionState | null> {
  const [tipos, featuresImovel, featuresCondominio] = await Promise.all([
    prisma.propertyTypeOption.findMany({
      where: { organizationId },
      select: { name: true },
    }),
    prisma.featureOption.findMany({
      where: { organizationId, category: "PROPERTY" },
      select: { name: true },
    }),
    prisma.featureOption.findMany({
      where: { organizationId, category: "CONDO" },
      select: { name: true },
    }),
  ]);

  const setTipos = new Set(tipos.map((t) => t.name));
  const setFeaturesImovel = new Set(featuresImovel.map((f) => f.name));
  const setFeaturesCondominio = new Set(featuresCondominio.map((f) => f.name));

  const fieldErrors: Record<string, string[]> = {};

  if (dados.propertyTypes.some((tipo) => !setTipos.has(tipo))) {
    fieldErrors.propertyTypes = ["Tipo de imóvel não cadastrado nesta organização."];
  }
  if (dados.desiredPropertyFeatures.some((f) => !setFeaturesImovel.has(f))) {
    fieldErrors.desiredPropertyFeatures = [
      "Característica de imóvel não cadastrada nesta organização.",
    ];
  }
  if (dados.desiredCondoFeatures.some((f) => !setFeaturesCondominio.has(f))) {
    fieldErrors.desiredCondoFeatures = [
      "Característica de condomínio não cadastrada nesta organização.",
    ];
  }

  if (Object.keys(fieldErrors).length === 0) return null;
  return { success: false, message: "Verifique os campos destacados.", fieldErrors };
}

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

// Cria ou atualiza a preferência de busca da Person (Fase C do CRM) —
// upsert único por personId (V1: no máximo uma preferência ativa por
// Person). organizationId nunca vem do formData (nem é lido de lá), só
// da sessão via requireOrganizationId().
export async function salvarPreferenciaPessoa(
  pessoaId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }

  const parsedFormData = parsePersonPreferenceFormData(formData);
  if (!parsedFormData.ok) return parsedFormData.estado;
  const { dados } = parsedFormData;

  return withOrganization(organizationId, async () => {
    // pessoaId chega como argumento bindado de Server Action — input do
    // navegador como qualquer outro. Confirma que a Person pertence a
    // ESTA organização ANTES de qualquer escrita em PersonPreference —
    // mesma defesa de registrarInteracao acima. Auditoria explícita da
    // Fase C (upsert × TENANT_SCOPED_MODELS): a extensão de tenant-scoping
    // (src/lib/prisma.ts) só garante que ALGUM organizationId é
    // preenchido quando ausente do where/create de um upsert — ela NÃO
    // garante que esse organizationId é o dono real da Person referenciada
    // por personId (não existe FK composta pra isso). Sem esta checagem
    // explícita antes do upsert, uma primeira gravação (Person ainda sem
    // PersonPreference) poderia criar uma linha com personId de outra
    // organização e organizationId da sessão atual — a checagem abaixo é
    // a única coisa que impede isso, não a extensão.
    const pessoa = await prisma.person.findUnique({
      where: { id: pessoaId, organizationId },
      select: { id: true },
    });
    if (!pessoa) {
      return erroAcessoNegado("Cliente não encontrado.");
    }

    // Nunca confiar que a UI só deixa selecionar valores do catálogo —
    // FormData é input do navegador como qualquer outro. Rejeita antes do
    // upsert, sem criar nada no catálogo automaticamente.
    const erroCatalogo = await validarCatalogosPreferencia(organizationId, dados);
    if (erroCatalogo) return erroCatalogo;

    // where/create com organizationId explícito nos dois — nunca depender
    // da extensão pra preencher isso aqui, mesmo já sendo redundante com
    // ela (ver comentário acima).
    await prisma.personPreference.upsert({
      where: { personId: pessoaId, organizationId },
      create: { personId: pessoaId, organizationId, ...camposPreferencia(dados) },
      update: camposPreferencia(dados),
    });

    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "PersonPreference",
      entityId: pessoaId,
      action: "saved",
    });

    revalidatePath(`/app/clientes/${pessoaId}`);
    return sucesso("Preferências salvas.");
  });
}
