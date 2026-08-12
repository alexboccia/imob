import { describe, test, expect, afterEach } from "vitest";
import { prisma, prismaPlatform } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";

// Fase H.1 — só schema/integridade estrutural (ver AGENTS/plano da fase).
// Nenhuma Server Action, sincronização de stage, Interaction automática ou
// ActivityLog é testada aqui: isso pertence à H.2. Estes testes existem
// exclusivamente pra validar o model, os defaults, as FKs (CASCADE/SET
// NULL/RESTRICT) e o tenant scoping antes de qualquer código de aplicação
// passar a consultar ScheduledActivity.

const SCHEDULED_AT = new Date("2026-09-01T14:00:00Z");

describe("ScheduledActivity — fundação de banco (Fase H.1 do CRM)", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;
  let cenarioB: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  test("A) cria ScheduledActivity VISIT válida", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    const agendamento = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        type: "VISIT",
        scheduledAt: SCHEDULED_AT,
      },
    });

    expect(agendamento.type).toBe("VISIT");
    expect(agendamento.personId).toBe(pessoa.id);
    expect(agendamento.propertyId).toBe(imovel.id);
    expect(agendamento.scheduledAt).toEqual(SCHEDULED_AT);
  });

  test("B) default type = VISIT", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const agendamento = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, scheduledAt: SCHEDULED_AT },
    });

    expect(agendamento.type).toBe("VISIT");
  });

  test("C) default status = SCHEDULED", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const agendamento = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, scheduledAt: SCHEDULED_AT },
    });

    expect(agendamento.status).toBe("SCHEDULED");
  });

  test("D) múltiplas ScheduledActivity pro mesmo Person+Property são permitidas", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });

    await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        scheduledAt: SCHEDULED_AT,
      },
    });
    await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        scheduledAt: new Date("2026-09-02T14:00:00Z"),
      },
    });

    const total = await prisma.scheduledActivity.count({
      where: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });
    expect(total).toBe(2);
  });

  // E/F usam prismaPlatform (client base, sem a extensão de tenant scoping)
  // de propósito: o objetivo é provar a constraint NOT NULL do BANCO em si,
  // não o comportamento da extensão (isso já é coberto em O/P).
  test("E) personId obrigatório", async () => {
    cenario = await criarCenario();

    await expect(
      prismaPlatform.scheduledActivity.create({
        data: { organizationId: cenario.organization.id, scheduledAt: SCHEDULED_AT } as never,
      })
    ).rejects.toThrow();
  });

  test("F) organizationId obrigatório", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    await expect(
      prismaPlatform.scheduledActivity.create({
        data: { personId: pessoa.id, scheduledAt: SCHEDULED_AT } as never,
      })
    ).rejects.toThrow();
  });

  test("G) propertyId nullable", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const agendamento = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, scheduledAt: SCHEDULED_AT },
    });

    expect(agendamento.propertyId).toBeNull();
  });

  test("H) propertyInterestId nullable", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const agendamento = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, scheduledAt: SCHEDULED_AT },
    });

    expect(agendamento.propertyInterestId).toBeNull();
  });

  test("I) createdByMemberId nullable", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });

    const agendamento = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, scheduledAt: SCHEDULED_AT },
    });

    expect(agendamento.createdByMemberId).toBeNull();
  });

  test("J) Person delete → ScheduledActivity CASCADE", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, scheduledAt: SCHEDULED_AT },
    });

    await prisma.person.delete({ where: { id: pessoa.id, organizationId: cenario.organization.id } });

    const total = await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("K) Property delete → propertyId vira NULL", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const agendamento = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        scheduledAt: SCHEDULED_AT,
      },
    });

    await prisma.property.delete({ where: { id: imovel.id, organizationId: cenario.organization.id } });

    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: agendamento.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.propertyId).toBeNull();
  });

  test("L) PropertyInterest delete → propertyInterestId vira NULL", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const interesse = await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });
    const agendamento = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        propertyInterestId: interesse.id,
        scheduledAt: SCHEDULED_AT,
      },
    });

    await prisma.propertyInterest.delete({ where: { id: interesse.id, organizationId: cenario.organization.id } });

    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: agendamento.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.propertyInterestId).toBeNull();
  });

  test("M) OrganizationMember delete → createdByMemberId vira NULL", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const agendamento = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        createdByMemberId: cenario.membro.id,
        scheduledAt: SCHEDULED_AT,
      },
    });

    await prisma.organizationMember.delete({ where: { id: cenario.membro.id } });

    const atualizado = await prisma.scheduledActivity.findUnique({
      where: { id: agendamento.id, organizationId: cenario.organization.id },
    });
    expect(atualizado?.createdByMemberId).toBeNull();
  });

  test("N) índices não são unique — múltiplas linhas com as mesmas colunas indexadas são permitidas", async () => {
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const interesse = await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id },
    });

    // Mesmo organizationId/personId/propertyId/propertyInterestId/status/
    // scheduledAt nas três linhas — cobre as quatro colunas líderes dos
    // @@index aprovados (nenhum é @@unique).
    for (let i = 0; i < 3; i += 1) {
      await prisma.scheduledActivity.create({
        data: {
          organizationId: cenario.organization.id,
          personId: pessoa.id,
          propertyId: imovel.id,
          propertyInterestId: interesse.id,
          status: "SCHEDULED",
          scheduledAt: SCHEDULED_AT,
        },
      });
    }

    const total = await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(3);
  });

  test("O) ScheduledActivity está tenant-scoped pela extensão", async () => {
    // Sem where.organizationId e sem withOrganization() no contexto — a
    // extension (TENANT_SCOPED_MODELS em src/lib/prisma.ts) deve recusar a
    // consulta em vez de vazar dado sem escopo algum.
    await expect(prisma.scheduledActivity.findMany()).rejects.toThrow(/organizationId/);
  });

  test("P) tentativa cross-tenant via model scoped é bloqueada/escopada conforme padrão existente", async () => {
    cenario = await criarCenario();
    cenarioB = await criarCenario();
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const agendamentoDeB = await prisma.scheduledActivity.create({
      data: { organizationId: cenarioB.organization.id, personId: pessoaDeB.id, scheduledAt: SCHEDULED_AT },
    });

    // Mesmo padrão de todo call site real: where sempre inclui o
    // organizationId de quem está consultando — um id de B filtrado pelo
    // organizationId de A não deve casar com nenhuma linha.
    const encontrado = await prisma.scheduledActivity.findUnique({
      where: { id: agendamentoDeB.id, organizationId: cenario.organization.id },
    });
    expect(encontrado).toBeNull();

    const totalDeA = await prisma.scheduledActivity.count({ where: { organizationId: cenario.organization.id } });
    expect(totalDeA).toBe(0);
  });
});
