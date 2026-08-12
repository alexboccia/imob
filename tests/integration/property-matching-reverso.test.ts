import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import type { Prisma } from "@/generated/prisma/client";
import { buscarClientesCompativeis, buscarImoveisCompativeis } from "@/lib/property-matching";

// Fase F do CRM — matching reverso Imóvel → Clientes compatíveis.
// buscarClientesCompativeis reusa calcularCompatibilidade sem nenhuma
// alteração (auditado e confirmado na autorização da Fase F) — por isso
// este arquivo testa a ORQUESTRAÇÃO nova (tenant-scoping, batch queries,
// threshold, ordenação, PropertyInterest, estados vazios), não a
// matemática do score em si, já exaustivamente coberta em
// property-matching.test.ts (Fase E) contra a mesma função pura.

describe("buscarClientesCompativeis — matching reverso (Prisma + tenant + entitlement)", () => {
  type Cenario = Awaited<ReturnType<typeof criarCenario>>;
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  // Gera uma lista de 100 features desejadas que produz exatamente `pct`%
  // de match contra um Property cujo propertyFeatures seja
  // UNIVERSO_FEATURES_IMOVEL (abaixo): `pct` features reais (presentes no
  // imóvel) + (100-pct) features fake (nunca presentes) — diferente da
  // Fase E, aqui o Property é FIXO (um só, o imóvel aberto) e quem varia
  // é a preferência de cada cliente, então não dá pra controlar o
  // percentual variando o lado do imóvel (como property-matching.test.ts
  // faz) — precisa variar quantas das features desejadas realmente
  // existem no imóvel fixo.
  function desiredFeaturesParaPercentual(pct: number, prefixoUnico: string): string[] {
    const reais = Array.from({ length: pct }, (_, i) => `real-${i}`);
    const fake = Array.from({ length: 100 - pct }, (_, i) => `fake-${prefixoUnico}-${i}`);
    return [...reais, ...fake];
  }
  const UNIVERSO_FEATURES_IMOVEL = Array.from({ length: 100 }, (_, i) => `real-${i}`);

  async function criarPreferencia(
    personId: string,
    organizationId: string,
    overrides: Omit<Prisma.PersonPreferenceUncheckedCreateInput, "personId" | "organizationId"> = {}
  ) {
    return prisma.personPreference.create({
      data: { personId, organizationId, ...overrides },
    });
  }

  test("A) Property da mesma org + PersonPreference compatível aparece", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id, name: "João Silva" });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa.id, cenario.organization.id);

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);

    expect(resultado.recomendacoes.map((r) => r.person.id)).toContain(pessoa.id);
    expect(resultado.recomendacoes.find((r) => r.person.id === pessoa.id)?.person.name).toBe("João Silva");
  });

  test("B) Property de outra organização não pode ser usado", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovelDeB = await criarImovel({ organizationId: cenarioB.organization.id });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa.id, cenario.organization.id);

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovelDeB.id);

    expect(resultado).toEqual({ totalPreferenciasNaOrganizacao: 0, recomendacoes: [] });
  });

  test("C) Preference de outra organização nunca aparece", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
    await criarPreferencia(pessoaDeB.id, cenarioB.organization.id);

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);

    expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoaDeB.id);
  });

  test("D) PersonPreference apontando pra Person de outra organização (inconsistência histórica) nunca aparece", async () => {
    // Simula exatamente o cenário que o comentário do schema documenta:
    // sem FK composta (personId, organizationId), nada no banco impede
    // uma PersonPreference com organizationId=A referenciando um personId
    // que pertence à organização B. A defesa em profundidade (filtro
    // explícito person.organizationId === organizationId dentro de
    // buscarClientesCompativeis) precisa pegar isso mesmo assim.
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
    // Inserção direta, fora do fluxo normal da aplicação — organizationId
    // da preferência é A, mas o Person referenciado é de B.
    await prisma.personPreference.create({
      data: { personId: pessoaDeB.id, organizationId: cenario.organization.id },
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);

    expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoaDeB.id);

    // Limpeza manual: essa PersonPreference "rogue" tem organizationId=A
    // mas referencia um Person de B — limparOrganizacao(A) não a alcança
    // (só cascateia via Person, e o Person dela pertence a B), o que
    // bloquearia o DELETE da Organization A por FK. Apagar aqui antes do
    // afterEach padrão rodar.
    await prisma.personPreference.delete({
      where: { personId: pessoaDeB.id, organizationId: cenario.organization.id },
    });
  });

  test("E) Property com status diferente de AVAILABLE ainda retorna clientes compatíveis (decisão documentada — status nunca foi hard filter do algoritmo)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "SOLD" });
    await criarPreferencia(pessoa.id, cenario.organization.id);

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);

    expect(resultado.recomendacoes.map((r) => r.person.id)).toContain(pessoa.id);
  });

  test("F) SALE preference x SALE property aparece", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "SALE" });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).toContain(pessoa.id);
  });

  test("G) SALE preference x SALE_AND_RENT property aparece", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE_AND_RENT" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "SALE" });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).toContain(pessoa.id);
  });

  test("H) SALE preference x RENT property é excluído", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "RENT" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "SALE" });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoa.id);
  });

  test("I) RENT preference x RENT property aparece", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "RENT" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "RENT" });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).toContain(pessoa.id);
  });

  test("J) RENT preference x SALE_AND_RENT property aparece", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE_AND_RENT" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "RENT" });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).toContain(pessoa.id);
  });

  test("K) RENT preference x SALE property é excluído", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "RENT" });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoa.id);
  });

  test("L) minPrice=0 continua sendo valor válido e ativa o filtro corretamente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE", price: 50 });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "SALE", minPrice: 0 });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).toContain(pessoa.id);
  });

  test("M) maxPrice=0 continua sendo valor válido", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelDentro = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE", price: 0 });
    const imovelFora = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE", price: 1 });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "SALE", maxPrice: 0 });

    const resultadoDentro = await buscarClientesCompativeis(cenario.organization.id, imovelDentro.id);
    const resultadoFora = await buscarClientesCompativeis(cenario.organization.id, imovelFora.id);
    expect(resultadoDentro.recomendacoes.map((r) => r.person.id)).toContain(pessoa.id);
    expect(resultadoFora.recomendacoes.map((r) => r.person.id)).not.toContain(pessoa.id);
  });

  test("N) preço do imóvel fora do intervalo desejado é excluído", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE", price: 900000 });
    await criarPreferencia(pessoa.id, cenario.organization.id, {
      transactionType: "SALE",
      minPrice: 400000,
      maxPrice: 600000,
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoa.id);
  });

  test("O) preço do imóvel NULL com hard filter de preço ativo é excluído (não neutro)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE", price: null });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "SALE", minPrice: 100000 });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoa.id);
  });

  test("P) tipo compatível", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, type: "Apartamento" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { propertyTypes: ["Apartamento", "Casa"] });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).toContain(pessoa.id);
  });

  test("Q) tipo incompatível é excluído", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, type: "Terreno" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { propertyTypes: ["Apartamento", "Casa"] });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoa.id);
  });

  test("R) city compatível conta como soft criterion", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, city: "São Paulo" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { cities: ["São Paulo"] });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const item = resultado.recomendacoes.find((r) => r.person.id === pessoa.id);
    expect(item).toBeDefined();
    expect(item?.score).toBe(100);
  });

  test("S) neighborhood compatível conta como soft criterion", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, neighborhood: "Vila Mariana" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { neighborhoods: ["Vila Mariana"] });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const item = resultado.recomendacoes.find((r) => r.person.id === pessoa.id);
    expect(item?.score).toBe(100);
  });

  test("T) bedrooms — mínimo desejado atendido", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, bedrooms: 3 });
    await criarPreferencia(pessoa.id, cenario.organization.id, { minBedrooms: 2 });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.find((r) => r.person.id === pessoa.id)?.score).toBe(100);
  });

  test("U) bathrooms — mínimo desejado atendido", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, bathrooms: 2 });
    await criarPreferencia(pessoa.id, cenario.organization.id, { minBathrooms: 2 });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.find((r) => r.person.id === pessoa.id)?.score).toBe(100);
  });

  test("V) parkingSpots — mínimo desejado atendido", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, parkingSpots: 2 });
    await criarPreferencia(pessoa.id, cenario.organization.id, { minParkingSpots: 1 });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.find((r) => r.person.id === pessoa.id)?.score).toBe(100);
  });

  test("W) area — dentro da faixa desejada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, privateArea: 80 });
    await criarPreferencia(pessoa.id, cenario.organization.id, { minArea: 70, maxArea: 100 });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.find((r) => r.person.id === pessoa.id)?.score).toBe(100);
  });

  test("X) propertyFeatures — match proporcional (não booleano)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      propertyFeatures: ["piscina", "varanda"],
    });
    await criarPreferencia(pessoa.id, cenario.organization.id, {
      desiredPropertyFeatures: ["piscina", "varanda", "churrasqueira", "academia"],
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const item = resultado.recomendacoes.find((r) => r.person.id === pessoa.id);
    expect(item?.score).toBe(50); // 2 de 4 = 50%, único critério ativo
  });

  test("Y) condoFeatures — match proporcional (não booleano)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      condoFeatures: ["piscina"],
    });
    await criarPreferencia(pessoa.id, cenario.organization.id, {
      desiredCondoFeatures: ["piscina", "academia"],
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const item = resultado.recomendacoes.find((r) => r.person.id === pessoa.id);
    expect(item?.score).toBe(50);
  });

  test("Z) dado NULL no Property fica neutro no soft criterion (não vira incompatibilidade)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      city: "São Paulo",
      bedrooms: null,
    });
    await criarPreferencia(pessoa.id, cenario.organization.id, { cities: ["São Paulo"], minBedrooms: 3 });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const item = resultado.recomendacoes.find((r) => r.person.id === pessoa.id);
    // bedrooms fica inativo (Property NULL) — só city conta, e bateu 100%.
    expect(item?.score).toBe(100);
  });

  test("AA) soft criterion ausente na preferência fica inativo", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, city: "São Paulo" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { cities: ["São Paulo"] }); // resto ausente

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.find((r) => r.person.id === pessoa.id)?.score).toBe(100);
  });

  test("AB) zero soft criteria — score interno 100 e activeSoftCriteriaCount=0", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE" });
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "SALE" }); // só hard filter

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const item = resultado.recomendacoes.find((r) => r.person.id === pessoa.id);
    expect(item?.score).toBe(100);
    expect(item?.activeSoftCriteriaCount).toBe(0);
  });

  test("AC) score real fracionário (49.6%) arredonda pra 50 e entra no threshold", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const desejadas = Array.from({ length: 25 }, (_, i) => `feature-${i}`);
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      bathrooms: 1,
      propertyFeatures: desejadas.slice(0, 4),
    });
    // bathrooms (peso 10, bate) + propertyFeatures (peso 15, 4/25=16%) —
    // únicos dois ativos: (10 + 15*0.16)/25 = 49.6% exato antes do round.
    await criarPreferencia(pessoa.id, cenario.organization.id, {
      minBathrooms: 1,
      desiredPropertyFeatures: desejadas,
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const item = resultado.recomendacoes.find((r) => r.person.id === pessoa.id);
    expect(item?.score).toBe(50);
  });

  test("AD) score abaixo de 50 é excluído", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const desejadas = Array.from({ length: 100 }, (_, i) => `feature-${i}`);
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      propertyFeatures: desejadas.slice(0, 49),
    });
    await criarPreferencia(pessoa.id, cenario.organization.id, { desiredPropertyFeatures: desejadas });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoa.id);
  });

  test("AE) ordenação por score decrescente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      propertyFeatures: UNIVERSO_FEATURES_IMOVEL,
    });

    const alto = await criarPessoa({ organizationId: cenario.organization.id, name: "Alto" });
    const medio = await criarPessoa({ organizationId: cenario.organization.id, name: "Medio" });
    const baixo = await criarPessoa({ organizationId: cenario.organization.id, name: "Baixo" });
    await criarPreferencia(alto.id, cenario.organization.id, {
      desiredPropertyFeatures: desiredFeaturesParaPercentual(100, "alto"),
    });
    await criarPreferencia(medio.id, cenario.organization.id, {
      desiredPropertyFeatures: desiredFeaturesParaPercentual(80, "medio"),
    });
    await criarPreferencia(baixo.id, cenario.organization.id, {
      desiredPropertyFeatures: desiredFeaturesParaPercentual(60, "baixo"),
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).toEqual([alto.id, medio.id, baixo.id]);
    expect(resultado.recomendacoes.map((r) => r.score)).toEqual([100, 80, 60]);
  });

  test("AF) empate de score desempata por PersonPreference.updatedAt DESC", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const antigo = await criarPessoa({ organizationId: cenario.organization.id });
    const recente = await criarPessoa({ organizationId: cenario.organization.id });
    await criarPreferencia(antigo.id, cenario.organization.id); // ambos score 100 (neutro)
    await criarPreferencia(recente.id, cenario.organization.id);

    await prisma.personPreference.update({
      where: { personId: antigo.id, organizationId: cenario.organization.id },
      data: { updatedAt: new Date("2020-01-01T00:00:00Z") },
    });
    await prisma.personPreference.update({
      where: { personId: recente.id, organizationId: cenario.organization.id },
      data: { updatedAt: new Date("2025-01-01T00:00:00Z") },
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.person.id)).toEqual([recente.id, antigo.id]);
  });

  test("AG) novo empate (score e updatedAt iguais) desempata por Person.id ASC", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoa1 = await criarPessoa({ organizationId: cenario.organization.id });
    const pessoa2 = await criarPessoa({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa1.id, cenario.organization.id);
    await criarPreferencia(pessoa2.id, cenario.organization.id);

    const mesmoInstante = new Date("2024-06-01T00:00:00Z");
    await prisma.personPreference.update({
      where: { personId: pessoa1.id, organizationId: cenario.organization.id },
      data: { updatedAt: mesmoInstante },
    });
    await prisma.personPreference.update({
      where: { personId: pessoa2.id, organizationId: cenario.organization.id },
      data: { updatedAt: mesmoInstante },
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const esperado = [pessoa1.id, pessoa2.id].sort();
    expect(resultado.recomendacoes.map((r) => r.person.id)).toEqual(esperado);
  });

  test("AH) top 5 corta só depois de calcular o score de todos os candidatos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      propertyFeatures: UNIVERSO_FEATURES_IMOVEL,
    });
    const percentuais = [100, 90, 80, 70, 60, 50];
    const pessoas = await Promise.all(
      percentuais.map((_, i) => criarPessoa({ organizationId: cenario!.organization.id, name: `Pessoa ${i}` }))
    );
    await Promise.all(
      pessoas.map((p, i) =>
        criarPreferencia(p.id, cenario!.organization.id, {
          desiredPropertyFeatures: desiredFeaturesParaPercentual(percentuais[i], `ah-${i}`),
        })
      )
    );

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);

    expect(resultado.recomendacoes).toHaveLength(5);
    expect(resultado.recomendacoes.map((r) => r.score)).toEqual([100, 90, 80, 70, 60]);
    expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoas[5].id);
  });

  test("AI) sem take prematuro — todos os candidatos são avaliados antes do corte de quantidade", async () => {
    // Mesmo cenário de AH: se houvesse um `take` prematuro na query de
    // PersonPreference, o 6º candidato (score 50, pior dos 6) poderia
    // nunca ter sido avaliado — o teste AH já prova que ele É avaliado
    // (aparece implicitamente no cálculo, só não sobrevive ao slice).
    // Aqui confirmamos explicitamente que aumentar pra 7 candidatos ainda
    // resulta nos 5 melhores corretos, não nos "5 primeiros da query".
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      propertyFeatures: UNIVERSO_FEATURES_IMOVEL,
    });
    // Ordem de criação propositalmente INVERSA ao ranking esperado —
    // se houvesse take/slice antes do sort, os primeiros criados (score
    // baixo) apareceriam em vez dos melhores.
    const percentuaisEmOrdemCriacao = [50, 55, 60, 100, 90, 80, 70];
    const pessoas = await Promise.all(
      percentuaisEmOrdemCriacao.map((_, i) =>
        criarPessoa({ organizationId: cenario!.organization.id, name: `Pessoa ${i}` })
      )
    );
    await Promise.all(
      pessoas.map((p, i) =>
        criarPreferencia(p.id, cenario!.organization.id, {
          desiredPropertyFeatures: desiredFeaturesParaPercentual(percentuaisEmOrdemCriacao[i], `ai-${i}`),
        })
      )
    );

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.recomendacoes.map((r) => r.score)).toEqual([100, 90, 80, 70, 60]);
  });

  test("AJ) PropertyInterest existente aparece no resultado com stage e favorited corretos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa.id, cenario.organization.id);
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "PROPOSAL",
        favorited: true,
      },
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const item = resultado.recomendacoes.find((r) => r.person.id === pessoa.id);
    expect(item?.existingInterest).toEqual({ id: interesse.id, stage: "PROPOSAL", favorited: true });
  });

  test("AK) favorited é apenas informativo — não altera o score", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const desejadas = Array.from({ length: 100 }, (_, i) => `feature-${i}`);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, propertyFeatures: desejadas.slice(0, 70) });
    await criarPreferencia(pessoa.id, cenario.organization.id, { desiredPropertyFeatures: desejadas });

    const antes = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const scoreAntes = antes.recomendacoes.find((r) => r.person.id === pessoa.id)?.score;

    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, favorited: true },
    });

    const depois = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const scoreDepois = depois.recomendacoes.find((r) => r.person.id === pessoa.id)?.score;

    expect(scoreDepois).toBe(scoreAntes);
    expect(scoreAntes).toBe(70);
  });

  test("AL) matching não cria PropertyInterest", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa.id, cenario.organization.id);

    await buscarClientesCompativeis(cenario.organization.id, imovel.id);

    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("AM) matching não cria ActivityLog", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa.id, cenario.organization.id);

    await buscarClientesCompativeis(cenario.organization.id, imovel.id);

    const total = await prisma.activityLog.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("AN) matching não cria Interaction", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa.id, cenario.organization.id);

    await buscarClientesCompativeis(cenario.organization.id, imovel.id);

    const total = await prisma.interaction.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("AO) duas execuções seguidas continuam sem nenhuma escrita", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa.id, cenario.organization.id);

    await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    await buscarClientesCompativeis(cenario.organization.id, imovel.id); // "reload"

    const totalInteresse = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    const totalLog = await prisma.activityLog.count({ where: { organizationId: cenario.organization.id } });
    const totalInteracao = await prisma.interaction.count({ where: { organizationId: cenario.organization.id } });
    expect(totalInteresse).toBe(0);
    expect(totalLog).toBe(0);
    expect(totalInteracao).toBe(0);
  });

  test("AP/BN) sem entitlement do módulo CRM, não recomenda nada", async () => {
    // criarCenario() sem "crm" — default é ["core","properties"].
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa.id, cenario.organization.id);

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado).toEqual({ totalPreferenciasNaOrganizacao: 0, recomendacoes: [] });
  });

  test("AQ) Person sem PersonPreference nunca aparece", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaSemPreferencia = await criarPessoa({ organizationId: cenario.organization.id });
    const pessoaComPreferencia = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoaComPreferencia.id, cenario.organization.id);

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const ids = resultado.recomendacoes.map((r) => r.person.id);
    expect(ids).not.toContain(pessoaSemPreferencia.id);
    expect(ids).toContain(pessoaComPreferencia.id);
  });

  test("AR) nenhuma PersonPreference na organização → estado vazio correto", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    // nenhuma preferência criada

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado).toEqual({ totalPreferenciasNaOrganizacao: 0, recomendacoes: [] });
  });

  test("AS) preferences existem mas nenhuma é compatível → estado vazio diferente de 'nenhuma preferência'", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id, purpose: "SALE" });
    // preferência existe mas exige RENT — hard filter reprova.
    await criarPreferencia(pessoa.id, cenario.organization.id, { transactionType: "RENT" });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado.totalPreferenciasNaOrganizacao).toBe(1);
    expect(resultado.recomendacoes).toEqual([]);
  });

  test("AT) isolamento de tenant mesmo usando IDs reais de outra organização", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovelDeB = await criarImovel({ organizationId: cenarioB.organization.id });
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
    await criarPreferencia(pessoaDeB.id, cenarioB.organization.id);

    // organizationId de A, mas propertyId real de B — IDs válidos, só a
    // combinação é cross-tenant.
    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovelDeB.id);
    expect(resultado).toEqual({ totalPreferenciasNaOrganizacao: 0, recomendacoes: [] });
  });

  test("AV) mesma combinação preference+property produz score/compatible/activeSoftCriteriaCount/criteria idênticos nos dois fluxos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      purpose: "SALE",
      city: "São Paulo",
      bedrooms: 3,
      price: 500000,
      propertyFeatures: ["piscina", "varanda"],
    });
    await criarPreferencia(pessoa.id, cenario.organization.id, {
      transactionType: "SALE",
      cities: ["São Paulo"],
      minBedrooms: 2,
      minPrice: 400000,
      maxPrice: 600000,
      desiredPropertyFeatures: ["piscina", "varanda", "churrasqueira"],
    });

    const direto = (await buscarImoveisCompativeis(cenario.organization.id, pessoa.id)).find(
      (r) => r.property.id === imovel.id
    );
    const reverso = (await buscarClientesCompativeis(cenario.organization.id, imovel.id)).recomendacoes.find(
      (r) => r.person.id === pessoa.id
    );

    expect(direto).toBeDefined();
    expect(reverso).toBeDefined();
    expect(reverso?.score).toBe(direto?.score);
    expect(reverso?.compatible).toBe(direto?.compatible);
    expect(reverso?.activeSoftCriteriaCount).toBe(direto?.activeSoftCriteriaCount);
    expect(reverso?.criteria).toEqual(direto?.criteria);
  });

  test("AZ) PropertyInterest de outra organização nunca vira existingInterest, mesmo referenciando o mesmo personId/propertyId", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferencia(pessoa.id, cenario.organization.id);

    // Inserção direta simulando inconsistência: PropertyInterest com
    // organizationId=B, mas personId/propertyId reais de A — sem FK
    // composta ligando organizationId ao tenant real do Person/Property
    // referenciados, nada no schema impede isso (mesmo racional do teste
    // D pra PersonPreference).
    const interesseRogue = await prisma.propertyInterest.create({
      data: {
        organizationId: cenarioB.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "PROPOSAL",
        favorited: true,
      },
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    const item = resultado.recomendacoes.find((r) => r.person.id === pessoa.id);

    expect(item).toBeDefined();
    // stage/favorited da organização B nunca vazam pro resultado de A —
    // o filtro explícito organizationId na query de PropertyInterest
    // (não a constraint estrutural) é o que garante isso.
    expect(item?.existingInterest).toBeNull();

    // Limpeza manual: propertyId é RESTRICT — limparOrganizacao(A)
    // tentaria apagar o Property de A antes de limparOrganizacao(B) ter
    // rodado (que é quem apagaria essa linha, via organizationId=B), e
    // seria bloqueado pela FK. Apagar aqui antes do afterEach padrão.
    await prisma.propertyInterest.delete({
      where: { id: interesseRogue.id, organizationId: cenarioB.organization.id },
    });
  });

  test("BA) organização com PersonPreference só inconsistentes (nenhuma estruturalmente válida) → estado vazio, sem query desnecessária de PropertyInterest", async () => {
    // Cenário distinto de AR (que testa zero linhas desde a query): aqui
    // a query de PersonPreference retorna 2 linhas, mas nenhuma sobrevive
    // ao filtro de defesa em profundidade — o efeito final (early return
    // antes da ETAPA 2) é o mesmo, mas exercitando o caminho do filtro,
    // não da lista vazia. A prova de que a query de PropertyInterest não
    // roda é estrutural (early return no código-fonte antes da ETAPA 2) —
    // este projeto não tem infraestrutura de contagem de query, mesma
    // limitação documentada em AU acima.
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    const pessoaDeB1 = await criarPessoa({ organizationId: cenarioB.organization.id });
    const pessoaDeB2 = await criarPessoa({ organizationId: cenarioB.organization.id });
    await prisma.personPreference.create({
      data: { personId: pessoaDeB1.id, organizationId: cenario.organization.id },
    });
    await prisma.personPreference.create({
      data: { personId: pessoaDeB2.id, organizationId: cenario.organization.id },
    });

    const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);
    expect(resultado).toEqual({ totalPreferenciasNaOrganizacao: 0, recomendacoes: [] });

    // Limpeza manual (mesma razão do teste D).
    await prisma.personPreference.delete({
      where: { personId: pessoaDeB1.id, organizationId: cenario.organization.id },
    });
    await prisma.personPreference.delete({
      where: { personId: pessoaDeB2.id, organizationId: cenario.organization.id },
    });
  });

  test(
    "BB) volume — 100 PersonPreferences continuam corretas: top 5, sem cross-tenant, PropertyInterest batched",
    async () => {
      cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
      cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
      const imovel = await criarImovel({
        organizationId: cenario.organization.id,
        propertyFeatures: UNIVERSO_FEATURES_IMOVEL,
      });

      const pessoas = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          criarPessoa({ organizationId: cenario!.organization.id, name: `Pessoa ${i}` })
        )
      );
      await Promise.all(
        pessoas.map((p, i) =>
          criarPreferencia(p.id, cenario!.organization.id, {
            // scores 1..100, um por pessoa
            desiredPropertyFeatures: desiredFeaturesParaPercentual(i + 1, `bb-${i}`),
          })
        )
      );

      // Decoy de outro tenant — não deve aparecer nem influenciar o top 5.
      const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
      await criarPreferencia(pessoaDeB.id, cenarioB.organization.id, {
        desiredPropertyFeatures: desiredFeaturesParaPercentual(100, "b-decoy"),
      });

      // PropertyInterest real pra confirmar que o batch continua correto
      // com volume (não é uma prova de contagem de query, é funcional).
      await prisma.propertyInterest.create({
        data: {
          organizationId: cenario.organization.id,
          personId: pessoas[99].id,
          propertyId: imovel.id,
          stage: "VISITED",
        },
      });

      const resultado = await buscarClientesCompativeis(cenario.organization.id, imovel.id);

      expect(resultado.totalPreferenciasNaOrganizacao).toBe(100);
      expect(resultado.recomendacoes).toHaveLength(5);
      expect(resultado.recomendacoes.map((r) => r.score)).toEqual([100, 99, 98, 97, 96]);
      expect(resultado.recomendacoes.map((r) => r.person.id)).not.toContain(pessoaDeB.id);
      const topComInteresse = resultado.recomendacoes.find((r) => r.person.id === pessoas[99].id);
      expect(topComInteresse?.existingInterest?.stage).toBe("VISITED");
    },
    20000
  );

  // AU) Nenhuma query Prisma dentro do .map() de score — confirmado por
  // leitura de código (property-matching.ts, buscarClientesCompativeis):
  // property, preferencias (com person incluso) e interesses são
  // buscados em 3 queries batched ANTES do .map() de
  // calcularCompatibilidade; o .map() em si só lê os dados já carregados
  // em memória (preferenciasValidas, interesseMap, preferenceUpdatedAtMap).
  // Não force um spy do driver Prisma pra provar isso automaticamente —
  // este projeto não tem infraestrutura de contagem de query em nenhum
  // teste existente (mesma decisão documentada em AW de
  // property-matching.test.ts, Fase E). Os testes AH/AI acima já
  // exercitam esse caminho com múltiplos candidatos sem erro.

  // BO) Confirmar que a página /app/imoveis/[id] não renderiza a seção
  // "Clientes compatíveis" quando hasModule(organizationId, "crm") é
  // false exigiria testar a árvore JSX retornada por um Server Component
  // async (EditarImovelPage) — este projeto não tem nenhuma
  // infraestrutura de teste de componente/página React (sem
  // @testing-library, sem nenhum .test.tsx em lugar nenhum do repositório
  // — mesma limitação já documentada nas auditorias da Fase E/F). O gate
  // em si (`{crmHabilitado && (...)}`, em src/app/app/imoveis/[id]/page.tsx)
  // foi verificado por leitura de código nesta correção. Recomendado como
  // smoke manual antes do deploy: abrir /app/imoveis/[id] autenticado
  // numa organização sem o módulo CRM habilitado e confirmar que a seção
  // "Clientes compatíveis" não aparece (mas "Clientes interessados" e o
  // resto da ficha continuam normais).
});
