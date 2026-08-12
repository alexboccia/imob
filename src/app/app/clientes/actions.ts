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
import {
  erroAcessoNegado,
  erroGenerico,
  erroValidacao,
  sucesso,
  type ActionState,
} from "@/lib/action-result";
import {
  parsePersonPreferenceFormData,
  camposPreferencia,
} from "@/lib/person-preference-schema";
import {
  criarInteresseSchema,
  atualizarEstagioInteresseSchema,
} from "@/lib/property-interest-schema";

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

// ---------------------------------------------------------------------
// PropertyInterest (Fase D do CRM) — estado ATUAL do relacionamento
// Person↔Property. Nunca cria Interaction automaticamente (decisão
// explícita da Fase D — ver auditoria): mudança de stage/favorited só
// gera ActivityLog, nunca histórico de interação.
// ---------------------------------------------------------------------

// Cria (ou confirma, se já existir) o relacionamento entre a Person da
// ficha e um Property escolhido no formulário. Idempotente: a
// @@unique([organizationId, personId, propertyId]) garante no máximo uma
// linha por par — reenviar o mesmo propertyId nunca cria uma segunda
// linha nem reseta stage/favorited/notes já existentes (update: {} é
// proposital, um no-op sobre os campos de estado).
export async function criarInteressePessoa(
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

  const parsed = criarInteresseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const { propertyId, notes } = parsed.data;

  return withOrganization(organizationId, async () => {
    // Person e Property validados INDEPENDENTEMENTE contra o organizationId
    // da sessão — nenhum dos dois IDs vindos do formulário é confiável
    // sozinho. Mensagem de erro genérica de propósito: não revela qual dos
    // dois (ou se algum) existe em outra organização. Mesmo padrão de
    // enviarContato (src/app/[orgSlug]/actions.ts) validando personId e
    // propertyId separadamente antes de criar uma Interaction.
    const [pessoa, imovel] = await Promise.all([
      prisma.person.findUnique({ where: { id: pessoaId, organizationId }, select: { id: true } }),
      prisma.property.findUnique({ where: { id: propertyId, organizationId }, select: { id: true, status: true } }),
    ]);
    if (!pessoa || !imovel) {
      return erroGenerico("Cliente ou imóvel não encontrado.");
    }

    // Novo relacionamento só pode ser criado com Property AVAILABLE (Fase
    // F, decisão de produto) — a ficha do cliente já só oferece imóveis
    // AVAILABLE no seletor (ver imoveisDisponiveis em
    // /app/clientes/[id]/page.tsx), mas isso é só UX: o propertyId chega
    // via FormData, que pode ser adulterado, então a regra precisa estar
    // aqui, não só escondendo o botão na tela (Fase F, ficha do imóvel,
    // RecomendacaoClienteItem). Relacionamento HISTÓRICO (já existente)
    // nunca é bloqueado por isso — se o imóvel virou SOLD/RENTED/etc.
    // depois de já relacionado, o reenvio idempotente do mesmo par
    // continua funcionando normalmente (cai no catch de P2002 abaixo,
    // sem nunca chegar a tentar um create novo).
    if (imovel.status !== "AVAILABLE") {
      const jaRelacionado = await prisma.propertyInterest.findUnique({
        where: {
          organizationId_personId_propertyId: { organizationId, personId: pessoaId, propertyId },
          organizationId,
        },
        select: { id: true },
      });
      if (!jaRelacionado) {
        return erroGenerico("Este imóvel não está disponível para novo relacionamento.");
      }
    }

    // create() direto (não upsert): precisamos saber com certeza se a linha
    // foi criada AGORA ou já existia, pra só logar property_interest_created
    // quando algo de fato aconteceu — reenvio idempotente ou corrida
    // recuperada não são eventos novos, não geram ActivityLog (nada mudou).
    //
    // Corrida possível: duas submissões idênticas (duplo clique, ou duas
    // abas) podem colidir no unique constraint entre o create de uma e o
    // commit da outra — a segunda estoura P2002 mesmo sem ninguém ter
    // "errado" nada. Mesmo padrão de retry único de person-dedup.ts (Fase
    // B): uma única re-consulta pós-catch, nunca um loop.
    let interesse;
    let foiCriadoAgora = false;
    try {
      interesse = await prisma.propertyInterest.create({
        data: { organizationId, personId: pessoaId, propertyId, notes: notes || null },
      });
      foiCriadoAgora = true;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        // organizationId também como campo de nível superior do where
        // (redundante com o mesmo valor já dentro da chave composta) — a
        // extensão de tenant-scoping (src/lib/prisma.ts) só reconhece
        // "organizationId" como chave direta do objeto where, não aninhada
        // dentro de organizationId_personId_propertyId. Sem isso, ela
        // tentaria preencher via AsyncLocalStorage, que o próprio prisma.ts
        // documenta como não confiável neste projeto.
        interesse = await prisma.propertyInterest.findUniqueOrThrow({
          where: {
            organizationId_personId_propertyId: { organizationId, personId: pessoaId, propertyId },
            organizationId,
          },
        });
      } else {
        throw erro;
      }
    }

    if (foiCriadoAgora) {
      await logActivity({
        organizationId,
        userId: session.user.id,
        entity: "PropertyInterest",
        entityId: interesse.id,
        action: "property_interest_created",
      });
    }

    revalidatePath(`/app/clientes/${pessoaId}`);
    revalidatePath(`/app/imoveis/${propertyId}`);
    return sucesso("Imóvel relacionado.");
  });
}

// Atualiza stage + notes de um relacionamento já existente. Não valida
// transição (INTERESTED → PROPOSAL é permitido de propósito — decisão da
// Fase D, MVP sem máquina de estado rígida, mesmo nível de simplicidade
// de atualizarEstagioFunil).
export async function atualizarEstagioInteresse(
  interesseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }

  const parsed = atualizarEstagioInteresseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const { stage, notes } = parsed.data;

  return withOrganization(organizationId, async () => {
    // Confirma que o PropertyInterest pertence a ESTA organização antes de
    // alterar — interesseId é input do navegador como qualquer outro.
    const atual = await prisma.propertyInterest.findUnique({
      where: { id: interesseId, organizationId },
      select: { stage: true, personId: true },
    });
    if (!atual) return erroAcessoNegado("Relacionamento não encontrado.");

    // notes ausente do FormData chega como undefined do Zod (schema com
    // .optional()) — nesse caso a chave nem entra no `data`, e o Prisma não
    // toca a coluna, preservando o valor existente. notes==="" (campo
    // enviado vazio) grava null de propósito (limpa a observação). Nunca
    // usar `notes ?? null`/`notes || null` direto no data: isso apagaria
    // notes existente sempre que o chamador não reenviasse o campo — a UI
    // atual sempre reenvia (Textarea populada com defaultValue), mas a
    // action não deve depender disso pra não perder dado silenciosamente.
    const dadosAtualizacao: { stage: typeof stage; notes?: string | null } = { stage };
    if (notes !== undefined) {
      dadosAtualizacao.notes = notes || null;
    }

    await prisma.propertyInterest.update({
      where: { id: interesseId, organizationId },
      data: dadosAtualizacao,
    });

    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "PropertyInterest",
      entityId: interesseId,
      action: "property_interest_stage_changed",
      payload: { from: atual.stage, to: stage },
    });

    revalidatePath(`/app/clientes/${atual.personId}`);
    return sucesso("Estágio atualizado.");
  });
}

// Alterna favorited (nunca toca stage). Sempre relê o valor atual do
// banco antes de inverter — não confia em nenhum valor vindo do
// navegador/estado do form pra decidir o próximo valor.
export async function alternarFavoritoInteresse(
  interesseId: string,
  // Assinatura exigida por useActionState — não lê prevState/formData de
  // propósito, o próximo valor sempre vem de reler o banco (comentário
  // acima), nunca do form.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }

  return withOrganization(organizationId, async () => {
    const atual = await prisma.propertyInterest.findUnique({
      where: { id: interesseId, organizationId },
      select: { favorited: true, personId: true },
    });
    if (!atual) return erroAcessoNegado("Relacionamento não encontrado.");

    const novoValor = !atual.favorited;
    await prisma.propertyInterest.update({
      where: { id: interesseId, organizationId },
      data: { favorited: novoValor },
    });

    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "PropertyInterest",
      entityId: interesseId,
      action: "property_interest_favorite_changed",
      payload: { from: atual.favorited, to: novoValor },
    });

    revalidatePath(`/app/clientes/${atual.personId}`);
    return sucesso(novoValor ? "Favoritado." : "Desfavoritado.");
  });
}

// Remove só a linha de PropertyInterest — nunca toca Person, Property,
// Interaction ou PersonPreference.
export async function removerInteresse(
  interesseId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }

  return withOrganization(organizationId, async () => {
    const atual = await prisma.propertyInterest.findUnique({
      where: { id: interesseId, organizationId },
      select: { personId: true },
    });
    if (!atual) return erroAcessoNegado("Relacionamento não encontrado.");

    await prisma.propertyInterest.delete({ where: { id: interesseId, organizationId } });

    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "PropertyInterest",
      entityId: interesseId,
      action: "property_interest_removed",
    });

    revalidatePath(`/app/clientes/${atual.personId}`);
    return sucesso("Relacionamento removido.");
  });
}
