import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { OrganizationRole } from "@/generated/prisma/client";
import { normalizarEmail } from "@/lib/rate-limit";
import { normalizarTelefone } from "@/lib/telefone";

// Fábrica de dados pra testes de integração — decoupled de prisma/seed.ts
// de propósito: o seed de produção não é feito pra ser reutilizado (função
// privada, roda como efeito colateral do import) e se a forma dele mudar
// não queremos que os testes quebrem silenciosamente por engano.
//
// Cada teste cria seu próprio Organization/Plan/User com identificadores
// únicos (contador + timestamp), o que permite os testes rodarem em
// paralelo (fileParallelism) e em qualquer ordem sem colidir em unique
// constraints (slug, email, code de plano).

let contador = 0;
function sufixoUnico(): string {
  contador += 1;
  return `${Date.now()}-${process.pid}-${contador}`;
}

// Catálogo de módulos é global (não pertence a nenhuma organização) —
// seguro de compartilhar entre testes via upsert; nunca é apagado pela
// limpeza de uma organização.
async function garantirModulo(code: string): Promise<string> {
  const modulo = await prisma.module.upsert({
    where: { code },
    update: {},
    create: { code, name: code },
  });
  return modulo.id;
}

export async function criarPlano(opcoes: {
  modulos?: string[];
  modulosDesabilitados?: string[];
  limites?: Record<string, number | null>;
  priceMonthlyCents?: number | null;
  isTrial?: boolean;
  trialDays?: number | null;
  active?: boolean;
} = {}): Promise<{ id: string }> {
  const plano = await prisma.plan.create({
    data: {
      code: `PLANO-TESTE-${sufixoUnico()}`,
      name: "Plano de teste",
      priceMonthlyCents: opcoes.priceMonthlyCents,
      isTrial: opcoes.isTrial ?? false,
      trialDays: opcoes.trialDays,
      active: opcoes.active ?? true,
    },
  });

  const habilitados = opcoes.modulos ?? ["core", "properties"];
  const desabilitados = opcoes.modulosDesabilitados ?? [];

  for (const code of [...habilitados, ...desabilitados]) {
    const moduleId = await garantirModulo(code);
    await prisma.planModule.create({
      data: {
        planId: plano.id,
        moduleId,
        enabled: !desabilitados.includes(code),
      },
    });
  }

  for (const [feature, limit] of Object.entries(opcoes.limites ?? {})) {
    await prisma.planLimit.create({ data: { planId: plano.id, feature, limit } });
  }

  return { id: plano.id };
}

export async function criarOrganizacao(opcoes: {
  planId?: string;
  slug?: string;
  name?: string;
} = {}): Promise<{ id: string; slug: string; planId: string }> {
  const planId = opcoes.planId ?? (await criarPlano()).id;
  const slug = opcoes.slug ?? `org-teste-${sufixoUnico()}`;
  const organization = await prisma.organization.create({
    data: { slug, name: opcoes.name ?? `Organização de teste ${slug}`, planId },
  });
  return { id: organization.id, slug: organization.slug, planId };
}

export async function criarUsuario(opcoes: {
  email?: string;
  name?: string;
  senha?: string;
} = {}): Promise<{ id: string; email: string; senha: string }> {
  const senha = opcoes.senha ?? "senha-de-teste-123";
  const email = opcoes.email ?? `usuario-teste-${sufixoUnico()}@e2e.test`;
  const user = await prisma.user.create({
    data: {
      email,
      name: opcoes.name ?? "Usuário de Teste",
      passwordHash: await bcrypt.hash(senha, 10),
    },
  });
  return { id: user.id, email: user.email, senha };
}

export async function criarMembro(opcoes: {
  organizationId: string;
  userId: string;
  role?: OrganizationRole;
}): Promise<{ id: string }> {
  const membro = await prisma.organizationMember.create({
    data: {
      organizationId: opcoes.organizationId,
      userId: opcoes.userId,
      role: opcoes.role ?? "OWNER",
    },
  });
  return { id: membro.id };
}

export async function criarImovel(opcoes: {
  organizationId: string;
  responsibleMemberId?: string;
  title?: string;
  status?: "DRAFT" | "AVAILABLE" | "RESERVED" | "SOLD" | "RENTED" | "INACTIVE";
  type?: string;
  purpose?: "SALE" | "RENT" | "SALE_AND_RENT";
  city?: string;
  neighborhood?: string;
  price?: number | null;
  rentPrice?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parkingSpots?: number | null;
  privateArea?: number | null;
  propertyFeatures?: string[];
  condoFeatures?: string[];
}): Promise<{ id: string }> {
  const imovel = await prisma.property.create({
    data: {
      organizationId: opcoes.organizationId,
      responsibleMemberId: opcoes.responsibleMemberId,
      title: opcoes.title ?? "Apartamento de teste",
      type: opcoes.type ?? "Apartamento",
      purpose: opcoes.purpose ?? "SALE",
      status: opcoes.status ?? "AVAILABLE",
      neighborhood: opcoes.neighborhood ?? "Bairro de teste",
      city: opcoes.city ?? "Cidade de teste",
      state: "SP",
      price: opcoes.price,
      rentPrice: opcoes.rentPrice,
      bedrooms: opcoes.bedrooms,
      bathrooms: opcoes.bathrooms,
      parkingSpots: opcoes.parkingSpots,
      privateArea: opcoes.privateArea,
      propertyFeatures: opcoes.propertyFeatures ?? [],
      condoFeatures: opcoes.condoFeatures ?? [],
    },
  });
  return { id: imovel.id };
}

export async function criarPessoa(opcoes: {
  organizationId: string;
  name?: string;
  email?: string;
  phone?: string;
  roles?: ("LEAD" | "CLIENT" | "OWNER")[];
}): Promise<{ id: string }> {
  // emailNormalized/phoneNormalized populados igual a todo call site real
  // (enviarContato, enviarAnuncioProprietario, criarPessoa em
  // src/app/app/clientes/actions.ts) — sem isso, uma Person criada só por
  // este fixture fica invisível pra resolverPessoaParaFormularioPublico
  // (src/lib/person-dedup.ts), que busca por esses campos, não pelos
  // brutos.
  const pessoa = await prisma.person.create({
    data: {
      organizationId: opcoes.organizationId,
      name: opcoes.name ?? "Pessoa de teste",
      email: opcoes.email,
      phone: opcoes.phone,
      emailNormalized: opcoes.email ? normalizarEmail(opcoes.email) : undefined,
      phoneNormalized: opcoes.phone ? normalizarTelefone(opcoes.phone) : undefined,
      roles: opcoes.roles ?? ["LEAD"],
    },
  });
  return { id: pessoa.id };
}

// Fase P.9 — PlatformOperator direto, pra testar Server Actions de
// /platform (autenticação mockada via vi.mock("@/lib/platform/auth"),
// mesmo padrão de auth de /app nos outros testes de integração).
export async function criarPlatformOperator(opcoes: {
  email?: string;
  name?: string;
  role?: "PLATFORM_ADMIN" | "PLATFORM_SUPPORT" | "SUPER_ADMIN";
} = {}): Promise<{ id: string; email: string; role: string }> {
  const email = opcoes.email ?? `platform-operator-teste-${sufixoUnico()}@e2e.test`;
  const operador = await prisma.platformOperator.create({
    data: {
      email,
      name: opcoes.name ?? "Operador de Teste",
      passwordHash: await bcrypt.hash("senha-de-teste-123", 10),
      role: opcoes.role ?? "SUPER_ADMIN",
    },
  });
  return { id: operador.id, email: operador.email, role: operador.role };
}

// PlatformAuditLog tem FK RESTRICT pra PlatformOperator — precisa sair
// antes do operador em qualquer limpeza de teste.
export async function destruirPlatformOperator(operatorId: string): Promise<void> {
  await prisma.platformAuditLog.deleteMany({ where: { platformOperatorId: operatorId } });
  await prisma.platformOperator.delete({ where: { id: operatorId } });
}

// Fase P.9 — override comercial direto (bypassa a action/UI, mesmo
// espírito de criarImovel/criarPessoa: monta o dado real via Prisma pra
// testar a leitura/resolução, não o formulário).
export async function criarOverride(opcoes: {
  organizationId: string;
  feature: string;
  limit: number | null;
}): Promise<{ id: string }> {
  const override = await prisma.organizationLimitOverride.create({
    data: { organizationId: opcoes.organizationId, feature: opcoes.feature, limit: opcoes.limit },
  });
  return { id: override.id };
}

// Fase P.9 — Subscription de trial direta, mesmo formato criado por
// criarOrganization (platform/organizations/nova/actions.ts) quando o
// plano escolhido é isTrial.
export async function criarSubscriptionTrial(opcoes: {
  organizationId: string;
  planId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}): Promise<{ id: string }> {
  const subscription = await prisma.subscription.create({
    data: {
      organizationId: opcoes.organizationId,
      planId: opcoes.planId,
      status: "TRIALING",
      currentPeriodStart: opcoes.currentPeriodStart,
      currentPeriodEnd: opcoes.currentPeriodEnd,
    },
  });
  return { id: subscription.id };
}

// Cenário pronto (plano + organização + usuário + membro), o caso comum da
// maioria dos testes de integração. destruir() apaga tudo que esse cenário
// criou, na ordem exigida pelas foreign keys do schema.
export async function criarCenario(opcoes: {
  role?: OrganizationRole;
  modulos?: string[];
  modulosDesabilitados?: string[];
  limites?: Record<string, number | null>;
  priceMonthlyCents?: number | null;
  isTrial?: boolean;
  trialDays?: number | null;
} = {}) {
  const plano = await criarPlano({
    modulos: opcoes.modulos,
    modulosDesabilitados: opcoes.modulosDesabilitados,
    limites: opcoes.limites,
    priceMonthlyCents: opcoes.priceMonthlyCents,
    isTrial: opcoes.isTrial,
    trialDays: opcoes.trialDays,
  });
  const organization = await criarOrganizacao({ planId: plano.id });
  const usuario = await criarUsuario();
  const membro = await criarMembro({
    organizationId: organization.id,
    userId: usuario.id,
    role: opcoes.role ?? "OWNER",
  });

  return {
    organization,
    plano,
    usuario,
    membro,
    async destruir() {
      await limparOrganizacao(organization.id, { userIds: [usuario.id], planId: plano.id });
    },
  };
}

// Apaga todos os dados de uma organização de teste, na ordem exigida pelas
// foreign keys (filhos antes de pais — ver prisma/schema.prisma). userIds e
// planId são opcionais porque nem todo teste cria um usuário/plano
// exclusivo (ex: ao reutilizar um cenário já existente).
export async function limparOrganizacao(
  organizationId: string,
  opcoes: { userIds?: string[]; planId?: string } = {}
): Promise<void> {
  await prisma.payment.deleteMany({ where: { invoice: { organizationId } } });
  await prisma.invoice.deleteMany({ where: { organizationId } });
  await prisma.subscription.deleteMany({ where: { organizationId } });
  // Fase P.9 — FK RESTRICT pra Organization, precisa sair antes do delete.
  await prisma.organizationLimitOverride.deleteMany({ where: { organizationId } });
  await prisma.billingEvent.deleteMany({ where: { organizationId } });
  await prisma.aiUsage.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.activityLog.deleteMany({ where: { organizationId } });
  await prisma.notificationPreference.deleteMany({
    where: { organizationMember: { organizationId } },
  });

  // Deal (cascata: DealPerson) e Interaction têm FK restrict pra Property —
  // precisam sair antes do Property.
  await prisma.deal.deleteMany({ where: { organizationId } });
  await prisma.interaction.deleteMany({ where: { organizationId } });
  // PropertyInterest.propertyId também é RESTRICT (Fase D) — mesma razão,
  // precisa sair antes do Property. (personId é CASCADE, sairia sozinho
  // com o Person.deleteMany abaixo, mas isso não ajuda aqui porque
  // Property.deleteMany roda antes do Person.deleteMany nesta função.)
  await prisma.propertyInterest.deleteMany({ where: { organizationId } });
  // Property cascateia Media, PropertyStatusHistory e PortalListing.
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.person.deleteMany({ where: { organizationId } });

  await prisma.featureOption.deleteMany({ where: { organizationId } });
  await prisma.propertyTypeOption.deleteMany({ where: { organizationId } });

  await prisma.organizationMember.deleteMany({ where: { organizationId } });
  await prisma.organizationSettings.deleteMany({ where: { organizationId } });
  await prisma.organizationBranding.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });

  if (opcoes.userIds?.length) {
    await prisma.user.deleteMany({ where: { id: { in: opcoes.userIds } } });
  }
  if (opcoes.planId) {
    await prisma.planLimit.deleteMany({ where: { planId: opcoes.planId } });
    await prisma.planModule.deleteMany({ where: { planId: opcoes.planId } });
    await prisma.plan.delete({ where: { id: opcoes.planId } });
  }
}
