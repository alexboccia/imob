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
import { criarCenario, criarImovel, criarPessoa } from "@/test/fixtures";
import { auth } from "@/lib/auth";
import {
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Fechar um negócio deixa TRÊS verdades consistentes
// =======================================================================
//   1. a negociação terminou;
//   2. o valor final foi preservado;
//   3. o imóvel está no estado comercial correto.
// Antes desta fase só as duas primeiras aconteciam — era possível ter
// WON com o imóvel ainda AVAILABLE, e o site seguia anunciando.

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

function autenticarComo(cenario: Cenario, sobrescrever: Record<string, unknown> = {}) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
      ...sobrescrever,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function negociacao(
  cenario: Cenario,
  opcoes: { purpose?: "SALE" | "RENT" | "SALE_AND_RENT"; status?: "AVAILABLE" | "RESERVED" } = {}
) {
  const imovel = await criarImovel({
    organizationId: cenario.organization.id,
    purpose: opcoes.purpose ?? "SALE",
    status: opcoes.status ?? "AVAILABLE",
    price: 550000,
    rentPrice: 2500,
  });
  const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
  const interesse = await prisma.propertyInterest.create({
    data: {
      organizationId: cenario.organization.id,
      personId: pessoa.id,
      propertyId: imovel.id,
      responsibleMemberId: cenario.membro.id,
      stage: "PROPOSAL",
    },
    select: { id: true },
  });
  return { imovel, pessoa, interesse };
}

function formGanho(valor: string, desfecho?: string): FormData {
  const fd = new FormData();
  fd.set("valorFechamento", valor);
  if (desfecho) fd.set("desfecho", desfecho);
  return fd;
}

function formPerda(motivo?: string): FormData {
  const fd = new FormData();
  if (motivo) fd.set("motivo", motivo);
  return fd;
}

const statusDo = async (id: string, organizationId: string) =>
  (
    await prisma.property.findFirstOrThrow({
      where: { id, organizationId },
      select: { status: true },
    })
  ).status;

describe("ganho — o imóvel sai de circulação", () => {
  test("VENDA: AVAILABLE → SOLD, com histórico e ator", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { imovel, interesse } = await negociacao(cenario, { purpose: "SALE" });

    const estado = await marcarInteresseComoGanho(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formGanho("500000")
    );
    expect(estado.success).toBe(true);

    // 1) negociação terminou · 2) valor preservado
    const fechada = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
    });
    expect(fechada.stage).toBe("WON");
    expect(Number(fechada.closedValue)).toBe(500000);
    expect(fechada.closedAt).not.toBeNull();
    expect(fechada.lostReason).toBeNull();

    // 3) imóvel no estado correto
    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("SOLD");

    const historico = await prisma.propertyStatusHistory.findMany({
      where: { propertyId: imovel.id, organizationId: cenario.organization.id },
    });
    expect(historico).toHaveLength(1);
    expect(historico[0].previousStatus).toBe("AVAILABLE");
    expect(historico[0].newStatus).toBe("SOLD");
    expect(historico[0].changedByMemberId).toBe(cenario.membro.id);
  });

  test("ALUGUEL: AVAILABLE → RENTED", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { imovel, interesse } = await negociacao(cenario, { purpose: "RENT" });

    expect(
      (await marcarInteresseComoGanho(interesse.id, ESTADO_INICIAL_ACAO, formGanho("2400")))
        .success
    ).toBe(true);
    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("RENTED");
  });

  test("VENDA E LOCAÇÃO sem escolha: recusa e NADA acontece", async () => {
    // O sistema não sabe o que aconteceu, e inventar gravaria um fato
    // comercial falso. Recusa é a resposta honesta.
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { imovel, interesse } = await negociacao(cenario, { purpose: "SALE_AND_RENT" });

    const estado = await marcarInteresseComoGanho(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formGanho("500000")
    );
    expect(estado.success).toBe(false);
    expect(estado.fieldErrors?.desfecho).toBeTruthy();

    const intacta = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
    });
    expect(intacta.stage).toBe("PROPOSAL");
    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("AVAILABLE");
  });

  test.each([
    ["SOLD", "SOLD"],
    ["RENTED", "RENTED"],
  ])("VENDA E LOCAÇÃO com escolha %s: aplica o desfecho informado", async (escolha, esperado) => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { imovel, interesse } = await negociacao(cenario, { purpose: "SALE_AND_RENT" });

    expect(
      (
        await marcarInteresseComoGanho(
          interesse.id,
          ESTADO_INICIAL_ACAO,
          formGanho("500000", escolha)
        )
      ).success
    ).toBe(true);
    expect(await statusDo(imovel.id, cenario.organization.id)).toBe(esperado);
  });

  test("imóvel JÁ fora de circulação não é sobrescrito nem ganha histórico", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { imovel, interesse } = await negociacao(cenario, { status: "RESERVED" });

    expect(
      (await marcarInteresseComoGanho(interesse.id, ESTADO_INICIAL_ACAO, formGanho("500000")))
        .success
    ).toBe(true);
    // O fato registrado antes continua valendo.
    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("RESERVED");
    expect(
      await prisma.propertyStatusHistory.count({
        where: { propertyId: imovel.id, organizationId: cenario.organization.id },
      })
    ).toBe(0);
  });

  test("fechar duas vezes é idempotente: um histórico, um status", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { imovel, interesse } = await negociacao(cenario);

    await marcarInteresseComoGanho(interesse.id, ESTADO_INICIAL_ACAO, formGanho("500000"));
    await marcarInteresseComoGanho(interesse.id, ESTADO_INICIAL_ACAO, formGanho("500000"));

    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("SOLD");
    expect(
      await prisma.propertyStatusHistory.count({
        where: { propertyId: imovel.id, organizationId: cenario.organization.id },
      })
    ).toBe(1);
    expect(
      await prisma.propertyInterestStageHistory.count({
        where: { propertyInterestId: interesse.id, organizationId: cenario.organization.id },
      })
    ).toBe(1);
  });
});

describe("perda — o imóvel continua disponível", () => {
  test("REJECTED com motivo: nada acontece com o imóvel", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { imovel, interesse } = await negociacao(cenario);

    expect(
      (await marcarInteresseComoPerdido(interesse.id, ESTADO_INICIAL_ACAO, formPerda("PRICE")))
        .success
    ).toBe(true);

    const perdida = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
    });
    expect(perdida.stage).toBe("REJECTED");
    expect(perdida.lostReason).toBe("PRICE");
    expect(perdida.closedAt).not.toBeNull();
    expect(perdida.closedValue).toBeNull();

    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("AVAILABLE");
    expect(
      await prisma.propertyStatusHistory.count({
        where: { propertyId: imovel.id, organizationId: cenario.organization.id },
      })
    ).toBe(0);
  });

  test("motivo é opcional: perder sem informar continua possível", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario);

    expect(
      (await marcarInteresseComoPerdido(interesse.id, ESTADO_INICIAL_ACAO, formPerda())).success
    ).toBe(true);
    const perdida = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
    });
    expect(perdida.lostReason).toBeNull();
  });

  test("motivo inválido não vira motivo — cai em não informado", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario);

    await marcarInteresseComoPerdido(interesse.id, ESTADO_INICIAL_ACAO, formPerda("PORQUE_SIM"));
    const perdida = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
    });
    expect(perdida.lostReason).toBeNull();
  });

  test("negócio GANHO nunca guarda motivo de perda", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario);

    // Motivo enviado junto do ganho: o servidor ignora por contradição.
    const fd = formGanho("500000");
    fd.set("motivo", "PRICE");
    await marcarInteresseComoGanho(interesse.id, ESTADO_INICIAL_ACAO, fd);

    const ganha = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
    });
    expect(ganha.stage).toBe("WON");
    expect(ganha.lostReason).toBeNull();
  });
});

describe("outras negociações do mesmo imóvel", () => {
  test("continuam abertas — o produto não fecha negócio por dedução", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      purpose: "SALE",
      price: 550000,
    });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const pessoaB = await criarPessoa({ organizationId: cenario.organization.id });
    const criar = (personId: string) =>
      prisma.propertyInterest.create({
        data: {
          organizationId: cenario.organization.id,
          personId,
          propertyId: imovel.id,
          responsibleMemberId: cenario.membro.id,
          stage: "PROPOSAL",
        },
        select: { id: true },
      });
    const vencedora = await criar(pessoaA.id);
    const outra = await criar(pessoaB.id);

    await marcarInteresseComoGanho(vencedora.id, ESTADO_INICIAL_ACAO, formGanho("500000"));

    // A outra negociação NÃO é encerrada automaticamente: a razão
    // comercial de cada uma é dela, e inventar "perdida" apagaria isso.
    const segunda = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: outra.id, organizationId: cenario.organization.id },
    });
    expect(segunda.stage).toBe("PROPOSAL");
    expect(segunda.closedAt).toBeNull();

    // Mas o contexto aparece sozinho: o imóvel está indisponível, e a
    // próxima ação comercial da segunda negociação já reflete isso
    // (obterProximaAcaoComercial, sem código novo).
    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("SOLD");
  });

  test("ganhar a segunda não sobrescreve o status já registrado", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      purpose: "SALE_AND_RENT",
      price: 550000,
      rentPrice: 2500,
    });
    const criar = async () => {
      const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
      return prisma.propertyInterest.create({
        data: {
          organizationId: cenario.organization.id,
          personId: pessoa.id,
          propertyId: imovel.id,
          responsibleMemberId: cenario.membro.id,
          stage: "PROPOSAL",
        },
        select: { id: true },
      });
    };
    const primeira = await criar();
    const segunda = await criar();

    await marcarInteresseComoGanho(primeira.id, ESTADO_INICIAL_ACAO, formGanho("500000", "SOLD"));
    await marcarInteresseComoGanho(segunda.id, ESTADO_INICIAL_ACAO, formGanho("2400", "RENTED"));

    // O primeiro fato registrado é o que vale — o WHERE do update exige
    // AVAILABLE, então a segunda não reescreve.
    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("SOLD");
    expect(
      await prisma.propertyStatusHistory.count({
        where: { propertyId: imovel.id, organizationId: cenario.organization.id },
      })
    ).toBe(1);
  });
});

describe("barreiras", () => {
  test("IDOR: negociação de outra organização não fecha nem mexe no imóvel", async () => {
    const meu = await novoCenario();
    const alheio = await novoCenario();
    const { imovel, interesse } = await negociacao(alheio);

    autenticarComo(meu);
    const estado = await marcarInteresseComoGanho(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formGanho("500000")
    );
    expect(estado.success).toBe(false);
    expect(await statusDo(imovel.id, alheio.organization.id)).toBe("AVAILABLE");
  });

  test("escopo restrito: sem vínculo, não fecha", async () => {
    const cenario = await novoCenario();
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { commercialVisibility: "RESTRICTED" },
    });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, price: 550000 });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const alheia = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        responsibleMemberId: null,
        stage: "PROPOSAL",
      },
      select: { id: true },
    });

    autenticarComo(cenario, { role: "BROKER" });
    expect(
      (await marcarInteresseComoGanho(alheia.id, ESTADO_INICIAL_ACAO, formGanho("500000"))).success
    ).toBe(false);
    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("AVAILABLE");
  });

  test("ator de outro tenant não vira autor da transição do imóvel", async () => {
    const meu = await novoCenario();
    const alheio = await novoCenario();
    const { imovel, interesse } = await negociacao(meu);

    autenticarComo(meu, { organizationMemberId: alheio.membro.id });
    await marcarInteresseComoGanho(interesse.id, ESTADO_INICIAL_ACAO, formGanho("500000"));

    const historico = await prisma.propertyStatusHistory.findFirstOrThrow({
      where: { propertyId: imovel.id, organizationId: meu.organization.id },
    });
    expect(historico.changedByMemberId).toBeNull();
    // O fato comercial acontece; só o ator falso é descartado.
    expect(await statusDo(imovel.id, meu.organization.id)).toBe("SOLD");
  });
});

describe("atomicidade", () => {
  test("valor inválido derruba tudo: nem negociação nem imóvel mudam", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { imovel, interesse } = await negociacao(cenario);

    const estado = await marcarInteresseComoGanho(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formGanho("0")
    );
    expect(estado.success).toBe(false);

    const intacta = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
    });
    expect(intacta.stage).toBe("PROPOSAL");
    expect(intacta.closedAt).toBeNull();
    expect(await statusDo(imovel.id, cenario.organization.id)).toBe("AVAILABLE");
    expect(
      await prisma.propertyStatusHistory.count({
        where: { propertyId: imovel.id, organizationId: cenario.organization.id },
      })
    ).toBe(0);
  });
});
