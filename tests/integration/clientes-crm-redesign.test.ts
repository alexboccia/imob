import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";

// Mesma limitação de resolução de módulo já documentada nos outros testes
// de integração desta sessão (next-auth → next/server não resolve sob
// Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/auth";
import { buscarResumoClienteCrm } from "@/app/app/clientes/actions";
import { resumirInteresse, resumirUltimoContato, resumirProximaAcao } from "@/lib/crm-listagem";
import { sanitizarFiltro, ORIGEM_LABEL, PAPEL_LABEL } from "@/lib/crm-labels";
import { construirWhereClientes } from "@/lib/listagens-admin-query";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

function autenticarComo(cenario: Cenario) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// Redesenho da tela de Clientes — cobre a fiação de dados nova (drawer +
// KPIs + query da listagem). resumirInteresse/resumirUltimoContato/
// resumirProximaAcao já são exaustivamente testados sem banco
// (src/lib/crm-listagem.test.ts) — este arquivo testa só o que muda com
// Postgres real: tenant isolation, batching, e que o dado que chega das
// queries tem o formato exato que essas funções puras esperam.
describe("buscarResumoClienteCrm — isolamento de tenant e contagens", () => {
  let cenarioA: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("A) cliente de outra organização retorna null, nunca vaza dado cross-tenant", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id, name: "Pessoa Sigilosa De B" });

    const resumo = await buscarResumoClienteCrm(pessoaB.id);
    expect(resumo).toBeNull();
  });

  test("B) contagens (favoritos/visitados/propostas) refletem só PropertyInterest da própria organização", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });
    const imovel = await criarImovel({ organizationId: cenarioA.organization.id, status: "AVAILABLE" });
    await prisma.propertyInterest.create({
      data: { organizationId: cenarioA.organization.id, personId: pessoa.id, propertyId: imovel.id, favorited: true, stage: "INTERESTED" },
    });
    const imovel2 = await criarImovel({ organizationId: cenarioA.organization.id, status: "AVAILABLE" });
    await prisma.propertyInterest.create({
      data: { organizationId: cenarioA.organization.id, personId: pessoa.id, propertyId: imovel2.id, stage: "VISITED" },
    });
    const imovel3 = await criarImovel({ organizationId: cenarioA.organization.id, status: "AVAILABLE" });
    await prisma.propertyInterest.create({
      data: { organizationId: cenarioA.organization.id, personId: pessoa.id, propertyId: imovel3.id, stage: "PROPOSAL" },
    });

    // Anomalia deliberada: PropertyInterest de OUTRA pessoa na mesma
    // organização, e um PropertyInterest de B — nenhum dos dois pode
    // contaminar as contagens de `pessoa`.
    const outraPessoaA = await criarPessoa({ organizationId: cenarioA.organization.id });
    await prisma.propertyInterest.create({
      data: { organizationId: cenarioA.organization.id, personId: outraPessoaA.id, propertyId: imovel.id, favorited: true, stage: "INTERESTED" },
    });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, status: "AVAILABLE" });
    await prisma.propertyInterest.create({
      data: { organizationId: cenarioB.organization.id, personId: pessoaB.id, propertyId: imovelB.id, favorited: true, stage: "PROPOSAL" },
    });

    const resumo = await buscarResumoClienteCrm(pessoa.id);
    expect(resumo?.contagens).toEqual({ favoritos: 1, visitados: 1, propostas: 1, atividades: 0 });
  });

  test("C) atividades conta TODA ScheduledActivity (agendada/concluída/cancelada), não só as futuras", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });
    const imovel = await criarImovel({ organizationId: cenarioA.organization.id, status: "AVAILABLE" });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenarioA.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000) },
    });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenarioA.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: new Date(Date.now() - 86_400_000) },
    });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenarioA.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "CANCELLED", scheduledAt: new Date(Date.now() - 172_800_000) },
    });

    const resumo = await buscarResumoClienteCrm(pessoa.id);
    expect(resumo?.contagens.atividades).toBe(3);
  });

  test("D) últimas 5 interações, ordenadas da mais recente pra mais antiga, com o imóvel relacionado quando houver", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });
    const imovel = await criarImovel({ organizationId: cenarioA.organization.id, title: "Cobertura Vista Mar" });

    for (let i = 0; i < 7; i++) {
      await prisma.interaction.create({
        data: {
          organizationId: cenarioA.organization.id,
          personId: pessoa.id,
          propertyId: i === 0 ? imovel.id : undefined,
          type: "CALL",
          occurredAt: new Date(Date.now() - i * 3_600_000),
        },
      });
    }

    const resumo = await buscarResumoClienteCrm(pessoa.id);
    expect(resumo?.interacoes).toHaveLength(5);
    // A mais recente (i=0) é a primeira da lista e tem o título do imóvel.
    expect(resumo?.interacoes[0].propertyTitulo).toBe("Cobertura Vista Mar");
    const timestamps = resumo!.interacoes.map((i) => i.occurredAt.getTime());
    expect([...timestamps]).toEqual([...timestamps].sort((a, b) => b - a));
  });

  test("E) roles/source/pipelineStage do cliente vêm corretos junto do resumo", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoa = await prisma.person.create({
      data: {
        organizationId: cenarioA.organization.id,
        name: "Cliente Completo",
        roles: ["LEAD", "CLIENT"],
        source: "REFERRAL",
        pipelineStage: "PROPOSAL",
      },
    });

    const resumo = await buscarResumoClienteCrm(pessoa.id);
    expect(resumo?.roles).toEqual(["LEAD", "CLIENT"]);
    expect(resumo?.source).toBe("REFERRAL");
    expect(resumo?.pipelineStage).toBe("PROPOSAL");
  });

  test("F) não escreve nada — resumo é só leitura", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA);
    const pessoa = await criarPessoa({ organizationId: cenarioA.organization.id });

    const antes = {
      interacoes: await prisma.interaction.count({ where: { organizationId: cenarioA.organization.id } }),
      atividades: await prisma.scheduledActivity.count({ where: { organizationId: cenarioA.organization.id } }),
      logs: await prisma.activityLog.count({ where: { organizationId: cenarioA.organization.id } }),
    };

    await buscarResumoClienteCrm(pessoa.id);
    await buscarResumoClienteCrm(pessoa.id);

    const depois = {
      interacoes: await prisma.interaction.count({ where: { organizationId: cenarioA.organization.id } }),
      atividades: await prisma.scheduledActivity.count({ where: { organizationId: cenarioA.organization.id } }),
      logs: await prisma.activityLog.count({ where: { organizationId: cenarioA.organization.id } }),
    };
    expect(depois).toEqual(antes);
  });
});

// -------------------------------------------------------------------
// Fiação da listagem redesenhada (src/app/app/clientes/page.tsx) — mesmo
// shape de query usado lá, provando que o dado real do Postgres (Decimal,
// enums, relações opcionais) chega no formato que resumirInteresse/
// resumirUltimoContato/resumirProximaAcao esperam. As funções em si já
// são exaustivamente testadas sem banco (crm-listagem.test.ts).
// -------------------------------------------------------------------
describe("Listagem de Clientes redesenhada — fiação de dados (Prisma + tenant)", () => {
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  async function buscarLinha(organizationId: string, personId: string) {
    const pessoa = await prisma.person.findUniqueOrThrow({
      where: { id: personId, organizationId },
      select: {
        id: true,
        name: true,
        preference: {
          select: {
            propertyTypes: true,
            transactionType: true,
            neighborhoods: true,
            cities: true,
            minPrice: true,
            maxPrice: true,
            minBedrooms: true,
          },
        },
        interactions: { orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true, type: true } },
        scheduledActivities: {
          where: { status: "SCHEDULED", scheduledAt: { gte: new Date() } },
          orderBy: { scheduledAt: "asc" },
          take: 1,
          select: { scheduledAt: true },
        },
        propertyInterests: {
          where: { stage: { notIn: ["WON", "REJECTED"] } },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { stage: true, property: { select: { status: true } } },
        },
      },
    });

    const interesseAberto = pessoa.propertyInterests[0]
      ? { stage: pessoa.propertyInterests[0].stage, propertyStatus: pessoa.propertyInterests[0].property.status }
      : null;

    return {
      interesseLinhas: resumirInteresse(pessoa.preference),
      ultimoContato: resumirUltimoContato(pessoa.interactions[0] ?? null),
      proximaAcao: resumirProximaAcao({ proximaVisita: pessoa.scheduledActivities[0] ?? null, interesseAberto }),
    };
  }

  test("preferência real (com Decimal do Postgres) vira linhas de interesse corretas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await prisma.personPreference.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyTypes: ["Apartamento"],
        transactionType: "SALE",
        neighborhoods: ["Pinheiros"],
        minPrice: 300000,
        maxPrice: 500000,
        minBedrooms: 2,
      },
    });

    const linha = await buscarLinha(cenario.organization.id, pessoa.id);
    expect(linha.interesseLinhas).toEqual([
      "Apartamento • Comprar",
      "Pinheiros",
      expect.stringContaining("-"),
      "2+ quartos",
    ]);
  });

  test("sem PersonPreference cadastrada -> interesseLinhas null (não confundir com PropertyInterest)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const linha = await buscarLinha(cenario.organization.id, pessoa.id);
    expect(linha.interesseLinhas).toBeNull();
  });

  test("visita agendada futura tem prioridade sobre PropertyInterest aberto na próxima ação", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "PROPOSAL" },
    });
    await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    const linha = await buscarLinha(cenario.organization.id, pessoa.id);
    expect(linha.proximaAcao?.texto).toBe("Visita agendada");
  });

  test("sem visita futura, próxima ação vem do PropertyInterest aberto mais recente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "VISITED" },
    });

    const linha = await buscarLinha(cenario.organization.id, pessoa.id);
    expect(linha.proximaAcao?.texto).toBe("Registrar retorno");
  });

  test("PropertyInterest encerrado (WON/REJECTED) nunca é tratado como interesse aberto", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, stage: "WON", closedAt: new Date() },
    });

    const linha = await buscarLinha(cenario.organization.id, pessoa.id);
    expect(linha.proximaAcao).toBeNull();
  });

  test("visita SCHEDULED no passado (perdida, nunca marcada) não conta como próxima visita", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() - 86_400_000),
      },
    });

    const linha = await buscarLinha(cenario.organization.id, pessoa.id);
    expect(linha.proximaAcao).toBeNull();
  });

  test("tenant isolation: PersonPreference/Interaction/PropertyInterest de outra organização nunca vazam pra este cliente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    // Pessoa homônima em B, com dado rico — nunca deve influenciar a
    // leitura da pessoa de A (organizationId sempre no where, nunca só
    // personId).
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id, name: "Homônima" });
    await prisma.personPreference.create({
      data: { organizationId: cenarioB.organization.id, personId: pessoaB.id, propertyTypes: ["Casa"], minBedrooms: 5 },
    });

    const linha = await buscarLinha(cenario.organization.id, pessoa.id);
    expect(linha.interesseLinhas).toBeNull();
  });
});

// -------------------------------------------------------------------
// KPIs do topo da página (mesmas 4 contagens de page.tsx, batched num só
// Promise.all) — cada uma testada isolada aqui contra Postgres real,
// porque a correção depende de janela de data (Postgres, não JS) e de
// conjunto de stages, não só de lógica pura.
// -------------------------------------------------------------------
describe("KPIs de Clientes — janelas de data e conjuntos de stage", () => {
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  test("novosLeadsSemana só conta NEW_LEAD criado nos últimos 7 dias, nunca mais antigo", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const dentro = await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Lead recente", roles: ["LEAD"], pipelineStage: "NEW_LEAD" },
    });
    await prisma.person.update({
      where: { id: dentro.id, organizationId: cenario.organization.id },
      data: { createdAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    const fora = await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Lead antigo", roles: ["LEAD"], pipelineStage: "NEW_LEAD" },
    });
    await prisma.person.update({
      where: { id: fora.id, organizationId: cenario.organization.id },
      data: { createdAt: new Date(Date.now() - 20 * 86_400_000) },
    });

    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const novosLeadsSemana = await prisma.person.count({
      where: { organizationId: cenario.organization.id, pipelineStage: "NEW_LEAD", createdAt: { gte: seteDiasAtras } },
    });
    expect(novosLeadsSemana).toBe(1);
  });

  test("emAtendimento conta exatamente CONTACTED/VISIT_SCHEDULED/PROPOSAL, nunca NEW_LEAD/CLOSED/LOST", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    for (const stage of ["NEW_LEAD", "CONTACTED", "VISIT_SCHEDULED", "PROPOSAL", "CLOSED", "LOST"] as const) {
      await prisma.person.create({
        data: { organizationId: cenario.organization.id, name: `Pessoa ${stage}`, roles: ["LEAD"], pipelineStage: stage },
      });
    }

    const emAtendimento = await prisma.person.count({
      where: { organizationId: cenario.organization.id, pipelineStage: { in: ["CONTACTED", "VISIT_SCHEDULED", "PROPOSAL"] } },
    });
    expect(emAtendimento).toBe(3);
  });

  test("visitasProximos7Dias conta só SCHEDULED dentro da janela — exclui passado, exclui além de 7 dias, exclui CANCELLED", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    const agora = new Date();
    const seteDiasNaFrente = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Dentro da janela — conta.
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: new Date(agora.getTime() + 2 * 86_400_000) },
    });
    // No passado — não conta.
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: new Date(agora.getTime() - 86_400_000) },
    });
    // Além de 7 dias — não conta.
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: new Date(agora.getTime() + 20 * 86_400_000) },
    });
    // CANCELLED dentro da janela — não conta (só SCHEDULED é uma visita pendente real).
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "CANCELLED", scheduledAt: new Date(agora.getTime() + 2 * 86_400_000) },
    });

    const visitasProximos7Dias = await prisma.scheduledActivity.count({
      where: { organizationId: cenario.organization.id, status: "SCHEDULED", scheduledAt: { gte: agora, lte: seteDiasNaFrente } },
    });
    expect(visitasProximos7Dias).toBe(1);
  });

  test("nenhuma das 4 contagens inclui dados de outra organização", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await prisma.person.create({
      data: { organizationId: cenarioB.organization.id, name: "Lead de B", roles: ["LEAD"], pipelineStage: "NEW_LEAD" },
    });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, status: "AVAILABLE" });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenarioB.organization.id, personId: pessoaB.id, propertyId: imovelB.id, status: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000) },
    });

    const totalA = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    const novosLeadsA = await prisma.person.count({ where: { organizationId: cenario.organization.id, pipelineStage: "NEW_LEAD" } });
    const visitasA = await prisma.scheduledActivity.count({
      where: { organizationId: cenario.organization.id, status: "SCHEDULED", scheduledAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 86_400_000) } },
    });
    expect(totalA).toBe(0);
    expect(novosLeadsA).toBe(0);
    expect(visitasA).toBe(0);
  });
});

// -------------------------------------------------------------------
// Correção cirúrgica pós-auditoria — antes desta correção, um valor
// manipulado na URL (?filters={"origem":"GARBAGE"}) chegava cru ao Prisma
// como enum inválido e derrubava a query com PrismaClientValidationError
// (HTTP 500, reproduzido ao vivo na auditoria). Aqui contra Postgres real:
// organização de teste com clientes reais, mesmo pipeline exato de
// page.tsx (sanitizarFiltro -> construirWhereClientes -> person.findMany),
// provando que o valor inválido nunca chega à query e nunca derruba nada.
// -------------------------------------------------------------------
describe("Filtro origem/papel inválido — não derruba a query real (Postgres)", () => {
  let cenario: Cenario | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  const ORIGENS_VALIDAS = new Set<string>(Object.keys(ORIGEM_LABEL));
  const PAPEIS_VALIDOS = new Set<string>(Object.keys(PAPEL_LABEL));

  async function buscarComoAPagina(organizationId: string, params: { origem?: string; papel?: string }) {
    const where = construirWhereClientes({
      organizationId,
      busca: "",
      origemFiltro: sanitizarFiltro(params.origem, ORIGENS_VALIDAS),
      papelFiltro: sanitizarFiltro(params.papel, PAPEIS_VALIDOS),
    });
    return prisma.person.findMany({ where, select: { id: true, name: true, organizationId: true } });
  }

  test("origem inválida ('GARBAGE') não lança e devolve os clientes reais da organização, ignorando o filtro", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Cliente Real Um", roles: ["LEAD"], source: "WEBSITE" },
    });
    await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Cliente Real Dois", roles: ["CLIENT"], source: "REFERRAL" },
    });

    const resultado = await buscarComoAPagina(cenario.organization.id, { origem: "GARBAGE" });
    expect(resultado).toHaveLength(2);
    expect(resultado.map((p) => p.name).sort()).toEqual(["Cliente Real Dois", "Cliente Real Um"]);
  });

  test("papel inválido ('GARBAGE') não lança e devolve os clientes reais da organização, ignorando o filtro", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Cliente Papel Válido", roles: ["OWNER"] },
    });

    const resultado = await buscarComoAPagina(cenario.organization.id, { papel: "GARBAGE" });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].name).toBe("Cliente Papel Válido");
  });

  test("origem válida + papel inválido — origem filtra de verdade, papel inválido é ignorado (não zera o resultado)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Site Um", roles: ["LEAD"], source: "WEBSITE" },
    });
    await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Indicação Um", roles: ["LEAD"], source: "REFERRAL" },
    });

    const resultado = await buscarComoAPagina(cenario.organization.id, { origem: "WEBSITE", papel: "GARBAGE" });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].name).toBe("Site Um");
  });

  test("ambos inválidos — devolve todos os clientes da organização, só o tenant correto, nunca de outra organização", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const outraOrg = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Cliente Da Org Certa", roles: ["LEAD"] },
    });
    await prisma.person.create({
      data: { organizationId: outraOrg.organization.id, name: "Cliente De Outra Org", roles: ["LEAD"] },
    });

    try {
      const resultado = await buscarComoAPagina(cenario.organization.id, { origem: "GARBAGE", papel: "GARBAGE" });
      expect(resultado).toHaveLength(1);
      expect(resultado[0].name).toBe("Cliente Da Org Certa");
      expect(resultado.every((p) => p.organizationId === cenario!.organization.id)).toBe(true);
    } finally {
      await outraOrg.destruir();
    }
  });
});
