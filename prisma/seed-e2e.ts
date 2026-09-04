// Seed determinístico pros testes E2E (Playwright) — roda contra o mesmo
// banco de teste do Vitest (imoveis_test), mas em dados fixos e idempotentes
// (upsert por id/slug/email), nunca apagados pela limpeza dos testes de
// integração (que só apaga o que ELES criam — ver src/test/fixtures.ts).
//
// Ids fixos de propósito onde os specs precisam navegar direto por URL
// (ex: /app/imoveis/{id}), pra não depender de nenhuma consulta ao banco a
// partir do processo do Playwright.
import { config } from "dotenv";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type OrganizationRole } from "../src/generated/prisma/client";

config({ path: path.resolve(__dirname, "..", ".env.test"), override: true });

if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error(
    "DATABASE_URL não aponta para um banco de teste (esperado um nome " +
      "terminado em _test) — abortando o seed de E2E."
  );
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export const IDS_E2E = {
  imovelParaEditarOrgA: "e2e-imovel-editar-a",
  membroOwnerOrgB: "e2e-membro-owner-b",
  // Organização dedicada da Agenda (ver comentário na seção "Organização
  // C" abaixo) — property fixa própria, nunca tocada por nenhum outro
  // spec, então (diferente de imovelParaEditarOrgA) seu título nunca é
  // renomeado por imoveis.spec.ts e pode ser referenciado como constante.
  imovelOrgAgenda: "e2e-imovel-org-agenda",
  // Redesenho de Imóveis — ver duplicata em tests/e2e/helpers.ts.
  imovelComBadgesOrgA: "e2e-imovel-badges-a",
  // Busca do Hero — segunda cidade/bairro (todo o resto do seed usa só
  // "São Paulo"/"Centro") + RENT com rentPrice preenchido e price nulo,
  // pra exercitar de verdade: autocomplete de cidade com >1 opção,
  // dependência cidade→bairro, e o filtro de valor aplicando no campo
  // certo por finalidade (bug real corrigido nesta feature — ver
  // imovel-filtros.ts).
  imovelAluguelOrgA: "e2e-imovel-aluguel-a",
  imovelComercialOrgA: "e2e-imovel-comercial-a",
};

// Fase P.10 — hostname fixo, custom domain ATIVO da Organização B, usado
// pelo spec de tenant resolver por host (tests/e2e/custom-domain.spec.ts).
// Deliberadamente a Organização B (não a A, que já é a "padrão"/canônica
// via PUBLIC_ORG_SLUG) — provar que o rewrite serve o conteúdo de uma
// organização DIFERENTE da canônica é o que de fato exercita o mecanismo
// novo.
export const HOSTNAME_E2E_ORG_B = "b.e2e-dominio-teste.test";

async function garantirModulo(code: string) {
  return prisma.module.upsert({
    where: { code },
    update: {},
    create: { code, name: code },
  });
}

async function garantirPlano(opcoes: {
  code: string;
  name: string;
  modulosHabilitados: string[];
  modulosDesabilitados?: string[];
  limites?: Record<string, number | null>;
}) {
  const plano = await prisma.plan.upsert({
    where: { code: opcoes.code },
    update: {},
    create: { code: opcoes.code, name: opcoes.name },
  });

  const desabilitados = opcoes.modulosDesabilitados ?? [];
  for (const code of [...opcoes.modulosHabilitados, ...desabilitados]) {
    const modulo = await garantirModulo(code);
    await prisma.planModule.upsert({
      where: { planId_moduleId: { planId: plano.id, moduleId: modulo.id } },
      update: { enabled: !desabilitados.includes(code) },
      create: { planId: plano.id, moduleId: modulo.id, enabled: !desabilitados.includes(code) },
    });
  }

  for (const [feature, limit] of Object.entries(opcoes.limites ?? {})) {
    await prisma.planLimit.upsert({
      where: { planId_feature: { planId: plano.id, feature } },
      update: { limit },
      create: { planId: plano.id, feature, limit },
    });
  }

  return plano;
}

async function garantirOrganizacaoComDono(opcoes: {
  slug: string;
  name: string;
  planId: string;
  email: string;
  senha: string;
  role: OrganizationRole;
  membroId?: string;
}) {
  const organization = await prisma.organization.upsert({
    where: { slug: opcoes.slug },
    update: { planId: opcoes.planId },
    create: { slug: opcoes.slug, name: opcoes.name, planId: opcoes.planId },
  });

  const passwordHash = await bcrypt.hash(opcoes.senha, 10);
  const usuario = await prisma.user.upsert({
    where: { email: opcoes.email },
    update: { passwordHash },
    create: { name: opcoes.name, email: opcoes.email, passwordHash },
  });

  const membro = await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: usuario.id } },
    update: { role: opcoes.role },
    create: {
      ...(opcoes.membroId ? { id: opcoes.membroId } : {}),
      organizationId: organization.id,
      userId: usuario.id,
      role: opcoes.role,
    },
  });

  return { organization, usuario, membro };
}

async function garantirImovel(opcoes: {
  id: string;
  organizationId: string;
  title: string;
  // Redesenho de Imóveis — badges opcionais, default false (nenhuma
  // chamada existente muda de comportamento). Usado só pelo fixture
  // dedicado de badges/KPIs abaixo.
  isOpportunity?: boolean;
  isFeatured?: boolean;
  isLaunch?: boolean;
  hasSlideshow?: boolean;
  // Busca do Hero — overrides opcionais, todos com o mesmo default de
  // sempre (nenhum call site existente muda de comportamento).
  type?: string;
  purpose?: "SALE" | "RENT";
  neighborhood?: string;
  city?: string;
  price?: number | null;
  rentPrice?: number | null;
  constructionStage?: "PRE_CONSTRUCTION" | "UNDER_CONSTRUCTION" | "READY_TO_MOVE" | null;
  deliveryForecast?: Date | null;
  description?: string | null;
  totalArea?: number | null;
  privateArea?: number | null;
  bedrooms?: number | null;
  suites?: number | null;
  bathrooms?: number | null;
  parkingSpots?: number | null;
  propertyFeatures?: string[];
  condoFeatures?: string[];
  responsibleMemberId?: string | null;
  condoFee?: number | null;
  propertyTax?: number | null;
}) {
  // update reseta os mesmos campos do create — specs de edição (ex: "editar
  // imóvel") mudam o título do imóvel seedado, então sem isso o seed
  // deixaria de ser determinístico depois da primeira rodada de E2E.
  const dados = {
    organizationId: opcoes.organizationId,
    title: opcoes.title,
    type: opcoes.type ?? "Apartamento",
    purpose: opcoes.purpose ?? "SALE",
    status: "AVAILABLE",
    neighborhood: opcoes.neighborhood ?? "Centro",
    city: opcoes.city ?? "São Paulo",
    state: "SP",
    price: opcoes.price === undefined ? 500000 : opcoes.price,
    rentPrice: opcoes.rentPrice ?? null,
    isOpportunity: opcoes.isOpportunity ?? false,
    isFeatured: opcoes.isFeatured ?? false,
    isLaunch: opcoes.isLaunch ?? false,
    hasSlideshow: opcoes.hasSlideshow ?? false,
    constructionStage: opcoes.constructionStage ?? null,
    deliveryForecast: opcoes.deliveryForecast ?? null,
    description: opcoes.description ?? null,
    totalArea: opcoes.totalArea ?? null,
    privateArea: opcoes.privateArea ?? null,
    bedrooms: opcoes.bedrooms ?? null,
    suites: opcoes.suites ?? null,
    bathrooms: opcoes.bathrooms ?? null,
    parkingSpots: opcoes.parkingSpots ?? null,
    propertyFeatures: opcoes.propertyFeatures ?? [],
    condoFeatures: opcoes.condoFeatures ?? [],
    responsibleMemberId: opcoes.responsibleMemberId ?? null,
    condoFee: opcoes.condoFee ?? null,
    propertyTax: opcoes.propertyTax ?? null,
  } as const;

  return prisma.property.upsert({
    where: { id: opcoes.id },
    update: dados,
    create: { id: opcoes.id, ...dados },
  });
}

async function garantirTipoImovel(opcoes: {
  organizationId: string;
  name: string;
  category?: "RESIDENTIAL" | "COMMERCIAL";
}) {
  const category = opcoes.category ?? "RESIDENTIAL";
  await prisma.propertyTypeOption.upsert({
    where: {
      organizationId_category_name: {
        organizationId: opcoes.organizationId,
        category,
        name: opcoes.name,
      },
    },
    update: {},
    create: {
      organizationId: opcoes.organizationId,
      category,
      name: opcoes.name,
    },
  });
}

// Redesenho de Características — mesmo padrão upsert de garantirTipoImovel
// acima (chave única real do model, idempotente entre execuções do
// Playwright, nunca acumula).
async function garantirCaracteristica(opcoes: {
  organizationId: string;
  category: "PROPERTY" | "CONDO";
  name: string;
}) {
  await prisma.featureOption.upsert({
    where: {
      organizationId_category_name: {
        organizationId: opcoes.organizationId,
        category: opcoes.category,
        name: opcoes.name,
      },
    },
    update: {},
    create: {
      organizationId: opcoes.organizationId,
      category: opcoes.category,
      name: opcoes.name,
    },
  });
}

async function main() {
  const orgSlugA = process.env.ORG_SLUG ?? "e2e-org-a";
  const orgNameA = process.env.ORG_NAME ?? "Organização E2E A";
  const emailA = process.env.SEED_ADMIN_EMAIL ?? "owner-a@e2e.test";
  const senha = process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123";

  // Organização A: plano completo (todos os módulos), usada pra login,
  // CRUD de imóvel e como organização pública (PUBLIC_ORG_SLUG aponta pra
  // ela também — ver .env.test).
  const planoCompleto = await garantirPlano({
    code: "E2E-COMPLETO",
    name: "Plano E2E completo",
    modulosHabilitados: ["core", "properties", "crm"],
  });
  const orgA = await garantirOrganizacaoComDono({
    slug: orgSlugA,
    name: orgNameA,
    planId: planoCompleto.id,
    email: emailA,
    senha,
    role: "OWNER",
  });

  // Organização B: plano básico (CRM desabilitado), usada só pra provar
  // isolamento entre tenants e bloqueio de módulo — nenhum spec faz login
  // nela.
  const planoBasico = await garantirPlano({
    code: "E2E-BASICO",
    name: "Plano E2E básico",
    modulosHabilitados: ["core", "properties"],
    modulosDesabilitados: ["crm"],
    limites: { PROPERTIES: 20, USERS: 2 },
  });
  const orgB = await garantirOrganizacaoComDono({
    slug: "e2e-org-b",
    name: "Organização E2E B",
    planId: planoBasico.id,
    email: "owner-b@e2e.test",
    senha,
    role: "OWNER",
    membroId: IDS_E2E.membroOwnerOrgB,
  });

  // Organização C: dedicada exclusivamente a agenda.spec.ts. Mesmo plano
  // completo de A (CRM habilitado), mas tenant à parte — nenhum outro spec
  // faz login nela. Existe pra ISOLAR ESTRUTURALMENTE a métrica agregada
  // que src/lib/pipeline.ts (buscarAnalyticsHistoricoPipeline) calcula
  // sobre TODO o PropertyInterestStageHistory de uma organização, sem
  // nenhum filtro de tempo/execução: como criarAgendamentoVisita avança
  // PropertyInterest de INTERESTED -> VISIT_SCHEDULED na primeira visita
  // (agendamentos/actions.ts), rodar agenda.spec.ts na MESMA organização
  // de pipeline.spec.ts (Org A) grava um episódio de stage ali, mudando
  // tempoMedioHistorico["INTERESTED"] e podendo reclassificar a
  // prioridade de uma negociação criada por outro spec (achado real da
  // auditoria pré-commit, reproduzido em worktree descartável). Como
  // buscarAnalyticsHistoricoPipeline sempre filtra por
  // `where: { organizationId }`, uma Organization própria pra Agenda
  // elimina o vetor de contaminação por construção — nunca por timing.
  const orgAgenda = await garantirOrganizacaoComDono({
    slug: "e2e-org-agenda",
    name: "Organização E2E Agenda",
    planId: planoCompleto.id,
    email: "owner-agenda@e2e.test",
    senha,
    role: "OWNER",
  });

  // Specs como "criar imóvel" e "formulário público cria lead" criam dados
  // novos a cada rodada — sem isso o banco de teste acumularia lixo entre
  // execuções do Playwright. Person cascateia Interaction ao ser apagada;
  // Property (fora dos ids fixos) cascateia Media/PropertyStatusHistory.
  const idsOrgs = [orgA.organization.id, orgB.organization.id, orgAgenda.organization.id];
  await prisma.person.deleteMany({ where: { organizationId: { in: idsOrgs } } });
  await prisma.property.deleteMany({
    where: {
      organizationId: { in: idsOrgs },
      id: {
        notIn: [
          IDS_E2E.imovelParaEditarOrgA,
          "e2e-imovel-org-b",
          IDS_E2E.imovelOrgAgenda,
          IDS_E2E.imovelComBadgesOrgA,
          IDS_E2E.imovelAluguelOrgA,
          IDS_E2E.imovelComercialOrgA,
        ],
      },
    },
  });

  await garantirTipoImovel({ organizationId: orgA.organization.id, name: "Apartamento" });
  // Redesenho de Tipos de Imóvel — fixtures determinísticas mínimas pra
  // exercitar os dois grupos (residencial já tinha "Apartamento" acima) e
  // a busca por nome longo sem overflow em viewports estreitos.
  await garantirTipoImovel({
    organizationId: orgA.organization.id,
    name: "Casa em condomínio fechado com área de lazer completa",
  });
  await garantirTipoImovel({
    organizationId: orgA.organization.id,
    name: "Sala Comercial",
    category: "COMMERCIAL",
  });
  // Redesenho de Características — fixtures determinísticas mínimas pra
  // exercitar KPIs (>0 nas duas categorias), busca (nome conhecido) e
  // texto longo sem overflow (nome propositalmente extenso).
  await garantirCaracteristica({ organizationId: orgA.organization.id, category: "PROPERTY", name: "Aceita pet" });
  await garantirCaracteristica({ organizationId: orgA.organization.id, category: "PROPERTY", name: "Piscina" });
  await garantirCaracteristica({
    organizationId: orgA.organization.id,
    category: "PROPERTY",
    name: "Vista panorâmica para o mar com terraço gourmet completo e churrasqueira integrada",
  });
  await garantirCaracteristica({ organizationId: orgA.organization.id, category: "CONDO", name: "Portaria 24 horas" });
  await garantirCaracteristica({ organizationId: orgA.organization.id, category: "CONDO", name: "Salão de festas" });
  await garantirImovel({
    id: IDS_E2E.imovelParaEditarOrgA,
    organizationId: orgA.organization.id,
    title: "Apartamento E2E para edição",
  });
  // Redesenho de Imóveis — fixture dedicada, nunca tocada por "editar
  // imóvel" (que reescreve imovelParaEditarOrgA e resetaria os badges a
  // cada rodada se fosse o mesmo registro). Garante 1 imóvel real com
  // todos os 4 badges + Oportunidade/Destaque > 0 nos KPIs.
  await garantirImovel({
    id: IDS_E2E.imovelComBadgesOrgA,
    organizationId: orgA.organization.id,
    title: "Apartamento com 2 quartos à venda, 58m² – Santo Amaro",
    isOpportunity: true,
    isFeatured: true,
    isLaunch: true,
    hasSlideshow: true,
    // Único imóvel do seed com obra em andamento: sem ele nenhum spec
    // conseguia exercitar EvolucaoObra (linha do tempo + previsão de
    // entrega), que é o caminho de lançamento/em construção da MESMA
    // rota de detalhe. Data fixa (não relativa a "hoje") pra o texto
    // renderizado ser determinístico entre rodadas.
    constructionStage: "UNDER_CONSTRUCTION",
    deliveryForecast: new Date("2027-06-01T00:00:00.000Z"),
    // Único imóvel do seed com a ficha completa — sem isto, descrição,
    // características, condomínio e custos nunca renderizavam em teste
    // nenhum, e a página de detalhe era exercitada só no seu estado mais
    // vazio. suites: 0 é proposital: prova que um contador em zero NÃO
    // vira linha de característica (ver CaracteristicasImovel.tsx).
    description:
      "Apartamento em construção com dois dormitórios.\n\nSegundo parágrafo da descrição, usado para verificar que a quebra de linha do texto original é preservada na página pública.",
    totalArea: 58,
    privateArea: 52,
    bedrooms: 2,
    suites: 0,
    bathrooms: 2,
    parkingSpots: 1,
    propertyFeatures: ["Aceita pet", "Piscina"],
    condoFeatures: ["Portaria 24 horas", "Salão de festas"],
    condoFee: 850,
    propertyTax: 320,
    // Responsável é o OWNER da organização, DE PROPÓSITO e sem perfil
    // público habilitado: é o cenário que prova a regra de privacidade —
    // ser responsável pelo imóvel (e ainda por cima ser OWNER) não
    // publica ninguém no site. O caso publicado é montado pelos próprios
    // testes, pelo painel, e desfeito no fim.
    responsibleMemberId: orgA.membro.id,
  });
  await garantirImovel({
    id: "e2e-imovel-org-b",
    organizationId: orgB.organization.id,
    title: "Imóvel da Organização B",
  });

  // Busca do Hero — segunda cidade/bairro + aluguel com rentPrice
  // (nenhum outro imóvel de Org A tem RENT nem cidade diferente de "São
  // Paulo"/"Centro"). Usa o próprio "Apartamento" já cadastrado no
  // catálogo — não precisa de um tipo novo pra isso.
  await garantirImovel({
    id: IDS_E2E.imovelAluguelOrgA,
    organizationId: orgA.organization.id,
    title: "Apartamento para alugar, 45m² – Cambuí",
    purpose: "RENT",
    city: "Campinas",
    neighborhood: "Cambuí",
    price: null,
    rentPrice: 2500,
  });
  // "Sala Comercial" já existe no CATÁLOGO (garantirTipoImovel acima),
  // mas buscarDadosFiltros só lista tipos que estão de fato EM USO por
  // um imóvel AVAILABLE — sem isto, o grupo "Comercial" do dropdown de
  // Tipo (Home) nunca aparece de verdade em nenhum teste.
  await garantirImovel({
    id: IDS_E2E.imovelComercialOrgA,
    organizationId: orgA.organization.id,
    title: "Sala comercial para alugar, 32m² – Centro",
    type: "Sala Comercial",
  });

  await garantirTipoImovel({ organizationId: orgAgenda.organization.id, name: "Apartamento" });
  await garantirImovel({
    id: IDS_E2E.imovelOrgAgenda,
    organizationId: orgAgenda.organization.id,
    title: "Apartamento E2E Agenda",
  });

  // Fase P.10 — custom domain fixo e ATIVO da Organização B (ver
  // HOSTNAME_E2E_ORG_B acima).
  await prisma.organizationDomain.upsert({
    where: { hostname: HOSTNAME_E2E_ORG_B },
    update: { organizationId: orgB.organization.id, status: "ACTIVE" },
    create: {
      organizationId: orgB.organization.id,
      hostname: HOSTNAME_E2E_ORG_B,
      type: "CUSTOM",
      status: "ACTIVE",
      verificationToken: "e2e-token-fixo-org-b",
    },
  });

  console.log("Seed E2E pronto:");
  console.log(`  Org A (plano completo, CRM habilitado): slug=${orgA.organization.slug} login=${emailA}`);
  console.log(`  Org B (plano básico, CRM desabilitado): slug=${orgB.organization.slug} login=owner-b@e2e.test`);
  console.log(
    `  Org C (dedicada à Agenda, CRM habilitado): slug=${orgAgenda.organization.slug} login=owner-agenda@e2e.test`
  );
}

main()
  .catch((erro) => {
    console.error("Falha ao rodar o seed de E2E:", erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
