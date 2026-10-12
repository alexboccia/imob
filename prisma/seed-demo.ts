import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// =======================================================================
// Seed de DEMONSTRAÇÃO (Fase 115) — "Imobiliária Horizonte — Demonstração"
// =======================================================================
// Objetivo: um cenário fictício, coerente e visualmente apresentável
// para demonstrar o CRM a um proprietário/gestor de imobiliária real.
// Nunca roda sozinho contra um banco que pareça produção (ver GUARDA DE
// SEGURANÇA abaixo) — e nunca apaga nada (só cria/reusa, nunca
// deleteMany).
//
// Pressupõe que `npx tsx prisma/seed.ts` já rodou nesse banco (cria os
// planos/módulos/permissões globais — este script NÃO duplica isso,
// só reaproveita o plano PREMIUM já existente via findUniqueOrThrow).
//
// Idempotente: identificado por um slug FIXO
// ("imobiliaria-horizonte-demo"). Se a organização já tem 12+ imóveis,
// o script não cria nada de novo — evita duplicar a cada execução.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SLUG_DEMO = "imobiliaria-horizonte-demo";
const SENHA_DEMO = "DemoHorizonte2026!";

// -----------------------------------------------------------------------
// GUARDA DE SEGURANÇA — fail-closed, nunca só NODE_ENV
// -----------------------------------------------------------------------
// Dois portões independentes:
//   1) confirmação explícita (DEMO_SEED_CONFIRM) — nunca roda "sem querer"
//      só porque alguém executou o arquivo errado.
//   2) classificação do BANCO DE DESTINO pela própria connection string
//      — não pelo NODE_ENV (que pode estar "development" apontando para
//      qualquer banco). Se a URL não parecer claramente local
//      (localhost/127.0.0.1, convenção de todo o resto do projeto — ver
//      docker-compose e .env.test), o script recusa, A MENOS que um
//      segundo flag explícito autorize banco remoto. Dúvida = não roda.
function validarAmbiente() {
  if (process.env.DEMO_SEED_CONFIRM !== "seed-demo-local-only") {
    throw new Error(
      'Recusado: defina DEMO_SEED_CONFIRM="seed-demo-local-only" explicitamente para rodar este seed. ' +
        "Isso existe para que ninguém execute este script sem querer contra o banco errado."
    );
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  const pareceLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
  if (!pareceLocal && process.env.DEMO_SEED_ALLOW_REMOTE !== "yes-i-am-sure") {
    throw new Error(
      "Recusado: DATABASE_URL não parece um banco local (localhost/127.0.0.1). " +
        "Este seed é para ambiente local de demonstração. Se você TEM CERTEZA que quer " +
        'rodar contra um banco remoto autorizado, defina DEMO_SEED_ALLOW_REMOTE="yes-i-am-sure" ' +
        "— nunca contra produção."
    );
  }
}

// Placeholder de foto de imóvel: SVG determinístico, sem nenhuma
// ambiguidade de direito de uso (gerado aqui, não copiado de lugar
// nenhum). Mesma técnica já usada em prisma/seed-e2e.ts para fotos de
// teste — aqui com uma composição um pouco mais apresentável (silhueta
// de casa + título) por ser para demonstração visual, não só para
// asserção automatizada. Documentado como LIMITAÇÃO conhecida em
// docs/comercial/demo/ — substituir por fotos reais/profissionais antes
// de uma demonstração real a um cliente.
function fotoPlaceholder(titulo: string, corFundo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="${corFundo}"/>
    <path d="M250 380 L400 260 L550 380 V520 H250 Z" fill="#ffffff" opacity="0.85"/>
    <rect x="370" y="430" width="60" height="90" fill="${corFundo}"/>
    <text x="400" y="560" font-family="sans-serif" font-size="22" fill="#ffffff" text-anchor="middle">${titulo}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const CORES_FOTO = ["#1d4ed8", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#0369a1"];

type DadosImovel = {
  titulo: string;
  tipo: string;
  finalidade: "SALE" | "RENT" | "SALE_AND_RENT";
  bairro: string;
  preco?: number;
  precoAluguel?: number;
  quartos?: number;
  banheiros?: number;
  vagas?: number;
  area?: number;
  status?: "AVAILABLE" | "RESERVED" | "SOLD" | "RENTED";
};

const IMOVEIS: DadosImovel[] = [
  { titulo: "Apartamento 2 quartos no Itaim", tipo: "Apartamento", finalidade: "SALE", bairro: "Itaim Bibi", preco: 780000, quartos: 2, banheiros: 2, vagas: 1, area: 68 },
  { titulo: "Cobertura duplex na Vila Olímpia", tipo: "Apartamento", finalidade: "SALE", bairro: "Vila Olímpia", preco: 1850000, quartos: 3, banheiros: 3, vagas: 2, area: 145 },
  { titulo: "Casa térrea com quintal no Brooklin", tipo: "Casa", finalidade: "SALE", bairro: "Brooklin", preco: 1200000, quartos: 3, banheiros: 2, vagas: 2, area: 180 },
  { titulo: "Studio mobiliado na Bela Vista", tipo: "Apartamento", finalidade: "RENT", bairro: "Bela Vista", precoAluguel: 2600, quartos: 1, banheiros: 1, vagas: 0, area: 32 },
  { titulo: "Apartamento 3 quartos no Tatuapé", tipo: "Apartamento", finalidade: "RENT", bairro: "Tatuapé", precoAluguel: 3200, quartos: 3, banheiros: 2, vagas: 1, area: 85 },
  { titulo: "Casa em condomínio em Santana", tipo: "Casa", finalidade: "SALE_AND_RENT", bairro: "Santana", preco: 950000, precoAluguel: 4500, quartos: 3, banheiros: 3, vagas: 2, area: 160 },
  { titulo: "Apartamento compacto na Lapa", tipo: "Apartamento", finalidade: "SALE", bairro: "Lapa", preco: 420000, quartos: 1, banheiros: 1, vagas: 1, area: 45 },
  { titulo: "Sobrado reformado no Ipiranga", tipo: "Casa", finalidade: "SALE", bairro: "Ipiranga", preco: 680000, quartos: 2, banheiros: 2, vagas: 1, area: 110 },
  { titulo: "Apartamento garden na Mooca", tipo: "Apartamento", finalidade: "RENT", bairro: "Mooca", precoAluguel: 2900, quartos: 2, banheiros: 1, vagas: 1, area: 60 },
  { titulo: "Cobertura vendida em Pinheiros", tipo: "Apartamento", finalidade: "SALE", bairro: "Pinheiros", preco: 1400000, quartos: 3, banheiros: 2, vagas: 2, area: 130, status: "SOLD" },
  { titulo: "Casa alugada no Alto de Pinheiros", tipo: "Casa", finalidade: "RENT", bairro: "Alto de Pinheiros", precoAluguel: 6500, quartos: 4, banheiros: 3, vagas: 3, area: 220, status: "RENTED" },
  { titulo: "Apartamento reservado na Saúde", tipo: "Apartamento", finalidade: "SALE", bairro: "Saúde", preco: 590000, quartos: 2, banheiros: 1, vagas: 1, area: 62, status: "RESERVED" },
];

const CLIENTES = [
  "Mariana Souza Lima", "Pedro Henrique Costa", "Ana Beatriz Ferreira", "Lucas Gabriel Oliveira",
  "Juliana Alves Pereira", "Rafael Augusto Santos", "Camila Rodrigues Martins", "Bruno Henrique Carvalho",
  "Fernanda Cristina Gomes", "Thiago Eduardo Barbosa", "Larissa Cristina Rocha", "Felipe Augusto Dias",
  "Patrícia Helena Nunes", "Gustavo Henrique Teixeira", "Carolina Vitória Araújo",
];

function diasAtras(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function diasAFrente(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function main() {
  validarAmbiente();

  const plano = await prisma.plan.findUniqueOrThrow({
    where: { code: "PREMIUM" },
    select: { id: true },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: SLUG_DEMO },
    update: {},
    create: {
      slug: SLUG_DEMO,
      name: "Imobiliária Horizonte — Demonstração",
      planId: plano.id,
      timezone: "America/Sao_Paulo",
    },
  });

  // Idempotência: se já tem o volume de imóveis esperado, não duplica.
  const totalImoveisExistente = await prisma.property.count({ where: { organizationId: organization.id } });
  if (totalImoveisExistente >= IMOVEIS.length) {
    console.log(
      `Organização demo já tem ${totalImoveisExistente} imóveis (>= ${IMOVEIS.length}) — nada a fazer. ` +
        `Slug: ${organization.slug}`
    );
    return;
  }

  const senhaHash = await bcrypt.hash(SENHA_DEMO, 10);

  async function garantirUsuario(email: string, name: string, role: "OWNER" | "BROKER") {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { name, email, passwordHash: senhaHash, active: true },
    });
    const membro = await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: {},
      create: { organizationId: organization.id, userId: user.id, role, status: "ACTIVE" },
    });
    return { userId: user.id, membershipId: membro.id };
  }

  const admin = await garantirUsuario("admin@imobiliariahorizonte.demo", "Patrícia Horizonte (Admin)", "OWNER");
  const corretor1 = await garantirUsuario("corretor1@imobiliariahorizonte.demo", "Marcos Vinícius Corretor", "BROKER");
  const corretor2 = await garantirUsuario("corretor2@imobiliariahorizonte.demo", "Beatriz Lima Corretora", "BROKER");
  const corretor3 = await garantirUsuario("corretor3@imobiliariahorizonte.demo", "Diego Fernandes Corretor", "BROKER");
  const corretores = [corretor1, corretor2, corretor3];

  console.log(`Organização demo pronta: ${organization.slug} (id: ${organization.id})`);
  console.log(`Senha de todos os usuários demo: ${SENHA_DEMO}`);

  // ---------------- Imóveis ----------------
  const imoveisCriados: { id: string; titulo: string; finalidade: DadosImovel["finalidade"] }[] = [];
  for (let i = 0; i < IMOVEIS.length; i++) {
    const dados = IMOVEIS[i];
    const imovel = await prisma.property.create({
      data: {
        organizationId: organization.id,
        title: dados.titulo,
        type: dados.tipo,
        purpose: dados.finalidade,
        status: dados.status ?? "AVAILABLE",
        neighborhood: dados.bairro,
        city: "São Paulo",
        state: "SP",
        price: dados.preco ?? null,
        rentPrice: dados.precoAluguel ?? null,
        bedrooms: dados.quartos ?? null,
        bathrooms: dados.banheiros ?? null,
        parkingSpots: dados.vagas ?? null,
        privateArea: dados.area ?? null,
        description: `Imóvel fictício de demonstração — ${dados.titulo}, bairro ${dados.bairro}.`,
      },
      select: { id: true },
    });
    await prisma.media.create({
      data: {
        organizationId: organization.id,
        propertyId: imovel.id,
        type: "PHOTO",
        url: fotoPlaceholder(dados.titulo, CORES_FOTO[i % CORES_FOTO.length]),
        isCover: true,
        order: 0,
      },
    });
    imoveisCriados.push({ id: imovel.id, titulo: dados.titulo, finalidade: dados.finalidade });
  }
  console.log(`${imoveisCriados.length} imóveis criados.`);

  // ---------------- Clientes ----------------
  const clientesCriados: { id: string; nome: string }[] = [];
  for (let i = 0; i < CLIENTES.length; i++) {
    const nome = CLIENTES[i];
    // Telefone claramente sintético: DDD 11 + prefixo fixo 9000 + índice
    // — nunca um número real, nunca gerado ao acaso.
    const pessoa = await prisma.person.create({
      data: {
        organizationId: organization.id,
        name: nome,
        email: `cliente${i + 1}@imobiliariahorizonte.demo`,
        emailNormalized: `cliente${i + 1}@imobiliariahorizonte.demo`,
        phone: `(11) 99000-${String(1000 + i).slice(-4)}`,
        phoneNormalized: `1199000${String(1000 + i).slice(-4)}`,
        roles: ["LEAD"],
      },
      select: { id: true, name: true },
    });
    clientesCriados.push({ id: pessoa.id, nome: pessoa.name });
  }
  console.log(`${clientesCriados.length} clientes criados.`);

  // ---------------- Negociações (PropertyInterest) ----------------
  // 8 negociações cobrindo os estágios pedidos: INTERESTED (novo
  // interesse), VISIT_SCHEDULED (visita agendada), VISITED (visitado),
  // PROPOSAL (proposta em andamento), WON (concluída, com comissão) e
  // REJECTED (perdida).
  // Person.pipelineStage é um conceito DELIBERADAMENTE separado do
  // estágio de cada negociação (PropertyInterest.stage) — mesma doutrina
  // documentada em todo o produto ("diferente do estágio de cada
  // negociação"). Sem setar isso aqui, a tela de Clientes mostraria TODO
  // mundo como "Novo lead" e "Não atribuído", mesmo quem já está em
  // Proposta ou Ganho no Pipeline — inconsistência visual real que
  // prejudicaria a demonstração. PipelineStage não tem um valor
  // equivalente a VISITED, então o mapeamento é aproximado por design.
  const MAPA_PARA_PIPELINE_STAGE: Record<Cenario["stage"], "NEW_LEAD" | "CONTACTED" | "VISIT_SCHEDULED" | "PROPOSAL" | "CLOSED" | "LOST"> = {
    INTERESTED: "CONTACTED",
    VISIT_SCHEDULED: "VISIT_SCHEDULED",
    VISITED: "VISIT_SCHEDULED",
    PROPOSAL: "PROPOSAL",
    WON: "CLOSED",
    REJECTED: "LOST",
  };

  type Cenario = { imovelIdx: number; clienteIdx: number; stage: "INTERESTED" | "VISIT_SCHEDULED" | "VISITED" | "PROPOSAL" | "WON" | "REJECTED"; corretor: typeof admin };
  const cenarios: Cenario[] = [
    { imovelIdx: 0, clienteIdx: 0, stage: "INTERESTED", corretor: corretor1 },
    { imovelIdx: 1, clienteIdx: 1, stage: "INTERESTED", corretor: corretor2 },
    { imovelIdx: 2, clienteIdx: 2, stage: "VISIT_SCHEDULED", corretor: corretor1 },
    { imovelIdx: 3, clienteIdx: 3, stage: "VISIT_SCHEDULED", corretor: corretor3 },
    { imovelIdx: 4, clienteIdx: 4, stage: "VISITED", corretor: corretor2 },
    { imovelIdx: 5, clienteIdx: 5, stage: "PROPOSAL", corretor: corretor1 },
    { imovelIdx: 9, clienteIdx: 6, stage: "WON", corretor: corretor3 },
    { imovelIdx: 6, clienteIdx: 7, stage: "REJECTED", corretor: corretor2 },
  ];

  const stageOrder: Cenario["stage"][] = ["INTERESTED", "VISIT_SCHEDULED", "VISITED", "PROPOSAL", "WON"];

  let negociacoesCriadas = 0;
  let atividadesCriadas = 0;

  for (const cenario of cenarios) {
    const imovel = imoveisCriados[cenario.imovelIdx];
    const cliente = clientesCriados[cenario.clienteIdx];
    const finalStage = cenario.stage;
    const ehGanho = finalStage === "WON";
    const ehPerdido = finalStage === "REJECTED";

    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: organization.id,
        personId: cliente.id,
        propertyId: imovel.id,
        stage: finalStage,
        responsibleMemberId: cenario.corretor.membershipId,
        ...(ehGanho
          ? {
              closedAt: diasAtras(2),
              closedValue: 460000,
              commissionValue: 23000,
            }
          : {}),
        ...(ehPerdido ? { closedAt: diasAtras(1), lostReason: "CLIENT_GAVE_UP" as const } : {}),
      },
      select: { id: true },
    });
    negociacoesCriadas++;

    // Mantém a ficha do cliente (Clientes) coerente com a negociação
    // real que acabamos de criar — ver comentário de MAPA_PARA_PIPELINE_STAGE.
    // assignedMemberId ("quem cadastrou", exibido na coluna Corretor da
    // listagem) e responsibleMemberId ("quem conduz", posse real) são
    // dois conceitos DIFERENTES no domínio (ver schema.prisma) — setamos
    // os dois iguais aqui por simplicidade do cenário fictício, não
    // porque sejam sinônimos.
    await prisma.person.update({
      where: { id: cliente.id },
      data: {
        pipelineStage: MAPA_PARA_PIPELINE_STAGE[finalStage],
        assignedMemberId: cenario.corretor.membershipId,
        responsibleMemberId: cenario.corretor.membershipId,
      },
    });

    // Histórico de estágio — real, não derivado de updatedAt (mesma
    // doutrina do resto do produto). Percorre os estágios intermediários
    // reais até chegar no estágio final deste cenário.
    let previousStage: string | null = null;
    const passos = ehPerdido ? ["INTERESTED", "REJECTED"] : stageOrder.slice(0, stageOrder.indexOf(finalStage) + 1);
    for (let passo = 0; passo < passos.length; passo++) {
      await prisma.propertyInterestStageHistory.create({
        data: {
          organizationId: organization.id,
          propertyInterestId: interesse.id,
          previousStage: previousStage as never,
          newStage: passos[passo] as never,
          changedAt: diasAtras(passos.length - passo),
          changedByMemberId: cenario.corretor.membershipId,
        },
      });
      previousStage = passos[passo];
    }

    // Comissão do negócio ganho: participação do corretor responsável +
    // um pagamento parcial já liquidado — mostra o ledger de pagamento
    // em ação, não só o valor total.
    if (ehGanho) {
      const participante = await prisma.propertyInterestParticipant.create({
        data: {
          organizationId: organization.id,
          propertyInterestId: interesse.id,
          memberId: cenario.corretor.membershipId,
          allocationValue: 23000,
        },
        select: { id: true },
      });
      await prisma.propertyInterestParticipantPayment.create({
        data: {
          organizationId: organization.id,
          participantId: participante.id,
          amount: 12000,
          paidAt: diasAtras(1),
          createdByMemberId: admin.membershipId,
        },
      });
    }

    // Atividade (visita) para os cenários que já passaram por
    // VISIT_SCHEDULED — visita futura para quem está agendado, passada
    // para quem já avançou além disso.
    if (["VISIT_SCHEDULED", "VISITED", "PROPOSAL", "WON"].includes(finalStage)) {
      const jaVisitou = finalStage !== "VISIT_SCHEDULED";
      await prisma.scheduledActivity.create({
        data: {
          organizationId: organization.id,
          type: "VISIT",
          propertyInterestId: interesse.id,
          personId: cliente.id,
          propertyId: imovel.id,
          scheduledAt: jaVisitou ? diasAtras(3) : diasAFrente(2),
          status: jaVisitou ? "COMPLETED" : "SCHEDULED",
          createdByMemberId: cenario.corretor.membershipId,
        },
      });
      atividadesCriadas++;
    }
  }

  // Atividades extras sem negociação vinculada (FOLLOW_UP — único tipo
  // além de VISIT no enum), só para completar a meta aproximada de ~10
  // atividades do cenário.
  for (let i = 0; i < 2 && i < clientesCriados.length - 8; i++) {
    const cliente = clientesCriados[8 + i];
    const corretor = corretores[i % corretores.length];
    await prisma.scheduledActivity.create({
      data: {
        organizationId: organization.id,
        type: "FOLLOW_UP",
        subject: "Retornar contato sobre interesse em imóvel",
        personId: cliente.id,
        scheduledAt: diasAFrente(1 + i),
        status: "SCHEDULED",
        createdByMemberId: corretor.membershipId,
        notes: "Follow-up de primeiro contato (dado fictício de demonstração).",
      },
    });
    atividadesCriadas++;
  }

  console.log(`${negociacoesCriadas} negociações criadas (estágios: ${cenarios.map((c) => c.stage).join(", ")}).`);
  console.log(`${atividadesCriadas} atividades criadas.`);
  console.log("Seed de demonstração concluído com sucesso.");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
