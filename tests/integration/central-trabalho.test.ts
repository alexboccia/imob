import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import { buscarCentralTrabalho, LIMITE_CENTRAL } from "@/lib/central-trabalho";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

async function outroMembro(organizationId: string, nome: string) {
  const usuario = await criarUsuario({ name: nome });
  return criarMembro({ organizationId, userId: usuario.id, role: "BROKER" });
}

// Relógio FIXO em todos os testes: nada aqui pode depender do timezone
// nem do horário da máquina que roda o CI.
const AGORA = new Date("2026-09-07T12:00:00.000Z");
const iso = (s: string) => new Date(s);

async function negociacao(
  organizationId: string,
  opcoes: { responsavelId?: string | null; stage?: string } = {}
) {
  const pessoa = await criarPessoa({ organizationId });
  const imovel = await criarImovel({ organizationId });
  const interesse = await prisma.propertyInterest.create({
    data: {
      organizationId,
      personId: pessoa.id,
      propertyId: imovel.id,
      stage: (opcoes.stage ?? "INTERESTED") as "INTERESTED",
      responsibleMemberId: opcoes.responsavelId === undefined ? null : opcoes.responsavelId,
      ...(opcoes.stage === "WON" || opcoes.stage === "REJECTED" ? { closedAt: AGORA } : {}),
    },
    select: { id: true, personId: true, propertyId: true },
  });
  return interesse;
}

async function visita(
  organizationId: string,
  interesse: { id: string; personId: string; propertyId: string },
  quando: string,
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" = "SCHEDULED"
) {
  return prisma.scheduledActivity.create({
    data: {
      organizationId,
      personId: interesse.personId,
      propertyId: interesse.propertyId,
      propertyInterestId: interesse.id,
      type: "VISIT",
      status,
      scheduledAt: iso(quando),
      ...(status === "COMPLETED" ? { completedAt: AGORA } : {}),
      ...(status === "CANCELLED" ? { cancelledAt: AGORA } : {}),
    },
    select: { id: true },
  });
}

const central = (organizationId: string, memberId: string) =>
  buscarCentralTrabalho(organizationId, memberId, { agora: AGORA });

describe("compromissos", () => {
  test("visita de hoje aparece em HOJE", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, n, "2026-09-07T15:00:00.000Z");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.hoje.total).toBe(1);
    expect(r.hoje.itens).toHaveLength(1);
    expect(r.atrasadas.total).toBe(0);
    expect(r.proximas).toHaveLength(0);
  });

  test("visita de ontem aparece em ATRASADAS", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, n, "2026-09-06T10:00:00.000Z");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.atrasadas.total).toBe(1);
    expect(r.hoje.total).toBe(0);
  });

  test("visita de amanhã aparece em PRÓXIMAS", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, n, "2026-09-08T09:00:00.000Z");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.proximas).toHaveLength(1);
    expect(r.hoje.total).toBe(0);
    expect(r.atrasadas.total).toBe(0);
  });

  test("COMPLETED não é pendência", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, n, "2026-09-06T10:00:00.000Z", "COMPLETED");
    await visita(c.organization.id, n, "2026-09-07T10:00:00.000Z", "COMPLETED");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.atrasadas.total).toBe(0);
    expect(r.hoje.total).toBe(0);
  });

  test("CANCELLED não é pendência", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, n, "2026-09-06T10:00:00.000Z", "CANCELLED");
    await visita(c.organization.id, n, "2026-09-07T10:00:00.000Z", "CANCELLED");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.atrasadas.total).toBe(0);
    expect(r.hoje.total).toBe(0);
  });

  test("as três categorias são mutuamente exclusivas na query", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, n, "2026-09-05T10:00:00.000Z");
    await visita(c.organization.id, n, "2026-09-07T10:00:00.000Z");
    await visita(c.organization.id, n, "2026-09-09T10:00:00.000Z");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.atrasadas.total).toBe(1);
    expect(r.hoje.total).toBe(1);
    expect(r.proximas).toHaveLength(1);
    // Nenhuma atividade contada duas vezes.
    const ids = [
      ...r.atrasadas.itens.map((i) => i.id),
      ...r.hoje.itens.map((i) => i.id),
      ...r.proximas.map((i) => i.id),
    ];
    expect(new Set(ids).size).toBe(3);
  });

  test("bordas do dia: 00:00 e 23:59:59.999 são HOJE", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, n, "2026-09-07T00:00:00.000Z");
    await visita(c.organization.id, n, "2026-09-07T23:59:59.999Z");
    // 1ms antes do dia começar: atrasada.
    await visita(c.organization.id, n, "2026-09-06T23:59:59.999Z");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.hoje.total).toBe(2);
    expect(r.atrasadas.total).toBe(1);
  });

  test("visita de OUTRO membro não entra na minha central", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno");
    const minha = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    const dele = await negociacao(c.organization.id, { responsavelId: bruno.id });
    await visita(c.organization.id, minha, "2026-09-07T10:00:00.000Z");
    await visita(c.organization.id, dele, "2026-09-07T11:00:00.000Z");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.hoje.total).toBe(1);
    expect(r.hoje.itens[0].pessoa?.id).toBe(minha.personId);
  });

  test("visita de negociação SEM responsável não é minha", async () => {
    const c = await novoCenario();
    const semDono = await negociacao(c.organization.id, { responsavelId: null });
    await visita(c.organization.id, semDono, "2026-09-07T10:00:00.000Z");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.hoje.total).toBe(0);
  });

  test("atrasadas vêm da mais antiga para a mais recente", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, n, "2026-09-02T10:00:00.000Z");
    await visita(c.organization.id, n, "2026-09-05T10:00:00.000Z");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.atrasadas.itens.map((i) => i.scheduledAtISO)).toEqual([
      "2026-09-02T10:00:00.000Z",
      "2026-09-05T10:00:00.000Z",
    ]);
  });

  test("a lista trunca no limite, mas a contagem continua exata", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    const quantidade = LIMITE_CENTRAL + 3;
    for (let i = 0; i < quantidade; i++) {
      await visita(c.organization.id, n, `2026-09-07T0${(i % 9) + 1}:0${i % 6}:00.000Z`);
    }

    const r = await central(c.organization.id, c.membro.id);
    expect(r.hoje.itens).toHaveLength(LIMITE_CENTRAL);
    // Nada de truncar em silêncio: o total é o real.
    expect(r.hoje.total).toBe(quantidade);
  });
});

describe("negociações", () => {
  test("negociação aberta do membro aparece", async () => {
    const c = await novoCenario();
    await negociacao(c.organization.id, { responsavelId: c.membro.id, stage: "PROPOSAL" });

    const r = await central(c.organization.id, c.membro.id);
    expect(r.negociacoes.total).toBe(1);
    expect(r.negociacoes.itens[0].stage).toBe("PROPOSAL");
  });

  test("negociação de OUTRO membro não aparece", async () => {
    const c = await novoCenario();
    const bruno = await outroMembro(c.organization.id, "Bruno");
    await negociacao(c.organization.id, { responsavelId: bruno.id });

    const r = await central(c.organization.id, c.membro.id);
    expect(r.negociacoes.total).toBe(0);
  });

  test("negociação SEM responsável não é automaticamente minha", async () => {
    const c = await novoCenario();
    await negociacao(c.organization.id, { responsavelId: null });

    const r = await central(c.organization.id, c.membro.id);
    expect(r.negociacoes.total).toBe(0);
  });

  test("WON e REJECTED não são trabalho pendente", async () => {
    const c = await novoCenario();
    await negociacao(c.organization.id, { responsavelId: c.membro.id, stage: "WON" });
    await negociacao(c.organization.id, { responsavelId: c.membro.id, stage: "REJECTED" });

    const r = await central(c.organization.id, c.membro.id);
    expect(r.negociacoes.total).toBe(0);
  });

  test("'sem próximo compromisso' é fato: só quando a agenda futura está vazia", async () => {
    const c = await novoCenario();
    const semAgenda = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    const comAgenda = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, comAgenda, "2026-09-09T10:00:00.000Z");
    // Visita PASSADA não conta como próximo compromisso.
    await visita(c.organization.id, semAgenda, "2026-09-01T10:00:00.000Z");

    const r = await central(c.organization.id, c.membro.id);
    const porId = new Map(r.negociacoes.itens.map((n) => [n.id, n]));
    expect(porId.get(semAgenda.id)?.semProximoCompromisso).toBe(true);
    expect(porId.get(comAgenda.id)?.semProximoCompromisso).toBe(false);
  });

  test("visita futura CANCELADA não conta como próximo compromisso", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await visita(c.organization.id, n, "2026-09-09T10:00:00.000Z", "CANCELLED");

    const r = await central(c.organization.id, c.membro.id);
    expect(r.negociacoes.itens[0].semProximoCompromisso).toBe(true);
  });

  test("último contato usa occurredAt, e a mais recente vence", async () => {
    const c = await novoCenario();
    const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await prisma.interaction.create({
      data: {
        organizationId: c.organization.id,
        personId: n.personId,
        type: "CALL",
        occurredAt: iso("2026-09-01T10:00:00.000Z"),
      },
    });
    await prisma.interaction.create({
      data: {
        organizationId: c.organization.id,
        personId: n.personId,
        type: "MESSAGE",
        occurredAt: iso("2026-09-05T10:00:00.000Z"),
      },
    });

    const r = await central(c.organization.id, c.membro.id);
    expect(r.negociacoes.itens[0].ultimoContatoISO).toBe("2026-09-05T10:00:00.000Z");
  });

  test("sem interação nenhuma, último contato é null — nunca uma data inventada", async () => {
    const c = await novoCenario();
    await negociacao(c.organization.id, { responsavelId: c.membro.id });

    const r = await central(c.organization.id, c.membro.id);
    expect(r.negociacoes.itens[0].ultimoContatoISO).toBeNull();
  });

  test("negociações vêm da menos movimentada para a mais recente", async () => {
    const c = await novoCenario();
    const antiga = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    const nova = await negociacao(c.organization.id, { responsavelId: c.membro.id });
    await prisma.propertyInterest.update({
      where: { id: antiga.id, organizationId: c.organization.id },
      data: { updatedAt: iso("2026-08-01T10:00:00.000Z") },
    });
    await prisma.propertyInterest.update({
      where: { id: nova.id, organizationId: c.organization.id },
      data: { updatedAt: iso("2026-09-06T10:00:00.000Z") },
    });

    const r = await central(c.organization.id, c.membro.id);
    expect(r.negociacoes.itens.map((n) => n.id)).toEqual([antiga.id, nova.id]);
  });
});

describe("isolamento entre organizações", () => {
  test("a central de A nunca mostra atividade nem negociação de B", async () => {
    const a = await novoCenario();
    const b = await novoCenario();

    const nb = await negociacao(b.organization.id, { responsavelId: b.membro.id });
    await visita(b.organization.id, nb, "2026-09-07T10:00:00.000Z");

    const r = await central(a.organization.id, a.membro.id);
    expect(r.hoje.total).toBe(0);
    expect(r.atrasadas.total).toBe(0);
    expect(r.proximas).toHaveLength(0);
    expect(r.negociacoes.total).toBe(0);
  });

  test("membro de B consultado na organização A não devolve nada", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const na = await negociacao(a.organization.id, { responsavelId: a.membro.id });
    await visita(a.organization.id, na, "2026-09-07T10:00:00.000Z");

    // Mesmo passando um memberId válido, mas de outro tenant.
    const r = await central(a.organization.id, b.membro.id);
    expect(r.hoje.total).toBe(0);
    expect(r.negociacoes.total).toBe(0);
  });
});

describe("volume", () => {
  test("com muitas negociações o resultado continua correto e limitado", async () => {
    const c = await novoCenario();
    const criadas = [];
    for (let i = 0; i < LIMITE_CENTRAL + 7; i++) {
      const n = await negociacao(c.organization.id, { responsavelId: c.membro.id });
      await prisma.interaction.create({
        data: {
          organizationId: c.organization.id,
          personId: n.personId,
          type: "CALL",
          occurredAt: iso("2026-09-05T10:00:00.000Z"),
        },
      });
      criadas.push(n);
    }

    const r = await central(c.organization.id, c.membro.id);
    // Total exato, lista truncada.
    expect(r.negociacoes.total).toBe(criadas.length);
    expect(r.negociacoes.itens).toHaveLength(LIMITE_CENTRAL);
    // O último contato vem preenchido para TODAS as linhas exibidas — é
    // o que a agregação em lote (um único groupBy) precisa garantir.
    //
    // NOTA: a ausência de N+1 é garantida por construção (um groupBy
    // para o último contato + um include aninhado com take:1 para a
    // próxima visita, o mesmo padrão batched do Pipeline), e NÃO é
    // afirmada por um contador aqui: o cliente Prisma estendido do
    // projeto não expõe $on("query"), e ligar log de query no singleton
    // compartilhado só para o teste seria pior que a dívida.
    expect(r.negociacoes.itens.every((n) => n.ultimoContatoISO !== null)).toBe(true);
    expect(r.negociacoes.itens.every((n) => n.semProximoCompromisso)).toBe(true);
  });
});
