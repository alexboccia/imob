import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, OrganizationRole } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await seedTenancy();

  const orgSlug = process.env.ORG_SLUG ?? "boccia";
  const orgName = process.env.ORG_NAME ?? "Boccia Consultoria Imobiliária";
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const senha = process.env.SEED_ADMIN_SENHA ?? "admin123";

  const planoPremium = await prisma.plan.findUniqueOrThrow({ where: { code: "PREMIUM" } });

  const organization = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: {},
    create: { slug: orgSlug, name: orgName, planId: planoPremium.id },
  });

  const senhaHash = await bcrypt.hash(senha, 10);

  const usuario = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: "Administrador", email, passwordHash: senhaHash },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: usuario.id } },
    update: {},
    create: { organizationId: organization.id, userId: usuario.id, role: "OWNER" },
  });

  console.log(`Usuário administrador pronto: ${usuario.email} (organização: ${organization.slug})`);

  const opcoesImovel = [
    "Acessível para PCD",
    "Água quente",
    "Andar alto",
    "Aquecimento a gás",
    "Aquecimento solar",
    "Ar-condicionado",
    "Ar-condicionado em todos os ambientes",
    "Ar-condicionado split",
    "Área de serviço",
    "Área externa",
    "Armário na cozinha",
    "Armário no quarto",
    "Armários embutidos",
    "Automação residencial",
    "Banheiro adaptado",
    "Banheiro de serviço",
    "Banheiro social",
    "Cabeamento estruturado",
    "Carregador para veículo elétrico",
    "Churrasqueira privativa",
    "Climatização",
    "Closet",
    "Cobertura",
    "Copa",
    "Cortinas/persianas automatizadas",
    "Cozinha americana",
    "Cozinha planejada",
    "Dependência de empregada",
    "Depósito",
    "Despensa",
    "Energia solar",
    "Escritório",
    "Espaço gourmet",
    "Esquina",
    "Face norte",
    "Fechadura eletrônica",
    "Garagem privativa",
    "Gás encanado",
    "Home office",
    "Iluminação planejada",
    "Internet cabeada",
    "Jacuzzi / Hidromassagem",
    "Jardim",
    "Lareira",
    "Lavabo",
    "Mezanino",
    "Mobiliado",
    "Móveis planejados",
    "Pergolado",
    "Piscina privativa",
    "Piso de madeira",
    "Piso frio",
    "Piso laminado",
    "Piso porcelanato",
    "Piso vinílico",
    "Porão",
    "Portas largas",
    "Quintal",
    "Rebaixamento em gesso",
    "Sacada",
    "Sala de estar",
    "Sala de jantar",
    "Sala de TV",
    "Sauna privativa",
    "Sol da manhã",
    "Sol da tarde",
    "Sotão",
    "Suíte",
    "Terraço",
    "Vaga coberta",
    "Vaga descoberta",
    "Vaga para visitante",
    "Varanda",
    "Ventilador de teto",
    "Vista livre",
    "Vista panorâmica",
    "Vista para lago",
    "Vista para montanha",
    "Vista para o mar",
    "Vista para praça",
    "Aceita pet",
    "Churrasqueira",
    "Elevador",
    "Lavanderia",
    "Piscina",
    "Portaria 24h",
    "Quadra poliesportiva",
    "Salão de festas",
    "Zelador",
  ];

  const opcoesCondominio = [
    "Academia",
    "Academia ao ar livre",
    "Aceita pet",
    "Berçário",
    "Bicicletário",
    "Bicicletário com oficina",
    "Brinquedoteca",
    "Câmeras de segurança",
    "Campo de futebol",
    "Car wash",
    "Carregador para carro elétrico",
    "Cerca elétrica",
    "Churrasqueira",
    "Coleta seletiva",
    "Condomínio fechado",
    "Controle de acesso",
    "Coworking",
    "Deck molhado",
    "Elevador",
    "Elevador de serviço",
    "Elevador social",
    "Energia solar",
    "Espaço delivery",
    "Espaço gourmet",
    "Espaço kids",
    "Espaço pet",
    "Espaço teen",
    "Espaço zen",
    "Fraldário",
    "Gerador",
    "Gerador para áreas comuns",
    "Interfone",
    "Lavanderia compartilhada",
    "Lockers inteligentes",
    "Mercado autônomo",
    "Mini mercado",
    "Oficina compartilhada",
    "Pet place",
    "Piscina",
    "Piscina aquecida",
    "Piscina coberta",
    "Piscina infantil",
    "Pista de caminhada",
    "Pista de cooper",
    "Playground",
    "Portão eletrônico",
    "Portaria 24h",
    "Quadra de areia",
    "Quadra de beach tennis",
    "Quadra de futebol de salão",
    "Quadra de tênis",
    "Quadra poliesportiva",
    "Reuso de água",
    "Ronda motorizada",
    "Sala de cinema",
    "Sala de jogos",
    "Salão de festas",
    "Sauna",
    "Segurança 24h",
    "Spa",
    "Vagas para visitantes",
  ];

  for (const nome of opcoesImovel) {
    await prisma.featureOption.upsert({
      where: {
        organizationId_category_name: {
          organizationId: organization.id,
          category: "PROPERTY",
          name: nome,
        },
      },
      update: {},
      create: { organizationId: organization.id, category: "PROPERTY", name: nome },
    });
  }

  for (const nome of opcoesCondominio) {
    await prisma.featureOption.upsert({
      where: {
        organizationId_category_name: {
          organizationId: organization.id,
          category: "CONDO",
          name: nome,
        },
      },
      update: {},
      create: { organizationId: organization.id, category: "CONDO", name: nome },
    });
  }

  console.log(
    `Catálogo de características pronto: ${opcoesImovel.length} do imóvel, ${opcoesCondominio.length} do condomínio.`
  );

  const tiposResidenciais = [
    "Apartamento",
    "Apartamento duplex",
    "Apartamento garden",
    "Apartamento triplex",
    "Casa",
    "Casa de condomínio",
    "Casa de vila",
    "Casa geminada",
    "Casa térrea",
    "Chácara",
    "Cobertura",
    "Cobertura duplex",
    "Cobertura triplex",
    "Edícula",
    "Fazenda",
    "Flat",
    "Kitnet",
    "Loft",
    "Lote residencial",
    "Mansão",
    "Prédio residencial",
    "Quarto",
    "Rancho",
    "República",
    "Residencial multifamiliar",
    "Sítio",
    "Sobrado",
    "Studio",
    "Terreno residencial",
  ];

  const tiposComerciais = [
    "Área comercial",
    "Área industrial",
    "Área rural para atividade comercial",
    "Armazém",
    "Bar",
    "Casa comercial",
    "Centro de distribuição",
    "Clínica",
    "Conjunto comercial",
    "Consultório",
    "Coworking",
    "Depósito",
    "Escritório",
    "Estacionamento",
    "Fábrica",
    "Galpão",
    "Galpão industrial",
    "Galpão logístico",
    "Garagem",
    "Hostel",
    "Hotel",
    "Indústria",
    "Laboratório",
    "Laje corporativa",
    "Loja",
    "Loja de shopping",
    "Oficina",
    "Padaria",
    "Ponto comercial",
    "Posto de combustível",
    "Pousada",
    "Prédio comercial",
    "Prédio corporativo",
    "Restaurante",
    "Sala comercial",
    "Sobrado comercial",
    "Terreno comercial",
    "Terreno industrial",
  ];

  for (const nome of tiposResidenciais) {
    await prisma.propertyTypeOption.upsert({
      where: {
        organizationId_category_name: {
          organizationId: organization.id,
          category: "RESIDENTIAL",
          name: nome,
        },
      },
      update: {},
      create: { organizationId: organization.id, category: "RESIDENTIAL", name: nome },
    });
  }

  for (const nome of tiposComerciais) {
    await prisma.propertyTypeOption.upsert({
      where: {
        organizationId_category_name: {
          organizationId: organization.id,
          category: "COMMERCIAL",
          name: nome,
        },
      },
      update: {},
      create: { organizationId: organization.id, category: "COMMERCIAL", name: nome },
    });
  }

  console.log(
    `Catálogo de tipos de imóvel pronto: ${tiposResidenciais.length} residenciais, ${tiposComerciais.length} comerciais.`
  );
}

// Fundação multi-tenant (EasyMob) — catálogos globais da plataforma, não
// pertencem a nenhuma organização. Ver /Users/alexboccia/.claude/plans/
// glittery-noodling-harp.md para o plano completo.
async function seedTenancy() {
  const modulos = [
    { code: "core", name: "Core" },
    { code: "properties", name: "Imóveis" },
    { code: "crm", name: "CRM" },
    { code: "leads", name: "Leads" },
    { code: "pipeline", name: "Funil" },
    { code: "agenda", name: "Agenda" },
    { code: "financeiro", name: "Financeiro" },
    { code: "marketing", name: "Marketing" },
    { code: "ia", name: "Inteligência Artificial" },
    { code: "relatorios", name: "Relatórios" },
    { code: "integracoes", name: "Integrações" },
    { code: "billing", name: "Cobrança" },
    { code: "email", name: "Envio de e-mail" },
    { code: "portais", name: "Publicação em portais" },
    { code: "whatsapp", name: "WhatsApp" },
  ];

  const modulosCriados = new Map<string, string>();
  for (const modulo of modulos) {
    const registro = await prisma.module.upsert({
      where: { code: modulo.code },
      update: { name: modulo.name },
      create: modulo,
    });
    modulosCriados.set(modulo.code, registro.id);
  }

  console.log(`Catálogo de módulos pronto: ${modulos.length} módulos.`);

  // Preço mensal em centavos — valor de exibição, sem cobrança automática.
  //
  // Fase P.9: estes valores só se aplicam à CRIAÇÃO de cada plano — a
  // partir do momento em que existem no banco, price/módulos/limites viram
  // configuração comercial editável pelo Platform Admin
  // (/platform/plans/[id]/editar). Reexecutar este seed NUNCA sobrescreve
  // um plano já existente (ver loop abaixo: create-if-missing, sem
  // `update`), justamente pra nunca desfazer silenciosamente uma edição
  // feita em runtime. A reconciliação one-time dos valores V1 aprovados
  // pros planos BASICO/PRO/PREMIUM (que já existiam antes da P.9, com
  // valores antigos) foi feita separadamente, ver scripts/reconciliar-planos-p9.ts
  // — nunca dentro deste seed idempotente.
  const planos = [
    {
      code: "STARTER",
      name: "Starter",
      priceMonthlyCents: 0,
      isTrial: true,
      trialDays: 14,
      modulosHabilitados: ["core", "properties", "crm"],
      limites: { PROPERTIES: 10, USERS: 1, PHOTOS_PER_PROPERTY: 5, CRM_CLIENTS: 100 },
    },
    {
      code: "BASICO",
      name: "Básico",
      priceMonthlyCents: 9900,
      isTrial: false,
      trialDays: null,
      modulosHabilitados: ["core", "properties", "crm"],
      limites: { PROPERTIES: 50, USERS: 1, PHOTOS_PER_PROPERTY: 10, CRM_CLIENTS: 500 },
    },
    {
      code: "PRO",
      name: "Pro",
      priceMonthlyCents: 24900,
      isTrial: false,
      trialDays: null,
      modulosHabilitados: [
        "core",
        "properties",
        "crm",
        "leads",
        "pipeline",
        "agenda",
        "relatorios",
        "email",
        "whatsapp",
      ],
      limites: { PROPERTIES: 250, USERS: 5, PHOTOS_PER_PROPERTY: 20, CRM_CLIENTS: 5000 },
    },
    {
      code: "PREMIUM",
      name: "Premium",
      priceMonthlyCents: 49900,
      isTrial: false,
      trialDays: null,
      modulosHabilitados: modulos.map((m) => m.code),
      limites: { PROPERTIES: 1000, USERS: 15, PHOTOS_PER_PROPERTY: 40, CRM_CLIENTS: null },
    },
  ];

  for (const planoConfig of planos) {
    const existente = await prisma.plan.findUnique({ where: { code: planoConfig.code } });
    const plano =
      existente ??
      (await prisma.plan.create({
        data: {
          code: planoConfig.code,
          name: planoConfig.name,
          priceMonthlyCents: planoConfig.priceMonthlyCents,
          isTrial: planoConfig.isTrial,
          trialDays: planoConfig.trialDays,
        },
      }));

    // Módulos/limites de um plano JÁ EXISTENTE também não são
    // sobrescritos aqui, pelo mesmo motivo do Plan acima — só populados na
    // criação do plano (loop abaixo roda create-if-missing por
    // planId+moduleId / planId+feature, nunca update).
    for (const modulo of modulos) {
      const moduleId = modulosCriados.get(modulo.code)!;
      const planModuleExistente = await prisma.planModule.findUnique({
        where: { planId_moduleId: { planId: plano.id, moduleId } },
      });
      if (!planModuleExistente) {
        await prisma.planModule.create({
          data: {
            planId: plano.id,
            moduleId,
            enabled: planoConfig.modulosHabilitados.includes(modulo.code),
          },
        });
      }
    }

    for (const [feature, limit] of Object.entries(planoConfig.limites)) {
      const planLimitExistente = await prisma.planLimit.findUnique({
        where: { planId_feature: { planId: plano.id, feature } },
      });
      if (!planLimitExistente) {
        await prisma.planLimit.create({ data: { planId: plano.id, feature, limit } });
      }
    }
  }

  console.log(`Catálogo de planos pronto: ${planos.map((p) => p.code).join(", ")}.`);

  // Permissões — catálogo + mapeamento inicial por role (ajustável sem
  // redeploy depois, via RolePermission).
  const permissoes = [
    { code: "properties.view", description: "Ver imóveis" },
    { code: "properties.create", description: "Criar imóveis" },
    { code: "properties.edit", description: "Editar imóveis" },
    { code: "properties.delete", description: "Excluir imóveis" },
    { code: "crm.view", description: "Ver clientes/leads" },
    { code: "crm.manage", description: "Gerenciar clientes/leads e funil" },
    { code: "users.manage", description: "Gerenciar usuários da organização" },
    { code: "settings.manage", description: "Gerenciar configurações da organização" },
    { code: "catalog.manage", description: "Gerenciar catálogos (características, tipos de imóvel)" },
    { code: "maintenance.manage", description: "Acessar ferramentas de manutenção" },
    { code: "billing.manage", description: "Gerenciar plano e cobrança" },
    { code: "reports.view", description: "Ver relatórios" },
  ];

  const permissoesCriadas = new Map<string, string>();
  for (const permissao of permissoes) {
    const registro = await prisma.permission.upsert({
      where: { code: permissao.code },
      update: { description: permissao.description },
      create: permissao,
    });
    permissoesCriadas.set(permissao.code, registro.id);
  }

  const todasPermissoes = permissoes.map((p) => p.code);
  const mapaRolePermissao: Record<OrganizationRole, string[]> = {
    OWNER: todasPermissoes,
    ADMIN: todasPermissoes,
    MANAGER: [
      "properties.view",
      "properties.create",
      "properties.edit",
      "properties.delete",
      "crm.view",
      "crm.manage",
      "catalog.manage",
      "reports.view",
    ],
    BROKER: ["properties.view", "properties.create", "properties.edit", "crm.view", "crm.manage"],
    ASSISTANT: ["properties.view", "crm.view"],
  };

  for (const [role, codigos] of Object.entries(mapaRolePermissao) as [
    OrganizationRole,
    string[],
  ][]) {
    for (const codigo of codigos) {
      const permissionId = permissoesCriadas.get(codigo)!;
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId } },
        update: {},
        create: { role, permissionId },
      });
    }
  }

  console.log(`Catálogo de permissões pronto: ${permissoes.length} permissões, 5 roles mapeadas.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
