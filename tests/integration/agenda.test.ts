import { describe, test, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import {
  buscarAgendaHoje,
  buscarAgendaProximas,
  buscarAgendaAnteriores,
  interpretarFiltrosAgenda,
  contarResumoDiario,
} from "@/lib/agenda";
import { inicioDoDiaUTC, proximaVisita, periodoDaVisita } from "@/lib/scheduled-activity-date";

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
// "YYYY-MM-DD" do dia UTC atual — mesmo formato de <input type="date">,
// usado nos testes H.5 que combinam filtro de período (de/ate) com a
// visão de Hoje sem depender de qual horário real o teste roda.
function hojeISO(): string {
  return inicioDoDiaUTC().toISOString().slice(0, 10);
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

  test("T) as queries da agenda filtram explicitamente type: \"VISIT\" (garantia estrutural pro enum crescer no futuro)", () => {
    const codigo = readFileSync(new URL("../../src/lib/agenda.ts", import.meta.url), "utf-8");
    const ocorrencias = codigo.match(/type:\s*"VISIT"/g) ?? [];
    // 3 queries de listagem (Hoje/Próximas/Anteriores) + 4 de contagem
    // globais (hoje/proximas/anteriores/atrasadas, contarAgenda) + 3 de
    // contagem do resumo diário (agendadas/concluidas/canceladas,
    // contarResumoDiario, adicionadas na H.5) = 10.
    expect(ocorrencias.length).toBe(10);
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

  // -------------------------------------------------------------------
  // Filtros operacionais (Fase H.4): busca, período, status
  // -------------------------------------------------------------------

  const SEM_FILTRO = interpretarFiltrosAgenda({});

  test("AA) busca encontra visita pelo nome do cliente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id, name: "Roberto Alvarenga" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const atividade = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        status: "SCHEDULED",
        scheduledAt: hojeAsHoras(2),
      },
    });

    const filtros = interpretarFiltrosAgenda({ q: "alvarenga" });
    const hoje = await buscarAgendaHoje(cenario.organization.id, { filtros });

    expect(hoje.map((i) => i.id)).toEqual([atividade.id]);
  });

  test("AB) busca encontra visita pelo título do imóvel", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, title: "Cobertura Duplex Panorâmica" });
    const atividade = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        status: "SCHEDULED",
        scheduledAt: hojeAsHoras(2),
      },
    });

    const filtros = interpretarFiltrosAgenda({ q: "duplex" });
    const hoje = await buscarAgendaHoje(cenario.organization.id, { filtros });

    expect(hoje.map((i) => i.id)).toEqual([atividade.id]);
  });

  test("AC) busca sem resultado retorna lista vazia, sem erro", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(2) });
    cenario = ctx.cenario;

    const filtros = interpretarFiltrosAgenda({ q: "nome-que-nao-existe-em-lugar-nenhum" });
    const hoje = await buscarAgendaHoje(ctx.cenario.organization.id, { filtros });

    expect(hoje).toEqual([]);
  });

  test("AD) filtro de data inicial (de) exclui visitas anteriores ao período", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const dentro = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(2), completedAt: new Date() },
    });
    const foraAntes = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(30), completedAt: new Date() },
    });
    void foraAntes;

    const de = new Date(dentro.scheduledAt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const filtros = interpretarFiltrosAgenda({ de });
    const anteriores = await buscarAgendaAnteriores(cenario.organization.id, { filtros });

    expect(anteriores.map((i) => i.id)).toContain(dentro.id);
    expect(anteriores.map((i) => i.id)).not.toContain(foraAntes.id);
  });

  test("AE) filtro de data final (ate) exclui visitas posteriores ao período", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const dentro = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: futuro(3) },
    });
    const foraDepois = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: futuro(40) },
    });

    const ate = new Date(dentro.scheduledAt.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const filtros = interpretarFiltrosAgenda({ ate });
    const proximas = await buscarAgendaProximas(cenario.organization.id, { filtros });

    expect(proximas.map((i) => i.id)).toContain(dentro.id);
    expect(proximas.map((i) => i.id)).not.toContain(foraDepois.id);
  });

  test("AF) intervalo completo (de+ate) filtra corretamente em Anteriores", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const dentro = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(5), completedAt: new Date() },
    });
    const foraAntes = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(20), completedAt: new Date() },
    });
    const foraDepois = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(1), completedAt: new Date() },
    });

    const de = new Date(dentro.scheduledAt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ate = new Date(dentro.scheduledAt.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const filtros = interpretarFiltrosAgenda({ de, ate });
    const anteriores = await buscarAgendaAnteriores(cenario.organization.id, { filtros });

    expect(anteriores.map((i) => i.id)).toEqual([dentro.id]);
    expect(anteriores.map((i) => i.id)).not.toContain(foraAntes.id);
    expect(anteriores.map((i) => i.id)).not.toContain(foraDepois.id);
  });

  test("AG) status=CONCLUIDAS em Anteriores retorna só COMPLETED", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const concluida = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(2), completedAt: new Date() },
    });
    const cancelada = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "CANCELLED", scheduledAt: passado(2), cancelledAt: new Date() },
    });
    const atrasada = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: passado(2) },
    });

    const filtros = interpretarFiltrosAgenda({ status: "CONCLUIDAS" });
    const anteriores = await buscarAgendaAnteriores(cenario.organization.id, { filtros });

    expect(anteriores.map((i) => i.id)).toEqual([concluida.id]);
    expect(anteriores.map((i) => i.id)).not.toContain(cancelada.id);
    expect(anteriores.map((i) => i.id)).not.toContain(atrasada.id);
  });

  test("AH) status=CANCELADAS em Anteriores retorna só CANCELLED", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const concluida = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(2), completedAt: new Date() },
    });
    const cancelada = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "CANCELLED", scheduledAt: passado(2), cancelledAt: new Date() },
    });

    const filtros = interpretarFiltrosAgenda({ status: "CANCELADAS" });
    const anteriores = await buscarAgendaAnteriores(cenario.organization.id, { filtros });

    expect(anteriores.map((i) => i.id)).toEqual([cancelada.id]);
    expect(anteriores.map((i) => i.id)).not.toContain(concluida.id);
  });

  test("AI) status=ATRASADAS em Anteriores retorna só SCHEDULED atrasada (nunca COMPLETED/CANCELLED)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const atrasada = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: passado(2) },
    });
    const concluida = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(2), completedAt: new Date() },
    });

    const filtros = interpretarFiltrosAgenda({ status: "ATRASADAS" });
    const anteriores = await buscarAgendaAnteriores(cenario.organization.id, { filtros });

    expect(anteriores.map((i) => i.id)).toEqual([atrasada.id]);
    expect(anteriores.map((i) => i.id)).not.toContain(concluida.id);
    // Confirma no banco: continua SCHEDULED, nunca virou CANCELLED/COMPLETED sozinha.
    const noBanco = await prisma.scheduledActivity.findUnique({ where: { id: atrasada.id, organizationId: cenario.organization.id } });
    expect(noBanco?.status).toBe("SCHEDULED");
  });

  test("AJ) status=CONCLUIDAS na aba Hoje é combinação impossível: retorna vazio, não erro", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(2) });
    cenario = ctx.cenario;

    const filtros = interpretarFiltrosAgenda({ status: "CONCLUIDAS" });
    const hoje = await buscarAgendaHoje(ctx.cenario.organization.id, { filtros });

    expect(hoje).toEqual([]);
  });

  test("AK) status=ATRASADAS na aba Próximas é combinação impossível: retorna vazio, não erro", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: futuro(5) });
    cenario = ctx.cenario;

    const filtros = interpretarFiltrosAgenda({ status: "ATRASADAS" });
    const proximas = await buscarAgendaProximas(ctx.cenario.organization.id, { filtros });

    expect(proximas).toEqual([]);
  });

  test("AL) busca + período combinados", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaAlvo = await criarPessoa({ organizationId: cenario.organization.id, name: "Marina Kowalski" });
    const pessoaOutra = await criarPessoa({ organizationId: cenario.organization.id, name: "Marina Kowalski" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const dentroDoPeriodo = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoaAlvo.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: futuro(3) },
    });
    const foraDoPeriodo = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoaOutra.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: futuro(40) },
    });

    const ate = new Date(dentroDoPeriodo.scheduledAt.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const filtros = interpretarFiltrosAgenda({ q: "kowalski", ate });
    const proximas = await buscarAgendaProximas(cenario.organization.id, { filtros });

    expect(proximas.map((i) => i.id)).toEqual([dentroDoPeriodo.id]);
    expect(proximas.map((i) => i.id)).not.toContain(foraDoPeriodo.id);
  });

  test("AM) busca + status combinados", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id, name: "Heitor Nascimento" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const concluidaAlvo = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(2), completedAt: new Date() },
    });
    const canceladaMesmoNome = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "CANCELLED", scheduledAt: passado(2), cancelledAt: new Date() },
    });

    const filtros = interpretarFiltrosAgenda({ q: "nascimento", status: "CONCLUIDAS" });
    const anteriores = await buscarAgendaAnteriores(cenario.organization.id, { filtros });

    expect(anteriores.map((i) => i.id)).toEqual([concluidaAlvo.id]);
    expect(anteriores.map((i) => i.id)).not.toContain(canceladaMesmoNome.id);
  });

  test("AN) paginação de Anteriores preserva o filtro de busca entre páginas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id, name: "Paginação Teste Cliente" });
    const outraPessoa = await criarPessoa({ organizationId: cenario.organization.id, name: "Alguém Irrelevante" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const idsAlvo: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const atividade = await prisma.scheduledActivity.create({
        data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(i + 1), completedAt: new Date() },
      });
      idsAlvo.push(atividade.id);
    }
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: outraPessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(1), completedAt: new Date() },
    });

    const filtros = interpretarFiltrosAgenda({ q: "paginação teste" });
    const pagina1 = await buscarAgendaAnteriores(cenario.organization.id, { filtros, skip: 0, take: 2 });
    const pagina2 = await buscarAgendaAnteriores(cenario.organization.id, { filtros, skip: 2, take: 2 });

    expect(pagina1).toHaveLength(2);
    expect(pagina2).toHaveLength(1);
    const idsRetornados = [...pagina1, ...pagina2].map((i) => i.id).sort();
    expect(idsRetornados).toEqual([...idsAlvo].sort());
  });

  test("AO) busca não encontra/vaza Person cross-tenant, mesmo quando o nome bate", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id, name: "Nome Sigiloso De Outra Org" });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id });

    const anomala = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoaB.id,
        propertyId: imovelA.id,
        status: "SCHEDULED",
        scheduledAt: hojeAsHoras(2),
      },
    });

    const filtros = interpretarFiltrosAgenda({ q: "sigiloso" });
    const hoje = await buscarAgendaHoje(cenario.organization.id, { filtros });

    expect(hoje.map((i) => i.id)).not.toContain(anomala.id);
    expect(hoje).toEqual([]);

    await prisma.scheduledActivity.deleteMany({ where: { id: anomala.id, organizationId: cenario.organization.id } });
  });

  test("AP) busca não encontra/vaza Property cross-tenant, mesmo quando o título bate", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id, title: "Imóvel Sigiloso De Outra Org" });

    const anomala = await prisma.scheduledActivity.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoaA.id,
        propertyId: imovelB.id,
        status: "SCHEDULED",
        scheduledAt: hojeAsHoras(2),
      },
    });

    const filtros = interpretarFiltrosAgenda({ q: "imóvel sigiloso" });
    const hoje = await buscarAgendaHoje(cenario.organization.id, { filtros });

    expect(hoje.map((i) => i.id)).not.toContain(anomala.id);
    expect(hoje).toEqual([]);
  });

  test("AQ) buscar com filtros ativos não cria/altera ScheduledActivity, PropertyInterest, Interaction ou ActivityLog", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(2), notes: "nota" });
    cenario = ctx.cenario;
    const where = { organizationId: ctx.cenario.organization.id };

    const antes = {
      scheduledActivity: await prisma.scheduledActivity.count({ where }),
      propertyInterest: await prisma.propertyInterest.count({ where }),
      interaction: await prisma.interaction.count({ where }),
      activityLog: await prisma.activityLog.count({ where }),
    };

    const filtros = interpretarFiltrosAgenda({ q: "teste", de: "2020-01-01", ate: "2030-01-01", status: "AGENDADAS" });
    await buscarAgendaHoje(ctx.cenario.organization.id, { filtros });
    await buscarAgendaProximas(ctx.cenario.organization.id, { filtros });
    await buscarAgendaAnteriores(ctx.cenario.organization.id, { filtros });

    const depois = {
      scheduledActivity: await prisma.scheduledActivity.count({ where }),
      propertyInterest: await prisma.propertyInterest.count({ where }),
      interaction: await prisma.interaction.count({ where }),
      activityLog: await prisma.activityLog.count({ where }),
    };

    expect(depois).toEqual(antes);
  });

  test("AR) limite de Próximas continua respeitado com filtro de busca ativo", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id, name: "Cliente Volume Teste" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.scheduledActivity.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        organizationId: cenario!.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        status: "SCHEDULED" as const,
        scheduledAt: futuro(i + 1),
      })),
    });

    const filtros = interpretarFiltrosAgenda({ q: "volume" });
    const proximas = await buscarAgendaProximas(cenario.organization.id, { filtros, limite: 3 });

    expect(proximas).toHaveLength(3);
  });

  test("AS) SEM_FILTRO (objeto default) mantém contrato de interpretarFiltrosAgenda({})", () => {
    expect(SEM_FILTRO.status).toBe("TODAS");
    expect(SEM_FILTRO.busca).toBe("");
  });

  // -------------------------------------------------------------------
  // Resumo diário da aba Hoje (Fase H.5)
  // -------------------------------------------------------------------

  test("Q) SCHEDULED hoje entra em Agendadas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: hojeAsHoras(2) },
    });

    const resumo = await contarResumoDiario(cenario.organization.id);
    expect(resumo.agendadas).toBe(1);
    expect(resumo.concluidas).toBe(0);
    expect(resumo.canceladas).toBe(0);
  });

  test("R) COMPLETED hoje entra em Concluídas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: hojeAsHoras(2), completedAt: new Date() },
    });

    const resumo = await contarResumoDiario(cenario.organization.id);
    expect(resumo.concluidas).toBe(1);
    expect(resumo.agendadas).toBe(0);
    expect(resumo.canceladas).toBe(0);
  });

  test("S) CANCELLED hoje entra em Canceladas", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "CANCELLED", scheduledAt: hojeAsHoras(2), cancelledAt: new Date() },
    });

    const resumo = await contarResumoDiario(cenario.organization.id);
    expect(resumo.canceladas).toBe(1);
    expect(resumo.agendadas).toBe(0);
    expect(resumo.concluidas).toBe(0);
  });

  test("T) visita de ontem não entra no resumo diário", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "COMPLETED", scheduledAt: passado(1), completedAt: new Date() },
    });

    const resumo = await contarResumoDiario(cenario.organization.id);
    expect(resumo.concluidas).toBe(0);
  });

  test("U) visita de amanhã não entra no resumo diário", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: futuro(1) },
    });

    const resumo = await contarResumoDiario(cenario.organization.id);
    expect(resumo.agendadas).toBe(0);
  });

  test("V) outra organização não entra no resumo diário", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id });
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenarioB.organization.id, personId: pessoaB.id, propertyId: imovelB.id, status: "SCHEDULED", scheduledAt: hojeAsHoras(2) },
    });

    const resumoA = await contarResumoDiario(cenario.organization.id);
    expect(resumoA.agendadas).toBe(0);
  });

  test("W) type diferente de VISIT: impossível de testar hoje (enum ScheduledActivityType só possui VISIT) — documentado, não simulado com schema/enum novo", () => {
    // contarResumoDiario filtra explicitamente type:"VISIT" (mesma
    // garantia estrutural do teste T acima, seção de corretude de
    // query) — quando o enum ganhar novas variantes numa fase futura,
    // este filtro já impede que elas entrem no resumo sem exigir
    // nenhuma mudança aqui. Não há como construir um cenário real com
    // type != "VISIT" sem alterar prisma/schema.prisma, o que está fora
    // do escopo da H.5 (instrução explícita: não inventar enum/schema).
    const codigo = readFileSync(new URL("../../src/lib/agenda.ts", import.meta.url), "utf-8");
    const trechoResumo = codigo.slice(codigo.indexOf("export async function contarResumoDiario"));
    expect(trechoResumo.match(/type:\s*"VISIT"/g)?.length).toBe(3);
  });

  test("X) resumo diário NÃO muda quando busca/status/período são aplicados na visualização", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaJoao = await criarPessoa({ organizationId: cenario.organization.id, name: "João Resumo Teste" });
    const pessoaOutra = await criarPessoa({ organizationId: cenario.organization.id, name: "Maria Irrelevante" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoaJoao.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: hojeAsHoras(2) },
    });
    for (let i = 0; i < 4; i += 1) {
      await prisma.scheduledActivity.create({
        data: { organizationId: cenario.organization.id, personId: pessoaOutra.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: hojeAsHoras(3 + i) },
      });
    }

    const resumoSemFiltro = await contarResumoDiario(cenario.organization.id);
    expect(resumoSemFiltro.agendadas).toBe(5);

    // Aplica busca visual (que reduziria a LISTA pra 1 item) — o resumo
    // diário (função separada, sempre global) não deve mudar.
    const filtros = interpretarFiltrosAgenda({ q: "joão" });
    const listaFiltrada = await buscarAgendaHoje(cenario.organization.id, { filtros });
    expect(listaFiltrada).toHaveLength(1);

    const resumoComFiltro = await contarResumoDiario(cenario.organization.id);
    expect(resumoComFiltro.agendadas).toBe(5);
    expect(resumoComFiltro).toEqual(resumoSemFiltro);
  });

  // -------------------------------------------------------------------
  // Hoje + filtros H.4, agrupamento e próxima visita (Fase H.5)
  // -------------------------------------------------------------------

  test("Y) busca por cliente + agrupamento por período continuam coerentes", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaAlvo = await criarPessoa({ organizationId: cenario.organization.id, name: "Cliente Agrupamento Manha" });
    const pessoaOutra = await criarPessoa({ organizationId: cenario.organization.id, name: "Outro Cliente Tarde" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const manha = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoaAlvo.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: new Date(`${hojeISO()}T09:00:00.000Z`) },
    });
    await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoaOutra.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: new Date(`${hojeISO()}T15:00:00.000Z`) },
    });

    const filtros = interpretarFiltrosAgenda({ q: "agrupamento manha" });
    const hoje = await buscarAgendaHoje(cenario.organization.id, { filtros });

    expect(hoje.map((i) => i.id)).toEqual([manha.id]);
    expect(periodoDaVisita(hoje[0].scheduledAt)).toBe("MANHA");
  });

  test("Z) busca por imóvel + agrupamento por período continuam coerentes", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelAlvo = await criarImovel({ organizationId: cenario.organization.id, title: "Studio Agrupamento Noite" });
    const noite = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovelAlvo.id, status: "SCHEDULED", scheduledAt: new Date(`${hojeISO()}T20:00:00.000Z`) },
    });

    const filtros = interpretarFiltrosAgenda({ q: "agrupamento noite" });
    const hoje = await buscarAgendaHoje(cenario.organization.id, { filtros });

    expect(hoje.map((i) => i.id)).toEqual([noite.id]);
    expect(periodoDaVisita(hoje[0].scheduledAt)).toBe("NOITE");
  });

  test("AA) filtro de período combinado com Hoje + agrupamento", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const tarde = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: new Date(`${hojeISO()}T13:00:00.000Z`) },
    });

    const filtros = interpretarFiltrosAgenda({ de: hojeISO(), ate: hojeISO() });
    const hoje = await buscarAgendaHoje(cenario.organization.id, { filtros });

    expect(hoje.map((i) => i.id)).toEqual([tarde.id]);
    expect(periodoDaVisita(hoje[0].scheduledAt)).toBe("TARDE");
  });

  test("AB) status incompatível com Hoje continua retornando vazio de forma previsível (H.4 preservado)", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(2) });
    cenario = ctx.cenario;

    const filtros = interpretarFiltrosAgenda({ status: "CONCLUIDAS" });
    const hoje = await buscarAgendaHoje(ctx.cenario.organization.id, { filtros });

    expect(hoje).toEqual([]);
    expect(proximaVisita(hoje)).toBeNull();
  });

  test("AC) cross-tenant continua não vazando ao combinar busca com a visão de Hoje", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaB = await criarPessoa({ organizationId: cenarioB.organization.id, name: "Sigiloso Agrupamento B" });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id });

    const anomala = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoaB.id, propertyId: imovelA.id, status: "SCHEDULED", scheduledAt: hojeAsHoras(2) },
    });

    const filtros = interpretarFiltrosAgenda({ q: "sigiloso agrupamento" });
    const hoje = await buscarAgendaHoje(cenario.organization.id, { filtros });

    expect(hoje).toEqual([]);
    await prisma.scheduledActivity.deleteMany({ where: { id: anomala.id, organizationId: cenario.organization.id } });
  });

  test("AD) próxima visita reflete o conjunto VISÍVEL após filtro, não o total do dia", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaCedo = await criarPessoa({ organizationId: cenario.organization.id, name: "Maria Cedo Geral" });
    const pessoaAlvo = await criarPessoa({ organizationId: cenario.organization.id, name: "Joao Alvo Filtro" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    // agora = início do dia (00:00 UTC), então ambas as visitas abaixo
    // (05h e 20h) são "futuras" pra fins de proximaVisita.
    const agoraDoTeste = inicioDoDiaUTC();
    const doCedo = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoaCedo.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: hojeAsHoras(5) },
    });
    const doAlvo = await prisma.scheduledActivity.create({
      data: { organizationId: cenario.organization.id, personId: pessoaAlvo.id, propertyId: imovel.id, status: "SCHEDULED", scheduledAt: hojeAsHoras(20) },
    });

    // Sem filtro: a visita das 05h é a globalmente mais próxima (menor
    // scheduledAt futuro).
    const hojeSemFiltro = await buscarAgendaHoje(cenario.organization.id, { agora: agoraDoTeste });
    expect(proximaVisita(hojeSemFiltro, agoraDoTeste)?.id).toBe(doCedo.id);

    // Com filtro isolando só a visita das 20h, a "próxima visita" do
    // conjunto VISÍVEL passa a ser ela — não porque virou globalmente a
    // mais próxima (não virou), mas porque é a única presente na lista
    // já filtrada que proximaVisita() recebe.
    const filtros = interpretarFiltrosAgenda({ q: "joao alvo filtro" });
    const hojeFiltrado = await buscarAgendaHoje(cenario.organization.id, { agora: agoraDoTeste, filtros });
    expect(hojeFiltrado.map((i) => i.id)).toEqual([doAlvo.id]);
    expect(proximaVisita(hojeFiltrado, agoraDoTeste)?.id).toBe(doAlvo.id);
  });

  test("AE) carregar visão diária (resumo + agrupamento + próxima visita) não escreve nada", async () => {
    const ctx = await cenarioComVisita({ status: "SCHEDULED", scheduledAt: hojeAsHoras(2), notes: "nota" });
    cenario = ctx.cenario;
    const where = { organizationId: ctx.cenario.organization.id };

    const antes = {
      scheduledActivity: await prisma.scheduledActivity.count({ where }),
      propertyInterest: await prisma.propertyInterest.count({ where }),
      interaction: await prisma.interaction.count({ where }),
      activityLog: await prisma.activityLog.count({ where }),
    };

    const resumo = await contarResumoDiario(ctx.cenario.organization.id);
    const hoje = await buscarAgendaHoje(ctx.cenario.organization.id);
    const gruposCalculados = hoje.map((item) => periodoDaVisita(item.scheduledAt));
    const proxima = proximaVisita(hoje);
    void resumo;
    void gruposCalculados;
    void proxima;

    const depois = {
      scheduledActivity: await prisma.scheduledActivity.count({ where }),
      propertyInterest: await prisma.propertyInterest.count({ where }),
      interaction: await prisma.interaction.count({ where }),
      activityLog: await prisma.activityLog.count({ where }),
    };

    expect(depois).toEqual(antes);
  });
});
