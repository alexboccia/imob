import { describe, test, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import { buscarAgendaHoje, buscarAgendaProximas, buscarAgendaAnteriores } from "@/lib/agenda";
import { inicioDoDiaUTC } from "@/lib/scheduled-activity-date";

// Agenda do corretor (Fase H.3) — testes de integração contra Postgres
// real. Cobre multi-tenancy (G-K), corretude de query (L-T) e read-only
// (U-X). Nenhum teste aqui exercita UI/página React — a lógica sensível
// (query, tenant-safety) já foi extraída pra src/lib/agenda.ts, que é
// diretamente testável sem infraestrutura de component testing.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

function futuro(diasNoFuturo = 1): Date {
  return new Date(Date.now() + diasNoFuturo * 24 * 60 * 60 * 1000);
}
function passado(diasNoPassado = 1): Date {
  return new Date(Date.now() - diasNoPassado * 24 * 60 * 60 * 1000);
}
// Ancorado no INÍCIO do dia UTC (nunca em "agora + N horas") — évita que o
// teste fique frágil perto da virada de meia-noite UTC, quando "agora + N
// horas" poderia cruzar pro dia seguinte dependendo de que horas o CI
// rodar. horas deve ficar entre 0 e 23 pra garantir que o resultado
// continua dentro do mesmo dia UTC de "hoje".
function hojeAsHoras(horas: number): Date {
  return new Date(inicioDoDiaUTC().getTime() + horas * 60 * 60 * 1000);
}

async function criarInteresse(opcoes: { organizationId: string; personId: string; propertyId: string }) {
  return prisma.propertyInterest.create({
    data: {
      organizationId: opcoes.organizationId,
      personId: opcoes.personId,
      propertyId: opcoes.propertyId,
    },
  });
}

async function cenarioComVisita(opcoes: {
  status?: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  scheduledAt?: Date;
  notes?: string | null;
}) {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
  const imovel = await criarImovel({ organizationId: cenario.organization.id });
  const interesse = await criarInteresse({
    organizationId: cenario.organization.id,
    personId: pessoa.id,
    propertyId: imovel.id,
  });
  const atividade = await prisma.scheduledActivity.create({
    data: {
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      propertyInterestId: interesse.id,
      status: opcoes.status ?? "SCHEDULED",
      scheduledAt: opcoes.scheduledAt ?? futuro(),
      notes: opcoes.notes ?? null,
      completedAt: opcoes.status === "COMPLETED" ? new Date() : null,
      cancelledAt: opcoes.status === "CANCELLED" ? new Date() : null,
    },
  });
  return { cenario, pessoa, imovel, interesse, atividade };
}

describe("Agenda do corretor — Fase H.3", () => {
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  // -------------------------------------------------------------------
  // Multi-tenancy
  // -------------------------------------------------------------------

  test("G) Org A não vê ScheduledActivity da Org B", async () => {
    const ctxA = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(2) });
    cenario = ctxA.cenario;
    const ctxB = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(2) });
    cenarioB = ctxB.cenario;

    const hojeA = await buscarAgendaHoje(ctxA.cenario.organization.id);

    expect(hojeA.map((i) => i.id)).toContain(ctxA.atividade.id);
    expect(hojeA.map((i) => i.id)).not.toContain(ctxB.atividade.id);
  });

  test("H) nenhuma aba (Hoje/Próximas/Anteriores) vaza atividade de outro tenant", async () => {
    const ctxA = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(2) });
    cenario = ctxA.cenario;
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });
    const interesseB = await criarInteresse({
      organizationId: cenarioB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
    });
    await prisma.scheduledActivity.createMany({
      data: [
        {
          organizationId: cenarioB.organization.id,
          personId: pessoaB.id,
          propertyId: imovelB.id,
          propertyInterestId: interesseB.id,
          status: "SCHEDULED",
          scheduledAt: hojeAsHoras(3),
        },
        {
          organizationId: cenarioB.organization.id,
          personId: pessoaB.id,
          propertyId: imovelB.id,
          propertyInterestId: interesseB.id,
          status: "SCHEDULED",
          scheduledAt: futuro(5),
        },
        {
          organizationId: cenarioB.organization.id,
          personId: pessoaB.id,
          propertyId: imovelB.id,
          propertyInterestId: interesseB.id,
          status: "COMPLETED",
          scheduledAt: passado(5),
          completedAt: new Date(),
        },
      ],
    });

    const [hoje, proximas, anteriores] = await Promise.all([
      buscarAgendaHoje(ctxA.cenario.organization.id),
      buscarAgendaProximas(ctxA.cenario.organization.id),
      buscarAgendaAnteriores(ctxA.cenario.organization.id),
    ]);

    expect(hoje.every((i) => i.id === ctxA.atividade.id)).toBe(true);
    expect(proximas).toHaveLength(0);
    expect(anteriores).toHaveLength(0);
  });

  test("I) Person de outro tenant (linha anômala) nunca vaza nome — item aparece com person redigido", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id, name: "Pessoa Sigilosa De B" });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id });

    // Linha fora do fluxo normal da app: organizationId de A, personId de B.
    const anomala = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoaB.id,
        propertyId: imovelA.id,
        status: "SCHEDULED",
        scheduledAt: hojeAsHoras(2),
      },
    });

    const hoje = await buscarAgendaHoje(cenario.organization.id);
    const item = hoje.find((i) => i.id === anomala.id);

    expect(item).toBeDefined();
    expect(item?.person).toBeNull();
    expect(JSON.stringify(item)).not.toContain("Pessoa Sigilosa De B");

    // Limpeza manual: personId aponta pra Person de B, então
    // limparOrganizacao(A) no afterEach não alcança esta linha via cascade
    // (o cascade de ScheduledActivity.personId só dispara ao apagar a
    // Person, e essa Person é de B, limpa DEPOIS de A) — sem isso, o FK
    // RESTRICT de organizationId bloquearia o delete da própria
    // Organization A. Mesmo padrão do teste BK em
    // scheduled-activity-visita.test.ts (H.2).
    await prisma.scheduledActivity.deleteMany({
      where: { id: anomala.id, organizationId: cenario.organization.id },
    });
  });

  test("J) Property de outro tenant (linha anômala) nunca vaza título — item aparece com property redigido", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, title: "Imóvel Sigiloso De B" });

    const anomala = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoaA.id,
        propertyId: imovelB.id,
        status: "SCHEDULED",
        scheduledAt: hojeAsHoras(2),
      },
    });

    const hoje = await buscarAgendaHoje(cenario.organization.id);
    const item = hoje.find((i) => i.id === anomala.id);

    expect(item).toBeDefined();
    expect(item?.property).toBeNull();
    expect(JSON.stringify(item)).not.toContain("Imóvel Sigiloso De B");
  });

  test("K) propertyInterestId anômalo/cross-tenant não expõe dado adicional (agenda nunca seleciona campos de PropertyInterest)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });
    const interesseB = await criarInteresse({
      organizationId: cenarioB.organization.id,
      personId: pessoaB.id,
      propertyId: imovelB.id,
    });

    const anomala = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoaA.id,
        propertyId: imovelA.id,
        propertyInterestId: interesseB.id,
        status: "SCHEDULED",
        scheduledAt: hojeAsHoras(2),
      },
    });

    const hoje = await buscarAgendaHoje(cenario.organization.id);
    const item = hoje.find((i) => i.id === anomala.id);

    // O item aparece normalmente (é legitimamente de A) — propertyInterestId
    // é só um id opaco repassado, nunca usado pra buscar/exibir campos do
    // PropertyInterest referenciado (agenda.ts não seleciona nada dele).
    expect(item).toBeDefined();
    expect(item?.propertyInterestId).toBe(interesseB.id);
    expect(JSON.stringify(item)).not.toMatch(/stage|favorited/i);
  });

  // -------------------------------------------------------------------
  // Corretude de query
  // -------------------------------------------------------------------

  test("L) Hoje retorna apenas SCHEDULED do dia atual", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(1) });
    cenario = ctx.cenario;
    await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        status: "SCHEDULED",
        scheduledAt: futuro(3),
      },
    });

    const hoje = await buscarAgendaHoje(ctx.cenario.organization.id);

    expect(hoje.map((i) => i.id)).toEqual([ctx.atividade.id]);
  });

  test("M) Próximas retorna apenas SCHEDULED futuras (depois de hoje)", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(1) });
    cenario = ctx.cenario;
    const futura = await prisma.scheduledActivity.create({
      data: {
        organizationId: ctx.cenario.organization.id,
        personId: ctx.pessoa.id,
        propertyId: ctx.imovel.id,
        status: "SCHEDULED",
        scheduledAt: futuro(5),
      },
    });

    const proximas = await buscarAgendaProximas(ctx.cenario.organization.id);

    expect(proximas.map((i) => i.id)).toEqual([futura.id]);
  });

  test("N) Anteriores inclui COMPLETED", async () => {
    const ctx = await cenarioComVisita({ status: "COMPLETED", scheduledAt: passado(2) });
    cenario = ctx.cenario;

    const anteriores = await buscarAgendaAnteriores(ctx.cenario.organization.id);

    expect(anteriores.map((i) => i.id)).toContain(ctx.atividade.id);
  });

  test("O) Anteriores inclui CANCELLED", async () => {
    const ctx = await cenarioComVisita({ status: "CANCELLED", scheduledAt: futuro(2) });
    cenario = ctx.cenario;

    const anteriores = await buscarAgendaAnteriores(ctx.cenario.organization.id);

    expect(anteriores.map((i) => i.id)).toContain(ctx.atividade.id);
  });

  test("P) SCHEDULED atrasada permanece SCHEDULED e aparece em Anteriores (nunca em Hoje/Próximas)", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: passado(3) });
    cenario = ctx.cenario;

    const [hoje, proximas, anteriores] = await Promise.all([
      buscarAgendaHoje(ctx.cenario.organization.id),
      buscarAgendaProximas(ctx.cenario.organization.id),
      buscarAgendaAnteriores(ctx.cenario.organization.id),
    ]);

    expect(hoje.map((i) => i.id)).not.toContain(ctx.atividade.id);
    expect(proximas.map((i) => i.id)).not.toContain(ctx.atividade.id);
    const item = anteriores.find((i) => i.id === ctx.atividade.id);
    expect(item).toBeDefined();
    expect(item?.status).toBe("SCHEDULED");

    // Confirma que a leitura da agenda NÃO alterou o status no banco —
    // nenhuma expiração automática (decisão da H.2, preservada na H.3).
    const noBanco = await prisma.scheduledActivity.findUnique({
      where: { id: ctx.atividade.id, organizationId: ctx.cenario.organization.id },
    });
    expect(noBanco?.status).toBe("SCHEDULED");
  });

  test("Q) ordenação de Hoje é scheduledAt ASC", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const tarde = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: hojeAsHoras(6) },
    });
    const cedo = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: hojeAsHoras(1) },
    });

    const hoje = await buscarAgendaHoje(cenario.organization.id);

    expect(hoje.map((i) => i.id)).toEqual([cedo.id, tarde.id]);
  });

  test("R) ordenação de Próximas é scheduledAt ASC", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const maisLonge = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: futuro(10) },
    });
    const maisPerto = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: futuro(3) },
    });

    const proximas = await buscarAgendaProximas(cenario.organization.id);

    expect(proximas.map((i) => i.id)).toEqual([maisPerto.id, maisLonge.id]);
  });

  test("S) Anteriores ordenado com mais recente primeiro (scheduledAt DESC)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const maisAntiga = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(20), completedAt: new Date() },
    });
    const maisRecente = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(2), completedAt: new Date() },
    });

    const anteriores = await buscarAgendaAnteriores(cenario.organization.id);

    expect(anteriores.map((i) => i.id)).toEqual([maisRecente.id, maisAntiga.id]);
  });

  test("T) as 3 queries da agenda filtram explicitamente type: \"VISIT\" (garantia estrutural pro enum crescer no futuro)", () => {
    const codigo = readFileSync(new URL("../../src/lib/agenda.ts", import.meta.url), "utf-8");
    const ocorrencias = codigo.match(/type:\s*"VISIT"/g) ?? [];
    // 3 queries de listagem (Hoje/Próximas/Anteriores) + 3 de contagem = 6.
    expect(ocorrencias.length).toBe(6);
  });

  // -------------------------------------------------------------------
  // Read-only
  // -------------------------------------------------------------------

  test("U-X) buscar a agenda não cria/altera ScheduledActivity, PropertyInterest, Interaction ou ActivityLog", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(2), notes: "nota" });
    cenario = ctx.cenario;
    const where = { organizationId: ctx.cenario.organization.id };

    const antes = {
      scheduledActivity: await prisma.scheduledActivity.count({ where }),
      propertyInterest: await prisma.propertyInterest.count({ where }),
      interaction: await prisma.interaction.count({ where }),
      activityLog: await prisma.activityLog.count({ where }),
    };
    const atividadeAntes = await prisma.scheduledActivity.findUnique({
      where: { id: ctx.atividade.id, organizationId: ctx.cenario.organization.id },
    });

    await buscarAgendaHoje(ctx.cenario.organization.id);
    await buscarAgendaProximas(ctx.cenario.organization.id);
    await buscarAgendaAnteriores(ctx.cenario.organization.id);

    const depois = {
      scheduledActivity: await prisma.scheduledActivity.count({ where }),
      propertyInterest: await prisma.propertyInterest.count({ where }),
      interaction: await prisma.interaction.count({ where }),
      activityLog: await prisma.activityLog.count({ where }),
    };
    const atividadeDepois = await prisma.scheduledActivity.findUnique({
      where: { id: ctx.atividade.id, organizationId: ctx.cenario.organization.id },
    });

    expect(depois).toEqual(antes);
    expect(atividadeDepois).toEqual(atividadeAntes);
  });
});
