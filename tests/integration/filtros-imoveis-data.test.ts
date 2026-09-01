import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarImovel } from "@/test/fixtures";
import { buscarDadosFiltrosSemCache } from "@/lib/filtros-imoveis-data";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

describe("buscarDadosFiltrosSemCache — cidades/bairros/tipos: tenant isolation e visibilidade pública", () => {
  let cenarioA: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("cidades e bairros nunca vazam de uma organização pra outra", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    await criarImovel({
      organizationId: cenarioA.organization.id,
      city: "São Paulo",
      neighborhood: "Moema",
      status: "AVAILABLE",
    });
    await criarImovel({
      organizationId: cenarioB.organization.id,
      city: "Cidade Sigilosa De B",
      neighborhood: "Bairro Sigiloso De B",
      status: "AVAILABLE",
    });

    const dadosA = await buscarDadosFiltrosSemCache(cenarioA.organization.id);
    expect(dadosA.cidades).toContain("São Paulo");
    expect(dadosA.cidades).not.toContain("Cidade Sigilosa De B");
    expect(dadosA.bairros.map((b) => b.nome)).not.toContain("Bairro Sigiloso De B");
  });

  test("imóvel não disponível (DRAFT/INACTIVE) nunca contribui cidade/bairro pro autocomplete público", async () => {
    cenarioA = await criarCenario();
    await criarImovel({
      organizationId: cenarioA.organization.id,
      city: "Cidade Rascunho",
      neighborhood: "Bairro Rascunho",
      status: "DRAFT",
    });

    const dados = await buscarDadosFiltrosSemCache(cenarioA.organization.id);
    expect(dados.cidades).not.toContain("Cidade Rascunho");
    expect(dados.bairros.map((b) => b.nome)).not.toContain("Bairro Rascunho");
  });

  test("cada bairro é associado à cidade certa, mesmo com nomes de bairro repetidos entre cidades", async () => {
    cenarioA = await criarCenario();
    await criarImovel({
      organizationId: cenarioA.organization.id,
      city: "São Paulo",
      neighborhood: "Centro",
      status: "AVAILABLE",
    });
    await criarImovel({
      organizationId: cenarioA.organization.id,
      city: "Campinas",
      neighborhood: "Centro",
      status: "AVAILABLE",
    });

    const dados = await buscarDadosFiltrosSemCache(cenarioA.organization.id);
    const cidadesDoCentro = dados.bairros
      .filter((b) => b.nome === "Centro")
      .map((b) => b.cidade)
      .sort();
    expect(cidadesDoCentro).toEqual(["Campinas", "São Paulo"]);
    expect(dados.cidades.sort()).toEqual(["Campinas", "São Paulo"]);
  });

  test("tipos continuam corretamente agrupados por categoria (RESIDENTIAL/COMMERCIAL) do catálogo real", async () => {
    cenarioA = await criarCenario();
    await prisma.propertyTypeOption.create({
      data: { organizationId: cenarioA.organization.id, category: "COMMERCIAL", name: "Loja de Teste" },
    });
    await criarImovel({
      organizationId: cenarioA.organization.id,
      type: "Loja de Teste",
      status: "AVAILABLE",
    });

    const dados = await buscarDadosFiltrosSemCache(cenarioA.organization.id);
    const loja = dados.tipos.find((t) => t.nome === "Loja de Teste");
    expect(loja?.categoria).toBe("COMMERCIAL");
  });

  test("tipo em uso sem entrada no catálogo (ambiguidade real do domínio) aparece com categoria null, nunca quebra", async () => {
    cenarioA = await criarCenario();
    await criarImovel({
      organizationId: cenarioA.organization.id,
      type: "Tipo Sem Catálogo",
      status: "AVAILABLE",
    });

    const dados = await buscarDadosFiltrosSemCache(cenarioA.organization.id);
    const semCatalogo = dados.tipos.find((t) => t.nome === "Tipo Sem Catálogo");
    expect(semCatalogo?.categoria).toBeNull();
  });
});
