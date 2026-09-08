"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, type PropertyInterestStage } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { telefoneValido, normalizarTelefone } from "@/lib/telefone";
import { normalizarEmail } from "@/lib/rate-limit";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule, getLimit, limiteExcedido, LimiteDoPlanoError, FEATURE_CRM_CLIENTS } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity-log";
import { oportunidadeElegivel } from "@/lib/oportunidade";
import { interpretarValorFechamento, decimalParaValor } from "@/lib/valor-fechamento";
import { interpretarComissao, comissaoExcedeValorFechado } from "@/lib/comissao";
import { membroPodeReceberNegociacao } from "@/lib/responsavel-negociacao";
import {
  interpretarAlocacao,
  validarAlocacaoContraTotal,
} from "@/lib/participacao-comissao";
import {
  interpretarPagamento,
  interpretarDataPagamento,
  validarPagamentoContraAtribuicao,
  validarAtribuicaoContraPagamentos,
} from "@/lib/pagamento-comissao";
import { temPapel, PAPEIS_LIQUIDACAO_COMISSAO } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { escopoComercialDaSessao } from "@/lib/escopo-comercial-sessao";
import {
  whereNegociacaoAlvo,
  wherePessoaAlvo,
  whereNegociacao,
  wherePessoa,
  type EscopoComercial,
} from "@/lib/escopo-comercial";
import { formatarPreco } from "@/lib/format";
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
  estagioInteresseEncerrado,
  ESTAGIOS_INTERESSE,
} from "@/lib/property-interest-schema";

type EstadoFormulario = { sucesso: boolean; erro?: string; clienteId?: string };

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
  // .optional() sozinho só aceita `undefined` — o <Select> de origem não
  // tem defaultValue (placeholder "Origem"), então o hidden input do Base
  // UI sempre existe no FormData com value="" quando nada é escolhido,
  // nunca omitido. Mesmo padrão de email/telefone acima pra aceitar "".
  origem: z
    .enum(["WEBSITE", "REFERRAL", "PORTAL", "INSTAGRAM", "WHATSAPP", "OTHER"])
    .optional()
    .or(z.literal("")),
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
  // Fase 22 — sem predicado de escopo AQUI de propósito: esta action
  // CRIA uma pessoa nova. Não há alvo preexistente a autorizar, e o
  // registro nasce vinculado a quem o criou (assignedMemberId), que é
  // justamente a ponte que wherePessoa reconhece.

  // emailNormalized/phoneNormalized populados aqui só por consistência de
  // dado (senão uma Person cadastrada manualmente nunca seria encontrada
  // por uma deduplicação futura do formulário público) — cadastro manual
  // não tenta deduplicar sozinho, é uma ação explícita do corretor.
  let pessoa;
  try {
    pessoa = await withOrganization(organizationId, () =>
      // Fase P.9: checagem de limite + create na MESMA transação, atrás de
      // um advisory lock determinístico por (organizationId, feature) —
      // serializa concorrência de criação de Person desta organização sem
      // exigir isolamento SERIALIZABLE na transação inteira (mais barato,
      // sem retry manual). pg_advisory_xact_lock é liberado
      // automaticamente no commit/rollback, nunca precisa de unlock
      // explícito. Diferente de verificarLimiteImoveis/verificarLimiteUsuarios
      // (count-then-create em duas etapas separadas, fragilidade
      // pré-existente documentada, não corrigida nesta fase) — aqui o
      // count e o create nunca podem ser intercalados por outra
      // transação concorrente da MESMA organização.
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${FEATURE_CRM_CLIENTS}))`;

        const limite = await getLimit(organizationId, FEATURE_CRM_CLIENTS);
        if (limite !== null) {
          const total = await tx.person.count({ where: { organizationId } });
          if (limiteExcedido(total, limite)) {
            throw new LimiteDoPlanoError(
              `Seu plano permite até ${limite} clientes CRM. Faça upgrade de plano para cadastrar mais.`
            );
          }
        }

        return tx.person.create({
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
        });
      })
    );
  } catch (erro) {
    if (erro instanceof LimiteDoPlanoError) {
      return { sucesso: false, erro: erro.message };
    }
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
  // Redesenho da tela de Clientes: antes disparava redirect("/app/clientes")
  // incondicional — como o formulário agora abre dentro de um Sheet SOBRE
  // a própria página de Clientes, um redirect pra ela mesma não fecharia o
  // Sheet (Next não remonta o componente cliente numa navegação pro mesmo
  // segmento). Devolve sucesso pro chamador decidir (NovoClienteSheet fecha
  // o Sheet e conta com o revalidatePath acima pra atualizar a listagem).
  return { sucesso: true, clienteId: pessoa.id };
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
  const escopo = await escopoComercialDaSessao(organizationId);

  await withOrganization(organizationId, async () => {
    // Fase 22 — `updateMany` e não `update`: aqui a escrita É o ponto de
    // autorização (não há leitura antes dela), e `update` só aceita
    // where único, o que impediria o predicado de escopo. Fora do
    // escopo, `count` é 0 e nada é alterado — sem revelar se a pessoa
    // existe.
    await prisma.person.updateMany({
      where: wherePessoaAlvo(escopo, pessoaId, organizationId),
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
  const escopo = await escopoComercialDaSessao(organizationId);

  await withOrganization(organizationId, async () => {
    // pessoaId chega como argumento bindado de Server Action — input do
    // navegador como qualquer outro, não confiável. Sem essa checagem, um
    // personId de outra organização criaria uma Interaction cruzando
    // tenants (organizationId correto, mas personId apontando pra um
    // Person de outra org). Mesmo padrão de defesa já usado pro
    // propertyId em src/app/[orgSlug]/actions.ts. Falha silenciosa de
    // propósito (mesmo tratamento do hasModule acima): não revela se o
    // Person existe em outra organização.
    const pessoa = await prisma.person.findFirst({
      where: wherePessoaAlvo(escopo, pessoaId, organizationId),
      select: { id: true },
    });
    if (!pessoa) return;

    // Fase 15 — AUTOR da interação, com guarda de tenant. O campo já era
    // escrito (a dívida herdada de "memberId nunca é escrito" vinha de um
    // grep que filtrava a própria expressão da escrita), mas confiava
    // cegamente no memberId da sessão. Mesmo padrão da Fase 14: uma
    // sessão inconsistente nunca grava FK cross-tenant, e ator inválido
    // vira null sem bloquear o registro do fato comercial.
    const autor = await prisma.organizationMember.findFirst({
      where: { id: session.user.organizationMemberId ?? "", organizationId },
      select: { id: true },
    });

    await prisma.interaction.create({
      data: {
        organizationId,
        personId: pessoaId,
        type: dados.tipo,
        notes: dados.notas || null,
        memberId: autor?.id ?? null,
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
  const escopo = await escopoComercialDaSessao(organizationId);

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
    const pessoa = await prisma.person.findFirst({
      where: wherePessoaAlvo(escopo, pessoaId, organizationId),
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

// =====================================================================
// Fase 11 — quem é o responsável pela negociação, no momento da criação
// =====================================================================
// REGRA ESCOLHIDA (opção C do leque auditado): o responsável nasce sendo
// o membro que está criando a oportunidade, e o formulário completo
// permite trocar antes de salvar.
//
// Por que auto-atribuir é legítimo AQUI, e não é "silencioso":
//   1. É a semântica que o próprio produto já adotou para ownership:
//      Person.assignedMemberId é gravado exatamente assim desde o CRM
//      (`session.user.organizationMemberId ?? null` em criarPessoa), e o
//      nome do responsável já aparece na lista de clientes. Esta fase
//      segue o precedente do domínio em vez de inventar outro.
//   2. Os quatro caminhos de criação partem de alguém logado agindo
//      sobre um cliente dentro do CRM — não há criação automática nem
//      criação por visitante do site.
//   3. Silencioso seria invisível e irreversível. Aqui o responsável
//      aparece no card do Kanban e na ficha do cliente, pode ser trocado
//      no próprio formulário antes de salvar, e transferido depois com
//      registro em ActivityLog.
//
// `responsavelId` vindo do FormData:
//   ausente        -> membro atual (os fluxos de 1 clique, que não têm
//                     formulário: as duas telas de recomendação e
//                     "Criar oportunidade" a partir de um contato)
//   string vazia   -> explicitamente SEM responsável
//   id de membro   -> valida tenant + status antes de aceitar
//
// SEM membro na sessão (sessão sem vínculo de organização) -> null, o
// mesmo estado seguro do precedente de Person.
type ResolucaoResponsavel =
  | { ok: true; responsibleMemberId: string | null }
  | { ok: false; erro: string };

async function resolverResponsavelInicial(
  organizationId: string,
  memberIdDaSessao: string | undefined,
  bruto: FormDataEntryValue | null
): Promise<ResolucaoResponsavel> {
  if (bruto === null) {
    return { ok: true, responsibleMemberId: memberIdDaSessao ?? null };
  }
  const escolhido = String(bruto).trim();
  if (!escolhido) return { ok: true, responsibleMemberId: null };
  return validarMembroAtribuivel(organizationId, escolhido);
}

// FRONTEIRA DE TENANT DO OWNERSHIP. O id do membro chega do navegador
// como qualquer outro campo: um <select> adulterado poderia mandar o id
// de um membro de OUTRA organização. O findFirst abaixo é a única coisa
// entre isso e uma negociação da Org A pertencendo a um corretor da Org
// B — por isso ele filtra por organizationId explicitamente e a mensagem
// de erro é genérica, sem revelar que o membro existe em outro tenant.
async function validarMembroAtribuivel(
  organizationId: string,
  membershipId: string
): Promise<ResolucaoResponsavel> {
  const membro = await prisma.organizationMember.findFirst({
    where: { id: membershipId, organizationId },
    select: { id: true, status: true },
  });
  if (!membro) return { ok: false, erro: "Responsável não encontrado nesta organização." };
  // Membro inativo continua sendo responsável HISTÓRICO de negociações
  // antigas, mas não recebe atribuição nova.
  if (!membroPodeReceberNegociacao(membro.status)) {
    return { ok: false, erro: "Este usuário está inativo e não pode receber negociações." };
  }
  return { ok: true, responsibleMemberId: membro.id };
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
  const escopo = await escopoComercialDaSessao(organizationId);

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
      prisma.person.findFirst({ where: wherePessoaAlvo(escopo, pessoaId, organizationId), select: { id: true } }),
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
    // Fase 11 — responsável resolvido ANTES de abrir a transação: uma
    // atribuição inválida (membro de outro tenant, membro inativo) não
    // pode nem chegar a criar a negociação.
    const responsavel = await resolverResponsavelInicial(
      organizationId,
      session.user.organizationMemberId,
      formData.get("responsavelId")
    );
    if (!responsavel.ok) return erroGenerico(responsavel.erro);

    let interesse;
    let foiCriadoAgora = false;
    try {
      interesse = await prisma.$transaction(async (tx) => {
        const criado = await tx.propertyInterest.create({
          data: {
            organizationId,
            personId: pessoaId,
            propertyId,
            notes: notes || null,
            responsibleMemberId: responsavel.responsibleMemberId,
          },
        });

        // PropertyInterestStageHistory inicial (Fase P.6 — correção
        // pós-auditoria do achado C): a criação É a entrada real em
        // INTERESTED, não um "5º caminho sem histórico" — previousStage
        // null (não existe estado anterior), newStage INTERESTED,
        // changedAt = criado.createdAt (o instante real que o Postgres já
        // gravou na própria criação, nunca um new Date() JS separado que
        // poderia divergir em milissegundos, nunca uma segunda leitura).
        // Mesma transação do create acima: nunca um PropertyInterest novo
        // sem history, nunca um history órfão sem PropertyInterest.
        await tx.propertyInterestStageHistory.create({
          data: {
            organizationId,
            propertyInterestId: criado.id,
            previousStage: null,
            newStage: "INTERESTED",
            changedAt: criado.createdAt,
            // Fase 14 — ator da transição, na MESMA transação: a
            // entrada em INTERESTED e quem a executou são um fato só.
            changedByMemberId: await resolverAtorTransicao(
              tx,
              organizationId,
              session.user.organizationMemberId
            ),
          },
        });

        return criado;
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

// =====================================================================
// Fase 8 — converter um CONTATO em OPORTUNIDADE, preservando a origem
// =====================================================================
// Antes desta ação, PropertyInterest só nascia de três fluxos manuais
// (relacionar imóvel na ficha do cliente, e as duas telas de
// recomendação), nenhum deles partindo de um contato. O resultado é que a
// origem comercial do negócio se perdia: dava pra saber que o Google
// trouxe o contato, e nunca se aquele contato virou negociação.
//
// Esta ação existe exatamente para fechar esse elo — e o faz com um FATO,
// não com uma heurística: o corretor está olhando UMA interação específica
// no histórico e clica em "Criar oportunidade" NELA. O
// sourceInteractionId gravado é o id daquele registro, não "a interação
// mais próxima no tempo".
//
// ELEGIBILIDADE (validada no servidor, nunca só escondendo o botão):
// só contato de captação com origin=IMOVEL e propertyId preenchido.
//   - CONTATO é conversa geral, pode não ser sobre imóvel nenhum;
//   - ANUNCIE é proprietário querendo anunciar, o oposto comercial do
//     funil de comprador — forçá-lo aqui criaria uma oportunidade de
//     compra que nunca existiu;
//   - interação registrada à mão pelo corretor (origin=null) não é
//     captação, e nunca teve origem de tráfego pra preservar.
export async function criarOportunidadeDoContato(
  interactionId: string,
  // Assinatura exigida por useActionState; nenhum dos dois é lido — o
  // único input desta ação é o interactionId bindado. Mesmo padrão (e
  // mesmo disable explícito) já usado em agendamentos/actions.ts.
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
  const escopo = await escopoComercialDaSessao(organizationId);

  return withOrganization(organizationId, async () => {
    // Fronteira de tenant: a interação precisa existir NESTA organização.
    // interactionId chega bindado de um Server Action — input do
    // navegador como qualquer outro. Mensagem genérica de propósito: não
    // revela se o registro existe em outra organização.
    // Fase 22 — a interação é o ponto de entrada desta action, e ela
    // pertence a uma PESSOA. Sem o predicado abaixo, um membro em modo
    // restrito poderia passar o id de uma interação de cliente alheio e
    // criar uma oportunidade sobre ele — virando responsável e ganhando
    // acesso. Isso seria escalar privilégio por escrita, e o produto não
    // tem fluxo de "pegar para si".
    const interacao = await prisma.interaction.findFirst({
      where: { id: interactionId, organizationId, person: { is: wherePessoa(escopo) } },
      select: { id: true, personId: true, propertyId: true, origin: true },
    });
    if (!interacao) return erroGenerico("Contato não encontrado.");

    if (!oportunidadeElegivel(interacao)) {
      return erroGenerico("Este contato não pode virar oportunidade.");
    }
    // Estreitamento para o TypeScript — oportunidadeElegivel já garantiu.
    const propertyId = interacao.propertyId!;

    // O imóvel é lido do PRÓPRIO registro da interação (já validado
    // contra a organização quando o contato foi criado), nunca de um
    // campo do formulário: não há como o navegador escolher qual imóvel
    // vira oportunidade.
    const imovel = await prisma.property.findUnique({
      where: { id: propertyId, organizationId },
      select: { id: true },
    });
    if (!imovel) return erroGenerico("Imóvel não encontrado.");

    // Mesma corrida (e mesmo tratamento) de criarInteressePessoa: o par
    // (person, property) é único por organização, então um duplo clique
    // ou uma oportunidade já criada por outro caminho colide em P2002.
    // Reenvio idempotente não é evento novo — não loga nem sobrescreve a
    // origem de um relacionamento que já existia.
    // Fase 11 — este fluxo é um botão de 1 clique, sem formulário onde
    // escolher: o responsável é quem está pegando o contato. Nenhum
    // FormData é lido (o `_formData` desta action é ignorado por
    // contrato), então resolverResponsavelInicial recebe `null` e cai no
    // membro da sessão. Origem de aquisição e ownership são
    // independentes: sourceInteraction diz de ONDE veio o negócio,
    // responsibleMember diz QUEM o conduz.
    const responsavel = await resolverResponsavelInicial(
      organizationId,
      session.user.organizationMemberId,
      null
    );
    if (!responsavel.ok) return erroGenerico(responsavel.erro);

    let foiCriadaAgora = false;
    let interesseId: string;
    try {
      const criado = await prisma.$transaction(async (tx) => {
        const novo = await tx.propertyInterest.create({
          data: {
            organizationId,
            personId: interacao.personId,
            propertyId,
            sourceInteractionId: interacao.id,
            responsibleMemberId: responsavel.responsibleMemberId,
          },
        });

        // Mesmo histórico inicial de criarInteressePessoa: a criação É a
        // entrada real em INTERESTED, com changedAt = createdAt do
        // próprio registro (nunca um new Date() separado).
        await tx.propertyInterestStageHistory.create({
          data: {
            organizationId,
            propertyInterestId: novo.id,
            previousStage: null,
            newStage: "INTERESTED",
            changedAt: novo.createdAt,
            // Fase 14 — mesma transação da criação.
            changedByMemberId: await resolverAtorTransicao(
              tx,
              organizationId,
              session.user.organizationMemberId
            ),
          },
        });

        return novo;
      });
      interesseId = criado.id;
      foiCriadaAgora = true;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        const existente = await prisma.propertyInterest.findUniqueOrThrow({
          where: {
            organizationId_personId_propertyId: {
              organizationId,
              personId: interacao.personId,
              propertyId,
            },
            organizationId,
          },
          select: { id: true },
        });
        interesseId = existente.id;
      } else {
        throw erro;
      }
    }

    if (foiCriadaAgora) {
      await logActivity({
        organizationId,
        userId: session.user.id,
        entity: "PropertyInterest",
        entityId: interesseId,
        action: "property_interest_created_from_interaction",
      });
    }

    revalidatePath(`/app/clientes/${interacao.personId}`);
    revalidatePath(`/app/imoveis/${propertyId}`);
    return sucesso(
      foiCriadaAgora ? "Oportunidade criada a partir deste contato." : "Este imóvel já era uma oportunidade deste cliente."
    );
  });
}

// Limite de tentativas do guard read-then-write abaixo — mesmo racional de
// MAX_TENTATIVAS_FECHAMENTO (fecharInteresse, mais abaixo neste arquivo):
// cada tentativa perdida significa que outra transação mudou o stage entre
// a leitura e o updateMany desta; 3 é generoso pra uma janela de
// milissegundos dentro de uma única transação.
const MAX_TENTATIVAS_ATUALIZACAO_ESTAGIO = 3;

type ResultadoAtualizacaoEstagio =
  | { tipo: "atualizado"; from: PropertyInterestStage }
  | { tipo: "no_op" }
  | { tipo: "nao_encontrado" }
  | { tipo: "corrida_nao_resolvida" };

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
  const escopo = await escopoComercialDaSessao(organizationId);

  const parsed = atualizarEstagioInteresseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const { stage, notes } = parsed.data;

  // notes ausente do FormData chega como undefined do Zod (schema com
  // .optional()) — nesse caso a chave nem entra no `data`, e o Prisma não
  // toca a coluna, preservando o valor existente. notes==="" (campo
  // enviado vazio) grava null de propósito (limpa a observação). Nunca usar
  // `notes ?? null`/`notes || null` direto no data: isso apagaria notes
  // existente sempre que o chamador não reenviasse o campo — a UI atual
  // sempre reenvia (Textarea populada com defaultValue), mas a action não
  // deve depender disso pra não perder dado silenciosamente.
  const dadosNotes: { notes?: string | null } = {};
  if (notes !== undefined) {
    dadosNotes.notes = notes || null;
  }

  return withOrganization(organizationId, async () => {
    // Confirma que o PropertyInterest pertence a ESTA organização antes de
    // alterar — interesseId é input do navegador como qualquer outro.
    // personId só serve pra validação de tenant/revalidatePath — NUNCA pro
    // `stage`, relido dentro da transação abaixo (mesma correção aplicada
    // em fecharInteresse na P.3: um `stage` capturado aqui fora da
    // transação podia ficar stale entre esta leitura e o guard atômico).
    const existente = await prisma.propertyInterest.findFirst({
      where: whereNegociacaoAlvo(escopo, interesseId, organizationId),
      select: { personId: true },
    });
    if (!existente) return erroAcessoNegado("Relacionamento não encontrado.");

    const resultado = await prisma.$transaction(async (tx): Promise<ResultadoAtualizacaoEstagio> => {
      for (let tentativa = 0; tentativa < MAX_TENTATIVAS_ATUALIZACAO_ESTAGIO; tentativa++) {
        const atual = await tx.propertyInterest.findFirst({
          where: whereNegociacaoAlvo(escopo, interesseId, organizationId),
          select: { stage: true },
        });
        if (!atual) return { tipo: "nao_encontrado" };

        if (atual.stage === stage) {
          // NO-OP (Fase P.6): stage solicitado == stage atual — nunca cria
          // PropertyInterestStageHistory (nenhuma transição de fato
          // ocorreu) nem um ActivityLog redundante de "mudança" que não
          // mudou nada. notes ainda é atualizado se enviado (cenário comum:
          // usuário edita só a observação sem tocar no Select).
          if (Object.keys(dadosNotes).length > 0) {
            await tx.propertyInterest.update({
              // where único: a autorização já aconteceu no lookup desta
              // action, antes da transação. Repetir o predicado aqui não
              // acrescentaria segurança e quebraria o `update`.
              where: { id: interesseId, organizationId },
              data: dadosNotes,
            });
          }
          return { tipo: "no_op" };
        }

        const atualizado = await tx.propertyInterest.updateMany({
          where: { id: interesseId, organizationId, stage: atual.stage },
          data: { stage, ...dadosNotes },
        });

        if (atualizado.count === 0) {
          // Perdeu a corrida desta tentativa — outra transação mudou o
          // stage entre a leitura acima e este update. Tenta de novo lendo
          // o valor mais recente (loop), sem gravar nenhum log/histórico
          // agora.
          continue;
        }

        // PropertyInterestStageHistory (Fase P.6): mesma transação, mesmo
        // valor literal de `atual.stage` que acabou de casar no updateMany
        // acima — só a tentativa vencedora da corrida grava histórico.
        await tx.propertyInterestStageHistory.create({
          data: {
            organizationId,
            propertyInterestId: interesseId,
            previousStage: atual.stage,
            newStage: stage,
            changedAt: new Date(),
            // Fase 14 — gravado DENTRO do mesmo bloco que só a tentativa
            // vencedora da corrida alcança: o ator registrado é sempre o
            // da transição que de fato venceu, nunca o de uma tentativa
            // que perdeu o updateMany e voltou pro loop.
            changedByMemberId: await resolverAtorTransicao(
              tx,
              organizationId,
              session.user.organizationMemberId
            ),
          },
        });

        await tx.activityLog.create({
          data: {
            organizationId,
            userId: session.user.id,
            entity: "PropertyInterest",
            entityId: interesseId,
            action: "property_interest_stage_changed",
            payload: { from: atual.stage, to: stage },
          },
        });

        return { tipo: "atualizado", from: atual.stage };
      }

      // Esgotou as tentativas — corrida anormalmente persistente (nunca
      // observada em teste real, só uma rede de segurança). Zero write,
      // zero log/histórico.
      return { tipo: "corrida_nao_resolvida" };
    });

    revalidatePath(`/app/clientes/${existente.personId}`);
    // Fase P.4: esta action é reaproveitada sem alteração de regra pelo
    // controle "Mover" do Kanban (src/app/app/pipeline) — precisa
    // revalidar a própria tela do Pipeline também, senão o card fica
    // preso na coluna antiga até um reload manual.
    revalidatePath("/app/pipeline");

    switch (resultado.tipo) {
      case "nao_encontrado":
        return erroAcessoNegado("Relacionamento não encontrado.");
      case "corrida_nao_resolvida":
        return erroGenerico("Não foi possível concluir agora devido a uma alteração concorrente — tente novamente.");
      case "no_op":
      case "atualizado":
        return sucesso("Estágio atualizado.");
    }
  });
}

// ---------------------------------------------------------------------
// Fechamento (Fase P.3) — marcar um PropertyInterest como ganho (WON) ou
// perdido (REJECTED), preenchendo closedAt atomicamente junto do stage.
// Rotas dedicadas, independentes de atualizarEstagioInteresse acima (que
// agora rejeita WON/REJECTED via ESTAGIOS_INTERESSE, ver
// property-interest-schema.ts) — nunca reaproveitar aquela action pra
// fechamento, o closedAt precisa ser server-side (new Date()) e nunca vir
// de FormData.
//
// Regras de transição V1 (auditadas, sem impedimento técnico encontrado
// pra restringir WON só a partir de PROPOSAL — qualquer stage aberto pode
// fechar como ganho ou perdido, mesma flexibilidade que já existe pra
// avançar stage manualmente antes desta fase):
//   INTERESTED / VISIT_SCHEDULED / VISITED / PROPOSAL -> WON       permitido
//   INTERESTED / VISIT_SCHEDULED / VISITED / PROPOSAL -> REJECTED  permitido
//   WON -> WON e REJECTED -> REJECTED (mesma action)                idempotente, sem novo write/log
//   WON -> REJECTED e REJECTED -> WON (via estas actions)           não permitido — reabertura fica pra fase futura
// ---------------------------------------------------------------------

type ResultadoFechamento =
  | { tipo: "fechado_agora"; from: string; personId: string; propertyId: string }
  | { tipo: "ja_fechado"; personId: string; propertyId: string }
  | { tipo: "transicao_invalida"; personId: string; propertyId: string }
  | { tipo: "nao_encontrado"; personId: string; propertyId: string }
  | { tipo: "corrida_nao_resolvida"; personId: string; propertyId: string };

// Limite de tentativas do guard read-then-write abaixo — nomeado, nunca
// número mágico. Cada tentativa perdida significa que outra transação
// mudou o stage entre a leitura e o updateMany desta; 3 é generoso pra
// uma janela de milissegundos dentro de uma única transação, sem virar
// loop infinito sob corrida hostil/patológica.
const MAX_TENTATIVAS_FECHAMENTO = 3;

async function fecharInteresse(
  interesseId: string,
  destino: "WON" | "REJECTED",
  // Fase 9 — valor negociado. Só existe para GANHO; em REJECTED o
  // parâmetro nunca é passado e a coluna permanece null.
  valorBruto?: unknown,
  // Fase 10 — comissão OPCIONAL. Só existe para GANHO.
  comissaoBruta?: unknown
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }
  const escopo = await escopoComercialDaSessao(organizationId);

  // Validação ANTES de qualquer escrita: marcar como ganho exige valor
  // real. Um ganho sem valor deixaria o relatório financeiro
  // permanentemente incompleto justo no registro que mais importa, e não
  // existe fluxo de edição depois do fechamento para corrigir.
  //
  // REJECTED nunca carrega valor: negócio perdido não tem valor fechado,
  // e gravar 0 ali seria confundir "não houve" com "valeu zero".
  let closedValue: number | null = null;
  let commissionValue: number | null = null;
  if (destino === "WON") {
    const interpretado = interpretarValorFechamento(valorBruto);
    if (!interpretado.ok) return erroGenerico(interpretado.erro);
    closedValue = interpretado.valor;

    // Comissão é opcional: em branco vira null (ok:true) e o negócio é
    // registrado como ganho normalmente. Só um valor MAL FORMADO barra o
    // fechamento — nunca a ausência.
    const comissao = interpretarComissao(comissaoBruta);
    if (!comissao.ok) return erroGenerico(comissao.erro);
    if (comissaoExcedeValorFechado(comissao.valor, closedValue)) {
      return erroGenerico("A comissão não pode ser maior que o valor de fechamento.");
    }
    commissionValue = comissao.valor;
  }

  return withOrganization(organizationId, async () => {
    // Person e Property reconferidos independentemente, mesmo padrão de
    // criarAgendamentoVisita (agendamentos/actions.ts) — PropertyInterest
    // tem FKs simples, nunca compostas (auditoria H.1/P.1, decisão #18),
    // então o organizationId da própria linha não é suficiente sozinho.
    // Esta leitura só serve pra validação de tenant e pra existência —
    // NUNCA pro `stage` (relido dentro da transação abaixo, ver
    // correção pós-auditoria: um `stage` capturado aqui fora da
    // transação podia ficar stale entre esta leitura e o guard atômico,
    // fazendo o ActivityLog gravar um `from` desatualizado mesmo com o
    // dado final sempre correto).
    const interesse = await prisma.propertyInterest.findFirst({
      where: whereNegociacaoAlvo(escopo, interesseId, organizationId),
      select: {
        id: true,
        personId: true,
        propertyId: true,
        person: { select: { organizationId: true } },
        property: { select: { organizationId: true } },
      },
    });
    if (
      !interesse ||
      interesse.person.organizationId !== organizationId ||
      interesse.property.organizationId !== organizationId
    ) {
      return erroAcessoNegado("Relacionamento não encontrado.");
    }

    const resultado = await prisma.$transaction(async (tx): Promise<ResultadoFechamento> => {
      // Guard read-then-write, vinculando a leitura ao update: em vez de
      // aceitar qualquer stage aberto (stage:{in:...}) e só depois
      // descobrir qual era, relemos o stage ATUAL a cada tentativa e o
      // usamos LITERALMENTE no WHERE do updateMany — se outra transação
      // mudou o stage entre esta leitura e este update (mesmo pra outro
      // stage aberto), o WHERE não casa mais, count:0, e tentamos de novo
      // com o valor mais recente. Isso garante que o `from` gravado no
      // ActivityLog é sempre exatamente o stage substituído, nunca um
      // valor obsoleto. Postgres serializa updates concorrentes na mesma
      // linha (a segunda espera a primeira commitar e reavalia o WHERE
      // contra o valor já commitado) — mesma garantia de row-lock que já
      // sustenta o guard atômico de concluirAgendamentoVisita, só que
      // agora a condição do WHERE é o valor exato relido, não um
      // conjunto fixo.
      for (let tentativa = 0; tentativa < MAX_TENTATIVAS_FECHAMENTO; tentativa++) {
        const atual = await tx.propertyInterest.findUnique({
          where: { id: interesse.id, organizationId },
          select: { stage: true },
        });
        if (!atual) {
          return {
            tipo: "nao_encontrado",
            personId: interesse.personId,
            propertyId: interesse.propertyId,
          };
        }
        if (atual.stage === destino) {
          return { tipo: "ja_fechado", personId: interesse.personId, propertyId: interesse.propertyId };
        }
        if (estagioInteresseEncerrado(atual.stage)) {
          // Terminal oposto (WON<->REJECTED) — nunca alcançável por este
          // fluxo, reabertura fica pra fase futura.
          return {
            tipo: "transicao_invalida",
            personId: interesse.personId,
            propertyId: interesse.propertyId,
          };
        }

        // Uma única instância de Date reutilizada pra closedAt e pra
        // changedAt do histórico (Fase P.6) — representam o MESMO evento de
        // fechamento, nunca dois `new Date()` separados que poderiam
        // divergir em milissegundos.
        const agora = new Date();
        const atualizado = await tx.propertyInterest.updateMany({
          where: { id: interesse.id, organizationId, stage: atual.stage },
          // stage, closedAt e closedValue no MESMO update da MESMA
          // transação do histórico: nunca existe WON sem valor nem valor
          // sem WON. Em REJECTED, closedValue é null explicitamente — não
          // herda nada de uma tentativa anterior.
          // stage, closedAt, closedValue e commissionValue no MESMO
          // update da MESMA transação do histórico. Em REJECTED os dois
          // valores são null explicitamente.
          data: { stage: destino, closedAt: agora, closedValue, commissionValue },
        });

        if (atualizado.count === 0) {
          // Perdeu a corrida desta tentativa — outra transação mudou o
          // stage entre a leitura acima e este update. Tenta de novo lendo
          // o valor mais recente (loop), sem gravar nenhum log agora.
          continue;
        }

        // PropertyInterestStageHistory (Fase P.6): mesma transação, mesmo
        // valor literal de `atual.stage` que acabou de casar no updateMany
        // acima — só a tentativa vencedora da corrida grava histórico.
        await tx.propertyInterestStageHistory.create({
          data: {
            organizationId,
            propertyInterestId: interesse.id,
            previousStage: atual.stage,
            newStage: destino,
            changedAt: agora,
            // Fase 14 — quem executou o FECHAMENTO. Não altera
            // responsibleMemberId: um gerente pode fechar o negócio de
            // outra pessoa, e o responsável continua sendo quem era.
            changedByMemberId: await resolverAtorTransicao(
              tx,
              organizationId,
              session.user.organizationMemberId
            ),
          },
        });

        // ActivityLog DENTRO da transação — mesmo desvio deliberado do
        // padrão best-effort documentado em concluirAgendamentoVisita: o
        // update de stage/closedAt e os dois registros de log precisam
        // ficar consistentes juntos ou não ficar aplicados de jeito nenhum.
        // Dois eventos por escolha explícita do produto: um genérico de
        // mudança de estágio (mesmo formato {from,to} de toda mudança de
        // stage no projeto) e um dedicado ao fechamento em si (útil pra
        // filtrar "todos os ganhos/perdas" sem precisar inspecionar
        // payload.to de property_interest_stage_changed). Payload
        // deliberadamente sem closedAt/motivo textual/nada de PII —
        // createdAt do próprio ActivityLog já registra o instante.
        // `from: atual.stage` é o mesmo valor literal que acabou de casar
        // no WHERE do updateMany acima — nunca um valor lido antes da
        // transação.
        await tx.activityLog.create({
          data: {
            organizationId,
            userId: session.user.id,
            entity: "PropertyInterest",
            entityId: interesse.id,
            action: "property_interest_stage_changed",
            payload: { from: atual.stage, to: destino },
          },
        });
        await tx.activityLog.create({
          data: {
            organizationId,
            userId: session.user.id,
            entity: "PropertyInterest",
            entityId: interesse.id,
            action: destino === "WON" ? "property_interest_won" : "property_interest_lost",
          },
        });

        return {
          tipo: "fechado_agora",
          from: atual.stage,
          personId: interesse.personId,
          propertyId: interesse.propertyId,
        };
      }

      // Esgotou as tentativas — corrida anormalmente persistente (nunca
      // observada em teste real, só uma rede de segurança). Zero write,
      // zero log; a mensagem pede nova tentativa em vez de mentir sobre
      // o resultado.
      return {
        tipo: "corrida_nao_resolvida",
        personId: interesse.personId,
        propertyId: interesse.propertyId,
      };
    });

    revalidatePath(`/app/clientes/${resultado.personId}`);
    revalidatePath(`/app/imoveis/${resultado.propertyId}`);
    // Fase P.4: FechamentoInteresse (P.3) é reaproveitado sem alteração
    // dentro do card do Kanban — precisa que o fechamento também
    // revalide /app/pipeline, senão o card não sai da coluna aberta até
    // um reload manual (mesmo racional do revalidatePath adicionado em
    // atualizarEstagioInteresse acima).
    revalidatePath("/app/pipeline");

    switch (resultado.tipo) {
      case "ja_fechado":
        return sucesso(destino === "WON" ? "Já estava marcado como ganho." : "Já estava marcado como perdido.");
      case "transicao_invalida":
        return erroGenerico("Este relacionamento já foi encerrado com outro resultado.");
      case "nao_encontrado":
        return erroAcessoNegado("Relacionamento não encontrado.");
      case "corrida_nao_resolvida":
        return erroGenerico("Não foi possível concluir agora devido a uma alteração concorrente — tente novamente.");
      case "fechado_agora":
        return sucesso(destino === "WON" ? "Negociação marcada como ganha." : "Negociação marcada como perdida.");
    }
  });
}

// =====================================================================
// Fase 10 — corrigir os dados FINANCEIROS de um negócio já ganho
// =====================================================================
// Fecha a dívida registrada na Fase 9: até aqui, um valor digitado errado
// no fechamento só podia ser consertado direto no banco.
//
// O que esta ação NÃO faz, por decisão:
//   - não reabre o pipeline: `stage` continua WON e nunca é tocado;
//   - não recalcula `closedAt`: o negócio foi fechado quando foi fechado,
//     e a correção é sobre os NÚMEROS, não sobre a data do evento;
//   - não existe para negócio aberto nem para REJECTED — só WON tem
//     valores financeiros para corrigir.
//
// Não é edição silenciosa: cada correção grava um ActivityLog com o campo
// alterado e os valores de/para. Valor de negócio não é PII (o payload
// do ActivityLog já registra transições de estado em todo o projeto), e
// é justamente esse rastro que torna a correção auditável em vez de
// perigosa.
export async function corrigirDadosFechamento(
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
  const escopo = await escopoComercialDaSessao(organizationId);

  const valorInterpretado = interpretarValorFechamento(formData.get("valorFechamento"));
  if (!valorInterpretado.ok) return erroGenerico(valorInterpretado.erro);
  const comissaoInterpretada = interpretarComissao(formData.get("valorComissao"));
  if (!comissaoInterpretada.ok) return erroGenerico(comissaoInterpretada.erro);
  if (comissaoExcedeValorFechado(comissaoInterpretada.valor, valorInterpretado.valor)) {
    return erroGenerico("A comissão não pode ser maior que o valor de fechamento.");
  }

  return withOrganization(organizationId, async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      // Fase 13 — MESMA trava da divisão, e não uma nova: corrigir a
      // comissão total agora valida contra as parcelas atribuídas, então
      // esta ação disputa a mesma invariante que adicionar/editar
      // participante e registrar pagamento. Um único lock por negociação
      // cobre os três níveis (comissão, parcela, pagamento) e elimina
      // qualquer ordem de aquisição — logo, qualquer deadlock.
      await travarDivisao(tx, organizationId, interesseId);

      // Fronteira de tenant + guard de estado numa leitura só. O WHERE do
      // updateMany repete stage: "WON" para que um fechamento revertido
      // por outra transação no meio do caminho não seja corrigido às
      // cegas.
      const atual = await tx.propertyInterest.findFirst({
        where: whereNegociacaoAlvo(escopo, interesseId, organizationId),
        select: { id: true, personId: true, propertyId: true, stage: true, closedValue: true, commissionValue: true },
      });
      if (!atual) return { tipo: "nao_encontrado" as const };
      if (atual.stage !== "WON") return { tipo: "nao_ganho" as const };

      // Fase 13 — INVARIANTE: commissionValue >= Σ allocationValue.
      // Antes desta fase a correção não olhava as parcelas, e reduzir a
      // comissão deixava a divisão somando mais que o total — quebrando
      // em silêncio a regra que a Fase 12 valida na outra ponta.
      const parcelas = await tx.propertyInterestParticipant.findMany({
        where: { organizationId, propertyInterestId: interesseId },
        select: { allocationValue: true },
      });
      const totalAtribuido = parcelas.reduce(
        (soma, parcela) => soma + (decimalParaValor(parcela.allocationValue) ?? 0),
        0
      );
      const totalAtribuidoCentavos = Math.round(totalAtribuido * 100) / 100;
      if (totalAtribuidoCentavos > 0) {
        if (comissaoInterpretada.valor === null) {
          return { tipo: "abaixo_das_parcelas" as const, atribuido: totalAtribuidoCentavos };
        }
        if (comissaoInterpretada.valor < totalAtribuidoCentavos) {
          return { tipo: "abaixo_das_parcelas" as const, atribuido: totalAtribuidoCentavos };
        }
      }

      const atualizado = await tx.propertyInterest.updateMany({
        where: { id: interesseId, organizationId, stage: "WON" },
        data: {
          closedValue: valorInterpretado.valor,
          commissionValue: comissaoInterpretada.valor,
        },
      });
      if (atualizado.count === 0) return { tipo: "corrida" as const };

      await tx.activityLog.create({
        data: {
          organizationId,
          userId: session.user.id,
          entity: "PropertyInterest",
          entityId: interesseId,
          action: "property_interest_closing_corrected",
          payload: {
            closedValueDe: decimalParaValor(atual.closedValue),
            closedValuePara: valorInterpretado.valor,
            commissionValueDe: decimalParaValor(atual.commissionValue),
            commissionValuePara: comissaoInterpretada.valor,
          },
        },
      });

      return { tipo: "corrigido" as const, personId: atual.personId, propertyId: atual.propertyId };
    });

    if (resultado.tipo === "nao_encontrado") {
      return erroAcessoNegado("Relacionamento não encontrado.");
    }
    if (resultado.tipo === "nao_ganho") {
      return erroGenerico("Só é possível corrigir os valores de uma negociação ganha.");
    }
    if (resultado.tipo === "abaixo_das_parcelas") {
      return erroGenerico(
        `A comissão não pode ficar abaixo do que já foi dividido entre os participantes (${formatarPreco(resultado.atribuido)}). Ajuste a divisão primeiro.`
      );
    }
    if (resultado.tipo === "corrida") {
      return erroGenerico("Não foi possível concluir agora devido a uma alteração concorrente — tente novamente.");
    }

    revalidatePath(`/app/clientes/${resultado.personId}`);
    revalidatePath(`/app/imoveis/${resultado.propertyId}`);
    revalidatePath("/app/pipeline");
    return sucesso("Valores do fechamento atualizados.");
  });
}

// =====================================================================
// Fase 11 — TRANSFERIR a negociação para outro responsável
// =====================================================================
// Necessidade auditada, não presumida: sem transferência, um responsável
// errado só seria corrigível direto no banco — exatamente a dívida que a
// Fase 9 deixou para closedValue e que a Fase 10 teve de pagar. E a
// própria barra de filtros do Pipeline já carregava a nota de que
// "Corretor" não existia como filtro server-side.
//
// BLOQUEADA EM NEGOCIAÇÃO FECHADA (WON/REJECTED). Este campo guarda o
// responsável ATUAL, e o Analytics atribui o resultado do período a ele.
// Permitir transferir depois do fechamento deixaria qualquer pessoa
// reescrever a performance de um período já encerrado — um ganho de
// março mudaria de dono em setembro. Como consequência direta disso, o
// valor é imutável após o fechamento e NÃO existe
// closedByResponsibleMemberId: um snapshot seria cópia do mesmo dado.
// Limitação assumida: corrigir o responsável de um negócio já fechado
// exige um fluxo administrativo auditável que esta fase não cria.
//
// Não é alteração silenciosa: grava ActivityLog com de/para.
export async function transferirResponsavelNegociacao(
  interesseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  // AUTORIZAÇÃO: o produto não tem papel gerencial de carteira comercial
  // (OrganizationRole cobre gestão de usuários/plataforma, não "gerente
  // de vendas"), então quem tem CRM pode transferir. Inventar um papel
  // novo aqui seria criar domínio sem evidência. Limitação documentada;
  // o rastro fica no ActivityLog, com o ator.
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }
  const escopo = await escopoComercialDaSessao(organizationId);

  const bruto = formData.get("responsavelId");
  const escolhido = String(bruto ?? "").trim();
  // String vazia = "deixar sem responsável", um destino legítimo (o
  // corretor saiu e ninguém assumiu ainda). Só um id de fato informado
  // passa pela validação de tenant/status.
  let destino: string | null = null;
  if (escolhido) {
    const validado = await validarMembroAtribuivel(organizationId, escolhido);
    if (!validado.ok) return erroGenerico(validado.erro);
    destino = validado.responsibleMemberId;
  }

  return withOrganization(organizationId, async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      const atual = await tx.propertyInterest.findFirst({
        where: whereNegociacaoAlvo(escopo, interesseId, organizationId),
        select: {
          id: true,
          personId: true,
          propertyId: true,
          stage: true,
          responsibleMemberId: true,
        },
      });
      if (!atual) return { tipo: "nao_encontrado" as const };
      if (estagioInteresseEncerrado(atual.stage)) return { tipo: "encerrado" as const };
      if (atual.responsibleMemberId === destino) return { tipo: "sem_mudanca" as const };

      // O WHERE repete os stages abertos: se outra transação fechar a
      // negociação no meio do caminho, a transferência não acontece às
      // cegas depois do fechamento.
      const atualizado = await tx.propertyInterest.updateMany({
        where: { id: interesseId, organizationId, stage: { in: [...ESTAGIOS_INTERESSE] } },
        data: { responsibleMemberId: destino },
      });
      if (atualizado.count === 0) return { tipo: "corrida" as const };

      // Um evento só, com de/para — `de: null` é a PRIMEIRA atribuição
      // (negociação legada assumida por alguém), e não um caso à parte.
      // A criação já é registrada por property_interest_created, então um
      // evento separado de "assigned" duplicaria o mesmo fato.
      // Só ids: nome de membro é PII desnecessária no log, e o id
      // resolve o nome atual na leitura.
      await tx.activityLog.create({
        data: {
          organizationId,
          userId: session.user.id,
          entity: "PropertyInterest",
          entityId: interesseId,
          action: "property_interest_reassigned",
          payload: { deMemberId: atual.responsibleMemberId, paraMemberId: destino },
        },
      });

      return { tipo: "transferido" as const, personId: atual.personId, propertyId: atual.propertyId };
    });

    if (resultado.tipo === "nao_encontrado") {
      return erroAcessoNegado("Negociação não encontrada.");
    }
    if (resultado.tipo === "encerrado") {
      return erroGenerico(
        "Não é possível trocar o responsável de uma negociação já encerrada."
      );
    }
    if (resultado.tipo === "sem_mudanca") {
      return sucesso("Responsável mantido.");
    }
    if (resultado.tipo === "corrida") {
      return erroGenerico(
        "Não foi possível concluir agora devido a uma alteração concorrente — tente novamente."
      );
    }

    revalidatePath(`/app/clientes/${resultado.personId}`);
    revalidatePath(`/app/imoveis/${resultado.propertyId}`);
    revalidatePath("/app/pipeline");
    return sucesso("Responsável atualizado.");
  });
}

// =====================================================================
// Fase 12 — PARTICIPANTES da negociação e divisão da comissão
// =====================================================================
// commissionValue (Fase 10) é a comissão TOTAL do negócio. Estas ações
// registram quem participa dela e com quanto — sempre por decisão
// explícita, nunca por dedução.
//
// O QUE ESTAS AÇÕES NUNCA FAZEM:
//   - não criam participante sozinhas (nem o responsável, nem ninguém);
//   - não distribuem o saldo restante para alguém;
//   - não presumem 100%, 50/50 nem percentual de mercado;
//   - não persistem percentual — o "%" da tela só calcula um valor.
//
// EDIÇÃO DEPOIS DO FECHAMENTO É PERMITIDA, diferente da transferência de
// responsável (Fase 11, bloqueada em WON/REJECTED). O motivo é o fluxo
// real: a comissão costuma ser conhecida DEPOIS do fechamento, e a
// divisão depende dela — travar o split ao fechar tornaria impossível
// registrar a divisão da maioria dos negócios reais. Em troca, toda
// alteração é auditada em ActivityLog.
//
// CONCORRÊNCIA: a soma das parcelas é uma invariante que atravessa
// linhas, então ler-somar-gravar sem proteção permitiria que duas
// escritas simultâneas passassem juntas do teto. Todas as três ações
// abaixo serializam pelo MESMO advisory lock, keyed na negociação —
// mesmo mecanismo já usado em criarPessoa para o limite de plano.
// pg_advisory_xact_lock é liberado no commit/rollback, nunca precisa de
// unlock explícito, e trava só esta negociação (não a organização).
// O cliente de transação vem do prisma ESTENDIDO (src/lib/prisma.ts usa
// $extends para o tenant-scoping), cujo tipo não é Prisma.TransactionClient.
// Derivar do próprio $transaction mantém os dois em sincronia sozinhos.
type ClienteTransacao = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function travarDivisao(
  tx: ClienteTransacao,
  organizationId: string,
  interesseId: string
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${`split:${interesseId}`}))`;
}

// Fase 14 — ATOR da transição de etapa, com guarda de tenant.
//
// O organizationMemberId da sessão é emitido no login para a organização
// da sessão, então na prática já é consistente. Ainda assim a FK é
// simples (não composta com organizationId) e este é um registro de
// auditoria: uma sessão inconsistente jamais pode gravar FK cross-tenant
// no histórico. Membro de outra organização (ou ausente) devolve null —
// "ator não registrado" —, e a transição NUNCA é bloqueada por isso:
// registrar quem moveu é secundário a registrar que moveu.
//
// Uma leitura por chave primária, dentro da transação que já está aberta.
async function resolverAtorTransicao(
  tx: ClienteTransacao,
  organizationId: string,
  memberIdDaSessao: string | undefined
): Promise<string | null> {
  if (!memberIdDaSessao) return null;
  const membro = await tx.organizationMember.findFirst({
    where: { id: memberIdDaSessao, organizationId },
    select: { id: true },
  });
  return membro?.id ?? null;
}

// Carrega, DENTRO da transação já travada, tudo que a validação precisa:
// a negociação (com a comissão total) e as participações existentes.
async function carregarDivisao(
  tx: ClienteTransacao,
  organizationId: string,
  interesseId: string,
  // Fase 22 — esta é a leitura que autoriza os fluxos de divisão de
  // comissão: fora do escopo devolve null e a action segue pelo mesmo
  // caminho de "não encontrado" que já existia.
  escopo: EscopoComercial
) {
  const interesse = await tx.propertyInterest.findFirst({
    where: whereNegociacaoAlvo(escopo, interesseId, organizationId),
    select: {
      id: true,
      personId: true,
      propertyId: true,
      stage: true,
      commissionValue: true,
    },
  });
  if (!interesse) return null;
  const participantes = await tx.propertyInterestParticipant.findMany({
    where: { organizationId, propertyInterestId: interesseId },
    select: {
      id: true,
      memberId: true,
      allocationValue: true,
      // Fase 13 — só os pagamentos VÁLIDOS: cancelado sai da soma sem
      // sumir do histórico. Carregado junto (batched) porque toda
      // validação de parcela agora depende do que já foi pago.
      payments: {
        where: { organizationId, cancelledAt: null },
        select: { id: true, amount: true },
      },
    },
  });
  return { interesse, participantes };
}

function revalidarDivisao(personId: string, propertyId: string) {
  revalidatePath(`/app/clientes/${personId}`);
  revalidatePath(`/app/imoveis/${propertyId}`);
  revalidatePath("/app/pipeline");
}

// Adiciona um participante à divisão. A parcela é OPCIONAL: dá para
// registrar quem participou antes de saber quanto.
export async function adicionarParticipante(
  interesseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  // AUTORIZAÇÃO: o produto não tem papel financeiro (OrganizationRole
  // cobre gestão de usuários/plataforma, não "financeiro"), então o gate
  // é o do CRM — inventar um papel aqui seria criar domínio sem
  // evidência. Limitação documentada; o rastro fica no ActivityLog.
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }
  const escopo = await escopoComercialDaSessao(organizationId);

  const membroId = String(formData.get("memberId") ?? "").trim();
  if (!membroId) return erroGenerico("Selecione um participante.");
  const membroValidado = await validarMembroAtribuivel(organizationId, membroId);
  if (!membroValidado.ok) return erroGenerico(membroValidado.erro);

  const alocacao = interpretarAlocacao(formData.get("valorParticipacao"));
  if (!alocacao.ok) return erroGenerico(alocacao.erro);

  return withOrganization(organizationId, async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      await travarDivisao(tx, organizationId, interesseId);
      const dados = await carregarDivisao(tx, organizationId, interesseId, escopo);
      if (!dados) return { tipo: "nao_encontrado" as const };

      if (dados.participantes.some((p) => p.memberId === membroId)) {
        return { tipo: "duplicado" as const };
      }

      const validacao = validarAlocacaoContraTotal(
        alocacao.valor,
        decimalParaValor(dados.interesse.commissionValue),
        dados.participantes.map((p) => decimalParaValor(p.allocationValue))
      );
      if (!validacao.ok) return { tipo: "invalido" as const, erro: validacao.erro };

      const criado = await tx.propertyInterestParticipant.create({
        data: {
          organizationId,
          propertyInterestId: interesseId,
          memberId: membroId,
          allocationValue: alocacao.valor,
        },
        select: { id: true },
      });

      await tx.activityLog.create({
        data: {
          organizationId,
          userId: session.user.id,
          entity: "PropertyInterest",
          entityId: interesseId,
          action: "property_interest_participant_added",
          // Só ids e valores: nome de membro é PII desnecessária no log.
          payload: { participantId: criado.id, memberId: membroId, valor: alocacao.valor },
        },
      });

      return {
        tipo: "ok" as const,
        personId: dados.interesse.personId,
        propertyId: dados.interesse.propertyId,
      };
    });

    if (resultado.tipo === "nao_encontrado") return erroAcessoNegado("Negociação não encontrada.");
    if (resultado.tipo === "duplicado") {
      return erroGenerico("Este usuário já participa da divisão desta negociação.");
    }
    if (resultado.tipo === "invalido") return erroGenerico(resultado.erro);

    revalidarDivisao(resultado.personId, resultado.propertyId);
    return sucesso("Participante adicionado.");
  });
}

// Altera a parcela de um participante já existente. Campo vazio volta o
// valor para "ainda não definida" (null), que é um estado legítimo — e
// diferente de zero, que a validação recusa.
export async function atualizarParticipante(
  participanteId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }
  const escopo = await escopoComercialDaSessao(organizationId);

  const alocacao = interpretarAlocacao(formData.get("valorParticipacao"));
  if (!alocacao.ok) return erroGenerico(alocacao.erro);

  return withOrganization(organizationId, async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      // O id da negociação vem do PRÓPRIO registro, nunca do formulário:
      // não há como o navegador apontar a edição para outra negociação.
      // Fase 22 — o participante pertence a uma NEGOCIAÇÃO; remover um
      // de negociação fora do escopo seria escrita não autorizada.
      // (adicionar/atualizar passam por carregarDivisao, que já valida.)
      const atual = await tx.propertyInterestParticipant.findFirst({
        where: {
          id: participanteId,
          organizationId,
          propertyInterest: { is: whereNegociacao(escopo) },
        },
        select: { id: true, propertyInterestId: true, memberId: true, allocationValue: true },
      });
      if (!atual) return { tipo: "nao_encontrado" as const };

      await travarDivisao(tx, organizationId, atual.propertyInterestId);
      const dados = await carregarDivisao(tx, organizationId, atual.propertyInterestId, escopo);
      if (!dados) return { tipo: "nao_encontrado" as const };

      // A própria linha sai do conjunto comparado: editar uma parcela não
      // pode competir com ela mesma no teto.
      const outras = dados.participantes
        .filter((p) => p.id !== participanteId)
        .map((p) => decimalParaValor(p.allocationValue));
      const validacao = validarAlocacaoContraTotal(
        alocacao.valor,
        decimalParaValor(dados.interesse.commissionValue),
        outras
      );
      if (!validacao.ok) return { tipo: "invalido" as const, erro: validacao.erro };

      // Fase 13 — INVARIANTE NOVA: a parcela não pode cair abaixo do que
      // já foi pago, nem virar "sem valor" com pagamento registrado.
      // Sem isto, reduzir a atribuição transformaria pagamento válido em
      // dívida negativa.
      const estaLinha = dados.participantes.find((p) => p.id === participanteId);
      const validacaoPagamentos = validarAtribuicaoContraPagamentos(
        alocacao.valor,
        (estaLinha?.payments ?? []).map((pg) => decimalParaValor(pg.amount) ?? 0)
      );
      if (!validacaoPagamentos.ok) {
        return { tipo: "invalido" as const, erro: validacaoPagamentos.erro };
      }

      const anterior = decimalParaValor(atual.allocationValue);
      if (anterior === alocacao.valor) return { tipo: "sem_mudanca" as const };

      await tx.propertyInterestParticipant.update({
        where: { id: participanteId, organizationId },
        data: { allocationValue: alocacao.valor },
      });

      await tx.activityLog.create({
        data: {
          organizationId,
          userId: session.user.id,
          entity: "PropertyInterest",
          entityId: atual.propertyInterestId,
          action: "property_interest_participant_updated",
          payload: {
            participantId: participanteId,
            memberId: atual.memberId,
            valorDe: anterior,
            valorPara: alocacao.valor,
          },
        },
      });

      return {
        tipo: "ok" as const,
        personId: dados.interesse.personId,
        propertyId: dados.interesse.propertyId,
      };
    });

    if (resultado.tipo === "nao_encontrado") return erroAcessoNegado("Participação não encontrada.");
    if (resultado.tipo === "invalido") return erroGenerico(resultado.erro);
    if (resultado.tipo === "sem_mudanca") return sucesso("Participação mantida.");

    revalidarDivisao(resultado.personId, resultado.propertyId);
    return sucesso("Participação atualizada.");
  });
}

// Remove um participante da divisão. Não redistribui a parcela dele para
// ninguém: o valor volta a ser saldo NÃO DISTRIBUÍDO, e a tela diz isso.
export async function removerParticipante(
  participanteId: string,
  // Assinatura exigida por useActionState; nenhum dos dois é lido — o
  // único input desta ação é o participanteId bindado (mesmo padrão e
  // mesmo disable de criarOportunidadeDoContato).
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
  const escopo = await escopoComercialDaSessao(organizationId);

  return withOrganization(organizationId, async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      // Fase 22 — o participante pertence a uma NEGOCIAÇÃO; remover um
      // de negociação fora do escopo seria escrita não autorizada.
      // (adicionar/atualizar passam por carregarDivisao, que já valida.)
      const atual = await tx.propertyInterestParticipant.findFirst({
        where: {
          id: participanteId,
          organizationId,
          propertyInterest: { is: whereNegociacao(escopo) },
        },
        select: {
          id: true,
          propertyInterestId: true,
          memberId: true,
          allocationValue: true,
          propertyInterest: { select: { personId: true, propertyId: true, organizationId: true } },
        },
      });
      if (!atual || atual.propertyInterest.organizationId !== organizationId) {
        return { tipo: "nao_encontrado" as const };
      }

      await travarDivisao(tx, organizationId, atual.propertyInterestId);

      // Fase 13 — participação com QUALQUER histórico de pagamento não é
      // removível, inclusive quando todos foram cancelados. Apagá-la
      // destruiria o registro de que houve movimento financeiro — e
      // cancelado existe justamente para preservar esse rastro, não para
      // liberar a exclusão. É também o que a FK RESTRICT do ledger
      // impõe no banco: contar só os válidos deixaria a action aprovar
      // um delete que o Postgres recusaria em seguida.
      const pagamentosNoLedger = await tx.propertyInterestParticipantPayment.count({
        where: { organizationId, participantId: participanteId },
      });
      if (pagamentosNoLedger > 0) return { tipo: "tem_pagamento" as const };

      const removido = await tx.propertyInterestParticipant.deleteMany({
        where: { id: participanteId, organizationId },
      });
      if (removido.count === 0) return { tipo: "corrida" as const };

      await tx.activityLog.create({
        data: {
          organizationId,
          userId: session.user.id,
          entity: "PropertyInterest",
          entityId: atual.propertyInterestId,
          action: "property_interest_participant_removed",
          payload: {
            participantId: participanteId,
            memberId: atual.memberId,
            valor: decimalParaValor(atual.allocationValue),
          },
        },
      });

      return {
        tipo: "ok" as const,
        personId: atual.propertyInterest.personId,
        propertyId: atual.propertyInterest.propertyId,
      };
    });

    if (resultado.tipo === "nao_encontrado") return erroAcessoNegado("Participação não encontrada.");
    if (resultado.tipo === "tem_pagamento") {
      return erroGenerico(
        "Esta participação tem histórico de pagamentos e não pode ser removida. Se a divisão mudou, ajuste o valor da participação."
      );
    }
    if (resultado.tipo === "corrida") {
      return erroGenerico("Não foi possível concluir agora devido a uma alteração concorrente — tente novamente.");
    }

    revalidarDivisao(resultado.personId, resultado.propertyId);
    return sucesso("Participante removido.");
  });
}

// =====================================================================
// Fase 13 — PAGAMENTO de comissão (liquidação da parcela)
// =====================================================================
// ATRIBUÍDO NÃO É PAGO. Estas ações registram o FATO de que dinheiro
// mudou de mãos; nada é inferido de WON, de commissionValue, de
// allocationValue nem da data de fechamento.
//
// AUTORIZAÇÃO: gate próprio, mais estreito que o do split. Registrar ou
// cancelar pagamento afirma que dinheiro saiu — mais grave que atribuir
// uma parcela. Não é papel financeiro inventado: é a camada gerencial
// que src/lib/authorization.ts já define (OWNER/ADMIN/MANAGER), o mesmo
// mecanismo usado nas outras áreas sensíveis do painel.
//
// SOMENTE EM NEGÓCIO GANHO. A Fase 12 permite participantes em negócio
// aberto (dá para saber quem trabalhou antes de saber quanto), mas
// "pagar comissão" de um negócio que ainda não foi ganho seria outro
// domínio — adiantamento — que este produto não modela.
//
// CONCORRÊNCIA: mesma trava por NEGOCIAÇÃO da Fase 12
// (travarDivisao), deliberadamente e não por preguiça. Um lock mais fino
// por participante seria suficiente para a soma de pagamentos, mas
// criaria um SEGUNDO domínio de lock convivendo com o da divisão — e
// duas ações que precisassem dos dois em ordens diferentes fechariam um
// deadlock. Um lock por negociação cobre comissão, parcelas e
// pagamentos, então não existe ordem de aquisição a definir.
async function carregarParcelaParaPagamento(
  tx: ClienteTransacao,
  organizationId: string,
  participanteId: string
) {
  const parcela = await tx.propertyInterestParticipant.findUnique({
    where: { id: participanteId, organizationId },
    select: {
      id: true,
      allocationValue: true,
      propertyInterestId: true,
      propertyInterest: {
        select: { organizationId: true, stage: true, personId: true, propertyId: true },
      },
    },
  });
  // organizationId conferido também na negociação: as FKs são simples e
  // a leitura nunca confia numa linha anômala cross-tenant.
  if (!parcela || parcela.propertyInterest.organizationId !== organizationId) return null;
  return parcela;
}

async function pagamentosValidosDaParcela(
  tx: ClienteTransacao,
  organizationId: string,
  participanteId: string
) {
  const linhas = await tx.propertyInterestParticipantPayment.findMany({
    where: { organizationId, participantId: participanteId, cancelledAt: null },
    select: { amount: true },
  });
  return linhas.map((l) => decimalParaValor(l.amount) ?? 0);
}

// Registra um pagamento REALIZADO. Parcial é o caso normal: a soma dos
// pagamentos válidos vai caminhando até a parcela atribuída.
export async function registrarPagamentoParticipante(
  participanteId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(await papelAtual(), PAPEIS_LIQUIDACAO_COMISSAO)) {
    return erroAcessoNegado("Você não tem permissão para registrar pagamentos de comissão.");
  }

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }
  // Fase 22 — sem predicado de escopo AQUI de propósito: esta action
  // já exige PAPEIS_LIQUIDACAO_COMISSAO (OWNER/ADMIN/MANAGER), e os
  // três resolvem para escopo de ORGANIZAÇÃO em qualquer política.
  // O predicado seria `{}` — literalmente sem efeito. Documentado em
  // vez de aplicado por simetria, que sugeriria uma proteção que não
  // está agindo aqui.

  const valor = interpretarPagamento(formData.get("valorPagamento"));
  if (!valor.ok) return erroGenerico(valor.erro);
  const data = interpretarDataPagamento(formData.get("dataPagamento"));
  if (!data.ok) return erroGenerico(data.erro);

  return withOrganization(organizationId, async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      // Primeira leitura serve APENAS para descobrir a que negociação
      // esta parcela pertence — é o que compõe a chave da trava.
      const referencia = await carregarParcelaParaPagamento(tx, organizationId, participanteId);
      if (!referencia) return { tipo: "nao_encontrado" as const };

      await travarDivisao(tx, organizationId, referencia.propertyInterestId);

      // RELEITURA DEPOIS DA TRAVA, e não reaproveitamento da leitura
      // acima: em READ COMMITTED, o valor lido antes do lock pode já ter
      // sido alterado por uma transação que estava na frente da fila.
      // Achado real de teste — sem esta releitura, um pagamento aprovado
      // contra a parcela antiga convivia com uma redução aprovada logo
      // antes, deixando pago > atribuído.
      const parcela = await carregarParcelaParaPagamento(tx, organizationId, participanteId);
      if (!parcela) return { tipo: "nao_encontrado" as const };

      if (parcela.propertyInterest.stage !== "WON") {
        return { tipo: "nao_ganho" as const };
      }

      const jaPagos = await pagamentosValidosDaParcela(tx, organizationId, participanteId);
      const validacao = validarPagamentoContraAtribuicao(
        valor.valor,
        decimalParaValor(parcela.allocationValue),
        jaPagos
      );
      if (!validacao.ok) return { tipo: "invalido" as const, erro: validacao.erro };

      const criado = await tx.propertyInterestParticipantPayment.create({
        data: {
          organizationId,
          participantId: participanteId,
          amount: valor.valor,
          paidAt: data.data,
          // Ator tenant-specific. `?? null` porque uma sessão sem vínculo
          // de organização é estado possível — o pagamento continua
          // válido, só sem o rastro de quem digitou (o ActivityLog abaixo
          // guarda o User de qualquer forma).
          createdByMemberId: session.user.organizationMemberId ?? null,
        },
        select: { id: true },
      });

      await tx.activityLog.create({
        data: {
          organizationId,
          userId: session.user.id,
          entity: "PropertyInterest",
          entityId: parcela.propertyInterestId,
          action: "property_interest_payment_added",
          // Só ids, valores e datas — nenhum nome.
          payload: {
            paymentId: criado.id,
            participantId: participanteId,
            valor: valor.valor,
            paidAt: data.data.toISOString(),
          },
        },
      });

      return {
        tipo: "ok" as const,
        personId: parcela.propertyInterest.personId,
        propertyId: parcela.propertyInterest.propertyId,
      };
    });

    if (resultado.tipo === "nao_encontrado") return erroAcessoNegado("Participação não encontrada.");
    if (resultado.tipo === "nao_ganho") {
      return erroGenerico(
        "Só é possível registrar pagamento de comissão em uma negociação ganha."
      );
    }
    if (resultado.tipo === "invalido") return erroGenerico(resultado.erro);

    revalidarDivisao(resultado.personId, resultado.propertyId);
    return sucesso("Pagamento registrado.");
  });
}

// Cancela um pagamento — e é também o caminho de CORREÇÃO: valor errado
// se conserta cancelando e registrando o certo, nunca reescrevendo um
// fato consumado. A linha permanece no histórico, marcada; só sai da
// soma paga.
export async function cancelarPagamentoParticipante(
  pagamentoId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(await papelAtual(), PAPEIS_LIQUIDACAO_COMISSAO)) {
    return erroAcessoNegado("Você não tem permissão para cancelar pagamentos de comissão.");
  }

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }
  // Fase 22 — sem predicado de escopo AQUI de propósito: esta action
  // já exige PAPEIS_LIQUIDACAO_COMISSAO (OWNER/ADMIN/MANAGER), e os
  // três resolvem para escopo de ORGANIZAÇÃO em qualquer política.
  // O predicado seria `{}` — literalmente sem efeito. Documentado em
  // vez de aplicado por simetria, que sugeriria uma proteção que não
  // está agindo aqui.

  return withOrganization(organizationId, async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      const pagamento = await tx.propertyInterestParticipantPayment.findUnique({
        where: { id: pagamentoId, organizationId },
        select: {
          id: true,
          amount: true,
          cancelledAt: true,
          participantId: true,
          participant: {
            select: {
              organizationId: true,
              propertyInterestId: true,
              propertyInterest: { select: { personId: true, propertyId: true } },
            },
          },
        },
      });
      if (!pagamento || pagamento.participant.organizationId !== organizationId) {
        return { tipo: "nao_encontrado" as const };
      }
      if (pagamento.cancelledAt !== null) return { tipo: "ja_cancelado" as const };

      await travarDivisao(tx, organizationId, pagamento.participant.propertyInterestId);

      // O WHERE repete cancelledAt: null — se outra transação cancelar no
      // meio do caminho, esta não sobrescreve o cancelamento alheio.
      const atualizado = await tx.propertyInterestParticipantPayment.updateMany({
        where: { id: pagamentoId, organizationId, cancelledAt: null },
        data: {
          cancelledAt: new Date(),
          cancelledByMemberId: session.user.organizationMemberId ?? null,
        },
      });
      if (atualizado.count === 0) return { tipo: "corrida" as const };

      await tx.activityLog.create({
        data: {
          organizationId,
          userId: session.user.id,
          entity: "PropertyInterest",
          entityId: pagamento.participant.propertyInterestId,
          action: "property_interest_payment_cancelled",
          payload: {
            paymentId: pagamentoId,
            participantId: pagamento.participantId,
            valor: decimalParaValor(pagamento.amount),
          },
        },
      });

      return {
        tipo: "ok" as const,
        personId: pagamento.participant.propertyInterest.personId,
        propertyId: pagamento.participant.propertyInterest.propertyId,
      };
    });

    if (resultado.tipo === "nao_encontrado") return erroAcessoNegado("Pagamento não encontrado.");
    if (resultado.tipo === "ja_cancelado") return erroGenerico("Este pagamento já está cancelado.");
    if (resultado.tipo === "corrida") {
      return erroGenerico("Não foi possível concluir agora devido a uma alteração concorrente — tente novamente.");
    }

    revalidarDivisao(resultado.personId, resultado.propertyId);
    return sucesso("Pagamento cancelado.");
  });
}

// Marca o relacionamento como ganho (stage=WON, closedAt=agora,
// closedValue=valor informado). O único dado que vem do FormData é o
// VALOR — stage, closedAt e o tenant continuam sendo decididos aqui, e o
// valor é validado no servidor antes de qualquer escrita.
export async function marcarInteresseComoGanho(
  interesseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  return fecharInteresse(
    interesseId,
    "WON",
    formData.get("valorFechamento"),
    formData.get("valorComissao")
  );
}

// Marca o relacionamento como perdido (stage=REJECTED, closedAt=agora).
// REJECTED continua sendo o valor técnico do enum — a UI exibe "Perdido"
// (ESTAGIO_INTERESSE_LABEL, src/lib/property-interest-schema.ts), nenhum enum novo.
export async function marcarInteresseComoPerdido(
  interesseId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  return fecharInteresse(interesseId, "REJECTED");
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
  const escopo = await escopoComercialDaSessao(organizationId);

  return withOrganization(organizationId, async () => {
    const atual = await prisma.propertyInterest.findFirst({
      where: whereNegociacaoAlvo(escopo, interesseId, organizationId),
      select: { favorited: true, personId: true },
    });
    if (!atual) return erroAcessoNegado("Relacionamento não encontrado.");

    const novoValor = !atual.favorited;
    await prisma.propertyInterest.update({
      // where único: o lookup acima já autorizou dentro do escopo.
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
  const escopo = await escopoComercialDaSessao(organizationId);

  return withOrganization(organizationId, async () => {
    const atual = await prisma.propertyInterest.findFirst({
      where: whereNegociacaoAlvo(escopo, interesseId, organizationId),
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

export type ResumoClienteDrawer = {
  id: string;
  name: string;
  roles: string[];
  source: string | null;
  pipelineStage: string;
  interacoes: {
    id: string;
    type: string;
    notes: string | null;
    occurredAt: Date;
    propertyTitulo: string | null;
  }[];
  contagens: {
    favoritos: number;
    visitados: number;
    propostas: number;
    atividades: number;
  };
};

// Redesenho da tela de Clientes — dado sob demanda do drawer lateral,
// buscado só quando um cliente é aberto (nunca por linha da listagem, ver
// comentário do SELECT batched em page.tsx). As 4 contagens usam
// prisma.propertyInterest.count/scheduledActivity.count — nenhuma delas
// tenta estimar; "atividades" conta TODA ScheduledActivity da pessoa
// (agendada, concluída ou cancelada), distinto do histórico de Interaction
// mostrado logo abaixo no drawer.
export async function buscarResumoClienteCrm(pessoaId: string): Promise<ResumoClienteDrawer | null> {
  const session = await auth();
  if (!session) redirect("/app/login");
  const organizationId = await requireOrganizationId();
  // Fase 22 — esta é uma SUPERFÍCIE DE PII alcançável por id (o drawer da
  // listagem a chama com o id da linha). Sem o escopo aqui, esconder o
  // cliente da lista não adiantaria nada: bastaria chamar a action com o
  // id certo para receber nome, telefone e e-mail.
  const escopo = await escopoComercialDaSessao(organizationId);

  return withOrganization(organizationId, async () => {
    const [pessoa, favoritos, visitados, propostas, atividades] = await Promise.all([
      prisma.person.findFirst({
        where: wherePessoaAlvo(escopo, pessoaId, organizationId),
        select: {
          id: true,
          name: true,
          roles: true,
          source: true,
          pipelineStage: true,
          interactions: {
            orderBy: { occurredAt: "desc" },
            take: 5,
            select: {
              id: true,
              type: true,
              notes: true,
              occurredAt: true,
              property: { select: { title: true } },
            },
          },
        },
      }),
      prisma.propertyInterest.count({ where: { organizationId, personId: pessoaId, favorited: true } }),
      prisma.propertyInterest.count({ where: { organizationId, personId: pessoaId, stage: "VISITED" } }),
      prisma.propertyInterest.count({ where: { organizationId, personId: pessoaId, stage: "PROPOSAL" } }),
      prisma.scheduledActivity.count({ where: { organizationId, personId: pessoaId } }),
    ]);

    if (!pessoa) return null;

    return {
      id: pessoa.id,
      name: pessoa.name,
      roles: pessoa.roles,
      source: pessoa.source,
      pipelineStage: pessoa.pipelineStage,
      interacoes: pessoa.interactions.map((i) => ({
        id: i.id,
        type: i.type,
        notes: i.notes,
        occurredAt: i.occurredAt,
        propertyTitulo: i.property?.title ?? null,
      })),
      contagens: { favoritos, visitados, propostas, atividades },
    };
  });
}
