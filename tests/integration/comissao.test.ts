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
  corrigirDadosFechamento,
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

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const ganhar = (id: string, valor: string, comissao?: string) =>
  marcarInteresseComoGanho(
    id,
    ESTADO_INICIAL_ACAO,
    form(comissao === undefined ? { valorFechamento: valor } : { valorFechamento: valor, valorComissao: comissao })
  );

const corrigir = (id: string, valor: string, comissao: string) =>
  corrigirDadosFechamento(id, ESTADO_INICIAL_ACAO, form({ valorFechamento: valor, valorComissao: comissao }));

async function oportunidadeManual(organizationId: string, personId: string, propertyId: string) {
  await criarInteressePessoa(personId, ESTADO_INICIAL_ACAO, form({ propertyId }));
  const i = await prisma.propertyInterest.findFirstOrThrow({
    where: { organizationId, personId, propertyId },
    select: { id: true },
  });
  return i.id;
}

async function ler(id: string, organizationId: string) {
  return prisma.propertyInterest.findUniqueOrThrow({
    where: { id, organizationId },
    select: { stage: true, closedAt: true, closedValue: true, commissionValue: true },
  });
}

describe("comissão no fechamento", () => {
  test("ganho com valor e comissão grava os dois na mesma transação", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);

    expect((await ganhar(id, "800000", "40000")).success).toBe(true);

    const i = await ler(id, organizationId);
    expect(i.stage).toBe("WON");
    expect(Number(i.closedValue)).toBe(800000);
    expect(Number(i.commissionValue)).toBe(40000);
  });

  test("comissão é OPCIONAL: ganho sem ela é registrado com commissionValue null", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);

    // Sem o campo no FormData, e com o campo vazio: os dois funcionam.
    expect((await ganhar(id, "800000")).success).toBe(true);
    const i = await ler(id, organizationId);
    expect(i.stage).toBe("WON");
    expect(Number(i.closedValue)).toBe(800000);
    // null = não registrada. Nunca 0.
    expect(i.commissionValue).toBeNull();
  });

  test("comissão zero, negativa ou mal formada bloqueia o fechamento inteiro", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);

    for (const invalida of ["0", "-100", "abc", "10.999"]) {
      const r = await ganhar(id, "800000", invalida);
      expect(r.success, `comissão "${invalida}" deveria ser recusada`).toBe(false);
    }
    // Nenhum estado parcial.
    const i = await ler(id, organizationId);
    expect(i.stage).toBe("INTERESTED");
    expect(i.closedValue).toBeNull();
    expect(i.commissionValue).toBeNull();
  });

  test("comissão maior que o valor fechado é bloqueada", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);

    const r = await ganhar(id, "100000", "150000");
    expect(r.success).toBe(false);
    expect((await ler(id, organizationId)).stage).toBe("INTERESTED");

    // Igual ao valor fechado é permitido (limite, não erro).
    expect((await ganhar(id, "100000", "100000")).success).toBe(true);
  });

  test("PERDIDO nunca grava comissão", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);

    await marcarInteresseComoPerdido(id, ESTADO_INICIAL_ACAO, new FormData());
    const i = await ler(id, organizationId);
    expect(i.stage).toBe("REJECTED");
    expect(i.closedValue).toBeNull();
    expect(i.commissionValue).toBeNull();
  });
});

describe("correção pós-fechamento", () => {
  test("corrige valor e comissão sem reabrir o pipeline nem mexer no closedAt", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);
    await ganhar(id, "800000", "40000");
    const antes = await ler(id, organizationId);

    expect((await corrigir(id, "850000", "50000")).success).toBe(true);

    const depois = await ler(id, organizationId);
    expect(Number(depois.closedValue)).toBe(850000);
    expect(Number(depois.commissionValue)).toBe(50000);
    // O negócio continua ganho e a data do evento não muda.
    expect(depois.stage).toBe("WON");
    expect(depois.closedAt!.getTime()).toBe(antes.closedAt!.getTime());
  });

  test("registra ActivityLog com de/para dos dois campos (trilha auditável)", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);
    await ganhar(id, "800000", "40000");
    await corrigir(id, "850000", "50000");

    const logs = await prisma.activityLog.findMany({
      where: { organizationId, entityId: id, action: "property_interest_closing_corrected" },
      select: { payload: true, userId: true },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].payload).toMatchObject({
      closedValueDe: 800000,
      closedValuePara: 850000,
      commissionValueDe: 40000,
      commissionValuePara: 50000,
    });
    expect(logs[0].userId).toBe(c.usuario.id);
  });

  test("permite registrar a comissão DEPOIS, num ganho que não tinha", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);
    await ganhar(id, "800000");
    expect((await ler(id, organizationId)).commissionValue).toBeNull();

    expect((await corrigir(id, "800000", "40000")).success).toBe(true);
    expect(Number((await ler(id, organizationId)).commissionValue)).toBe(40000);
  });

  test("limpar a comissão volta para null, não para zero", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);
    await ganhar(id, "800000", "40000");

    expect((await corrigir(id, "800000", "")).success).toBe(true);
    expect((await ler(id, organizationId)).commissionValue).toBeNull();
  });

  test("negócio ABERTO ou PERDIDO não pode ter valores corrigidos", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovelA = await criarImovel({ organizationId });
    const imovelB = await criarImovel({ organizationId });

    const aberto = await oportunidadeManual(organizationId, pessoa.id, imovelA.id);
    expect((await corrigir(aberto, "800000", "40000")).success).toBe(false);
    expect((await ler(aberto, organizationId)).closedValue).toBeNull();

    const perdido = await oportunidadeManual(organizationId, pessoa.id, imovelB.id);
    await marcarInteresseComoPerdido(perdido, ESTADO_INICIAL_ACAO, new FormData());
    expect((await corrigir(perdido, "800000", "40000")).success).toBe(false);
    expect((await ler(perdido, organizationId)).closedValue).toBeNull();
  });

  test("correção valida igual ao fechamento (valor obrigatório, comissão ≤ valor)", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);
    await ganhar(id, "800000", "40000");

    expect((await corrigir(id, "", "40000")).success).toBe(false);
    expect((await corrigir(id, "0", "40000")).success).toBe(false);
    expect((await corrigir(id, "100000", "150000")).success).toBe(false);

    // Nada mudou.
    const i = await ler(id, organizationId);
    expect(Number(i.closedValue)).toBe(800000);
    expect(Number(i.commissionValue)).toBe(40000);
  });

  test("Org A não corrige negócio da Org B", async () => {
    const orgB = await novoCenario();
    const pessoaB = await criarPessoa({ organizationId: orgB.organization.id });
    const imovelB = await criarImovel({ organizationId: orgB.organization.id });
    const idB = await oportunidadeManual(orgB.organization.id, pessoaB.id, imovelB.id);
    await ganhar(idB, "800000", "40000");

    // Autentica como Org A.
    await novoCenario();
    expect((await corrigir(idB, "999999", "99999")).success).toBe(false);

    const i = await ler(idB, orgB.organization.id);
    expect(Number(i.closedValue)).toBe(800000);
    expect(Number(i.commissionValue)).toBe(40000);
  });
});

describe("analytics de comissão", () => {
  test("total, média e efetiva usam só os ganhos COM comissão", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovelA = await criarImovel({ organizationId });
    const imovelB = await criarImovel({ organizationId });
    const imovelC = await criarImovel({ organizationId });

    await ganhar(await oportunidadeManual(organizationId, pessoa.id, imovelA.id), "800000", "40000");
    await ganhar(await oportunidadeManual(organizationId, pessoa.id, imovelB.id), "200000", "10000");
    // Ganho sem comissão.
    await ganhar(await oportunidadeManual(organizationId, pessoa.id, imovelC.id), "500000");

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });
    expect(a.resultado.fechamentosGanhos).toBe(3);
    expect(a.resultado.comissaoTotal).toBe(50000);
    expect(a.resultado.comissaoMedia).toBe(25000);
    expect(a.resultado.ganhosSemComissao).toBe(1);
    // 50.000 / 1.000.000 = 5% (só os dois negócios com ambos conhecidos).
    expect(a.resultado.comissaoEfetiva).toBeCloseTo(5);
  });

  test("nenhuma comissão registrada: média e efetiva null, nunca zero", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    await ganhar(await oportunidadeManual(organizationId, pessoa.id, imovel.id), "800000");

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });
    expect(a.resultado.comissaoTotal).toBe(0);
    expect(a.resultado.comissaoMedia).toBeNull();
    expect(a.resultado.comissaoEfetiva).toBeNull();
    expect(a.resultado.ganhosSemComissao).toBe(1);
  });

  test("comissão é atribuída ao canal e à campanha da interação de origem", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
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
    await ganhar(interesse.id, "1200000", "60000");

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });
    const anuncios = a.aquisicao.canais.find((x) => x.canal === "ANUNCIOS")!;
    expect(anuncios.valorFechado).toBe(1200000);
    expect(anuncios.comissao).toBe(60000);
    expect(a.aquisicao.campanhas.find((x) => x.campanha === "verao-2026")!.comissao).toBe(60000);
  });

  test("ganho manual leva a comissão para Sem atribuição, sem inventar canal", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    await ganhar(await oportunidadeManual(organizationId, pessoa.id, imovel.id), "450000", "22500");

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });
    expect(a.aquisicao.canais.find((x) => x.canal === "SEM_ATRIBUICAO")!.comissao).toBe(22500);
    expect(a.aquisicao.canais.filter((x) => x.canal !== "SEM_ATRIBUICAO")).toEqual([]);
  });

  test("legado (WON sem valor nem comissão) não é estimado", async () => {
    const c = await novoCenario();
    const organizationId = c.organization.id;
    const pessoa = await criarPessoa({ organizationId });
    const imovel = await criarImovel({ organizationId });
    const id = await oportunidadeManual(organizationId, pessoa.id, imovel.id);
    await prisma.propertyInterest.updateMany({
      where: { id, organizationId },
      data: { stage: "WON", closedAt: new Date(), closedValue: null, commissionValue: null },
    });

    const a = await buscarAnalyticsComercial(organizationId, { periodo: "30d", agora: new Date() });
    expect(a.resultado.fechamentosGanhos).toBe(1);
    expect(a.resultado.valorFechado).toBe(0);
    expect(a.resultado.comissaoTotal).toBe(0);
    expect(a.resultado.ganhosSemValor).toBe(1);
    expect(a.resultado.ganhosSemComissao).toBe(1);
    expect(a.resultado.comissaoMedia).toBeNull();
  });

  test("tenant vazio: zeros e nulls, sem NaN", async () => {
    const c = await novoCenario();
    const a = await buscarAnalyticsComercial(c.organization.id, { periodo: "30d", agora: new Date() });
    expect(a.resultado.comissaoTotal).toBe(0);
    expect(a.resultado.comissaoMedia).toBeNull();
    expect(a.resultado.comissaoEfetiva).toBeNull();
    expect(a.resultado.ganhosSemComissao).toBe(0);
  });
});
