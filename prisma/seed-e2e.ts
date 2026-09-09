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
import { componentesNoFuso, instanteDeComponentes } from "../src/lib/fuso-horario";

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
  // Fase 17 — organização dedicada à Central de trabalho.
  imovelOrgCentral: "e2e-imovel-org-central",
  // Fase 18 — organização dedicada ao FUSO HORÁRIO (ver seção da
  // Organização F).
  imovelOrgFuso: "e2e-imovel-org-fuso",
  // Fase 22 — organização dedicada à política restrita.
  imovelOrgRestrita: "e2e-imovel-org-restrita",
  imovelOrgRestritaSegundo: "e2e-imovel-org-restrita-2",
  imovelOrgRestritaGanho: "e2e-imovel-org-restrita-ganho",
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
  // Analytics comercial (Fase 5) — imóveis da Organização D, ver seção
  // "Organização D" em main(). Três papéis distintos e fixos: o campeão
  // do ranking, o segundo colocado e um que NUNCA recebe contato (prova
  // que imóvel sem contato não vira linha em zero).
  imovelTopOrgAnalytics: "e2e-imovel-analytics-top",
  imovelSecundarioOrgAnalytics: "e2e-imovel-analytics-2",
  imovelSemContatoOrgAnalytics: "e2e-imovel-analytics-sem-contato",
  // Organização N — tracking/atribuição dirigidos por navegador. Ver o
  // comentário do bloco no seed: existe porque o evento sai por
  // navigator.sendBeacon, que a interceptação de rota do Playwright NÃO
  // captura de forma confiável.
  imovelTopOrgTracking: "e2e-imovel-tracking-top",
  imovelSecundarioOrgTracking: "e2e-imovel-tracking-2",
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
  // Fase 18 — fuso EXPLÍCITO e obrigatório em toda organização do seed.
  // Nenhum spec deve depender do fallback por acidente: se o valor
  // importa para o teste, ele está escrito aqui.
  timezone: string;
}) {
  const organization = await prisma.organization.upsert({
    where: { slug: opcoes.slug },
    update: { planId: opcoes.planId, timezone: opcoes.timezone },
    create: {
      slug: opcoes.slug,
      name: opcoes.name,
      planId: opcoes.planId,
      timezone: opcoes.timezone,
    },
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
  // Vitrine editorial da Home: 1..4, ou ausente (fora da vitrine).
  homeHighlightPosition?: number | null;
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
  developer?: string | null;
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
    homeHighlightPosition: opcoes.homeHighlightPosition ?? null,
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
    developer: opcoes.developer ?? null,
  } as const;

  return prisma.property.upsert({
    where: { id: opcoes.id },
    update: dados,
    create: { id: opcoes.id, ...dados },
  });
}

// Materiais de apresentação (book, plantas, tabela). Idempotente por
// (imóvel, nome): o seed roda quantas vezes for.
//
// A URL aponta para um CDN fictício no MESMO formato que o upload real
// emite ({base}/{organizationId}/materiais/{uuid}.pdf). Em teste não há
// R2 (R2_PUBLIC_URL vazio em .env.test), e nada aqui depende de o byte
// existir: a validação de URL acontece na ESCRITA pelo painel — provada
// na suíte de integração, que configura a base — e a ficha pública só
// entrega o link.
async function garantirMaterial(opcoes: {
  organizationId: string;
  propertyId: string;
  name: string;
  uuid: string;
  sortOrder: number;
  active?: boolean;
}) {
  const url = `https://cdn-e2e.local/${opcoes.organizationId}/materiais/${opcoes.uuid}.pdf`;
  const existente = await prisma.propertyPresentationMaterial.findFirst({
    where: { propertyId: opcoes.propertyId, name: opcoes.name },
    select: { id: true },
  });
  const dados = {
    organizationId: opcoes.organizationId,
    propertyId: opcoes.propertyId,
    name: opcoes.name,
    url,
    mimeType: "application/pdf",
    sortOrder: opcoes.sortOrder,
    active: opcoes.active ?? true,
  };
  if (existente) {
    await prisma.propertyPresentationMaterial.update({ where: { id: existente.id }, data: dados });
  } else {
    await prisma.propertyPresentationMaterial.create({ data: dados });
  }
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
    // UTC explícito: é o calendário sob o qual as asserções absolutas
    // destes specs foram escritas. Nada muda para elas na Fase 18.
    timezone: "UTC",
    name: orgNameA,
    planId: planoCompleto.id,
    email: emailA,
    senha,
    role: "OWNER",
  });

  // Organização B: plano básico (CRM desabilitado), usada só pra provar
  // isolamento entre tenants e bloqueio de módulo — nenhum spec faz login
  // nela.
  // Fase 26 — plano do cadastro self-service, resolvido POR CÓDIGO pela
  // action. Sem ele no banco de teste, a confirmação do cadastro
  // simplesmente não teria plano para atribuir. Mesmos valores do plano
  // de entrada real: gratuito, trial de 14 dias, um único usuário.
  const planoStarter = await garantirPlano({
    code: "STARTER",
    name: "Starter",
    modulosHabilitados: ["core", "properties", "crm"],
    limites: { PROPERTIES: 10, USERS: 1, PHOTOS_PER_PROPERTY: 5, CRM_CLIENTS: 100 },
  });
  await prisma.plan.update({
    where: { id: planoStarter.id },
    data: { isTrial: true, trialDays: 14, priceMonthlyCents: 0, active: true },
  });

  const planoBasico = await garantirPlano({
    code: "E2E-BASICO",
    name: "Plano E2E básico",
    modulosHabilitados: ["core", "properties"],
    modulosDesabilitados: ["crm"],
    limites: { PROPERTIES: 20, USERS: 2 },
  });
  const orgB = await garantirOrganizacaoComDono({
    slug: "e2e-org-b",
    // UTC explícito: é o calendário sob o qual as asserções absolutas
    // destes specs foram escritas. Nada muda para elas na Fase 18.
    timezone: "UTC",
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
    // UTC explícito: é o calendário sob o qual as asserções absolutas
    // destes specs foram escritas. Nada muda para elas na Fase 18.
    timezone: "UTC",
    name: "Organização E2E Agenda",
    planId: planoCompleto.id,
    email: "owner-agenda@e2e.test",
    senha,
    role: "OWNER",
  });

  // Organização D: dedicada exclusivamente a analytics.spec.ts, pelo mesmo
  // motivo estrutural da Organização C. As asserções de Analytics são
  // números ABSOLUTOS (7 contatos, 3 pessoas, +250%) — só sustentáveis num
  // tenant onde nenhum outro spec escreve. Em particular, Org A recebe
  // contatos reais de public-form.spec.ts (PUBLIC_ORG_SLUG aponta pra ela),
  // o que tornaria qualquer número absoluto dependente da ordem de
  // execução dos specs.
  const orgAnalytics = await garantirOrganizacaoComDono({
    slug: "e2e-org-analytics",
    // UTC explícito: é o calendário sob o qual as asserções absolutas
    // destes specs foram escritas. Nada muda para elas na Fase 18.
    timezone: "UTC",
    name: "Organização E2E Analytics",
    planId: planoCompleto.id,
    email: "owner-analytics@e2e.test",
    senha,
    role: "OWNER",
  });

  // Organização N — TRACKING E ATRIBUIÇÃO dirigidos por navegador.
  //
  // Existe por uma razão que nenhuma barreira de teste resolve: o evento
  // de analytics sai do cliente por `navigator.sendBeacon`
  // (src/lib/analytics-client.ts), e a interceptação de rota do
  // Playwright — de página OU de contexto — não captura beacon de forma
  // confiável. Enquanto analytics-tracking.spec.ts e atribuicao.spec.ts
  // dirigiam o site público da Organização de Analytics, uma
  // visualização real escapava de vez em quando e "20 visualizações"
  // virava 21, derrubando analytics.spec.ts — que afirma CONTAGENS
  // ABSOLUTAS daquela organização. Aconteceu no CI mais de uma vez.
  //
  // A correção é estrutural, e é a mesma doutrina das Organizações C, D e
  // E: quem dirige um navegador contra um site público não pode ser a
  // mesma organização de quem afirma números absolutos. Aqui, um beacon
  // que escape cai numa organização cujos totais ninguém afirma — o
  // vazamento deixa de ter consequência em vez de depender de sorte.
  const orgTracking = await garantirOrganizacaoComDono({
    slug: "e2e-org-tracking",
    timezone: "UTC",
    name: "Organização E2E Tracking",
    planId: planoCompleto.id,
    email: "owner-tracking@e2e.test",
    senha,
    role: "OWNER",
  });

  // Fase 17 — Organização E: dedicada à CENTRAL DE TRABALHO, pelo mesmo
  // motivo estrutural das organizações C e D. A Home é pessoal e afirma
  // números absolutos ("1 visita atrasada", "2 negociações"); colocá-la
  // na Org A ou na da Agenda faria qualquer asserção depender da ordem de
  // execução dos specs — e adicionar visitas SCHEDULED à Org da Agenda
  // mudaria os contadores que agenda.spec.ts e pipeline.spec.ts já
  // afirmam.
  const orgCentral = await garantirOrganizacaoComDono({
    slug: "e2e-org-central",
    // UTC explícito: é o calendário sob o qual as asserções absolutas
    // destes specs foram escritas. Nada muda para elas na Fase 18.
    timezone: "UTC",
    name: "Organização E2E Central",
    planId: planoCompleto.id,
    email: "owner-central@e2e.test",
    senha,
    role: "OWNER",
  });

  // Fase 18 — Organização F: dedicada ao FUSO HORÁRIO, pelo mesmo motivo
  // estrutural das organizações C, D e E. É a única organização do seed
  // que NÃO está em UTC, e é isso que a torna útil: em America/Sao_Paulo
  // (UTC−3) o dia comercial começa 3 horas depois do dia UTC, então uma
  // visita das 23:30 locais pertence a HOJE mesmo já sendo o dia seguinte
  // em UTC. Colocar esse dado em qualquer organização existente mudaria a
  // classificação de visitas que outros specs já afirmam.
  const orgFuso = await garantirOrganizacaoComDono({
    slug: "e2e-org-fuso",
    name: "Organização E2E Fuso",
    planId: planoCompleto.id,
    email: "owner-fuso@e2e.test",
    senha,
    role: "OWNER",
    timezone: "America/Sao_Paulo",
  });

  // Fase 22 — Organização G: dedicada à POLÍTICA RESTRITA, pelo mesmo
  // motivo estrutural das organizações C-F. É a única do seed com
  // commercialVisibility = RESTRICTED; colocar esse modo em qualquer
  // organização existente esconderia dados que os outros specs afirmam
  // ver.
  const orgRestrita = await garantirOrganizacaoComDono({
    slug: "e2e-org-restrita",
    timezone: "UTC",
    name: "Organização E2E Restrita",
    planId: planoCompleto.id,
    email: "owner-restrita@e2e.test",
    senha,
    role: "OWNER",
  });
  await prisma.organization.update({
    where: { id: orgRestrita.organization.id },
    data: { commercialVisibility: "RESTRICTED" },
  });

  // Fase 24 — Organização H: dedicada à CAPTAÇÃO AMBÍGUA, pelo mesmo
  // motivo estrutural das organizações C-G. Ela carrega duas pessoas que
  // colidem de propósito (uma dona do e-mail, outra do telefone), e é
  // isso que faz o formulário público cair no conflito de identidade.
  // Plantar essa colisão em qualquer organização existente mudaria a
  // contagem de clientes que outros specs afirmam.
  const orgCaptacao = await garantirOrganizacaoComDono({
    slug: "e2e-org-captacao",
    timezone: "UTC",
    name: "Organização E2E Captação",
    planId: planoCompleto.id,
    email: "owner-captacao@e2e.test",
    senha,
    role: "OWNER",
  });

  // Fase 25 — Organização I: dedicada ao CICLO DE ACESSO, pelo mesmo
  // motivo estrutural das organizações C-H. Os specs desta fase criam e
  // consomem convites, redefinem senhas e suspendem vínculos — mexer na
  // senha ou no status de um membro de qualquer organização existente
  // derrubaria specs que fazem login com aquelas credenciais.
  const orgAcesso = await garantirOrganizacaoComDono({
    slug: "e2e-org-acesso",
    timezone: "UTC",
    name: "Organização E2E Acesso",
    planId: planoCompleto.id,
    email: "owner-acesso@e2e.test",
    senha,
    role: "OWNER",
  });

  // Fase 26 — Organizações J e K: dedicadas ao MULTI-ORG. A mesma
  // identidade é OWNER numa e BROKER na outra, com fusos e políticas de
  // visibilidade diferentes — é a matriz que prova que trocar de
  // organização troca papel, calendário e escopo ao mesmo tempo.
  //
  // Dedicadas, e não um reuso das orgs F/G existentes: acrescentar um
  // membro a uma organização que outras specs medem é a contaminação
  // cross-spec que a Fase 25 já custou caro para descobrir.
  const orgMultiA = await garantirOrganizacaoComDono({
    slug: "e2e-org-multi-a",
    timezone: "America/Sao_Paulo",
    name: "Organização E2E Multi A",
    planId: planoCompleto.id,
    email: "multi-org@e2e.test",
    senha,
    role: "OWNER",
  });
  const orgMultiB = await garantirOrganizacaoComDono({
    slug: "e2e-org-multi-b",
    timezone: "UTC",
    name: "Organização E2E Multi B",
    planId: planoCompleto.id,
    email: "owner-multi-b@e2e.test",
    senha,
    role: "OWNER",
  });
  await prisma.organization.update({
    where: { id: orgMultiB.organization.id },
    data: { commercialVisibility: "RESTRICTED" },
  });

  // Fase 27 — Organizações L e M: dedicadas ao CICLO FINANCEIRO.
  //
  //   L: trial VIGENTE  -> a tela de assinatura mostra prazo e limites;
  //   M: trial VENCIDO  -> a operação para, e é justamente ali que se
  //                        prova que o caminho de regularização
  //                        continua aberto.
  //
  // Dedicadas porque o spec manipula o período de trial: mexer nisso em
  // qualquer organização existente bloquearia a operação dela e
  // derrubaria toda spec que depende de navegar no painel.
  // Plano de trial PRÓPRIO destas duas organizações — nunca o STARTER.
  //
  // O STARTER é uma linha de catálogo GLOBAL que a suíte
  // tests/integration/bootstrap-starter-p9.test.ts apaga e recria para
  // testar o script que o cria. Prender uma organização do seed a ele
  // deixaria aquele DELETE impossível (violação de chave estrangeira)
  // em qualquer banco onde este seed tenha rodado — que é o caso de
  // toda máquina de desenvolvimento. Catálogo global não pertence a
  // quem só precisa de um plano de trial.
  const planoTrialE2E = await garantirPlano({
    code: "E2E-TRIAL",
    name: "Trial E2E",
    modulosHabilitados: ["core", "properties", "crm"],
    limites: { PROPERTIES: 10, USERS: 1, PHOTOS_PER_PROPERTY: 5, CRM_CLIENTS: 100 },
  });
  await prisma.plan.update({
    where: { id: planoTrialE2E.id },
    data: { isTrial: true, trialDays: 14, priceMonthlyCents: 0, active: true },
  });

  const orgTrial = await garantirOrganizacaoComDono({
    slug: "e2e-org-trial",
    timezone: "UTC",
    name: "Organização E2E Trial",
    planId: planoTrialE2E.id,
    email: "owner-trial@e2e.test",
    senha,
    role: "OWNER",
  });
  const orgVencida = await garantirOrganizacaoComDono({
    slug: "e2e-org-vencida",
    timezone: "UTC",
    name: "Organização E2E Vencida",
    planId: planoTrialE2E.id,
    email: "owner-vencida@e2e.test",
    senha,
    role: "OWNER",
  });

  // Specs como "criar imóvel" e "formulário público cria lead" criam dados
  // novos a cada rodada — sem isso o banco de teste acumularia lixo entre
  // execuções do Playwright. Person cascateia Interaction ao ser apagada;
  // Property (fora dos ids fixos) cascateia Media/PropertyStatusHistory.
  const idsOrgs = [
    orgA.organization.id,
    orgB.organization.id,
    orgAgenda.organization.id,
    orgAnalytics.organization.id,
    orgTracking.organization.id,
    orgCentral.organization.id,
    orgFuso.organization.id,
    orgRestrita.organization.id,
    orgCaptacao.organization.id,
    orgAcesso.organization.id,
    orgMultiA.organization.id,
    orgMultiB.organization.id,
    orgTrial.organization.id,
    orgVencida.organization.id,
  ];
  // Usuários criados por usuarios.spec.ts a cada rodada (Fase 8 — correção
  // de causa raiz de um flake real): o seed nunca os limpava, e a
  // listagem pagina em 20. Depois de algumas execuções o usuário recém
  // criado caía para a segunda página e a asserção "aparece na lista"
  // falhava — na suíte completa, nunca isolado. Não é aumento de timeout
  // nem retry: é remover o acúmulo que causava o problema.
  //
  // Só os gerados pelo padrão do spec são apagados; os donos fixos das
  // organizações (owner-*@e2e.test) nunca entram neste filtro. As FKs
  // opcionais que apontam para OrganizationMember são zeradas antes, para
  // o delete não esbarrar em RESTRICT.
  // Donos fixos recriados deterministicamente pelo próprio seed — nunca
  // podem ser apagados pela limpeza abaixo.
  const emailsDonosFixos = [
    emailA,
    "owner-b@e2e.test",
    "owner-agenda@e2e.test",
    "owner-analytics@e2e.test",
    // Fase 17 — Organização E (Central de trabalho). Os DOIS entram: o
    // dono e o segundo corretor. Sem eles a limpeza de membros
    // descartáveis apagaria as identidades logo depois de criadas, e as
    // negociações da Central perderiam o responsável (FK).
    "owner-central@e2e.test",
    "corretor-central@e2e.test",
    // Fase 18 — dono da Organização F (fuso horário), mesmo motivo.
    "owner-fuso@e2e.test",
    // Fase 22 — Organização G (política restrita): dona e os dois
    // corretores, cujas carteiras precisam sobreviver à limpeza.
    "owner-restrita@e2e.test",
    "ana-restrita@e2e.test",
    "bruno-restrita@e2e.test",
    // Fase 24 — Organização H (captação ambígua): a dona e o corretor,
    // que precisa sobreviver à limpeza para provar o portão de papel.
    "owner-captacao@e2e.test",
    "corretor-captacao@e2e.test",
    // Fase 25 — Organização I (ciclo de acesso). A dona e o corretor que
    // esquece a senha precisam sobreviver à limpeza.
    "owner-acesso@e2e.test",
    "corretor-acesso@e2e.test",
    // Identidade do cenário "convidar quem já tem conta" (Fase 25).
    "ja-tem-conta@e2e.test",
    // Fase 26 — identidade multi-org e a dona da segunda organização.
    "multi-org@e2e.test",
    "owner-multi-b@e2e.test",
    // Fase 27 — donas das organizações do ciclo financeiro.
    "owner-trial@e2e.test",
    "owner-vencida@e2e.test",
  ];

  // Correção completa do acúmulo (a da Fase 8 cobria só o prefixo
  // "usuario.e2e."): usuarios.spec.ts cria TAMBÉM "aaa.primeiro.*" e
  // "zzz.ultimo.*" para os testes de ordenação, e esses continuavam
  // acumulando a cada rodada até empurrar o usuário recém-criado para a
  // segunda página da listagem (que pagina em 20).
  //
  // A regra agora é por exclusão, não por prefixo: sobrevive quem é dono
  // fixo de alguma organização do seed; todo o resto é descarte de
  // execução anterior. Assim nenhum padrão de e-mail novo inventado por
  // um spec futuro volta a escapar da limpeza.
  const membrosDescartaveis = await prisma.organizationMember.findMany({
    where: {
      organizationId: { in: idsOrgs },
      user: { email: { notIn: emailsDonosFixos } },
    },
    select: { id: true, userId: true },
  });
  if (membrosDescartaveis.length > 0) {
    const idsMembros = membrosDescartaveis.map((m) => m.id);
    const idsUsuarios = membrosDescartaveis.map((m) => m.userId);
    await prisma.person.updateMany({
      where: { assignedMemberId: { in: idsMembros } },
      data: { assignedMemberId: null },
    });
    await prisma.property.updateMany({
      where: { responsibleMemberId: { in: idsMembros } },
      data: { responsibleMemberId: null },
    });
    await prisma.interaction.updateMany({
      where: { memberId: { in: idsMembros } },
      data: { memberId: null },
    });
    await prisma.scheduledActivity.updateMany({
      where: { createdByMemberId: { in: idsMembros } },
      data: { createdByMemberId: null },
    });
    // Fase 11 — mesma limpeza explícita das demais FKs de ownership.
    await prisma.propertyInterest.updateMany({
      where: { responsibleMemberId: { in: idsMembros } },
      data: { responsibleMemberId: null },
    });
    // Fase 13 — pagamentos primeiro (FK RESTRICT para participante), e o
    // ator vira null porque createdBy/cancelledBy são SET NULL.
    await prisma.propertyInterestParticipantPayment.deleteMany({
      where: { participant: { memberId: { in: idsMembros } } },
    });
    await prisma.propertyInterestParticipantPayment.updateMany({
      where: { createdByMemberId: { in: idsMembros } },
      data: { createdByMemberId: null },
    });
    await prisma.propertyInterestParticipantPayment.updateMany({
      where: { cancelledByMemberId: { in: idsMembros } },
      data: { cancelledByMemberId: null },
    });
    // Fase 12 — participação NÃO é anulável (FK RESTRICT, de propósito):
    // a linha inteira sai junto com o membro descartável.
    await prisma.propertyInterestParticipant.deleteMany({
      where: { memberId: { in: idsMembros } },
    });
    await prisma.notificationPreference.deleteMany({
      where: { organizationMemberId: { in: idsMembros } },
    });
    await prisma.organizationMember.deleteMany({ where: { id: { in: idsMembros } } });
    // Fase 25 — os tokens têm FK RESTRICT para User: sem apagá-los
    // antes, o delete abaixo esbarra na constraint. Sai por userId
    // porque recuperação de senha não tem organização (senha é global).
    await prisma.inviteToken.deleteMany({ where: { userId: { in: idsUsuarios } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: idsUsuarios } } });
    await prisma.user.deleteMany({ where: { id: { in: idsUsuarios } } });
  }

  // Fase 24 — captações pendentes de rodadas anteriores. Person.delete
  // apenas ANULA resolvedPersonId (FK opcional, SET NULL), então nada
  // aqui sai por cascade: sem esta linha a fila de identificação
  // cresceria a cada execução e o spec passaria a ver captações antigas.
  await prisma.leadCapture.deleteMany({ where: { organizationId: { in: idsOrgs } } });
  // Fase 25 — convites e recuperações de rodadas anteriores. Sem isto, um
  // convite pendente sobreviveria entre execuções e o spec veria "convite
  // pendente" numa pessoa que ele acabou de criar do zero.
  await prisma.inviteToken.deleteMany({ where: { organizationId: { in: idsOrgs } } });
  // Eventos digitais (Fase 6) — apagados explicitamente: os imóveis de id
  // fixo sobrevivem ao deleteMany abaixo, então o cascade deles não
  // limparia nada e as contagens do funil cresceriam a cada rodada.
  await prisma.propertyAnalyticsEvent.deleteMany({ where: { organizationId: { in: idsOrgs } } });
  // Fase 8 — o Person.deleteMany abaixo já cascateia PropertyInterest,
  // mas o history tem FK própria e precisa sair antes.
  await prisma.propertyInterestStageHistory.deleteMany({ where: { organizationId: { in: idsOrgs } } });
  // Fase 13 — o Person.deleteMany abaixo cascateia PropertyInterest, que
  // por sua vez cascateia os participantes; mas o ledger tem FK RESTRICT
  // para participante (de propósito: registro financeiro não some junto
  // com a parcela), então os pagamentos precisam sair explicitamente
  // antes — caso contrário o cascade esbarra na constraint.
  await prisma.propertyInterestParticipantPayment.deleteMany({
    where: { organizationId: { in: idsOrgs } },
  });
  await prisma.propertyInterestParticipant.deleteMany({
    where: { organizationId: { in: idsOrgs } },
  });
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
          IDS_E2E.imovelTopOrgAnalytics,
          IDS_E2E.imovelSecundarioOrgAnalytics,
          IDS_E2E.imovelSemContatoOrgAnalytics,
          // Fase 26 — imóveis fixos das organizações multi-org.
          "e2e-imovel-multi-a",
          "e2e-imovel-multi-b",
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
    // Terceira posição da vitrine: com QUATRO destaques a Home pode
    // provar a faixa de quatro colunas em desktop, que é o requisito
    // estrutural do card novo.
    homeHighlightPosition: 3,
  });
  // Redesenho de Imóveis — fixture dedicada, nunca tocada por "editar
  // imóvel" (que reescreve imovelParaEditarOrgA e resetaria os badges a
  // cada rodada se fosse o mesmo registro). Garante 1 imóvel real com
  // todos os 4 badges + Oportunidade/Destaque > 0 nos KPIs.
  await garantirImovel({
    id: IDS_E2E.imovelComBadgesOrgA,
    organizationId: orgA.organization.id,
    // Fase da vitrine — primeira posição da Home. O mesmo imóvel que
    // carrega os três rótulos comerciais serve à vitrine, e é isso que
    // permite provar que os conceitos são independentes: os rótulos
    // continuam existindo na ficha e nos filtros, a vitrine é outra coisa.
    homeHighlightPosition: 1,
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
    // String livre (Property.developer, "Construtora/Incorporadora" no
    // formulário) — nome fictício de fixture, não uma entidade do
    // domínio: o projeto não tem model de construtora.
    developer: "Construtora E2E",
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
  // Materiais de apresentação: o imóvel de badges é LANÇAMENTO, então é
  // ele que exercita o bloco público inteiro (título de empreendimento,
  // lista real, captação e entrega). O terceiro material entra
  // DESATIVADO de propósito — prova que desativar tira da ficha sem
  // apagar o cadastro. A ordem semeada é deliberadamente diferente da
  // alfabética e da de criação, pra que o teste veja a ordem EXPLÍCITA.
  await garantirMaterial({
    organizationId: orgA.organization.id,
    propertyId: IDS_E2E.imovelComBadgesOrgA,
    name: "Book do empreendimento",
    uuid: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    sortOrder: 0,
  });
  await garantirMaterial({
    organizationId: orgA.organization.id,
    propertyId: IDS_E2E.imovelComBadgesOrgA,
    name: "Plantas e metragens",
    uuid: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
    sortOrder: 1,
  });
  await garantirMaterial({
    organizationId: orgA.organization.id,
    propertyId: IDS_E2E.imovelComBadgesOrgA,
    name: "Tabela de precos (desativada)",
    uuid: "cccccccc-3333-4333-8333-cccccccccccc",
    sortOrder: 2,
    active: false,
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
    // Segunda posição da vitrine: com dois imóveis a Home prova ORDEM,
    // e não só presença. Um imóvel de aluguel em outra cidade também
    // mostra que a vitrine não é um recorte por finalidade ou região.
    homeHighlightPosition: 2,
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
    homeHighlightPosition: 4,
    // Fase 3 — lançamento MÍNIMO: tem o rótulo comercial e nada mais
    // (sem estágio de obra, sem previsão de entrega, sem construtora,
    // sem planta, sem características). É o contraponto do imóvel de
    // badges e serve pra provar que cada bloco opcional da experiência
    // de lançamento some sozinho em vez de virar seção vazia.
    isLaunch: true,
  });

  await garantirTipoImovel({ organizationId: orgAgenda.organization.id, name: "Apartamento" });
  await garantirImovel({
    id: IDS_E2E.imovelOrgAgenda,
    organizationId: orgAgenda.organization.id,
    title: "Apartamento E2E Agenda",
  });

  // -----------------------------------------------------------------
  // Organização D — fixture determinística do Analytics comercial
  // -----------------------------------------------------------------
  // Todos os `occurredAt` são posicionados em DIAS RELATIVOS a agora, ao
  // meio-dia UTC: o seed roda em qualquer data e os eventos sempre caem
  // nas mesmas janelas (7d / 30d / 13 semanas), sem nenhuma data
  // hardcoded que "expiraria". Meio-dia (não 00:00 nem 23:59) mantém
  // distância folgada das bordas de dia UTC, então nem o fuso do runner
  // nem o instante da execução podem empurrar um evento pro balde
  // vizinho.
  //
  // Os números que a spec afirma saem daqui e de mais lugar nenhum:
  //   contatos comerciais (30d) ....... 7
  //   pessoas distintas ............... 3
  //   imóveis com contato ............. 2
  //   proprietários querendo anunciar . 1
  //   período anterior (30d) .......... 2  -> variação +250%
  //   interações SEM origem (30d) ..... 1  -> nota de método
  //   origens: IMOVEL 4 · ANUNCIE 2 · CONTATO 1
  await garantirTipoImovel({ organizationId: orgAnalytics.organization.id, name: "Apartamento" });
  await garantirImovel({
    id: IDS_E2E.imovelTopOrgAnalytics,
    organizationId: orgAnalytics.organization.id,
    title: "Cobertura Analytics mais procurada",
    neighborhood: "Moema",
  });
  await garantirImovel({
    id: IDS_E2E.imovelSecundarioOrgAnalytics,
    organizationId: orgAnalytics.organization.id,
    title: "Studio Analytics segundo colocado",
  });
  await garantirImovel({
    id: IDS_E2E.imovelSemContatoOrgAnalytics,
    organizationId: orgAnalytics.organization.id,
    title: "Sobrado Analytics sem nenhum contato",
  });

  // As Person desta organização já foram apagadas pelo deleteMany acima
  // (idsOrgs inclui orgAnalytics), então são recriadas do zero a cada
  // rodada — nunca acumulam entre execuções.
  const leadRecorrente = await prisma.person.create({
    data: {
      organizationId: orgAnalytics.organization.id,
      name: "Lead Analytics Recorrente",
      roles: ["LEAD"],
      source: "WEBSITE",
    },
  });
  const leadOcasional = await prisma.person.create({
    data: {
      organizationId: orgAnalytics.organization.id,
      name: "Lead Analytics Ocasional",
      roles: ["LEAD"],
      source: "WEBSITE",
    },
  });
  const proprietarioAnalytics = await prisma.person.create({
    data: {
      organizationId: orgAnalytics.organization.id,
      name: "Proprietário Analytics",
      roles: ["OWNER"],
      source: "WEBSITE",
    },
  });

  const AGORA_SEED = Date.now();
  const diasAtras = (dias: number) => {
    const base = new Date(AGORA_SEED - dias * 24 * 60 * 60 * 1000);
    return new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12, 0, 0, 0)
    );
  };

  await prisma.interaction.createMany({
    data: [
      // 4 contatos de UMA única pessoa — é o que prova, na tela, que
      // "contatos recebidos" (7) e "pessoas que procuraram" (3) são
      // métricas diferentes e não podem ser lidas como a mesma coisa.
      // Dois contatos atribuídos à campanha de anúncios — é o que liga
      // "verao-2026" a contato real na tela de Analytics.
      { organizationId: orgAnalytics.organization.id, personId: leadRecorrente.id, propertyId: IDS_E2E.imovelTopOrgAnalytics, type: "MESSAGE", origin: "IMOVEL", occurredAt: diasAtras(1), utmSource: "google", utmMedium: "cpc", utmCampaign: "verao-2026", referrerHost: "google.com" },
      { organizationId: orgAnalytics.organization.id, personId: leadRecorrente.id, propertyId: IDS_E2E.imovelTopOrgAnalytics, type: "MESSAGE", origin: "IMOVEL", occurredAt: diasAtras(2), utmSource: "google", utmMedium: "cpc", utmCampaign: "verao-2026", referrerHost: "google.com" },
      { organizationId: orgAnalytics.organization.id, personId: leadRecorrente.id, propertyId: IDS_E2E.imovelTopOrgAnalytics, type: "MESSAGE", origin: "IMOVEL", occurredAt: diasAtras(3) },
      { organizationId: orgAnalytics.organization.id, personId: leadRecorrente.id, type: "MESSAGE", origin: "CONTATO", occurredAt: diasAtras(2) },
      // Segundo imóvel do ranking.
      { organizationId: orgAnalytics.organization.id, personId: leadOcasional.id, propertyId: IDS_E2E.imovelSecundarioOrgAnalytics, type: "MESSAGE", origin: "IMOVEL", occurredAt: diasAtras(4) },
      // 2 pedidos de anúncio do MESMO proprietário — 1 proprietário
      // interessado, nunca 2.
      { organizationId: orgAnalytics.organization.id, personId: proprietarioAnalytics.id, type: "MESSAGE", origin: "ANUNCIE", occurredAt: diasAtras(1) },
      { organizationId: orgAnalytics.organization.id, personId: proprietarioAnalytics.id, type: "MESSAGE", origin: "ANUNCIE", occurredAt: diasAtras(5) },
      // Ruído deliberado: registro interno da equipe, origin=null. Não
      // pode entrar em nenhum número — só na nota de método.
      { organizationId: orgAnalytics.organization.id, personId: leadRecorrente.id, type: "CALL", origin: null, occurredAt: diasAtras(2) },
      // Período ANTERIOR (dia 35 e 40 -> dentro dos 30 dias anteriores):
      // base da comparação. 7 vs 2 = +250%.
      { organizationId: orgAnalytics.organization.id, personId: leadOcasional.id, type: "MESSAGE", origin: "CONTATO", occurredAt: diasAtras(35) },
      { organizationId: orgAnalytics.organization.id, personId: leadOcasional.id, type: "MESSAGE", origin: "CONTATO", occurredAt: diasAtras(40) },
    ],
  });

  // Eventos digitais determinísticos da Organização de Analytics (Fase 6).
  //
  // Inseridos direto, sem passar pelo endpoint: são FIXTURE, e o browser
  // provaria o mecanismo (que é testado à parte, em analytics-tracking
  // pelo site público) e não os números. `visitorHash` é opaco por
  // definição — aqui são só valores fixos de 32 hex distintos, que é
  // exatamente o formato que calcularVisitorHash produz.
  //
  // Números que a spec afirma saem daqui:
  //   visualizações .......... 20  (10 + 4 + 6)
  //   cliques no WhatsApp ..... 3
  //   contatos de imóvel ...... 4  (Fase 5: 3 no top + 1 no secundário)
  //   contato/visualização ... 20% (4/20)
  //   WhatsApp/visualização .. 15% (3/20)
  //
  // O terceiro imóvel tem 6 visualizações e ZERO contato de propósito: é
  // o diagnóstico que a Fase 6 desbloqueou (anúncio visto e que não
  // converte) e que o ranking da Fase 5, ordenado só por contato, nunca
  // mostrava.
  // WhatsApp da Organização de Analytics — é o que faz os três CTAs
  // existirem no site público dela. Fica AQUI, e não na Org A, de
  // propósito: site-publico.spec.ts liga e desliga o WhatsApp da Org A
  // durante os próprios testes, então depender dele tornaria a spec de
  // tracking refém da ordem de execução.
  await prisma.organizationSettings.upsert({
    where: { organizationId: orgAnalytics.organization.id },
    update: { whatsapp: "11999990000" },
    create: {
      organizationId: orgAnalytics.organization.id,
      whatsapp: "11999990000",
      email: "contato@analytics.e2e.test",
    },
  });

  // Site público da Organização de Tracking: dois imóveis (a spec prova
  // que o visitante é o MESMO entre páginas diferentes) e WhatsApp
  // próprio, que é o que faz os três CTAs existirem na ficha.
  await garantirTipoImovel({ organizationId: orgTracking.organization.id, name: "Apartamento" });
  await garantirImovel({
    id: IDS_E2E.imovelTopOrgTracking,
    organizationId: orgTracking.organization.id,
    title: "Cobertura Tracking mais procurada",
    neighborhood: "Moema",
  });
  await garantirImovel({
    id: IDS_E2E.imovelSecundarioOrgTracking,
    organizationId: orgTracking.organization.id,
    title: "Studio Tracking segundo colocado",
  });
  await prisma.organizationSettings.upsert({
    where: { organizationId: orgTracking.organization.id },
    update: { whatsapp: "11999990000" },
    create: {
      organizationId: orgTracking.organization.id,
      whatsapp: "11999990000",
      email: "contato@tracking.e2e.test",
    },
  });

  const hashVisitante = (n: number) => String(n).padStart(2, "0").repeat(16);
  const eventosDigitais: {
    organizationId: string;
    propertyId: string;
    type: string;
    placement: string | null;
    visitorHash: string;
    occurredAt: Date;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    referrerHost?: string | null;
  }[] = [];
  // Fase 7 — atribuição determinística. Distribuição escolhida pra
  // exercitar os três canais que a classificação separa:
  //   ANUNCIOS (google/cpc), SOCIAL (instagram orgânico) e
  //   SEM_ATRIBUICAO (o que não tem origem, como todo dado legado).
  const ATRIBUICOES = [
    { utmSource: "google", utmMedium: "cpc", utmCampaign: "verao-2026", referrerHost: "google.com" },
    { utmSource: "instagram", utmMedium: null, utmCampaign: "lancamento", referrerHost: "instagram.com" },
    { utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null },
  ] as const;

  const empilharEventos = (
    propertyId: string,
    tipo: string,
    placement: string | null,
    quantidade: number,
    inicio: number,
    atribuicao: (typeof ATRIBUICOES)[number]
  ) => {
    for (let i = 0; i < quantidade; i++) {
      eventosDigitais.push({
        organizationId: orgAnalytics.organization.id,
        propertyId,
        type: tipo,
        placement,
        visitorHash: hashVisitante(inicio + i),
        occurredAt: diasAtras((i % 5) + 1),
        ...atribuicao,
      });
    }
  };
  empilharEventos(IDS_E2E.imovelTopOrgAnalytics, "PROPERTY_VIEW", null, 6, 10, ATRIBUICOES[0]);
  empilharEventos(IDS_E2E.imovelTopOrgAnalytics, "PROPERTY_VIEW", null, 4, 16, ATRIBUICOES[1]);
  empilharEventos(IDS_E2E.imovelTopOrgAnalytics, "WHATSAPP_CLICK", "SIDEBAR", 3, 30, ATRIBUICOES[0]);
  // Sem atribuição de propósito: representa o dado anterior a esta fase.
  empilharEventos(IDS_E2E.imovelSecundarioOrgAnalytics, "PROPERTY_VIEW", null, 4, 40, ATRIBUICOES[2]);
  empilharEventos(IDS_E2E.imovelSemContatoOrgAnalytics, "PROPERTY_VIEW", null, 6, 50, ATRIBUICOES[1]);
  await prisma.propertyAnalyticsEvent.createMany({ data: eventosDigitais });

  // Fase 8 — uma oportunidade determinística ORIGINADA de contato, e uma
  // criada manualmente (sem origem). Juntas provam na tela a distinção
  // que a fase inteira existe pra sustentar: canal atribuído vs. "Sem
  // atribuição".
  //
  // A oportunidade com origem aponta para o PRIMEIRO contato de imóvel do
  // lead recorrente (o de utm google/cpc, campanha verao-2026), então o
  // canal "Anúncios pagos" passa a ter 1 oportunidade e 1 ganho.
  const contatoComOrigem = await prisma.interaction.findFirst({
    where: {
      organizationId: orgAnalytics.organization.id,
      origin: "IMOVEL",
      propertyId: IDS_E2E.imovelTopOrgAnalytics,
      utmCampaign: "verao-2026",
    },
    orderBy: { occurredAt: "desc" },
    select: { id: true, personId: true },
  });
  if (contatoComOrigem) {
    const oportunidade = await prisma.propertyInterest.create({
      data: {
        organizationId: orgAnalytics.organization.id,
        personId: contatoComOrigem.personId,
        propertyId: IDS_E2E.imovelTopOrgAnalytics,
        sourceInteractionId: contatoComOrigem.id,
        stage: "WON",
        closedAt: diasAtras(1),
        // Fase 9 — valor fechado determinístico. É o que faz "Valor
        // fechado" e "Ticket médio" terem número real na tela de
        // Analytics, e o que liga a campanha verao-2026 a dinheiro.
        closedValue: 850000,
        // Fase 10 — comissão determinística: 5% de R$ 850.000. É o que dá
        // número real a "Comissão registrada", "Comissão média" e
        // "Comissão efetiva" na tela de Analytics.
        commissionValue: 42500,
        // Fase 11 — negociação COM responsável: dá à tabela "Performance
        // por responsável" uma linha com nome, ganho, valor e comissão.
        responsibleMemberId: orgAnalytics.membro.id,
        // Fase 12 — divisão PARCIAL e determinística: de R$ 42.500 de
        // comissão, R$ 25.000 são atribuídos ao dono da organização e
        // R$ 17.500 ficam NÃO DISTRIBUÍDOS. É exatamente o estado que a
        // tela precisa provar — saldo declarado, nunca atribuído a
        // ninguém automaticamente.
        participants: {
          create: [
            {
              organizationId: orgAnalytics.organization.id,
              memberId: orgAnalytics.membro.id,
              allocationValue: 25000,
              // Fase 13 — liquidação PARCIAL determinística: de
              // R$ 25.000 atribuídos, R$ 10.000 pagos. É o estado que a
              // tela precisa provar — atribuído != pago, com saldo
              // pendente declarado e status derivado "Parcial".
              payments: {
                create: [
                  {
                    organizationId: orgAnalytics.organization.id,
                    amount: 10000,
                    paidAt: diasAtras(1),
                    createdByMemberId: orgAnalytics.membro.id,
                  },
                ],
              },
            },
          ],
        },
      },
    });
    await prisma.propertyInterestStageHistory.create({
      data: {
        organizationId: orgAnalytics.organization.id,
        propertyInterestId: oportunidade.id,
        previousStage: null,
        newStage: "WON",
        changedAt: diasAtras(1),
      },
    });
    // Oportunidade MANUAL: sem sourceInteractionId, de propósito. Fica no
    // TERCEIRO imóvel (o que nunca recebeu contato) para não colidir com
    // o contato de imóvel do lead ocasional — que precisa continuar
    // convertível, e é o caso positivo do E2E.
    //
    // Fase 9: fechada como GANHA e SEM valor, representando o ganho
    // LEGADO (anterior a esta medição). É o que a tela precisa para
    // provar a distinção entre "R$ 0" e "valor não registrado".
    const manualLegada = await prisma.propertyInterest.create({
      data: {
        organizationId: orgAnalytics.organization.id,
        personId: leadOcasional.id,
        propertyId: IDS_E2E.imovelSemContatoOrgAnalytics,
        stage: "WON",
        closedAt: diasAtras(2),
        // Ganho LEGADO: sem valor E sem comissão — prova na tela a
        // distinção entre "R$ 0" e "não registrado" nos dois campos.
        closedValue: null,
        commissionValue: null,
        // Fase 11 — e SEM responsável, pelo mesmo motivo: é o que prova
        // na tela que a linha "Sem responsável" existe como balde próprio
        // e que nada foi atribuído retroativamente.
        responsibleMemberId: null,
      },
    });
    await prisma.propertyInterestStageHistory.create({
      data: {
        organizationId: orgAnalytics.organization.id,
        propertyInterestId: manualLegada.id,
        previousStage: null,
        newStage: "WON",
        changedAt: diasAtras(2),
      },
    });
  }

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
  // =====================================================================
  // Fase 17 — dados determinísticos da CENTRAL DE TRABALHO (Organização E)
  // =====================================================================
  // A Home é pessoal e afirma números absolutos, então o estado precisa
  // ser exato: 1 visita ATRASADA, 1 HOJE, 1 PRÓXIMA, 3 negociações
  // minhas e 1 de outro membro (que NUNCA pode aparecer).
  //
  // As datas são relativas a AGORA_SEED, não fixas: "hoje" só é hoje se
  // for calculado a cada seed. Todas usam meio-dia UTC pelo mesmo motivo
  // do resto do seed — a Central classifica pelo DIA calendário UTC
  // (src/lib/scheduled-activity-date.ts), então o meio-dia nunca escorrega
  // de dia por causa da hora em que a suíte roda.
  await garantirImovel({
    id: IDS_E2E.imovelOrgCentral,
    organizationId: orgCentral.organization.id,
    title: "Apartamento E2E Central",
  });

  // Segundo corretor da Organização E — idempotente, mesmo idiom de
  // upsert de garantirOrganizacaoComDono.
  const usuarioOutroCentral = await prisma.user.upsert({
    where: { email: "corretor-central@e2e.test" },
    update: {},
    create: {
      name: "Bruno Outro Corretor",
      email: "corretor-central@e2e.test",
      passwordHash: await bcrypt.hash(senha, 10),
    },
    select: { id: true },
  });
  const outroCorretorCentral = await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: orgCentral.organization.id,
        userId: usuarioOutroCentral.id,
      },
    },
    update: {},
    create: {
      organizationId: orgCentral.organization.id,
      userId: usuarioOutroCentral.id,
      role: "BROKER",
    },
    select: { id: true },
  });

  const criarNegociacaoCentral = async (opcoes: {
    nomePessoa: string;
    responsibleMemberId: string | null;
    visitaEm?: Date;
  }) => {
    const pessoa = await prisma.person.create({
      data: {
        organizationId: orgCentral.organization.id,
        name: opcoes.nomePessoa,
        roles: ["LEAD"],
      },
      select: { id: true },
    });
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: orgCentral.organization.id,
        personId: pessoa.id,
        propertyId: IDS_E2E.imovelOrgCentral,
        stage: "INTERESTED",
        responsibleMemberId: opcoes.responsibleMemberId,
      },
      select: { id: true },
    });
    if (opcoes.visitaEm) {
      await prisma.scheduledActivity.create({
        data: {
          organizationId: orgCentral.organization.id,
          personId: pessoa.id,
          propertyId: IDS_E2E.imovelOrgCentral,
          propertyInterestId: interesse.id,
          type: "VISIT",
          status: "SCHEDULED",
          scheduledAt: opcoes.visitaEm,
        },
      });
    }
    return interesse;
  };

  await criarNegociacaoCentral({
    nomePessoa: "Central Atrasada",
    responsibleMemberId: orgCentral.membro.id,
    visitaEm: diasAtras(3),
  });
  await criarNegociacaoCentral({
    nomePessoa: "Central Hoje",
    responsibleMemberId: orgCentral.membro.id,
    visitaEm: diasAtras(0),
  });
  await criarNegociacaoCentral({
    nomePessoa: "Central Proxima",
    responsibleMemberId: orgCentral.membro.id,
    visitaEm: diasAtras(-3),
  });
  // Fase 19 — uma negociação com FOLLOW-UP de hoje, e nenhuma visita.
  // Prova na tela o que a fase entregou: a Central passa a mostrar o
  // outro tipo de compromisso, com o assunto em texto, e a negociação
  // deixa de aparecer como "sem próximo compromisso".
  const negociacaoFollowUp = await criarNegociacaoCentral({
    nomePessoa: "Central Follow Up",
    responsibleMemberId: orgCentral.membro.id,
  });
  const pessoaFollowUp = (
    await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: negociacaoFollowUp.id },
      select: { personId: true },
    })
  ).personId;
  // DOIS follow-ups, de propósito, e cada um prova uma coisa diferente:
  //
  //   hoje ao meio-dia UTC  -> aparece no bloco HOJE. A classificação é
  //                            por DIA (Fases 17/18), então isso vale
  //                            independentemente da hora em que a suíte
  //                            roda — inclusive depois do meio-dia.
  //   amanhã ao meio-dia    -> é o PRÓXIMO COMPROMISSO da negociação
  //                            (scheduledAt > agora em qualquer horário
  //                            de execução), o que tira a negociação de
  //                            "sem próximo compromisso".
  //
  // Um único follow-up ao meio-dia de hoje não serviria para as duas
  // coisas: depois das 12:00 UTC ele deixa de ser futuro.
  for (const [assunto, quando] of [
    ["Enviar proposta revisada", diasAtras(0)],
    ["Cobrar documentos", diasAtras(-1)],
  ] as const) {
    await prisma.scheduledActivity.create({
      data: {
        organizationId: orgCentral.organization.id,
        personId: pessoaFollowUp,
        propertyId: IDS_E2E.imovelOrgCentral,
        propertyInterestId: negociacaoFollowUp.id,
        type: "FOLLOW_UP",
        subject: assunto,
        status: "SCHEDULED",
        scheduledAt: quando,
      },
    });
  }
  // Negociação de OUTRO corretor: prova na tela que a Central é pessoal.
  await criarNegociacaoCentral({
    nomePessoa: "Central De Outro Corretor",
    responsibleMemberId: outroCorretorCentral.id,
  });
  // Fase 21 — negociação SEM RESPONSÁVEL. É o fato que a visão de equipe
  // finalmente consegue mostrar (responsibleMemberId null), e que a
  // Central pessoal, por definição, nunca exibe. Não altera nenhuma
  // contagem pessoal do dono: ela não é de ninguém.
  await criarNegociacaoCentral({
    nomePessoa: "Central Sem Responsavel",
    responsibleMemberId: null,
  });

  // =====================================================================
  // Fase 18 — dados de BORDA DE FUSO (Organização F, America/Sao_Paulo)
  // =====================================================================
  // Duas visitas escolhidas para serem indistinguíveis em UTC e distintas
  // no calendário de São Paulo — é exatamente aí que a Fase 17 errava:
  //
  //   hoje      23:30 America/Sao_Paulo  ->  HOJE      (amanhã em UTC)
  //   amanhã    00:15 America/Sao_Paulo  ->  PRÓXIMA   (amanhã em UTC)
  //
  // As duas caem no MESMO dia UTC. Sob a convenção antiga as duas seriam
  // classificadas igual; sob o fuso da organização elas se separam. Os
  // instantes são construídos com instanteDeComponentes — o mesmo helper
  // do produto, nunca "menos três horas" na mão.
  const FUSO_ORG_F = "America/Sao_Paulo";
  const horarioLocalOrgF = (deslocamentoDias: number, hora: number, minuto: number) => {
    const c = componentesNoFuso(new Date(AGORA_SEED), FUSO_ORG_F);
    return instanteDeComponentes(
      { ano: c.ano, mes: c.mes, dia: c.dia + deslocamentoDias, hora, minuto },
      FUSO_ORG_F
    );
  };

  await garantirImovel({
    id: IDS_E2E.imovelOrgFuso,
    organizationId: orgFuso.organization.id,
    title: "Apartamento E2E Fuso",
  });

  const criarVisitaOrgF = async (opcoes: { nomePessoa: string; visitaEm: Date }) => {
    const pessoa = await prisma.person.create({
      data: { organizationId: orgFuso.organization.id, name: opcoes.nomePessoa, roles: ["LEAD"] },
      select: { id: true },
    });
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: orgFuso.organization.id,
        personId: pessoa.id,
        propertyId: IDS_E2E.imovelOrgFuso,
        stage: "INTERESTED",
        responsibleMemberId: orgFuso.membro.id,
      },
      select: { id: true },
    });
    await prisma.scheduledActivity.create({
      data: {
        organizationId: orgFuso.organization.id,
        personId: pessoa.id,
        propertyId: IDS_E2E.imovelOrgFuso,
        propertyInterestId: interesse.id,
        type: "VISIT",
        status: "SCHEDULED",
        scheduledAt: opcoes.visitaEm,
      },
    });
  };

  await criarVisitaOrgF({
    nomePessoa: "Fuso Fim Do Dia",
    visitaEm: horarioLocalOrgF(0, 23, 30),
  });
  await criarVisitaOrgF({
    nomePessoa: "Fuso Comeco De Amanha",
    visitaEm: horarioLocalOrgF(1, 0, 15),
  });

  // =====================================================================
  // Fase 22 — carteiras separadas da Organização G (política RESTRITA)
  // =====================================================================
  // Ana e Bruno são BROKER. Cada um conduz uma negociação, e existe um
  // CLIENTE COMPARTILHADO com uma negociação de cada — o caso que prova
  // a doutrina "PII compartilhado, negociações separadas".
  await garantirImovel({
    id: IDS_E2E.imovelOrgRestrita,
    organizationId: orgRestrita.organization.id,
    title: "Apartamento E2E Restrita",
  });

  const corretorRestrito = async (email: string, nome: string) => {
    const usuario = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await bcrypt.hash(senha, 10) },
      create: { name: nome, email, passwordHash: await bcrypt.hash(senha, 10) },
      select: { id: true },
    });
    return prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: orgRestrita.organization.id,
          userId: usuario.id,
        },
      },
      update: { role: "BROKER" },
      create: {
        organizationId: orgRestrita.organization.id,
        userId: usuario.id,
        role: "BROKER",
      },
      select: { id: true },
    });
  };
  const anaRestrita = await corretorRestrito("ana-restrita@e2e.test", "Ana Restrita");
  const brunoRestrito = await corretorRestrito("bruno-restrita@e2e.test", "Bruno Restrito");

  const negociacaoRestrita = async (opcoes: {
    nomePessoa: string;
    responsibleMemberId: string | null;
    pessoaId?: string;
    imovelId?: string;
  }) => {
    const pessoaId =
      opcoes.pessoaId ??
      (
        await prisma.person.create({
          data: {
            organizationId: orgRestrita.organization.id,
            name: opcoes.nomePessoa,
            roles: ["LEAD"],
          },
          select: { id: true },
        })
      ).id;
    const imovelId = opcoes.imovelId ?? IDS_E2E.imovelOrgRestrita;
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: orgRestrita.organization.id,
        personId: pessoaId,
        propertyId: imovelId,
        stage: "INTERESTED",
        responsibleMemberId: opcoes.responsibleMemberId,
      },
      select: { id: true },
    });
    // Um compromisso de HOJE por negociação: prova que a Agenda também
    // é escopada, não só o Pipeline.
    await prisma.scheduledActivity.create({
      data: {
        organizationId: orgRestrita.organization.id,
        personId: pessoaId,
        propertyId: imovelId,
        propertyInterestId: interesse.id,
        type: "FOLLOW_UP",
        subject: `Follow-up de ${opcoes.nomePessoa}`,
        status: "SCHEDULED",
        scheduledAt: diasAtras(0),
      },
    });
    return pessoaId;
  };

  await negociacaoRestrita({
    nomePessoa: "Cliente Exclusivo Da Ana",
    responsibleMemberId: anaRestrita.id,
  });
  await negociacaoRestrita({
    nomePessoa: "Cliente Exclusivo Do Bruno",
    responsibleMemberId: brunoRestrito.id,
  });
  await negociacaoRestrita({
    nomePessoa: "Negociacao Sem Dono",
    responsibleMemberId: null,
  });

  // CLIENTE COMPARTILHADO: uma negociação de cada corretor, em imóveis
  // diferentes (a unique é organizationId+personId+propertyId).
  const imovelCompartilhado = await garantirImovel({
    id: IDS_E2E.imovelOrgRestritaSegundo,
    organizationId: orgRestrita.organization.id,
    title: "Cobertura E2E Restrita",
  });
  const compartilhado = await negociacaoRestrita({
    nomePessoa: "Cliente Compartilhado",
    responsibleMemberId: anaRestrita.id,
  });
  await negociacaoRestrita({
    nomePessoa: "Cliente Compartilhado",
    responsibleMemberId: brunoRestrito.id,
    pessoaId: compartilhado,
    imovelId: imovelCompartilhado.id,
  });

  // =====================================================================
  // Fase 23 — dados de ANALYTICS da carteira (Organização G, RESTRITA)
  // =====================================================================
  // Um negócio GANHO conduzido pela Ana, com comissão dividida entre
  // Ana e Bruno. Prova as duas dimensões distintas na tela: quem conduz
  // (responsibleMemberId) e quem é beneficiário (participant.memberId).
  const pessoaGanho = await prisma.person.create({
    data: {
      organizationId: orgRestrita.organization.id,
      name: "Cliente Ganho Da Ana",
      roles: ["LEAD"],
    },
    select: { id: true },
  });
  const imovelGanho = await garantirImovel({
    id: IDS_E2E.imovelOrgRestritaGanho,
    organizationId: orgRestrita.organization.id,
    title: "Sobrado E2E Restrita",
  });
  const negocioGanho = await prisma.propertyInterest.create({
    data: {
      organizationId: orgRestrita.organization.id,
      personId: pessoaGanho.id,
      propertyId: imovelGanho.id,
      stage: "WON",
      responsibleMemberId: anaRestrita.id,
      closedAt: diasAtras(2),
      closedValue: "450000.00",
      commissionValue: "18000.00",
    },
    select: { id: true },
  });
  const participacaoAna = await prisma.propertyInterestParticipant.create({
    data: {
      organizationId: orgRestrita.organization.id,
      propertyInterestId: negocioGanho.id,
      memberId: anaRestrita.id,
      allocationValue: "12000.00",
    },
    select: { id: true },
  });
  await prisma.propertyInterestParticipant.create({
    data: {
      organizationId: orgRestrita.organization.id,
      propertyInterestId: negocioGanho.id,
      memberId: brunoRestrito.id,
      allocationValue: "6000.00",
    },
  });
  await prisma.propertyInterestParticipantPayment.create({
    data: {
      organizationId: orgRestrita.organization.id,
      participantId: participacaoAna.id,
      amount: "5000.00",
      paidAt: diasAtras(1),
    },
  });

  // =====================================================================
  // Fase 24 — colisão de identidade da Organização H
  // =====================================================================
  // Duas pessoas distintas, cada uma dona de UM dos dados de contato. Um
  // visitante que envia os dois ao mesmo tempo não é nenhuma das duas com
  // certeza — e o sistema, em vez de escolher, guarda o contato.
  //
  // Os valores normalizados são escritos explicitamente porque é por eles
  // que o dedupe procura; deixá-los ao acaso tornaria o conflito
  // dependente de detalhe de implementação em vez de fixture.
  await prisma.person.create({
    data: {
      organizationId: orgCaptacao.organization.id,
      name: "Cliente do E-mail",
      email: "colisao@e2e.test",
      emailNormalized: "colisao@e2e.test",
      roles: ["LEAD"],
    },
  });
  // Um BROKER desta mesma organização: é ele que prova o outro lado do
  // portão — a fila é gerencial, e quem não decide identidade não vê a
  // tela nem o item de menu.
  const usuarioCorretorCaptacao = await prisma.user.upsert({
    where: { email: "corretor-captacao@e2e.test" },
    update: { passwordHash: await bcrypt.hash(senha, 10) },
    create: {
      name: "Corretor Captação",
      email: "corretor-captacao@e2e.test",
      passwordHash: await bcrypt.hash(senha, 10),
    },
    select: { id: true },
  });
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: orgCaptacao.organization.id,
        userId: usuarioCorretorCaptacao.id,
      },
    },
    update: { role: "BROKER" },
    create: {
      organizationId: orgCaptacao.organization.id,
      userId: usuarioCorretorCaptacao.id,
      role: "BROKER",
    },
  });

  await prisma.person.create({
    data: {
      organizationId: orgCaptacao.organization.id,
      name: "Cliente do Telefone",
      phone: "(11) 94444-0001",
      phoneNormalized: "11944440001",
      roles: ["LEAD"],
    },
  });

  // =====================================================================
  // Fase 25 — corretor da Organização I
  // =====================================================================
  // Identidade ATIVA e vínculo ATIVO, com senha conhecida: é quem
  // "esquece a senha" no spec de recuperação. Precisa ser dedicado
  // porque o spec TROCA a senha dele — usar qualquer dono de outra
  // organização quebraria todos os logins seguintes.
  const usuarioCorretorAcesso = await prisma.user.upsert({
    where: { email: "corretor-acesso@e2e.test" },
    update: {
      // Rodada nova sempre restaura a senha do seed: o spec anterior a
      // trocou, e o seed é quem devolve o mundo ao estado determinístico.
      passwordHash: await bcrypt.hash(senha, 10),
      active: true,
      passwordChangedAt: null,
    },
    create: {
      name: "Corretor Acesso",
      email: "corretor-acesso@e2e.test",
      passwordHash: await bcrypt.hash(senha, 10),
    },
    select: { id: true },
  });
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: orgAcesso.organization.id,
        userId: usuarioCorretorAcesso.id,
      },
    },
    update: { role: "BROKER", status: "ACTIVE" },
    create: {
      organizationId: orgAcesso.organization.id,
      userId: usuarioCorretorAcesso.id,
      role: "BROKER",
      status: "ACTIVE",
    },
  });
  // Tokens de rodadas anteriores desta identidade saem por userId
  // (recuperação não tem organizationId — senha é global).
  await prisma.passwordResetToken.deleteMany({
    where: { userId: usuarioCorretorAcesso.id },
  });

  // Identidade que JÁ TEM CONTA, para o cenário "convidar alguém que já
  // existe". Vive na Organização H de propósito: ela precisa ter conta
  // ativa em ALGUMA organização que não seja a I (que é justamente a
  // que o convite vai criar).
  //
  // Dedicada, e não um dono fixo reaproveitado: aceitar o convite dá a
  // essa identidade um SEGUNDO vínculo ativo, e fazer isso com um dono
  // compartilhado contamina toda spec que loga com ele — foi exatamente
  // o que aconteceu quando o spec usava owner-a.
  const usuarioJaTemConta = await prisma.user.upsert({
    where: { email: "ja-tem-conta@e2e.test" },
    update: { passwordHash: await bcrypt.hash(senha, 10), active: true, passwordChangedAt: null },
    create: {
      name: "Pessoa Que Ja Tem Conta",
      email: "ja-tem-conta@e2e.test",
      passwordHash: await bcrypt.hash(senha, 10),
    },
    select: { id: true },
  });
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: orgCaptacao.organization.id,
        userId: usuarioJaTemConta.id,
      },
    },
    update: { role: "BROKER", status: "ACTIVE" },
    create: {
      organizationId: orgCaptacao.organization.id,
      userId: usuarioJaTemConta.id,
      role: "BROKER",
      status: "ACTIVE",
    },
  });

  // O spec "usuário que já existe" convida um DONO FIXO de outra
  // organização (owner-a) para a Organização I. Esse vínculo sobrevive à
  // limpeza de membros descartáveis justamente por ser de um dono fixo —
  // e na rodada seguinte o convite seria recusado com "já existe um
  // convite pendente", que é o comportamento CERTO do produto e um teste
  // não determinístico. O seed desfaz o vínculo, devolvendo o mundo ao
  // estado de antes.
  const forasteirosNaOrgAcesso = await prisma.organizationMember.findMany({
    where: {
      organizationId: orgAcesso.organization.id,
      user: {
        email: { notIn: ["owner-acesso@e2e.test", "corretor-acesso@e2e.test"] },
      },
    },
    select: { id: true, userId: true },
  });
  if (forasteirosNaOrgAcesso.length > 0) {
    await prisma.inviteToken.deleteMany({
      where: {
        organizationId: orgAcesso.organization.id,
        userId: { in: forasteirosNaOrgAcesso.map((m) => m.userId) },
      },
    });
    await prisma.organizationMember.deleteMany({
      where: { id: { in: forasteirosNaOrgAcesso.map((m) => m.id) } },
    });
  }

  // A identidade multi-org é OWNER na J (dona) e ganha um vínculo BROKER
  // na K — dois papéis diferentes para a mesma pessoa, que é exatamente
  // o que o seletor precisa provar.
  const usuarioMultiOrg = await prisma.user.findUniqueOrThrow({
    where: { email: "multi-org@e2e.test" },
    select: { id: true },
  });
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: orgMultiB.organization.id,
        userId: usuarioMultiOrg.id,
      },
    },
    update: { role: "BROKER", status: "ACTIVE" },
    create: {
      organizationId: orgMultiB.organization.id,
      userId: usuarioMultiOrg.id,
      role: "BROKER",
      status: "ACTIVE",
    },
  });

  // Um imóvel EXCLUSIVO de cada organização multi-org. É o que torna a
  // troca observável de verdade: não basta o nome no menu mudar — as
  // consultas precisam passar a usar o outro tenant. Sem dado
  // distinguível, "trocou" e "não trocou" têm a mesma aparência.
  await garantirImovel({
    id: "e2e-imovel-multi-a",
    organizationId: orgMultiA.organization.id,
    title: "Imovel Exclusivo Multi A",
  });
  await garantirImovel({
    id: "e2e-imovel-multi-b",
    organizationId: orgMultiB.organization.id,
    title: "Imovel Exclusivo Multi B",
  });

  // Fase 26 — organizações criadas pelo spec de cadastro self-service.
  // Cada execução cria uma nova (o fluxo é real, de ponta a ponta), e
  // sem esta limpeza o banco de teste acumularia uma imobiliária por
  // rodada, para sempre.
  const criadasPeloSpec = await prisma.organization.findMany({
    where: { slug: { startsWith: "e2e-cadastro-" } },
    select: { id: true },
  });
  if (criadasPeloSpec.length > 0) {
    const ids = criadasPeloSpec.map((o) => o.id);
    const membros = await prisma.organizationMember.findMany({
      where: { organizationId: { in: ids } },
      select: { userId: true },
    });
    const userIds = membros.map((m) => m.userId);
    await prisma.activityLog.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.subscription.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    // As identidades criadas por esses cadastros só existem por causa
    // deles — saem junto, com os tokens que apontam para elas.
    await prisma.inviteToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({
      where: { id: { in: userIds }, memberships: { none: {} } },
    });
  }
  await prisma.signupToken.deleteMany({ where: { email: { startsWith: "cadastro-e2e-" } } });

  // Períodos de trial determinísticos: um vigente, um vencido. Recriados
  // a cada rodada porque o spec observa exatamente essa diferença.
  const agoraTrial = new Date();
  for (const [org, fim] of [
    [orgTrial, new Date(agoraTrial.getTime() + 14 * 24 * 60 * 60 * 1000)] as const,
    [orgVencida, new Date(agoraTrial.getTime() - 24 * 60 * 60 * 1000)] as const,
  ]) {
    await prisma.subscription.deleteMany({ where: { organizationId: org.organization.id } });
    await prisma.subscription.create({
      data: {
        organizationId: org.organization.id,
        planId: planoTrialE2E.id,
        status: "TRIALING",
        currentPeriodStart: new Date(agoraTrial.getTime() - 24 * 60 * 60 * 1000),
        currentPeriodEnd: fim,
      },
    });
  }

  console.log(`  Org A (plano completo, CRM habilitado): slug=${orgA.organization.slug} login=${emailA}`);
  console.log(`  Org B (plano básico, CRM desabilitado): slug=${orgB.organization.slug} login=owner-b@e2e.test`);
  console.log(
    `  Org C (dedicada à Agenda, CRM habilitado): slug=${orgAgenda.organization.slug} login=owner-agenda@e2e.test`
  );
  console.log(
    `  Org D (dedicada ao Analytics, CRM habilitado): slug=${orgAnalytics.organization.slug} login=owner-analytics@e2e.test`,
    `  Org E (dedicada à Central de trabalho): slug=${orgCentral.organization.slug} login=owner-central@e2e.test`,
    `  Org F (dedicada ao fuso, America/Sao_Paulo): slug=${orgFuso.organization.slug} login=owner-fuso@e2e.test`,
    `  Org G (dedicada à visibilidade restrita): slug=${orgRestrita.organization.slug} login=owner-restrita@e2e.test`,
    `  Org H (dedicada à captação ambígua): slug=${orgCaptacao.organization.slug} login=owner-captacao@e2e.test`,
    `  Org I (dedicada ao ciclo de acesso): slug=${orgAcesso.organization.slug} login=owner-acesso@e2e.test`,
    `  Orgs J/K (multi-org): ${orgMultiA.organization.slug} + ${orgMultiB.organization.slug} login=multi-org@e2e.test`,
    `  Orgs L/M (assinatura): ${orgTrial.organization.slug} (vigente) + ${orgVencida.organization.slug} (vencido)`
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
