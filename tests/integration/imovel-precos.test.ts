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
import { Prisma } from "@/generated/prisma/client";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import { precosDoImovel } from "@/lib/imovel-precos";

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

// Prova a cadeia inteira, não só o helper isolado:
// coluna Decimal(14,2) no Postgres -> Prisma -> DTO plain -> valor igual.
describe("Decimal do banco até o DTO da fronteira", () => {
  test("preço de venda atravessa sem perder centavos", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await prisma.property.update({
      where: { id: imovel.id, organizationId: c.organization.id },
      data: { price: "1234567.89", rentPrice: null },
    });

    const lido = await prisma.property.findUniqueOrThrow({
      where: { id: imovel.id, organizationId: c.organization.id },
      select: { price: true, rentPrice: true },
    });
    // O que o Prisma devolve é MESMO um Decimal — é isso que quebrava a
    // fronteira.
    expect(lido.price).toBeInstanceOf(Prisma.Decimal);

    const dto = precosDoImovel(lido);
    expect(dto.price).toBe(1234567.89);
    expect(dto.rentPrice).toBeNull();
    expect(typeof dto.price).toBe("number");
    expect(() => structuredClone(dto)).not.toThrow();
  });

  test("preço de locação atravessa sem perder centavos", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await prisma.property.update({
      where: { id: imovel.id, organizationId: c.organization.id },
      data: { price: null, rentPrice: "3499.90" },
    });

    const lido = await prisma.property.findUniqueOrThrow({
      where: { id: imovel.id, organizationId: c.organization.id },
      select: { price: true, rentPrice: true },
    });
    const dto = precosDoImovel(lido);
    expect(dto.price).toBeNull();
    expect(dto.rentPrice).toBe(3499.9);
  });

  test("imóvel sem preço nenhum continua sem preço — nunca R$ 0", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await prisma.property.update({
      where: { id: imovel.id, organizationId: c.organization.id },
      data: { price: null, rentPrice: null },
    });

    const lido = await prisma.property.findUniqueOrThrow({
      where: { id: imovel.id, organizationId: c.organization.id },
      select: { price: true, rentPrice: true },
    });
    expect(precosDoImovel(lido)).toEqual({ price: null, rentPrice: null });
  });

  test("o teto de Decimal(14,2) sobrevive à ida e volta pelo banco", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await prisma.property.update({
      where: { id: imovel.id, organizationId: c.organization.id },
      data: { price: "999999999999.99" },
    });

    const lido = await prisma.property.findUniqueOrThrow({
      where: { id: imovel.id, organizationId: c.organization.id },
      select: { price: true, rentPrice: true },
    });
    expect(precosDoImovel(lido).price).toBe(999999999999.99);
  });

  test("o select que alimenta a ficha do cliente produz DTO serializável", async () => {
    const c = await novoCenario();
    const pessoa = await criarPessoa({ organizationId: c.organization.id });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await prisma.property.update({
      where: { id: imovel.id, organizationId: c.organization.id },
      data: { price: "750000.50", rentPrice: "4200.25" },
    });
    await prisma.propertyInterest.create({
      data: {
        organizationId: c.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
      },
    });

    // Mesmo select da página: /app/clientes/[id] carrega property com
    // price/rentPrice para o InteresseImovelItem.
    const interesse = await prisma.propertyInterest.findFirstOrThrow({
      where: { organizationId: c.organization.id, personId: pessoa.id },
      select: {
        property: { select: { id: true, title: true, price: true, rentPrice: true, status: true } },
      },
    });

    const propriedadeParaOCliente = {
      id: interesse.property.id,
      title: interesse.property.title,
      ...precosDoImovel(interesse.property),
      status: interesse.property.status,
    };

    expect(propriedadeParaOCliente.price).toBe(750000.5);
    expect(propriedadeParaOCliente.rentPrice).toBe(4200.25);
    // O objeto inteiro que cruza a fronteira é clonável...
    expect(() => structuredClone(propriedadeParaOCliente)).not.toThrow();
    // ...enquanto o objeto CRU do Prisma não é. Este contraste é o bug.
    expect(() => structuredClone(interesse.property)).toThrow();
  });
});
