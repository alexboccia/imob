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
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { criarCenario, criarImovel, criarPessoa } from "@/test/fixtures";
import { solicitarVisita } from "@/app/[orgSlug]/actions";
import { buscarAgendaProximas, buscarAgendaSolicitacoes } from "@/lib/agenda";
import { atividadeDoMembro } from "@/lib/responsavel-atividade";
import { ORIGENS_CAPTACAO } from "@/lib/captacao";

// =======================================================================
// Visita pedida pela ficha pública (Fase 55)
// =======================================================================
// O que se protege aqui é a ENTRADA NA JORNADA: o visitante do site
// produz exatamente o mesmo trio que o painel produz — Person
// deduplicada, PropertyInterest e ScheduledActivity VISIT — e a visita
// aparece nas consultas que o CRM já usa. Nada de domínio paralelo.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(timezone = "America/Sao_Paulo") {
  const c = await criarCenario({ modulos: ["core", "properties", "crm"], timezone });
  cenarios.push(c);
  return c;
}

/** Uma data futura qualquer, em horário comercial. */
function amanha(hora = "14:30") {
  const d = new Date(Date.now() + 36 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return {
    data: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`,
    hora,
  };
}

function formVisita(imovelId: string, extras: Record<string, string> = {}) {
  const fd = new FormData();
  const quando = amanha();
  fd.set("nome", "Joana Compradora");
  fd.set("email", "joana@exemplo.test");
  fd.set("telefone", "11999998888");
  fd.set("data", quando.data);
  fd.set("hora", quando.hora);
  fd.set("imovelId", imovelId);
  for (const [k, v] of Object.entries(extras)) fd.set(k, v);
  return fd;
}

const pedir = (slug: string, fd: FormData) => solicitarVisita(slug, { sucesso: false }, fd);

async function visitaGravada(organizationId: string) {
  return prisma.scheduledActivity.findFirst({
    where: { organizationId, type: "VISIT" },
    include: { propertyInterest: true },
  });
}

describe("criação da visita", () => {
  test("o visitante entra na jornada: Person, negociação e visita SOLICITADA", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({
      organizationId: c.organization.id,
      responsibleMemberId: c.membro.id,
      status: "AVAILABLE",
    });

    const r = await pedir(c.organization.slug, formVisita(imovel.id, { observacao: "Prefiro à tarde." }));
    expect(r).toEqual({ sucesso: true });

    const pessoa = await prisma.person.findFirstOrThrow({
      where: { organizationId: c.organization.id },
    });
    expect(pessoa.name).toBe("Joana Compradora");
    expect(pessoa.roles).toContain("LEAD");

    const visita = await visitaGravada(c.organization.id);
    expect(visita).not.toBeNull();
    // Imóvel certo, organização certa, pessoa certa.
    expect(visita!.propertyId).toBe(imovel.id);
    expect(visita!.organizationId).toBe(c.organization.id);
    expect(visita!.personId).toBe(pessoa.id);
    // Fase 56 — status inicial é PEDIDO, nunca compromisso assumido.
    // Este par de asserções é o coração da fase: um desconhecido não
    // ocupa a agenda da equipe.
    expect(visita!.status).toBe("REQUESTED");
    expect(visita!.status).not.toBe("SCHEDULED");
    expect(visita!.type).toBe("VISIT");
    // Nada de resultado, cancelamento ou conclusão inventados.
    expect(visita!.visitOutcome).toBeNull();
    expect(visita!.completedAt).toBeNull();
    expect(visita!.cancelledAt).toBeNull();
    // A observação do visitante é a nota operacional do compromisso.
    expect(visita!.notes).toBe("Prefiro à tarde.");
    // Ninguém da equipe criou este compromisso.
    expect(visita!.createdByMemberId).toBeNull();
    // No futuro.
    expect(visita!.scheduledAt.getTime()).toBeGreaterThan(Date.now());

    // A negociação nasce com o responsável DO IMÓVEL e em INTERESTED —
    // "tem visita marcada" só passa a ser verdade na confirmação.
    expect(visita!.propertyInterest).not.toBeNull();
    expect(visita!.propertyInterest!.responsibleMemberId).toBe(c.membro.id);
    expect(visita!.propertyInterest!.propertyId).toBe(imovel.id);
    expect(visita!.propertyInterest!.stage).toBe("INTERESTED");
    // Fase 56 — o pedido nasce com dono, para cair na fila de alguém.
    expect(visita!.responsibleMemberId).toBe(c.membro.id);
  });

  test("o contato aparece na caixa de entrada, com a origem do agendamento", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    await pedir(c.organization.slug, formVisita(imovel.id, { observacao: "Levo minha esposa." }));

    const interacao = await prisma.interaction.findFirstOrThrow({
      where: { organizationId: c.organization.id },
    });
    expect(interacao.origin).toBe(ORIGENS_CAPTACAO.VISITA);
    expect(interacao.propertyId).toBe(imovel.id);
    // Sem autor: o contato CHEGOU, ninguém o registrou (é isso que o põe
    // na fila de novos contatos).
    expect(interacao.memberId).toBeNull();
    expect(interacao.notes).toContain("Visita solicitada pelo site");
    expect(interacao.notes).toContain("Levo minha esposa.");
  });

  test("o pedido NÃO entra na agenda de compromissos — entra na fila de solicitações", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({
      organizationId: c.organization.id,
      responsibleMemberId: c.membro.id,
      status: "AVAILABLE",
    });
    await pedir(c.organization.slug, formVisita(imovel.id));

    // Fase 56 — a aba de compromissos assumidos continua VAZIA. Era esta
    // a regressão de produto: um horário que ninguém aceitou aparecendo
    // como visita marcada.
    const proximas = await buscarAgendaProximas(c.organization.id, "America/Sao_Paulo", {});
    expect(proximas).toHaveLength(0);

    // E a Central de trabalho, que só conta SCHEDULED, também não o vê.
    const compromissosDoMembro = await prisma.scheduledActivity.count({
      where: {
        organizationId: c.organization.id,
        status: "SCHEDULED",
        ...atividadeDoMembro(c.membro.id, c.organization.id),
      },
    });
    expect(compromissosDoMembro).toBe(0);

    // Mas o pedido EXISTE e está na fila de triagem do responsável, com
    // os dados que ele precisa para decidir.
    const solicitacoes = await buscarAgendaSolicitacoes(
      c.organization.id,
      "America/Sao_Paulo",
      atividadeDoMembro(c.membro.id, c.organization.id)
    );
    expect(solicitacoes).toHaveLength(1);
    expect(solicitacoes[0].status).toBe("REQUESTED");
    expect(solicitacoes[0].property?.id).toBe(imovel.id);
    expect(solicitacoes[0].person?.name).toBe("Joana Compradora");
    expect(solicitacoes[0].createdAtISO).toBeTruthy();
  });

  test("pessoa já conhecida: reutiliza a Person e a negociação existente", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    await pedir(c.organization.slug, formVisita(imovel.id));
    await pedir(c.organization.slug, formVisita(imovel.id, { hora: "16:00" }));

    // Uma pessoa, uma negociação, duas visitas — pedir de novo é legítimo.
    expect(await prisma.person.count({ where: { organizationId: c.organization.id } })).toBe(1);
    expect(await prisma.propertyInterest.count({ where: { organizationId: c.organization.id } })).toBe(1);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
    ).toBe(2);
  });

  test("negociação já existente não tem responsável nem stage sobrescritos", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    const pessoa = await criarPessoa({
      organizationId: c.organization.id,
      name: "Joana Compradora",
      email: "joana@exemplo.test",
    });
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: c.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "PROPOSAL",
        responsibleMemberId: c.membro.id,
      },
    });

    await pedir(c.organization.slug, formVisita(imovel.id));

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse.id, organizationId: c.organization.id },
    });
    // Stage adiantado NUNCA regride para VISIT_SCHEDULED.
    expect(depois.stage).toBe("PROPOSAL");
    expect(depois.responsibleMemberId).toBe(c.membro.id);
    expect(
      await prisma.scheduledActivity.count({
        where: { propertyInterestId: interesse.id, organizationId: c.organization.id },
      })
    ).toBe(1);
  });

  test("negociação em INTERESTED NÃO avança no envio público — só na confirmação", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    const pessoa = await criarPessoa({
      organizationId: c.organization.id,
      name: "Joana Compradora",
      email: "joana@exemplo.test",
    });
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: c.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "INTERESTED",
      },
    });

    await pedir(c.organization.slug, formVisita(imovel.id));

    const depois = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesse.id, organizationId: c.organization.id },
    });
    // Fase 56 — "esta negociação tem visita marcada" é uma afirmação que
    // o envio público não pode fazer sozinho. O stage fica onde estava.
    expect(depois.stage).toBe("INTERESTED");
    const historico = await prisma.propertyInterestStageHistory.findMany({
      where: { propertyInterestId: interesse.id, organizationId: c.organization.id },
    });
    expect(historico.map((h) => h.newStage)).not.toContain("VISIT_SCHEDULED");
  });

  test("sem responsável pelo imóvel, a negociação nasce sem dono — nunca do primeiro membro", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    await pedir(c.organization.slug, formVisita(imovel.id));
    const visita = await visitaGravada(c.organization.id);
    expect(visita!.propertyInterest!.responsibleMemberId).toBeNull();
    expect(visita!.responsibleMemberId).toBeNull();
  });
});

describe("recusas", () => {
  async function recusa(fd: FormData, slug: string) {
    const r = await pedir(slug, fd);
    expect(r.sucesso).toBe(false);
    return r;
  }

  test("data no passado é recusada e nada é gravado", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    const fd = formVisita(imovel.id, { data: "2020-01-10", hora: "10:00" });
    const r = await recusa(fd, c.organization.slug);
    expect(r.erro).toMatch(/futuro/i);
    expect(await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })).toBe(0);
    expect(await prisma.person.count({ where: { organizationId: c.organization.id } })).toBe(0);
  });

  test.each([
    ["nome vazio", { nome: "" }],
    ["e-mail inválido", { email: "joana.exemplo" }],
    ["telefone inválido", { telefone: "1199" }],
    ["data fora do formato", { data: "20/12/2026" }],
    ["hora fora do formato", { hora: "14h" }],
  ])("payload inválido (%s) não grava nada", async (_n, alteracao) => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    await recusa(formVisita(imovel.id, alteracao as Record<string, string>), c.organization.slug);
    expect(await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })).toBe(0);
    expect(await prisma.person.count({ where: { organizationId: c.organization.id } })).toBe(0);
  });

  test("imóvel que não é público/disponível é recusado sem revelar nada", async () => {
    const c = await novoCenario();
    for (const status of ["DRAFT", "SOLD", "INACTIVE"] as const) {
      const imovel = await criarImovel({ organizationId: c.organization.id, status });
      const r = await recusa(formVisita(imovel.id), c.organization.slug);
      expect(r.erro).not.toMatch(/rascunho|vendido|inativo|status/i);
    }
    expect(await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })).toBe(0);
  });

  test("imóvel inexistente e imóvel de OUTRA organização recebem a mesma resposta", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const imovelDeB = await criarImovel({ organizationId: b.organization.id, status: "AVAILABLE" });

    const deOutroTenant = await recusa(formVisita(imovelDeB.id), a.organization.slug);
    const inexistente = await recusa(formVisita("nao-existe"), a.organization.slug);
    expect(deOutroTenant.erro).toBe(inexistente.erro);

    // E nada foi criado em nenhuma das duas organizações.
    for (const c of [a, b]) {
      expect(
        await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
      ).toBe(0);
    }
  });

  test("organização inexistente não grava nada", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    await recusa(formVisita(imovel.id), "org-que-nao-existe");
    expect(await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })).toBe(0);
  });
});

describe("fuso da organização", () => {
  test("o horário pedido é lido no fuso da imobiliária, não em UTC", async () => {
    const c = await novoCenario("America/Sao_Paulo");
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });
    const quando = amanha("09:00");
    await pedir(
      c.organization.slug,
      formVisita(imovel.id, { data: quando.data, hora: quando.hora })
    );

    const visita = await visitaGravada(c.organization.id);
    // 09:00 em São Paulo (UTC-3) é 12:00 UTC.
    expect(visita!.scheduledAt.toISOString()).toBe(`${quando.data}T12:00:00.000Z`);
  });
});
