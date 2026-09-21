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
import { criarCenario, criarImovel } from "@/test/fixtures";
import { auth } from "@/lib/auth";
import { solicitarVisita } from "@/app/[orgSlug]/actions";
import {
  confirmarSolicitacaoVisita,
  descartarSolicitacaoVisita,
  cancelarAgendamentoVisita,
  concluirAgendamentoVisita,
  remarcarAgendamentoVisita,
} from "@/app/app/agendamentos/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { buscarAgendaProximas, buscarAgendaSolicitacoes, contarAgenda } from "@/lib/agenda";

// =======================================================================
// Solicitação pública de visita -> confirmação pelo corretor (Fase 56)
// =======================================================================
// O que se protege aqui é a DISTINÇÃO entre pedir e assumir. Um pedido
// público não pode ocupar a agenda como compromisso confirmado, e a
// transição para compromisso é um ato humano, autenticado, escopado ao
// tenant e seguro sob concorrência.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
  vi.mocked(auth).mockReset();
});

async function novoCenario() {
  const c = await criarCenario({ modulos: ["core", "properties", "crm"], timezone: "America/Sao_Paulo" });
  cenarios.push(c);
  return c;
}

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

function daquiADias(dias: number, hora = "14:30") {
  const d = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return { data: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`, hora };
}

function formVisita(imovelId: string, extras: Record<string, string> = {}) {
  const fd = new FormData();
  const quando = daquiADias(3);
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
const confirmar = (id: string) => confirmarSolicitacaoVisita(id, ESTADO_INICIAL_ACAO, new FormData());
const descartar = (id: string) => descartarSolicitacaoVisita(id, ESTADO_INICIAL_ACAO, new FormData());

/** Cenário completo: org com imóvel do corretor + um pedido público já feito. */
async function comPedido(extras: Record<string, string> = {}) {
  const c = await novoCenario();
  const imovel = await criarImovel({
    organizationId: c.organization.id,
    responsibleMemberId: c.membro.id,
    status: "AVAILABLE",
  });
  const resposta = await pedir(c.organization.slug, formVisita(imovel.id, extras));
  expect(resposta).toEqual({ sucesso: true });
  const solicitacao = await prisma.scheduledActivity.findFirstOrThrow({
    where: { organizationId: c.organization.id, type: "VISIT" },
  });
  return { c, imovel, solicitacao };
}

describe("o pedido público nasce como solicitação", () => {
  test("cria REQUESTED e nunca SCHEDULED", async () => {
    const { solicitacao } = await comPedido();
    expect(solicitacao.status).toBe("REQUESTED");
    expect(solicitacao.status).not.toBe("SCHEDULED");
  });

  test("não inventa desfecho: sem conclusão, cancelamento nem resultado", async () => {
    const { solicitacao } = await comPedido();
    expect(solicitacao.completedAt).toBeNull();
    expect(solicitacao.cancelledAt).toBeNull();
    expect(solicitacao.visitOutcome).toBeNull();
    expect(solicitacao.outcomeNotes).toBeNull();
    expect(solicitacao.createdByMemberId).toBeNull();
  });

  test("o contador da Agenda separa solicitações de compromissos", async () => {
    const { c } = await comPedido();
    const contadores = await contarAgenda(c.organization.id, "America/Sao_Paulo", {});
    expect(contadores.solicitacoes).toBe(1);
    expect(contadores.hoje).toBe(0);
    expect(contadores.proximas).toBe(0);
    expect(contadores.anteriores).toBe(0);
    expect(contadores.atrasadas).toBe(0);
  });
});

describe("confirmação", () => {
  test("REQUESTED -> SCHEDULED, na MESMA linha, e aí sim entra na agenda", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);

    const r = await confirmar(solicitacao.id);
    expect(r.success).toBe(true);

    const depois = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: solicitacao.id, organizationId: c.organization.id },
    });
    expect(depois.status).toBe("SCHEDULED");
    // Nenhuma linha nova: confirmar é transição, não criação.
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
    ).toBe(1);

    const proximas = await buscarAgendaProximas(c.organization.id, "America/Sao_Paulo", {});
    expect(proximas).toHaveLength(1);
    expect(proximas[0].id).toBe(solicitacao.id);
    // E some da fila de triagem.
    expect(await buscarAgendaSolicitacoes(c.organization.id, "America/Sao_Paulo", {})).toHaveLength(0);
  });

  test("o stage avança só aqui, com o ator da confirmação registrado", async () => {
    const { c, solicitacao } = await comPedido();
    const interesseId = solicitacao.propertyInterestId!;
    // Antes: o envio público não mexeu no stage.
    expect(
      (await prisma.propertyInterest.findUniqueOrThrow({
        where: { id: interesseId, organizationId: c.organization.id },
      })).stage
    ).toBe("INTERESTED");

    autenticarComo(c);
    await confirmar(solicitacao.id);

    const interesse = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: interesseId, organizationId: c.organization.id },
    });
    expect(interesse.stage).toBe("VISIT_SCHEDULED");

    const historico = await prisma.propertyInterestStageHistory.findMany({
      where: { propertyInterestId: interesseId, organizationId: c.organization.id },
    });
    const transicao = historico.find((h) => h.newStage === "VISIT_SCHEDULED");
    expect(transicao).toBeTruthy();
    // Diferente do envio público (sem ator), aqui há um humano que agiu.
    expect(transicao!.changedByMemberId).toBe(c.membro.id);
  });

  test("duplo clique: a segunda confirmação é idempotente, não cria segunda visita", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);

    const primeira = await confirmar(solicitacao.id);
    const segunda = await confirmar(solicitacao.id);
    expect(primeira.success).toBe(true);
    expect(segunda.success).toBe(true);
    expect(segunda.message).toContain("já estava confirmada");
    expect(
      await prisma.scheduledActivity.count({
        where: { organizationId: c.organization.id, status: "SCHEDULED" },
      })
    ).toBe(1);
  });

  test("duas abas confirmando ao mesmo tempo: exatamente uma vence", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);

    const [a, b] = await Promise.all([confirmar(solicitacao.id), confirmar(solicitacao.id)]);
    // As duas respondem sucesso (a perdedora relê e reflete o desfecho
    // real), mas existe UMA visita e UMA transição de stage.
    expect(a.success && b.success).toBe(true);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
    ).toBe(1);
    const historico = await prisma.propertyInterestStageHistory.findMany({
      where: {
        propertyInterestId: solicitacao.propertyInterestId!,
        organizationId: c.organization.id,
        newStage: "VISIT_SCHEDULED",
      },
    });
    expect(historico).toHaveLength(1);
  });

  test("confirmar depois de descartar é recusado", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);
    await descartar(solicitacao.id);

    const r = await confirmar(solicitacao.id);
    expect(r.success).toBe(false);
    expect(
      (await prisma.scheduledActivity.findUniqueOrThrow({
        where: { id: solicitacao.id, organizationId: c.organization.id },
      })).status
    ).toBe("CANCELLED");
  });

  test("imóvel que saiu do ar entre o pedido e a triagem não vira compromisso", async () => {
    const { c, imovel, solicitacao } = await comPedido();
    await prisma.property.update({
      where: { id: imovel.id, organizationId: c.organization.id },
      data: { status: "SOLD" },
    });
    autenticarComo(c);

    const r = await confirmar(solicitacao.id);
    expect(r.success).toBe(false);
    expect(
      (await prisma.scheduledActivity.findUniqueOrThrow({
        where: { id: solicitacao.id, organizationId: c.organization.id },
      })).status
    ).toBe("REQUESTED");
  });
});

describe("descarte", () => {
  test("REQUESTED -> CANCELLED, com cancelledAt e sem NO_SHOW", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);

    const r = await descartar(solicitacao.id);
    expect(r.success).toBe(true);

    const depois = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: solicitacao.id, organizationId: c.organization.id },
    });
    expect(depois.status).toBe("CANCELLED");
    expect(depois.cancelledAt).not.toBeNull();
    expect(depois.completedAt).toBeNull();
    expect(depois.visitOutcome).toBeNull();
  });

  test("descartada deixa de ser pendência ativa", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);
    await descartar(solicitacao.id);

    expect(await buscarAgendaSolicitacoes(c.organization.id, "America/Sao_Paulo", {})).toHaveLength(0);
    const contadores = await contarAgenda(c.organization.id, "America/Sao_Paulo", {});
    expect(contadores.solicitacoes).toBe(0);
  });

  test("o interesse da pessoa não é apagado pelo descarte", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);
    await descartar(solicitacao.id);

    const interesse = await prisma.propertyInterest.findUniqueOrThrow({
      where: { id: solicitacao.propertyInterestId!, organizationId: c.organization.id },
    });
    expect(interesse.stage).toBe("INTERESTED");
  });

  test("descartar uma visita JÁ confirmada é recusado — cancelamento é outro fluxo", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);
    await confirmar(solicitacao.id);

    const r = await descartar(solicitacao.id);
    expect(r.success).toBe(false);
    expect(
      (await prisma.scheduledActivity.findUniqueOrThrow({
        where: { id: solicitacao.id, organizationId: c.organization.id },
      })).status
    ).toBe("SCHEDULED");
  });

  test("descarte é idempotente", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);
    await descartar(solicitacao.id);
    const segunda = await descartar(solicitacao.id);
    expect(segunda.success).toBe(true);
  });
});

describe("uma solicitação não atravessa os fluxos de compromisso", () => {
  test("NUNCA recebe NO_SHOW nem resultado: concluir é recusado", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);

    const fd = new FormData();
    fd.set("resultado", "NAO_COMPARECEU");
    const r = await concluirAgendamentoVisita(solicitacao.id, ESTADO_INICIAL_ACAO, fd);
    expect(r.success).toBe(false);

    const depois = await prisma.scheduledActivity.findUniqueOrThrow({
      where: { id: solicitacao.id, organizationId: c.organization.id },
    });
    expect(depois.status).toBe("REQUESTED");
    expect(depois.visitOutcome).toBeNull();
    expect(depois.completedAt).toBeNull();
  });

  test("cancelar pela agenda é recusado enquanto for solicitação", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);

    const r = await cancelarAgendamentoVisita(solicitacao.id, ESTADO_INICIAL_ACAO, new FormData());
    expect(r.success).toBe(false);
    expect(
      (await prisma.scheduledActivity.findUniqueOrThrow({
        where: { id: solicitacao.id, organizationId: c.organization.id },
      })).status
    ).toBe("REQUESTED");
  });

  test("remarcar é recusado enquanto for solicitação", async () => {
    const { c, solicitacao } = await comPedido();
    autenticarComo(c);

    const fd = new FormData();
    fd.set("scheduledAt", new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 16));
    const r = await remarcarAgendamentoVisita(solicitacao.id, ESTADO_INICIAL_ACAO, fd);
    expect(r.success).toBe(false);
  });
});

describe("tenant e IDOR", () => {
  test("uma organização não confirma a solicitação de outra", async () => {
    const vitima = await comPedido();
    const atacante = await novoCenario();
    autenticarComo(atacante);

    const r = await confirmar(vitima.solicitacao.id);
    expect(r.success).toBe(false);
    expect(
      (await prisma.scheduledActivity.findUniqueOrThrow({
        where: { id: vitima.solicitacao.id, organizationId: vitima.c.organization.id },
      })).status
    ).toBe("REQUESTED");
  });

  test("uma organização não descarta a solicitação de outra", async () => {
    const vitima = await comPedido();
    const atacante = await novoCenario();
    autenticarComo(atacante);

    const r = await descartar(vitima.solicitacao.id);
    expect(r.success).toBe(false);
    expect(
      (await prisma.scheduledActivity.findUniqueOrThrow({
        where: { id: vitima.solicitacao.id, organizationId: vitima.c.organization.id },
      })).status
    ).toBe("REQUESTED");
  });

  test("a fila de solicitações de uma org nunca mostra a da outra", async () => {
    const a = await comPedido();
    const b = await comPedido();
    const fila = await buscarAgendaSolicitacoes(a.c.organization.id, "America/Sao_Paulo", {});
    expect(fila).toHaveLength(1);
    expect(fila.map((i) => i.id)).not.toContain(b.solicitacao.id);
  });

  test("imóvel de outra organização no formulário público não cria nada", async () => {
    const outra = await novoCenario();
    const imovelAlheio = await criarImovel({
      organizationId: outra.organization.id,
      status: "AVAILABLE",
    });
    const c = await novoCenario();

    const r = await pedir(c.organization.slug, formVisita(imovelAlheio.id));
    expect(r.sucesso).toBe(false);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
    ).toBe(0);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: outra.organization.id } })
    ).toBe(0);
  });
});

describe("idempotência do envio público", () => {
  test("o mesmo pedido enviado duas vezes seguidas cria UMA solicitação", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });

    const a = await pedir(c.organization.slug, formVisita(imovel.id));
    const b = await pedir(c.organization.slug, formVisita(imovel.id));
    expect(a.sucesso && b.sucesso).toBe(true);

    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
    ).toBe(1);
  });

  test("envios simultâneos idênticos não viram duas solicitações", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });

    const respostas = await Promise.all([
      pedir(c.organization.slug, formVisita(imovel.id)),
      pedir(c.organization.slug, formVisita(imovel.id)),
    ]);

    // Nenhuma das duas explode na cara do visitante (a corrida na
    // criação da negociação devolvia P2002 não tratado antes da Fase 56).
    expect(respostas.every((r) => r.sucesso)).toBe(true);
    // Uma pessoa, uma negociação, um pedido.
    expect(await prisma.person.count({ where: { organizationId: c.organization.id } })).toBe(1);
    expect(
      await prisma.propertyInterest.count({ where: { organizationId: c.organization.id } })
    ).toBe(1);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
    ).toBe(1);
  });

  test("outro horário é um pedido NOVO — a proteção não prende a pessoa", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });

    await pedir(c.organization.slug, formVisita(imovel.id));
    await pedir(c.organization.slug, formVisita(imovel.id, { hora: "17:00" }));

    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
    ).toBe(2);
  });

  test("depois de confirmada, o mesmo horário pedido de novo é uma solicitação nova", async () => {
    const { c, imovel, solicitacao } = await comPedido();
    autenticarComo(c);
    await confirmar(solicitacao.id);

    await pedir(c.organization.slug, formVisita(imovel.id));
    expect(
      await prisma.scheduledActivity.count({
        where: { organizationId: c.organization.id, status: "REQUESTED" },
      })
    ).toBe(1);
  });
});

describe("antiabuso do envio público", () => {
  test("honeypot preenchido não cria nada e não revela o motivo", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });

    const r = await pedir(c.organization.slug, formVisita(imovel.id, { website: "http://bot" }));
    // Sucesso silencioso de propósito: nunca ensina o bot a se adaptar.
    expect(r).toEqual({ sucesso: true });
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
    ).toBe(0);
    expect(await prisma.person.count({ where: { organizationId: c.organization.id } })).toBe(0);
  });

  test("envio rápido demais é recusado e nada é gravado", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id, status: "AVAILABLE" });

    const r = await pedir(
      c.organization.slug,
      formVisita(imovel.id, { renderizadoEm: String(Date.now()) })
    );
    expect(r.sucesso).toBe(false);
    expect(
      await prisma.scheduledActivity.count({ where: { organizationId: c.organization.id } })
    ).toBe(0);
  });
});
