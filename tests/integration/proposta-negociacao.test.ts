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
import { registrarProposta } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Negociação de valores — a memória que faltava
// =======================================================================
// Antes: "está em PROPOSTA". Depois: "cliente ofereceu X, proprietário
// respondeu Y". Estes testes provam o fato gravado, a sequência, a
// transição de etapa e as barreiras.

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

function formulario(lado: string, valor: string): FormData {
  const fd = new FormData();
  fd.set("lado", lado);
  fd.set("valor", valor);
  return fd;
}

async function negociacao(
  cenario: Cenario,
  opcoes: { stage?: "INTERESTED" | "VISITED" | "PROPOSAL" | "WON" | "REJECTED"; purpose?: "SALE" | "RENT" } = {}
) {
  const imovel = await criarImovel({
    organizationId: cenario.organization.id,
    purpose: opcoes.purpose ?? "SALE",
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
      stage: opcoes.stage ?? "VISITED",
      ...(opcoes.stage === "WON" || opcoes.stage === "REJECTED" ? { closedAt: new Date() } : {}),
    },
    select: { id: true, personId: true, propertyId: true },
  });
  return { imovel, pessoa, interesse };
}

describe("registrarProposta", () => {
  test("grava o fato: valor, lado e autoria — que não são a mesma coisa", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario);

    const estado = await registrarProposta(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formulario("CLIENT", "480000")
    );
    expect(estado.success).toBe(true);

    const proposta = await prisma.propertyInterestOffer.findFirstOrThrow({
      where: { propertyInterestId: interesse.id },
    });
    expect(Number(proposta.amount)).toBe(480000);
    // QUEM PROPÔS: o cliente.
    expect(proposta.side).toBe("CLIENT");
    // QUEM REGISTROU: o corretor logado. São conceitos diferentes.
    expect(proposta.createdByMemberId).toBe(cenario.membro.id);
  });

  test("a primeira proposta leva a negociação para PROPOSTA, com histórico e ator", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario, { stage: "VISITED" });

    await registrarProposta(interesse.id, ESTADO_INICIAL_ACAO, formulario("CLIENT", "480000"));

    const atualizado = await prisma.propertyInterest.findFirstOrThrow({
      where: { id: interesse.id, organizationId: cenario.organization.id },
      select: { stage: true },
    });
    expect(atualizado.stage).toBe("PROPOSAL");

    const historico = await prisma.propertyInterestStageHistory.findMany({
      where: { propertyInterestId: interesse.id, organizationId: cenario.organization.id },
    });
    expect(historico).toHaveLength(1);
    expect(historico[0].previousStage).toBe("VISITED");
    expect(historico[0].newStage).toBe("PROPOSAL");
    expect(historico[0].changedByMemberId).toBe(cenario.membro.id);
  });

  test("contraproposta NÃO gera histórico de etapa redundante", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario, { stage: "PROPOSAL" });

    await registrarProposta(interesse.id, ESTADO_INICIAL_ACAO, formulario("CLIENT", "480000"));
    await registrarProposta(interesse.id, ESTADO_INICIAL_ACAO, formulario("OWNER", "510000"));

    // A etapa não mudou: não há transição para registrar.
    expect(
      await prisma.propertyInterestStageHistory.count({
        where: { propertyInterestId: interesse.id, organizationId: cenario.organization.id },
      })
    ).toBe(0);
    expect(
      await prisma.propertyInterestOffer.count({ where: { propertyInterestId: interesse.id } })
    ).toBe(2);
  });

  test("a sequência conta a história: cliente → proprietário → cliente", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario);

    await registrarProposta(interesse.id, ESTADO_INICIAL_ACAO, formulario("CLIENT", "480000"));
    await registrarProposta(interesse.id, ESTADO_INICIAL_ACAO, formulario("OWNER", "510000"));
    await registrarProposta(interesse.id, ESTADO_INICIAL_ACAO, formulario("CLIENT", "500000"));

    const propostas = await prisma.propertyInterestOffer.findMany({
      where: { propertyInterestId: interesse.id },
      orderBy: { offeredAt: "asc" },
      select: { amount: true, side: true },
    });
    expect(propostas.map((p) => [p.side, Number(p.amount)])).toEqual([
      ["CLIENT", 480000],
      ["OWNER", 510000],
      ["CLIENT", 500000],
    ]);
  });

  test("funciona para ALUGUEL, não só para venda", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario, { purpose: "RENT" });

    const estado = await registrarProposta(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formulario("CLIENT", "2300")
    );
    expect(estado.success).toBe(true);
    const proposta = await prisma.propertyInterestOffer.findFirstOrThrow({
      where: { propertyInterestId: interesse.id },
    });
    expect(Number(proposta.amount)).toBe(2300);
  });

  test.each([
    ["zero", "0"],
    ["negativo", "-100"],
    ["vazio", ""],
    ["texto", "abc"],
    ["três casas", "100.999"],
  ])("valor %s é recusado e nada é gravado", async (_nome, valor) => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario);

    const estado = await registrarProposta(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formulario("CLIENT", valor)
    );
    expect(estado.success).toBe(false);
    expect(estado.fieldErrors?.valor).toBeTruthy();
    expect(
      await prisma.propertyInterestOffer.count({ where: { propertyInterestId: interesse.id } })
    ).toBe(0);
  });

  test("lado inválido é recusado", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario);

    const estado = await registrarProposta(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formulario("BANCO", "480000")
    );
    expect(estado.success).toBe(false);
    expect(estado.fieldErrors?.lado).toBeTruthy();
  });

  test.each(["WON", "REJECTED"] as const)(
    "negociação %s não recebe proposta nova",
    async (stage) => {
      const cenario = await novoCenario();
      autenticarComo(cenario);
      const { interesse } = await negociacao(cenario, { stage });

      const estado = await registrarProposta(
        interesse.id,
        ESTADO_INICIAL_ACAO,
        formulario("CLIENT", "480000")
      );
      expect(estado.success).toBe(false);
      expect(
        await prisma.propertyInterestOffer.count({ where: { propertyInterestId: interesse.id } })
      ).toBe(0);
    }
  );

  test("negociação inexistente: recusa genérica", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const estado = await registrarProposta(
      "cmzzzzzzzzzzzzzzzzzzzzzzz",
      ESTADO_INICIAL_ACAO,
      formulario("CLIENT", "480000")
    );
    expect(estado.success).toBe(false);
  });

  test("IDOR: negociação de outra organização não recebe proposta", async () => {
    const meu = await novoCenario();
    const alheio = await novoCenario();
    const { interesse: alheia } = await negociacao(alheio);

    autenticarComo(meu);
    const estado = await registrarProposta(
      alheia.id,
      ESTADO_INICIAL_ACAO,
      formulario("CLIENT", "480000")
    );
    expect(estado.success).toBe(false);
    expect(
      await prisma.propertyInterestOffer.count({ where: { propertyInterestId: alheia.id } })
    ).toBe(0);
  });

  test("escopo restrito: sem vínculo com a negociação, não registra", async () => {
    const cenario = await novoCenario();
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { commercialVisibility: "RESTRICTED" },
    });
    // Negociação de OUTRO responsável.
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const alheia = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        responsibleMemberId: null,
        stage: "VISITED",
      },
      select: { id: true },
    });

    autenticarComo(cenario, { role: "BROKER" });
    const estado = await registrarProposta(
      alheia.id,
      ESTADO_INICIAL_ACAO,
      formulario("CLIENT", "480000")
    );
    expect(estado.success).toBe(false);
    expect(
      await prisma.propertyInterestOffer.count({ where: { propertyInterestId: alheia.id } })
    ).toBe(0);
  });

  test("autoria falsa de outro tenant não vira autoria", async () => {
    const meu = await novoCenario();
    const alheio = await novoCenario();
    const { interesse } = await negociacao(meu);

    autenticarComo(meu, { organizationMemberId: alheio.membro.id });
    const estado = await registrarProposta(
      interesse.id,
      ESTADO_INICIAL_ACAO,
      formulario("CLIENT", "480000")
    );
    // O fato comercial é preservado; o ator inválido vira null.
    expect(estado.success).toBe(true);
    const proposta = await prisma.propertyInterestOffer.findFirstOrThrow({
      where: { propertyInterestId: interesse.id },
    });
    expect(proposta.createdByMemberId).toBeNull();
  });

  test("duas propostas seguidas são legítimas e ambas ficam", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const { interesse } = await negociacao(cenario);

    await Promise.all([
      registrarProposta(interesse.id, ESTADO_INICIAL_ACAO, formulario("CLIENT", "480000")),
      registrarProposta(interesse.id, ESTADO_INICIAL_ACAO, formulario("CLIENT", "490000")),
    ]);

    expect(
      await prisma.propertyInterestOffer.count({ where: { propertyInterestId: interesse.id } })
    ).toBe(2);
  });
});
