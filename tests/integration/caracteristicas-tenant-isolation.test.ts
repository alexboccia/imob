import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";

// Redesenho de Características — mesmo padrão de
// tests/integration/tenant-isolation.test.ts (Property), aplicado a
// FeatureOption. Testa a query real (id + organizationId no where), o
// mesmo mecanismo já usado por criarCaracteristica/removerCaracteristica
// em src/app/app/caracteristicas/actions.ts (arquivo inalterado nesta
// tarefa) — não invoca a Server Action diretamente (exigiria mockar
// auth()), testa o padrão de isolamento que ela usa.
describe("Isolamento de tenant — FeatureOption", () => {
  let cenarioA: Awaited<ReturnType<typeof criarCenario>> | undefined;
  let cenarioB: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("característica criada é persistida com o organizationId correto", async () => {
    cenarioA = await criarCenario();
    const caracteristica = await prisma.featureOption.create({
      data: { organizationId: cenarioA.organization.id, category: "PROPERTY", name: "Aceita pet" },
    });

    const encontrada = await prisma.featureOption.findUnique({
      where: { id: caracteristica.id, organizationId: cenarioA.organization.id },
    });
    expect(encontrada?.organizationId).toBe(cenarioA.organization.id);
  });

  test("listagem de tenant A não inclui características de tenant B", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    await prisma.featureOption.create({
      data: { organizationId: cenarioA.organization.id, category: "PROPERTY", name: "Característica A" },
    });
    await prisma.featureOption.create({
      data: { organizationId: cenarioB.organization.id, category: "PROPERTY", name: "Característica B" },
    });

    const resultadosA = await prisma.featureOption.findMany({
      where: { organizationId: cenarioA.organization.id },
    });

    expect(resultadosA).toHaveLength(1);
    expect(resultadosA[0].name).toBe("Característica A");
    expect(resultadosA.every((f) => f.organizationId === cenarioA!.organization.id)).toBe(true);
  });

  // Mesmo mecanismo de removerCaracteristica: delete/deleteMany com
  // organizationId da SESSÃO chamadora no where, nunca só o id vindo do
  // cliente — um id de B filtrado pelo organizationId de A não casa com
  // nenhuma linha.
  test("tenant A não consegue remover característica de tenant B", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    const caracteristicaB = await prisma.featureOption.create({
      data: { organizationId: cenarioB.organization.id, category: "CONDO", name: "Portaria 24 horas" },
    });

    const resultado = await prisma.featureOption.deleteMany({
      where: { id: caracteristicaB.id, organizationId: cenarioA.organization.id },
    });
    expect(resultado.count).toBe(0);

    const aindaExiste = await prisma.featureOption.findUnique({
      where: { id: caracteristicaB.id, organizationId: cenarioB.organization.id },
    });
    expect(aindaExiste).not.toBeNull();
    expect(aindaExiste?.name).toBe("Portaria 24 horas");
  });

  // Regra crítica do domínio (ver actions.ts/page.tsx): remover uma
  // FeatureOption é uma operação isolada, sem relação (FK) com Property —
  // Property.propertyFeatures/condoFeatures são String[] simples,
  // copiados por valor no momento do cadastro, não uma referência viva ao
  // catálogo. Remover a opção administrativa não pode alterar um imóvel
  // que já a possui.
  test("remover a opção administrativa não altera propertyFeatures de um imóvel que já a possui", async () => {
    cenarioA = await criarCenario();
    const caracteristica = await prisma.featureOption.create({
      data: { organizationId: cenarioA.organization.id, category: "PROPERTY", name: "Aceita pet" },
    });
    const imovel = await prisma.property.create({
      data: {
        organizationId: cenarioA.organization.id,
        title: "Imóvel com característica",
        type: "Apartamento",
        purpose: "SALE",
        status: "AVAILABLE",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        propertyFeatures: ["Aceita pet"],
      },
    });

    await prisma.featureOption.delete({
      where: { id: caracteristica.id, organizationId: cenarioA.organization.id },
    });

    const imovelDepois = await prisma.property.findUnique({
      where: { id: imovel.id, organizationId: cenarioA.organization.id },
    });
    expect(imovelDepois?.propertyFeatures).toEqual(["Aceita pet"]);

    const opcaoAindaListada = await prisma.featureOption.findFirst({
      where: { organizationId: cenarioA.organization.id, category: "PROPERTY", name: "Aceita pet" },
    });
    expect(opcaoAindaListada).toBeNull();

    await prisma.property.delete({ where: { id: imovel.id, organizationId: cenarioA.organization.id } });
  });
});
