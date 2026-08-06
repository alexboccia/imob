import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, OrganizationRole } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const senha = process.env.SEED_ADMIN_SENHA ?? "admin123";

  const senhaHash = await bcrypt.hash(senha, 10);

  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nome: "Administrador",
      email,
      senhaHash,
      papel: "ADMINISTRADOR",
    },
  });

  console.log(`Usuário administrador pronto: ${usuario.email}`);

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
    await prisma.caracteristicaOpcao.upsert({
      where: { categoria_nome: { categoria: "IMOVEL", nome } },
      update: {},
      create: { categoria: "IMOVEL", nome },
    });
  }

  for (const nome of opcoesCondominio) {
    await prisma.caracteristicaOpcao.upsert({
      where: { categoria_nome: { categoria: "CONDOMINIO", nome } },
      update: {},
      create: { categoria: "CONDOMINIO", nome },
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
    await prisma.tipoImovelOpcao.upsert({
      where: { categoria_nome: { categoria: "RESIDENCIAL", nome } },
      update: {},
      create: { categoria: "RESIDENCIAL", nome },
    });
  }

  for (const nome of tiposComerciais) {
    await prisma.tipoImovelOpcao.upsert({
      where: { categoria_nome: { categoria: "COMERCIAL", nome } },
      update: {},
      create: { categoria: "COMERCIAL", nome },
    });
  }

  console.log(
    `Catálogo de tipos de imóvel pronto: ${tiposResidenciais.length} residenciais, ${tiposComerciais.length} comerciais.`
  );

  await seedTenancy();
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
  const planos = [
    {
      code: "BASICO",
      name: "Básico",
      priceMonthlyCents: 9900,
      modulosHabilitados: ["core", "properties"],
      limites: { PROPERTIES: 20, USERS: 2, PHOTOS_PER_PROPERTY: 10 },
    },
    {
      code: "PRO",
      name: "Pro",
      priceMonthlyCents: 24900,
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
      limites: { PROPERTIES: 100, USERS: 10, PHOTOS_PER_PROPERTY: 30 },
    },
    {
      code: "PREMIUM",
      name: "Premium",
      priceMonthlyCents: 49900,
      modulosHabilitados: modulos.map((m) => m.code),
      limites: { PROPERTIES: null, USERS: null, PHOTOS_PER_PROPERTY: null },
    },
  ];

  for (const planoConfig of planos) {
    const plano = await prisma.plan.upsert({
      where: { code: planoConfig.code },
      update: { name: planoConfig.name, priceMonthlyCents: planoConfig.priceMonthlyCents },
      create: {
        code: planoConfig.code,
        name: planoConfig.name,
        priceMonthlyCents: planoConfig.priceMonthlyCents,
      },
    });

    for (const modulo of modulos) {
      const moduleId = modulosCriados.get(modulo.code)!;
      await prisma.planModule.upsert({
        where: { planId_moduleId: { planId: plano.id, moduleId } },
        update: { enabled: planoConfig.modulosHabilitados.includes(modulo.code) },
        create: {
          planId: plano.id,
          moduleId,
          enabled: planoConfig.modulosHabilitados.includes(modulo.code),
        },
      });
    }

    for (const [feature, limit] of Object.entries(planoConfig.limites)) {
      await prisma.planLimit.upsert({
        where: { planId_feature: { planId: plano.id, feature } },
        update: { limit },
        create: { planId: plano.id, feature, limit },
      });
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
