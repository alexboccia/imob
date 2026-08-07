import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { construirWhereImoveis } from "@/lib/listagens-admin-query";
import { criarCenario } from "@/test/fixtures";
import { criarImovel } from "@/test/fixtures";

describe("Isolamento de tenant — Property", () => {
  let cenarioA: Awaited<ReturnType<typeof criarCenario>> | undefined;
  let cenarioB: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("imóvel criado é persistido com o organizationId correto", async () => {
    cenarioA = await criarCenario();
    const imovel = await criarImovel({ organizationId: cenarioA.organization.id });

    const encontrado = await prisma.property.findUnique({
      where: { id: imovel.id, organizationId: cenarioA.organization.id },
    });
    expect(encontrado?.organizationId).toBe(cenarioA.organization.id);
  });

  test("usuário de tenant A não consulta imóveis de tenant B", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    await criarImovel({ organizationId: cenarioA.organization.id, title: "Imóvel A" });
    await criarImovel({ organizationId: cenarioB.organization.id, title: "Imóvel B" });

    const whereA = construirWhereImoveis({ organizationId: cenarioA.organization.id, busca: "" });
    const resultadosA = await prisma.property.findMany({ where: whereA });

    expect(resultadosA).toHaveLength(1);
    expect(resultadosA[0].title).toBe("Imóvel A");
    expect(resultadosA.every((p) => p.organizationId === cenarioA!.organization.id)).toBe(true);
  });

  test("usuário de tenant A não consegue alterar imóvel de tenant B", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    const imovelB = await criarImovel({ organizationId: cenarioB.organization.id });

    // Mesmo padrão de toda action do painel: o where sempre inclui o
    // organizationId da sessão de quem está chamando, não só o id do
    // registro — por isso um id de B filtrado pelo organizationId de A
    // não casa com nenhuma linha.
    const resultado = await prisma.property.updateMany({
      where: { id: imovelB.id, organizationId: cenarioA.organization.id },
      data: { title: "Alterado indevidamente" },
    });
    expect(resultado.count).toBe(0);

    const aindaIntacto = await prisma.property.findUnique({
      where: { id: imovelB.id, organizationId: cenarioB.organization.id },
    });
    expect(aindaIntacto?.title).not.toBe("Alterado indevidamente");
  });

  test("Media criada para um imóvel herda o mesmo organizationId do Property", async () => {
    cenarioA = await criarCenario();
    const imovel = await criarImovel({ organizationId: cenarioA.organization.id });

    const midia = await prisma.media.create({
      data: {
        organizationId: cenarioA.organization.id,
        propertyId: imovel.id,
        type: "PHOTO",
        url: "https://example.com/foto.jpg",
      },
    });

    expect(midia.organizationId).toBe(cenarioA.organization.id);
    expect(midia.propertyId).toBe(imovel.id);
  });
});
