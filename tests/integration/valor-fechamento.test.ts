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
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import { auth } from "@/lib/auth";
import {
  criarInteressePessoa,
  criarOportunidadeDoContato,
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { buscarAnalyticsComercial } from "@/lib/analytics-comercial";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return cenario;
}

const GOOGLE_ADS = {
  utmSource: "google",
  utmMedium: "cpc",
  utmCampaign: "verao-2026",
  referrerHost: "google.com",
};

function formValor(valor: string) {
  const fd = new FormData();
  fd.set("valorFechamento", valor);
  return fd;
}

const ganhar = (id: string, valor: string) =>
  marcarInteresseComoGanho(id, ESTADO_INICIAL_ACAO, formValor(valor));
const perder = (id: string) => marcarInteresseComoPerdido(id, ESTADO_INICIAL_ACAO, new FormData());

async function criarOportunidadeManual(organizationId: string, personId: string, propertyId: string) {
  const fd = new FormData();
  fd.set("propertyId", propertyId);
  await criarInteressePessoa(personId, ESTADO_INICIAL_ACAO, fd);
  const interesse = await prisma.propertyInterest.findFirstOrThrow({
    where: { organizationId, personId, propertyId },
    select: { id: true },
  });
  return interesse.id;
}

async function lerInteresse(id: string, organizationId: string) {
  return prisma.propertyInterest.findUniqueOrThrow({
    where: { id, organizationId },
    select: { stage: true, closedAt: true, closedValue: true },
  });
}

describe("fechar como GANHO exige valor", () => {
  test("grava stage, closedAt e closedValue atomicamente, com histórico", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await criarOportunidadeManual(organizationId, pessoa.id, imovel.id);

    const r = await ganhar(id, "850000.00");
    expect(r.success).toBe(true);

    const interesse = await lerInteresse(id, organizationId);
    expect(interesse.stage).toBe("WON");
    expect(interesse.closedAt).not.toBeNull();
    expect(Number(interesse.closedValue)).toBe(850000);

    // closedAt e o changedAt do histórico representam o MESMO evento.
    const historico = await prisma.propertyInterestStageHistory.findMany({
      where: { organizationId, propertyInterestId: id, newStage: "WON" },
      select: { changedAt: true },
    });
    expect(historico).toHaveLength(1);
    expect(historico[0].changedAt.getTime()).toBe(interesse.closedAt!.getTime());
  });

  test("valor ausente, zero, negativo ou inválido NÃO fecha nada", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await criarOportunidadeManual(organizationId, pessoa.id, imovel.id);

    for (const invalido of ["", "0", "0.00", "-50000", "abc", "1e999", "100.999"]) {
      const r = await marcarInteresseComoGanho(id, ESTADO_INICIAL_ACAO, formValor(invalido));
      expect(r.success, `valor "${invalido}" deveria ser recusado`).toBe(false);
    }

    // Nenhum estado parcial: continua aberto, sem closedAt e sem valor.
    const interesse = await lerInteresse(id, organizationId);
    expect(interesse.stage).toBe("INTERESTED");
    expect(interesse.closedAt).toBeNull();
    expect(interesse.closedValue).toBeNull();
  });

  test("FormData sem o campo nenhum também é recusado", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await criarOportunidadeManual(organizationId, pessoa.id, imovel.id);

    const r = await marcarInteresseComoGanho(id, ESTADO_INICIAL_ACAO, new FormData());
    expect(r.success).toBe(false);
    expect((await lerInteresse(id, organizationId)).stage).toBe("INTERESTED");
  });

  test("valor no limite é aceito; acima do teto é recusado", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovelA = await criarImovel({ organizationId });
    const imovelB = await criarImovel({ organizationId });

    const idA = await criarOportunidadeManual(organizationId, pessoa.id, imovelA.id);
    expect((await ganhar(idA, "1000000000")).success).toBe(true);

    const idB = await criarOportunidadeManual(organizationId, pessoa.id, imovelB.id);
    expect((await ganhar(idB, "1000000001")).success).toBe(false);
  });
});

describe("fechar como PERDIDO nunca grava valor", () => {
  test("REJECTED mantém closedValue null (não grava 0)", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await criarOportunidadeManual(organizationId, pessoa.id, imovel.id);

    const r = await perder(id);
    expect(r.success).toBe(true);

    const interesse = await lerInteresse(id, organizationId);
    expect(interesse.stage).toBe("REJECTED");
    expect(interesse.closedAt).not.toBeNull();
    // null = não houve valor fechado. Zero significaria "valeu nada".
    expect(interesse.closedValue).toBeNull();
  });

  test("um ganho não pode ser reaberto nem perdido depois (restrição preservada)", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await criarOportunidadeManual(organizationId, pessoa.id, imovel.id);

    await ganhar(id, "700000");
    const r = await perder(id);
    expect(r.success).toBe(false);

    const interesse = await lerInteresse(id, organizationId);
    expect(interesse.stage).toBe("WON");
    // O valor original permanece intacto.
    expect(Number(interesse.closedValue)).toBe(700000);
  });
});

describe("multi-tenant", () => {
  test("Org A não fecha nem valoriza oportunidade da Org B", async () => {
    const orgB = await novoCenario();
    const pessoaB = await criarPessoa({ organizationId: orgB.organization.id });
    const imovelB = await criarImovel({ organizationId: orgB.organization.id });
    const idB = await criarOportunidadeManual(orgB.organization.id, pessoaB.id, imovelB.id);

    // Autentica como Org A e tenta fechar o interesse da Org B.
    const orgA = await novoCenario();

    const r = await ganhar(idB, "999999");
    expect(r.success).toBe(false);

    const interesse = await lerInteresse(idB, orgB.organization.id);
    expect(interesse.stage).toBe("INTERESTED");
    expect(interesse.closedValue).toBeNull();
    expect(orgA.organization.id).not.toBe(orgB.organization.id);
  });
});

describe("analytics financeiro", () => {
  test("valor fechado e ticket médio consideram só os ganhos COM valor", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovelA = await criarImovel({ organizationId });
    const imovelB = await criarImovel({ organizationId });
    const imovelC = await criarImovel({ organizationId });

    await ganhar(await criarOportunidadeManual(organizationId, pessoa.id, imovelA.id), "500000");
    await ganhar(await criarOportunidadeManual(organizationId, pessoa.id, imovelB.id), "300000");
    // Ganho LEGADO: fechado direto no banco, sem valor (como todo WON
    // anterior a esta fase).
    const idLegado = await criarOportunidadeManual(organizationId, pessoa.id, imovelC.id);
    await prisma.propertyInterest.updateMany({
      where: { id: idLegado, organizationId },
      data: { stage: "WON", closedAt: new Date(), closedValue: null },
    });

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });

    expect(a.resultado.fechamentosGanhos).toBe(3);
    expect(a.resultado.valorFechado).toBe(800000);
    expect(a.resultado.ganhosComValor).toBe(2);
    expect(a.resultado.ganhosSemValor).toBe(1);
    // Divide por 2 (ganhos com valor), não por 3 — o legado não puxa a
    // média para baixo com um dado que não existe.
    expect(a.resultado.ticketMedio).toBe(400000);
  });

  test("só ganhos SEM valor: ticket médio null, nunca R$ 0", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await criarOportunidadeManual(organizationId, pessoa.id, imovel.id);
    await prisma.propertyInterest.updateMany({
      where: { id, organizationId },
      data: { stage: "WON", closedAt: new Date(), closedValue: null },
    });

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });
    expect(a.resultado.fechamentosGanhos).toBe(1);
    expect(a.resultado.valorFechado).toBe(0);
    expect(a.resultado.ticketMedio).toBeNull();
    expect(a.resultado.ganhosSemValor).toBe(1);
  });

  test("valor fechado é atribuído ao canal e à campanha da interação de origem", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });

    const contato = await prisma.interaction.create({
      data: {
        organizationId,
        personId: pessoa.id,
        propertyId: imovel.id,
        type: "MESSAGE",
        origin: "IMOVEL",
        ...GOOGLE_ADS,
      },
      select: { id: true },
    });
    await criarOportunidadeDoContato(contato.id, ESTADO_INICIAL_ACAO, new FormData());
    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId, sourceInteractionId: contato.id },
      select: { id: true },
    });
    await ganhar(interesse.id, "1200000");

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });

    const anuncios = a.aquisicao.canais.find((c) => c.canal === "ANUNCIOS")!;
    expect(anuncios.fechamentos).toBe(1);
    expect(anuncios.valorFechado).toBe(1200000);

    const campanha = a.aquisicao.campanhas.find((c) => c.campanha === "verao-2026")!;
    expect(campanha.valorFechado).toBe(1200000);
    expect(a.resultado.valorFechado).toBe(1200000);
  });

  test("ganho MANUAL leva o valor para Sem atribuição, sem inventar canal", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    await ganhar(await criarOportunidadeManual(organizationId, pessoa.id, imovel.id), "450000");

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });
    const sem = a.aquisicao.canais.find((c) => c.canal === "SEM_ATRIBUICAO")!;
    expect(sem.valorFechado).toBe(450000);
    expect(a.aquisicao.canais.filter((c) => c.canal !== "SEM_ATRIBUICAO")).toEqual([]);
    expect(a.resultado.valorFechado).toBe(450000);
  });

  test("perdido não entra em nenhum número financeiro", async () => {
    const cenario = await novoCenario();
    const organizationId = cenario.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    await perder(await criarOportunidadeManual(organizationId, pessoa.id, imovel.id));

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });
    expect(a.resultado.fechamentosPerdidos).toBe(1);
    expect(a.resultado.fechamentosGanhos).toBe(0);
    expect(a.resultado.valorFechado).toBe(0);
    expect(a.resultado.ticketMedio).toBeNull();
  });

  test("tenant vazio: zeros e ticket null, sem NaN", async () => {
    const cenario = await novoCenario();
    const a = await buscarAnalyticsComercial(cenario.organization.id, {
      periodo: "30d",
      agora: new Date(),
    });
    expect(a.resultado.valorFechado).toBe(0);
    expect(a.resultado.ticketMedio).toBeNull();
    expect(a.resultado.ganhosComValor).toBe(0);
    expect(a.resultado.ganhosSemValor).toBe(0);
  });
});
