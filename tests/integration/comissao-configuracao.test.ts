import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";

// Fase 122-B (AUD-121-006) — mesmo padrão de mock de
// tests/integration/configuracoes-hero-image.test.ts.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { salvarComissaoPadrao, buscarComissaoPadrao } from "@/app/app/configuracoes/comissao-actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

function autenticarComo(cenario: Cenario, role: "OWNER" | "ADMIN" | "BROKER" | "MANAGER" = "OWNER") {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function formulario(percentual: string): FormData {
  const fd = new FormData();
  fd.set("percentualComissaoPadrao", percentual);
  return fd;
}

describe("Fase 122-B — percentual padrão de comissão por imobiliária", () => {
  let cenarioA: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("A) OWNER configura um percentual válido e a leitura devolve o mesmo valor", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA, "OWNER");

    const estado = await salvarComissaoPadrao(ESTADO_INICIAL_ACAO, formulario("6"));
    expect(estado.success).toBe(true);

    expect(await buscarComissaoPadrao(cenarioA.organization.id)).toBe(6);
  });

  test("B) BROKER (sem permissão de gestão de configurações) não consegue configurar", async () => {
    // papelAtual() revalida o papel no banco (OrganizationMember.role),
    // nunca confia no campo da sessão mockada — por isso o papel BROKER
    // precisa nascer no próprio cenário, não só no mock de auth().
    cenarioA = await criarCenario({ role: "BROKER" });
    autenticarComo(cenarioA, "BROKER");

    const estado = await salvarComissaoPadrao(ESTADO_INICIAL_ACAO, formulario("6"));
    expect(estado.success).toBe(false);

    expect(await buscarComissaoPadrao(cenarioA.organization.id)).toBeNull();
  });

  test("C) valor inválido (zero, negativo, acima de 100, três casas) é recusado e nada é gravado", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA, "OWNER");

    for (const invalido of ["0", "-5", "150", "5.123", "abc"]) {
      const estado = await salvarComissaoPadrao(ESTADO_INICIAL_ACAO, formulario(invalido));
      expect(estado.success).toBe(false);
    }
    expect(await buscarComissaoPadrao(cenarioA.organization.id)).toBeNull();
  });

  test("D) percentual vazio limpa a configuração (volta a null)", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA, "OWNER");

    await salvarComissaoPadrao(ESTADO_INICIAL_ACAO, formulario("6"));
    expect(await buscarComissaoPadrao(cenarioA.organization.id)).toBe(6);

    await salvarComissaoPadrao(ESTADO_INICIAL_ACAO, formulario(""));
    expect(await buscarComissaoPadrao(cenarioA.organization.id)).toBeNull();
  });

  test("E) isolamento multi-tenant: o padrão de uma organização nunca aparece na outra", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();

    autenticarComo(cenarioA, "OWNER");
    await salvarComissaoPadrao(ESTADO_INICIAL_ACAO, formulario("8"));

    autenticarComo(cenarioB, "OWNER");
    await salvarComissaoPadrao(ESTADO_INICIAL_ACAO, formulario("3"));

    expect(await buscarComissaoPadrao(cenarioA.organization.id)).toBe(8);
    expect(await buscarComissaoPadrao(cenarioB.organization.id)).toBe(3);
  });

  test("F) configurar o padrão nunca reescreve a comissão de negociações já fechadas", async () => {
    cenarioA = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenarioA, "OWNER");

    const imovel = await prisma.property.create({
      data: {
        organizationId: cenarioA.organization.id,
        title: "Imóvel de teste",
        type: "Apartamento",
        purpose: "SALE",
        status: "AVAILABLE",
        neighborhood: "Bairro",
        city: "Cidade",
        state: "SP",
        propertyFeatures: [],
        condoFeatures: [],
      },
    });
    const pessoa = await prisma.person.create({
      data: { organizationId: cenarioA.organization.id, name: "Cliente", roles: ["LEAD"] },
    });
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: cenarioA.organization.id,
        propertyId: imovel.id,
        personId: pessoa.id,
        stage: "WON",
        commissionValue: 12345.67,
      },
    });

    await salvarComissaoPadrao(ESTADO_INICIAL_ACAO, formulario("6"));

    const interesseDepois = await prisma.propertyInterest.findUnique({
      where: { id: interesse.id, organizationId: cenarioA.organization.id },
      select: { commissionValue: true },
    });
    expect(Number(interesseDepois?.commissionValue)).toBe(12345.67);
  });
});
