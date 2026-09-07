import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";
import { buscarCentralTrabalho } from "@/lib/central-trabalho";
import {
  buscarAgendaHoje,
  buscarAgendaProximas,
  buscarAgendaAnteriores,
  contarAgenda,
  interpretarFiltrosAgenda,
} from "@/lib/agenda";
import { buscarAnalyticsComercial } from "@/lib/analytics-comercial";
import { deDatetimeLocalNoFuso, paraDatetimeLocalNoFuso, chaveDoDia } from "@/lib/fuso-horario";

// =======================================================================
// Fase 18 — fuso horário da organização, ponta a ponta contra o banco
// =======================================================================
// RELÓGIO FIXO em todos os casos. O CI pode rodar em qualquer fuso e a
// qualquer hora: nada aqui depende de `new Date()` real.
//
// O instante de referência é escolhido a dedo: 08/09 00:30 UTC ainda é
// 07/09 21:30 em São Paulo. É a janela em que os dois calendários
// discordam, que é exatamente onde a Fase 17 errava.

const SP = "America/Sao_Paulo";
const NY = "America/New_York";
const AGORA = new Date("2026-09-08T00:30:00.000Z");

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(timezone: string | null): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"], timezone });
  cenarios.push(cenario);
  return cenario;
}

async function negociacaoComVisita(
  cenario: Cenario,
  opcoes: { quando?: Date; nome?: string; stage?: "INTERESTED" | "WON" } = {}
) {
  const organizationId = cenario.organization.id;
  const pessoa = await criarPessoa({ organizationId, name: opcoes.nome });
  const imovel = await criarImovel({ organizationId });
  const interesse = await prisma.propertyInterest.create({
    data: {
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: opcoes.stage ?? "INTERESTED",
      responsibleMemberId: cenario.membro.id,
      ...(opcoes.stage === "WON" ? { closedAt: opcoes.quando ?? AGORA } : {}),
    },
    select: { id: true },
  });
  if (opcoes.quando && opcoes.stage !== "WON") {
    await prisma.scheduledActivity.create({
      data: {
        organizationId,
        personId: pessoa.id,
        propertyId: imovel.id,
        propertyInterestId: interesse.id,
        type: "VISIT",
        status: "SCHEDULED",
        scheduledAt: opcoes.quando,
      },
    });
  }
  return { interesse, pessoa, imovel };
}

// -----------------------------------------------------------------------
// 1-2. Organization.timezone e o fallback legado
// -----------------------------------------------------------------------
describe("Organization.timezone", () => {
  test("organização configurada devolve o fuso persistido", async () => {
    const cenario = await novoCenario(SP);
    expect(await buscarFusoOrganizacao(cenario.organization.id)).toBe(SP);
  });

  test("organização LEGADA (timezone null) cai no fallback explícito UTC", async () => {
    const cenario = await novoCenario(null);
    const linha = await prisma.organization.findUniqueOrThrow({
      where: { id: cenario.organization.id },
      select: { timezone: true },
    });
    // O banco continua com null — zero backfill, nada foi inventado.
    expect(linha.timezone).toBeNull();
    // ... e o produto resolve para o comportamento histórico.
    expect(await buscarFusoOrganizacao(cenario.organization.id)).toBe("UTC");
  });

  test("valor inválido que tenha escapado para o banco não quebra a tela", async () => {
    const cenario = await novoCenario(null);
    // Escrita direta, contornando a validação da action de propósito:
    // simula tzdata mudando ou um dado antigo.
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { timezone: "Antiga/Zona" },
    });
    expect(await buscarFusoOrganizacao(cenario.organization.id)).toBe("UTC");
  });

  test("organização inexistente devolve o fallback em vez de lançar", async () => {
    expect(await buscarFusoOrganizacao("organizacao-que-nao-existe")).toBe("UTC");
  });
});

// -----------------------------------------------------------------------
// 3-4. Atualização da configuração e isolamento entre tenants
// -----------------------------------------------------------------------
describe("configuração e tenant", () => {
  test("alterar o fuso NÃO reescreve nenhum timestamp persistido", async () => {
    const cenario = await novoCenario("UTC");
    const quando = new Date("2026-09-08T02:00:00.000Z");
    const { interesse } = await negociacaoComVisita(cenario, { quando });

    const antes = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, propertyInterestId: interesse.id },
      select: { scheduledAt: true, createdAt: true },
    });

    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { timezone: SP },
    });

    const depois = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, propertyInterestId: interesse.id },
      select: { scheduledAt: true, createdAt: true },
    });
    expect(depois.scheduledAt.getTime()).toBe(antes.scheduledAt.getTime());
    expect(depois.createdAt.getTime()).toBe(antes.createdAt.getTime());

    // O INSTANTE é o mesmo; só a interpretação do calendário mudou.
    expect(chaveDoDia(depois.scheduledAt, "UTC")).toBe("2026-09-08");
    expect(chaveDoDia(depois.scheduledAt, SP)).toBe("2026-09-07");
  });

  test("o fuso de uma organização é invisível para outra", async () => {
    const a = await novoCenario(SP);
    const b = await novoCenario(NY);
    expect(await buscarFusoOrganizacao(a.organization.id)).toBe(SP);
    expect(await buscarFusoOrganizacao(b.organization.id)).toBe(NY);

    // Alterar o fuso de A não toca em B — o `where` é sempre pelo id da
    // organização da sessão, nunca por um id vindo do formulário.
    await prisma.organization.update({
      where: { id: a.organization.id },
      data: { timezone: "Europe/Lisbon" },
    });
    expect(await buscarFusoOrganizacao(b.organization.id)).toBe(NY);
  });

  test("duas organizações no MESMO instante veem dias diferentes", async () => {
    const brasil = await novoCenario(SP);
    const utc = await novoCenario("UTC");
    const quando = new Date("2026-09-08T02:00:00.000Z"); // 07/09 23:00 SP

    await negociacaoComVisita(brasil, { quando });
    await negociacaoComVisita(utc, { quando });

    const central = (c: Cenario, fuso: string) =>
      buscarCentralTrabalho(c.organization.id, c.membro.id, fuso, { agora: AGORA });

    const doBrasil = await central(brasil, SP);
    const doUtc = await central(utc, "UTC");
    expect(doBrasil.hoje.total).toBe(1);
    expect(doBrasil.proximas).toHaveLength(0);
    expect(doUtc.hoje.total).toBe(1);
  });
});

// -----------------------------------------------------------------------
// 5-7. Central: Hoje / Atrasadas / Próximas
// -----------------------------------------------------------------------
describe("Central de trabalho no fuso da organização", () => {
  test("a visita das 23:00 locais é HOJE — em UTC ela cairia em PRÓXIMAS", async () => {
    const cenario = await novoCenario(SP);
    await negociacaoComVisita(cenario, { quando: new Date("2026-09-08T02:00:00.000Z") });

    const emSaoPaulo = await buscarCentralTrabalho(
      cenario.organization.id,
      cenario.membro.id,
      SP,
      { agora: AGORA }
    );
    expect(emSaoPaulo.hoje.total).toBe(1);
    expect(emSaoPaulo.proximas).toHaveLength(0);
    expect(emSaoPaulo.atrasadas.total).toBe(0);

    // A MESMA linha, lida no calendário UTC, muda de bloco.
    const emUtc = await buscarCentralTrabalho(
      cenario.organization.id,
      cenario.membro.id,
      "UTC",
      { agora: AGORA }
    );
    expect(emUtc.hoje.total).toBe(1);
    expect(emUtc.atrasadas.total).toBe(0);
  });

  test("a visita das 00:15 do dia seguinte é PRÓXIMA, no mesmo dia UTC da anterior", async () => {
    const cenario = await novoCenario(SP);
    await negociacaoComVisita(cenario, {
      quando: new Date("2026-09-08T02:00:00.000Z"), // 07/09 23:00 SP
      nome: "Fim do dia",
    });
    await negociacaoComVisita(cenario, {
      quando: new Date("2026-09-08T03:15:00.000Z"), // 08/09 00:15 SP
      nome: "Começo de amanhã",
    });

    const central = await buscarCentralTrabalho(
      cenario.organization.id,
      cenario.membro.id,
      SP,
      { agora: AGORA }
    );
    expect(central.hoje.total).toBe(1);
    expect(central.proximas).toHaveLength(1);
    // As duas estão no mesmo dia UTC — é a organização que as separa.
    expect(chaveDoDia(new Date(central.hoje.itens[0].scheduledAtISO), "UTC")).toBe(
      chaveDoDia(new Date(central.proximas[0].scheduledAtISO), "UTC")
    );
  });

  test("ATRASADA é por dia calendário da organização, nunca por horário", async () => {
    const cenario = await novoCenario(SP);
    // 07/09 09:00 SP — o horário já passou (agora são 21:30 lá), mas o
    // DIA não. Decisão da Fase 17, preservada.
    await negociacaoComVisita(cenario, { quando: new Date("2026-09-07T12:00:00.000Z") });
    // 06/09 23:00 SP — dia anterior: atrasada de verdade.
    await negociacaoComVisita(cenario, { quando: new Date("2026-09-07T02:00:00.000Z") });

    const central = await buscarCentralTrabalho(
      cenario.organization.id,
      cenario.membro.id,
      SP,
      { agora: AGORA }
    );
    expect(central.hoje.total).toBe(1);
    expect(central.atrasadas.total).toBe(1);
    expect(central.proximas).toHaveLength(0);
  });

  test("as três categorias nunca se sobrepõem, em qualquer fuso", async () => {
    const cenario = await novoCenario(SP);
    for (const iso of [
      "2026-09-05T12:00:00.000Z",
      "2026-09-07T02:00:00.000Z",
      "2026-09-07T12:00:00.000Z",
      "2026-09-08T02:00:00.000Z",
      "2026-09-08T03:15:00.000Z",
      "2026-09-20T12:00:00.000Z",
    ]) {
      await negociacaoComVisita(cenario, { quando: new Date(iso) });
    }
    for (const fuso of ["UTC", SP, NY]) {
      const central = await buscarCentralTrabalho(
        cenario.organization.id,
        cenario.membro.id,
        fuso,
        { agora: AGORA }
      );
      const ids = [
        ...central.atrasadas.itens.map((i) => i.id),
        ...central.hoje.itens.map((i) => i.id),
        ...central.proximas.map((i) => i.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
      expect(central.atrasadas.total + central.hoje.total + central.proximas.length).toBe(6);
    }
  });
});

// -----------------------------------------------------------------------
// 8. Agenda: a mesma definição temporal da Central
// -----------------------------------------------------------------------
describe("Agenda e Central concordam", () => {
  test("as duas telas classificam exatamente as mesmas visitas em cada bloco", async () => {
    const cenario = await novoCenario(SP);
    const organizationId = cenario.organization.id;
    for (const iso of [
      "2026-09-05T12:00:00.000Z",
      "2026-09-07T02:00:00.000Z",
      "2026-09-07T12:00:00.000Z",
      "2026-09-08T02:00:00.000Z",
      "2026-09-08T03:15:00.000Z",
      "2026-09-20T12:00:00.000Z",
    ]) {
      await negociacaoComVisita(cenario, { quando: new Date(iso) });
    }

    const central = await buscarCentralTrabalho(organizationId, cenario.membro.id, SP, {
      agora: AGORA,
    });
    const [hoje, proximas, contadores] = await Promise.all([
      buscarAgendaHoje(organizationId, SP, {}, { agora: AGORA }),
      buscarAgendaProximas(organizationId, SP, {}, { agora: AGORA }),
      contarAgenda(organizationId, SP, {}, { agora: AGORA }),
    ]);

    const ordenar = (v: string[]) => [...v].sort();
    expect(ordenar(hoje.map((i) => i.id))).toEqual(ordenar(central.hoje.itens.map((i) => i.id)));
    expect(ordenar(proximas.map((i) => i.id))).toEqual(
      ordenar(central.proximas.map((i) => i.id))
    );
    expect(contadores.hoje).toBe(central.hoje.total);
    expect(contadores.proximas).toBe(central.proximas.length);
    expect(contadores.atrasadas).toBe(central.atrasadas.total);
  });

  test("o filtro de período da Agenda recorta o dia da ORGANIZAÇÃO", async () => {
    const cenario = await novoCenario(SP);
    const organizationId = cenario.organization.id;
    // 07/09 23:00 SP — em UTC já é dia 08.
    await negociacaoComVisita(cenario, { quando: new Date("2026-09-08T02:00:00.000Z") });

    const filtros = interpretarFiltrosAgenda({ de: "2026-09-07", ate: "2026-09-07" });
    expect(filtros.de).toEqual({ ano: 2026, mes: 9, dia: 7 });

    // Em São Paulo a visita está dentro do dia 07.
    const noBrasil = await buscarAgendaAnteriores(organizationId, SP, {}, {
      agora: new Date("2026-09-30T12:00:00.000Z"),
      filtros,
    });
    expect(noBrasil).toHaveLength(1);

    // No calendário UTC o mesmo filtro não a encontra.
    const emUtc = await buscarAgendaAnteriores(organizationId, "UTC", {}, {
      agora: new Date("2026-09-30T12:00:00.000Z"),
      filtros,
    });
    expect(emUtc).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// 9-10. datetime-local -> UTC e a volta para o formulário
// -----------------------------------------------------------------------
describe("agendamento: horário digitado e horário exibido", () => {
  test("14:30 digitado é persistido como 17:30 UTC e volta como 14:30", async () => {
    const cenario = await novoCenario(SP);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "INTERESTED",
        responsibleMemberId: cenario.membro.id,
      },
      select: { id: true },
    });

    const fuso = await buscarFusoOrganizacao(organizationId);
    const instante = deDatetimeLocalNoFuso("2026-09-07T14:30", fuso)!;
    const atividade = await prisma.scheduledActivity.create({
      data: {
        organizationId,
        personId: pessoa.id,
        propertyId: imovel.id,
        propertyInterestId: interesse.id,
        type: "VISIT",
        status: "SCHEDULED",
        scheduledAt: instante,
      },
      select: { id: true, scheduledAt: true },
    });

    // O banco guarda o INSTANTE absoluto.
    expect(atividade.scheduledAt.toISOString()).toBe("2026-09-07T17:30:00.000Z");
    // E a leitura para o formulário devolve o que foi digitado.
    expect(paraDatetimeLocalNoFuso(atividade.scheduledAt, fuso)).toBe("2026-09-07T14:30");
    // No fuso errado, o corretor "corrigiria" um horário que estava certo.
    expect(paraDatetimeLocalNoFuso(atividade.scheduledAt, "UTC")).toBe("2026-09-07T17:30");
  });

  test("o mesmo texto digitado em organizações de fusos diferentes vira instantes diferentes", async () => {
    const brasil = await novoCenario(SP);
    const lisboa = await novoCenario("Europe/Lisbon");
    const fusoBrasil = await buscarFusoOrganizacao(brasil.organization.id);
    const fusoLisboa = await buscarFusoOrganizacao(lisboa.organization.id);

    const a = deDatetimeLocalNoFuso("2026-09-07T14:30", fusoBrasil)!;
    const b = deDatetimeLocalNoFuso("2026-09-07T14:30", fusoLisboa)!;
    expect(a.toISOString()).toBe("2026-09-07T17:30:00.000Z");
    expect(b.toISOString()).toBe("2026-09-07T13:30:00.000Z");
  });
});

// -----------------------------------------------------------------------
// 11-16. Analytics: períodos e coortes nas bordas
// -----------------------------------------------------------------------
describe("Analytics: períodos no calendário da organização", () => {
  // "Contato comercial" exige uma origem do catálogo (whereContatoComercial
  // em src/lib/captacao.ts) — registro manual (origin null) não conta.
  // Esta fase não mexeu nessa definição; só no LIMITE da janela.
  async function contato(cenario: Cenario, occurredAt: Date) {
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await prisma.interaction.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        type: "MESSAGE",
        origin: "CONTATO",
        occurredAt,
      },
    });
  }

  test.each(["7d", "30d", "13s"] as const)(
    "período %s inclui o contato das 23:00 locais do dia em curso",
    async (periodo) => {
      const cenario = await novoCenario(SP);
      // 07/09 23:00 SP = 08/09 02:00 UTC — dentro do dia 07 lá.
      await contato(cenario, new Date("2026-09-08T02:00:00.000Z"));
      const analytics = await buscarAnalyticsComercial(cenario.organization.id, SP, {
        periodo,
        agora: AGORA,
      });
      expect(analytics.contatos.atual).toBe(1);
      expect(analytics.janelas.dias).toBe(periodo === "7d" ? 7 : periodo === "30d" ? 30 : 91);
    }
  );

  test("um contato do dia ANTERIOR ao início da janela fica de fora", async () => {
    const cenario = await novoCenario(SP);
    // Janela de 7 dias terminando em 07/09 -> começa em 01/09 03:00 UTC.
    await contato(cenario, new Date("2026-09-01T02:59:59.999Z")); // 31/08 23:59:59.999 SP
    await contato(cenario, new Date("2026-09-01T03:00:00.000Z")); // 01/09 00:00 SP
    const analytics = await buscarAnalyticsComercial(cenario.organization.id, SP, {
      periodo: "7d",
      agora: AGORA,
    });
    expect(analytics.contatos.atual).toBe(1);
    expect(analytics.contatos.anterior).toBe(1);
  });

  test("closedAt na borda do dia é recortado pelo calendário da organização", async () => {
    const cenario = await novoCenario(SP);
    // Fechado em 07/09 23:00 SP (08/09 02:00 UTC) — dentro da janela lá.
    await negociacaoComVisita(cenario, {
      stage: "WON",
      quando: new Date("2026-09-08T02:00:00.000Z"),
    });
    const noBrasil = await buscarAnalyticsComercial(cenario.organization.id, SP, {
      periodo: "7d",
      agora: AGORA,
    });
    expect(noBrasil.resultado.fechamentosGanhos).toBe(1);

    // O valor persistido de closedAt não mudou — só o recorte.
    const linha = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, stage: "WON" },
      select: { closedAt: true },
    });
    expect(linha.closedAt!.toISOString()).toBe("2026-09-08T02:00:00.000Z");
  });

  test("paidAt na borda do dia entra na liquidação do período da organização", async () => {
    const cenario = await novoCenario(SP);
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "WON",
        closedAt: new Date("2026-09-05T12:00:00.000Z"),
        commissionValue: "1000.00",
        responsibleMemberId: cenario.membro.id,
      },
      select: { id: true },
    });
    const participante = await prisma.propertyInterestParticipant.create({
      data: {
        organizationId,
        propertyInterestId: interesse.id,
        memberId: cenario.membro.id,
        allocationValue: "1000.00",
      },
      select: { id: true },
    });
    // Pago em 07/09 23:00 SP — em UTC já é dia 08.
    await prisma.propertyInterestParticipantPayment.create({
      data: {
        organizationId,
        participantId: participante.id,
        amount: "400.00",
        paidAt: new Date("2026-09-08T02:00:00.000Z"),
      },
    });

    const analytics = await buscarAnalyticsComercial(organizationId, SP, {
      periodo: "7d",
      agora: AGORA,
    });
    expect(analytics.liquidacao.pagamentos).toBe(1);
    expect(analytics.liquidacao.pagoNoPeriodo).toBe(400);
  });

  test("occurredAt de uma interação na borda cai no dia comercial certo", async () => {
    const cenario = await novoCenario(SP);
    // 23:59:59.999 do dia 07 em São Paulo é o último milissegundo do dia.
    await contato(cenario, new Date("2026-09-08T02:59:59.999Z"));
    // ... e 1ms depois já é o dia 08, fora do dia em curso.
    await contato(cenario, new Date("2026-09-08T03:00:00.000Z"));

    const analytics = await buscarAnalyticsComercial(cenario.organization.id, SP, {
      periodo: "7d",
      agora: AGORA,
    });
    // A janela termina no fim do dia 07 local: só o primeiro entra.
    expect(analytics.contatos.atual).toBe(1);
    expect(analytics.serie[6].chave).toBe("2026-09-07");
    expect(analytics.serie[6].total).toBe(1);
  });

  test("a série tem um balde por dia calendário da organização", async () => {
    const cenario = await novoCenario(SP);
    await contato(cenario, new Date("2026-09-08T02:00:00.000Z")); // 07/09 23:00 SP
    const analytics = await buscarAnalyticsComercial(cenario.organization.id, SP, {
      periodo: "7d",
      agora: AGORA,
    });
    expect(analytics.serie).toHaveLength(7);
    expect(analytics.serie[6].chave).toBe("2026-09-07");
    expect(analytics.serie[6].total).toBe(1);
  });

  test("período que atravessa DST continua com o número certo de dias", async () => {
    const cenario = await novoCenario(NY);
    const agora = new Date("2026-11-10T18:00:00.000Z");
    const analytics = await buscarAnalyticsComercial(cenario.organization.id, NY, {
      periodo: "30d",
      agora,
    });
    expect(analytics.serie).toHaveLength(30);
    expect(analytics.serie[0].chave).toBe("2026-10-12");
    expect(analytics.serie[29].chave).toBe("2026-11-10");
  });
});
