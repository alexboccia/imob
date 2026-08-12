import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPessoa, criarImovel } from "@/test/fixtures";
import type { Prisma } from "@/generated/prisma/client";
import {
  calcularCompatibilidade,
  buscarImoveisCompativeis,
  SCORE_MINIMO_RECOMENDACAO,
  type PreferenciaParaMatching,
  type PropertyParaMatching,
} from "@/lib/property-matching";

// Fase E do CRM — matching Person↔Property. Cobertura mínima acordada
// (cenários A–AQ) + extras. Dividido em dois blocos:
//  1) calcularCompatibilidade — função pura, testada com objetos simples,
//     sem banco (maioria dos cenários do algoritmo em si).
//  2) buscarImoveisCompativeis — orquestração (Prisma + tenant-scoping +
//     entitlement + PropertyInterest), com fixtures reais.

function preferenciaPadrao(overrides: Partial<PreferenciaParaMatching> = {}): PreferenciaParaMatching {
  return {
    transactionType: null,
    propertyTypes: [],
    cities: [],
    neighborhoods: [],
    minPrice: null,
    maxPrice: null,
    minBedrooms: null,
    minBathrooms: null,
    minParkingSpots: null,
    minArea: null,
    maxArea: null,
    desiredPropertyFeatures: [],
    desiredCondoFeatures: [],
    ...overrides,
  };
}

function propertyPadrao(overrides: Partial<PropertyParaMatching> = {}): PropertyParaMatching {
  return {
    id: "prop-1",
    title: "Imóvel de teste",
    type: "Apartamento",
    purpose: "SALE",
    city: "São Paulo",
    neighborhood: "Vila Mariana",
    price: 500000,
    rentPrice: null,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpots: 1,
    privateArea: 80,
    propertyFeatures: [],
    condoFeatures: [],
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function criterio(resultado: ReturnType<typeof calcularCompatibilidade>, key: string) {
  return resultado.criteria.find((c) => c.key === key)!;
}

describe("calcularCompatibilidade — critérios de matching (pura, sem DB)", () => {
  test("D) transactionType SALE — purpose hard filter aceita SALE e SALE_AND_RENT, rejeita RENT", () => {
    const preference = preferenciaPadrao({ transactionType: "SALE" });

    const comSale = calcularCompatibilidade(preference, propertyPadrao({ purpose: "SALE" }));
    expect(comSale.compatible).toBe(true);
    expect(criterio(comSale, "purpose").matched).toBe(true);

    const comSaleAndRent = calcularCompatibilidade(preference, propertyPadrao({ purpose: "SALE_AND_RENT" }));
    expect(comSaleAndRent.compatible).toBe(true);

    const comRent = calcularCompatibilidade(preference, propertyPadrao({ purpose: "RENT" }));
    expect(comRent.compatible).toBe(false);
    expect(comRent.score).toBe(0);
    expect(criterio(comRent, "purpose").matched).toBe(false);
  });

  test("E) transactionType RENT — purpose hard filter aceita RENT e SALE_AND_RENT, rejeita SALE", () => {
    const preference = preferenciaPadrao({ transactionType: "RENT" });

    expect(calcularCompatibilidade(preference, propertyPadrao({ purpose: "RENT" })).compatible).toBe(true);
    expect(
      calcularCompatibilidade(preference, propertyPadrao({ purpose: "SALE_AND_RENT" })).compatible
    ).toBe(true);
    const comSale = calcularCompatibilidade(preference, propertyPadrao({ purpose: "SALE" }));
    expect(comSale.compatible).toBe(false);
    expect(comSale.score).toBe(0);
  });

  test("F) Property com purpose SALE_AND_RENT satisfaz tanto preferência SALE quanto RENT", () => {
    const property = propertyPadrao({ purpose: "SALE_AND_RENT" });
    expect(calcularCompatibilidade(preferenciaPadrao({ transactionType: "SALE" }), property).compatible).toBe(
      true
    );
    expect(calcularCompatibilidade(preferenciaPadrao({ transactionType: "RENT" }), property).compatible).toBe(
      true
    );
  });

  test("G) preço em SALE usa Property.price, nunca rentPrice", () => {
    const preference = preferenciaPadrao({ transactionType: "SALE", minPrice: 400000, maxPrice: 600000 });

    const dentro = calcularCompatibilidade(
      preference,
      propertyPadrao({ price: 500000, rentPrice: 999999999 })
    );
    expect(dentro.compatible).toBe(true);
    expect(criterio(dentro, "price").matched).toBe(true);

    const fora = calcularCompatibilidade(preference, propertyPadrao({ price: 700000, rentPrice: 1 }));
    expect(fora.compatible).toBe(false);
    expect(fora.score).toBe(0);

    const semPreco = calcularCompatibilidade(preference, propertyPadrao({ price: null }));
    expect(semPreco.compatible).toBe(false);
  });

  test("H) preço em RENT usa Property.rentPrice, nunca price", () => {
    const preference = preferenciaPadrao({ transactionType: "RENT", minPrice: 1000, maxPrice: 3000 });

    const dentro = calcularCompatibilidade(
      preference,
      propertyPadrao({ purpose: "RENT", rentPrice: 2000, price: 999999999 })
    );
    expect(dentro.compatible).toBe(true);

    const semRentPrice = calcularCompatibilidade(
      preference,
      propertyPadrao({ purpose: "RENT", rentPrice: null, price: 2000 })
    );
    expect(semRentPrice.compatible).toBe(false);
  });

  test("I) minPrice sozinho — só exige piso, sem teto", () => {
    const preference = preferenciaPadrao({ transactionType: "SALE", minPrice: 400000 });
    expect(calcularCompatibilidade(preference, propertyPadrao({ price: 450000 })).compatible).toBe(true);
    expect(calcularCompatibilidade(preference, propertyPadrao({ price: 10000000 })).compatible).toBe(true);
    expect(calcularCompatibilidade(preference, propertyPadrao({ price: 300000 })).compatible).toBe(false);
  });

  test("J) maxPrice sozinho — só exige teto, sem piso", () => {
    const preference = preferenciaPadrao({ transactionType: "SALE", maxPrice: 600000 });
    expect(calcularCompatibilidade(preference, propertyPadrao({ price: 550000 })).compatible).toBe(true);
    expect(calcularCompatibilidade(preference, propertyPadrao({ price: 1 })).compatible).toBe(true);
    expect(calcularCompatibilidade(preference, propertyPadrao({ price: 650000 })).compatible).toBe(false);
  });

  test("K) propertyTypes — hard filter de tipo", () => {
    const preference = preferenciaPadrao({ propertyTypes: ["Apartamento", "Casa"] });
    expect(calcularCompatibilidade(preference, propertyPadrao({ type: "Apartamento" })).compatible).toBe(true);
    const foraDoTipo = calcularCompatibilidade(preference, propertyPadrao({ type: "Terreno" }));
    expect(foraDoTipo.compatible).toBe(false);
    expect(foraDoTipo.score).toBe(0);
  });

  test("L) city — comparação tolera diferença de caixa", () => {
    const preference = preferenciaPadrao({ cities: ["Osasco"] });
    const resultado = calcularCompatibilidade(preference, propertyPadrao({ city: "OSASCO" }));
    expect(criterio(resultado, "city").matched).toBe(true);
  });

  test("M) city — comparação tolera acento e espaços nas pontas", () => {
    const semAcento = calcularCompatibilidade(
      preferenciaPadrao({ cities: ["São Paulo"] }),
      propertyPadrao({ city: "Sao Paulo" })
    );
    expect(criterio(semAcento, "city").matched).toBe(true);

    const comEspacos = calcularCompatibilidade(
      preferenciaPadrao({ cities: ["  São Paulo  "] }),
      propertyPadrao({ city: "São Paulo" })
    );
    expect(criterio(comEspacos, "city").matched).toBe(true);
  });

  test("N) neighborhood — mesmo tratamento de normalização, independente de city", () => {
    const bate = calcularCompatibilidade(
      preferenciaPadrao({ neighborhoods: ["Vila Mariana"] }),
      propertyPadrao({ neighborhood: "vila mariana" })
    );
    expect(criterio(bate, "neighborhood").matched).toBe(true);

    const naoBate = calcularCompatibilidade(
      preferenciaPadrao({ neighborhoods: ["Vila Mariana"] }),
      propertyPadrao({ neighborhood: "Moema" })
    );
    expect(criterio(naoBate, "neighborhood").matched).toBe(false);
  });

  test("O) bedrooms — mínimo desejado, comparação >=", () => {
    const preference = preferenciaPadrao({ minBedrooms: 3 });
    expect(criterio(calcularCompatibilidade(preference, propertyPadrao({ bedrooms: 3 })), "bedrooms").matched).toBe(
      true
    );
    expect(criterio(calcularCompatibilidade(preference, propertyPadrao({ bedrooms: 5 })), "bedrooms").matched).toBe(
      true
    );
    expect(criterio(calcularCompatibilidade(preference, propertyPadrao({ bedrooms: 2 })), "bedrooms").matched).toBe(
      false
    );
  });

  test("P) bathrooms — mínimo desejado, comparação >=", () => {
    const preference = preferenciaPadrao({ minBathrooms: 2 });
    expect(
      criterio(calcularCompatibilidade(preference, propertyPadrao({ bathrooms: 2 })), "bathrooms").matched
    ).toBe(true);
    expect(
      criterio(calcularCompatibilidade(preference, propertyPadrao({ bathrooms: 1 })), "bathrooms").matched
    ).toBe(false);
  });

  test("Q) parkingSpots — mínimo desejado, comparação >=", () => {
    const preference = preferenciaPadrao({ minParkingSpots: 2 });
    expect(
      criterio(calcularCompatibilidade(preference, propertyPadrao({ parkingSpots: 2 })), "parkingSpots").matched
    ).toBe(true);
    expect(
      criterio(calcularCompatibilidade(preference, propertyPadrao({ parkingSpots: 1 })), "parkingSpots").matched
    ).toBe(false);
  });

  test("R) area — faixa min/max sobre privateArea", () => {
    const preference = preferenciaPadrao({ minArea: 70, maxArea: 100 });
    expect(criterio(calcularCompatibilidade(preference, propertyPadrao({ privateArea: 80 })), "area").matched).toBe(
      true
    );
    expect(criterio(calcularCompatibilidade(preference, propertyPadrao({ privateArea: 60 })), "area").matched).toBe(
      false
    );
    expect(criterio(calcularCompatibilidade(preference, propertyPadrao({ privateArea: 120 })), "area").matched).toBe(
      false
    );
  });

  test("S) propertyFeatures — 100% das desejadas presentes conta peso cheio", () => {
    const preference = preferenciaPadrao({ desiredPropertyFeatures: ["piscina", "churrasqueira"] });
    const resultado = calcularCompatibilidade(
      preference,
      propertyPadrao({ propertyFeatures: ["piscina", "churrasqueira", "academia"] })
    );
    const c = criterio(resultado, "propertyFeatures");
    expect(c.percentualAtendido).toBe(1);
    expect(c.matched).toBe(true);
    expect(c.weight).toBe(15);
  });

  test("T) propertyFeatures — match parcial é proporcional, não booleano", () => {
    const preference = preferenciaPadrao({ desiredPropertyFeatures: ["a", "b", "c", "d"] });
    const resultado = calcularCompatibilidade(preference, propertyPadrao({ propertyFeatures: ["a", "b", "c"] }));
    const c = criterio(resultado, "propertyFeatures");
    expect(c.percentualAtendido).toBe(0.75);
    expect(c.matched).toBe(true);
    expect(c.detail).toBe("3 de 4 características desejadas");

    const semNenhuma = calcularCompatibilidade(preference, propertyPadrao({ propertyFeatures: [] }));
    const c2 = criterio(semNenhuma, "propertyFeatures");
    expect(c2.percentualAtendido).toBe(0);
    expect(c2.matched).toBe(false);
  });

  test("U) condoFeatures — mesmo tratamento proporcional de propertyFeatures, peso próprio (10)", () => {
    const preference = preferenciaPadrao({ desiredCondoFeatures: ["piscina", "salão de festas"] });
    const resultado = calcularCompatibilidade(preference, propertyPadrao({ condoFeatures: ["piscina"] }));
    const c = criterio(resultado, "condoFeatures");
    expect(c.percentualAtendido).toBe(0.5);
    expect(c.weight).toBe(10);
  });

  test("V) preferência ausente não penaliza — critério fica inativo, não conta como 'não atendido'", () => {
    const preference = preferenciaPadrao({ cities: ["São Paulo"] }); // só city informado
    const resultado = calcularCompatibilidade(preference, propertyPadrao({ city: "São Paulo" }));

    expect(criterio(resultado, "bedrooms").active).toBe(false);
    expect(criterio(resultado, "bedrooms").percentualAtendido).toBeNull();
    // único critério ativo (city) bateu → score não é diluído pelos 7 outros
    // critérios nunca informados.
    expect(resultado.score).toBe(100);
  });

  test("W) Property com campo NULL fica neutro (excluído), nunca vira 0", () => {
    const preference = preferenciaPadrao({ minBedrooms: 3, cities: ["São Paulo"] });
    const resultado = calcularCompatibilidade(
      preference,
      propertyPadrao({ bedrooms: null, city: "São Paulo" })
    );

    const bedrooms = criterio(resultado, "bedrooms");
    expect(bedrooms.active).toBe(false);
    expect(bedrooms.percentualAtendido).toBeNull();
    expect(bedrooms.matched).toBeNull();
    // city (único critério avaliável) bateu 100% → score 100, bedrooms com
    // dado ausente no imóvel não derruba o score.
    expect(resultado.score).toBe(100);
  });

  test("X) denominador dinâmico — só pesos dos critérios ativos entram na conta, nunca 100 fixo", () => {
    const preference = preferenciaPadrao({ minBedrooms: 3, minBathrooms: 2 });
    // bedrooms (peso 15) bate, bathrooms (peso 10) não bate — nada mais
    // ativo. Denominador = 25 (não 100).
    const resultado = calcularCompatibilidade(
      preference,
      propertyPadrao({ bedrooms: 3, bathrooms: 1 })
    );
    expect(resultado.score).toBe(60); // round(100 * 15/25)
  });

  test("Y) score sempre fica em 0–100 e arredonda corretamente", () => {
    const preference = preferenciaPadrao({ minBedrooms: 3, minBathrooms: 2, minParkingSpots: 1 });
    // bedrooms(15) bate, bathrooms(10) não bate, parkingSpots(10) bate.
    // total ativo = 35, atendido = 25 → 71.428...% → arredonda 71.
    const resultado = calcularCompatibilidade(
      preference,
      propertyPadrao({ bedrooms: 3, bathrooms: 1, parkingSpots: 1 })
    );
    expect(resultado.score).toBe(71);
    expect(resultado.score).toBeGreaterThanOrEqual(0);
    expect(resultado.score).toBeLessThanOrEqual(100);

    const tudoBate = calcularCompatibilidade(
      preference,
      propertyPadrao({ bedrooms: 3, bathrooms: 2, parkingSpots: 1 })
    );
    expect(tudoBate.score).toBe(100);

    const nadaBate = calcularCompatibilidade(
      preference,
      propertyPadrao({ bedrooms: 1, bathrooms: 1, parkingSpots: 0 })
    );
    expect(nadaBate.score).toBe(0);
  });

  test("Z) SCORE_MINIMO_RECOMENDACAO é 50 e o algoritmo consegue produzir esse valor exato", () => {
    expect(SCORE_MINIMO_RECOMENDACAO).toBe(50);
    const desejadas = Array.from({ length: 2 }, (_, i) => `feature-${i}`);
    const preference = preferenciaPadrao({ desiredPropertyFeatures: desejadas });
    const resultado = calcularCompatibilidade(preference, propertyPadrao({ propertyFeatures: [desejadas[0]] }));
    expect(resultado.score).toBe(50);
  });

  test("AM) localização com apenas city informado — neighborhood fica inativo, city sozinho responde pelos 12.5 ativos", () => {
    const preference = preferenciaPadrao({ cities: ["São Paulo"] });
    const resultado = calcularCompatibilidade(preference, propertyPadrao({ city: "São Paulo" }));
    expect(criterio(resultado, "city").active).toBe(true);
    expect(criterio(resultado, "city").weight).toBe(12.5);
    expect(criterio(resultado, "neighborhood").active).toBe(false);
    expect(resultado.score).toBe(100);
  });

  test("AN) localização com apenas neighborhood informado — city fica inativo, neighborhood sozinho responde pelos 12.5 ativos", () => {
    const preference = preferenciaPadrao({ neighborhoods: ["Vila Mariana"] });
    const resultado = calcularCompatibilidade(preference, propertyPadrao({ neighborhood: "Vila Mariana" }));
    expect(criterio(resultado, "neighborhood").active).toBe(true);
    expect(criterio(resultado, "neighborhood").weight).toBe(12.5);
    expect(criterio(resultado, "city").active).toBe(false);
    expect(resultado.score).toBe(100);
  });

  test("AO) localização com city e neighborhood ambos informados — cada um pesa sua metade independentemente", () => {
    const preference = preferenciaPadrao({ cities: ["São Paulo"], neighborhoods: ["Vila Mariana"] });
    // city bate, neighborhood não bate — únicos dois critérios ativos,
    // pesos iguais (12.5 cada) → 50%.
    const resultado = calcularCompatibilidade(
      preference,
      propertyPadrao({ city: "São Paulo", neighborhood: "Moema" })
    );
    expect(criterio(resultado, "city").matched).toBe(true);
    expect(criterio(resultado, "neighborhood").matched).toBe(false);
    expect(resultado.score).toBe(50);
  });

  test("AP) desiredPropertyFeatures/desiredCondoFeatures vazias não entram no denominador", () => {
    // Só city ativo (features vazias = inativas) — score não é diluído por
    // dois critérios de peso 15+10 nunca informados.
    const preference = preferenciaPadrao({ cities: ["São Paulo"], desiredPropertyFeatures: [], desiredCondoFeatures: [] });
    const resultado = calcularCompatibilidade(preference, propertyPadrao({ city: "São Paulo" }));
    expect(criterio(resultado, "propertyFeatures").active).toBe(false);
    expect(criterio(resultado, "condoFeatures").active).toBe(false);
    expect(resultado.score).toBe(100);
  });

  test("AQ) dados numéricos NULL no Property nunca viram zero no score", () => {
    const preference = preferenciaPadrao({
      cities: ["São Paulo"],
      minArea: 50,
      maxArea: 150,
      minParkingSpots: 1,
    });
    const resultado = calcularCompatibilidade(
      preference,
      propertyPadrao({ city: "São Paulo", privateArea: null, parkingSpots: null })
    );
    expect(criterio(resultado, "area").active).toBe(false);
    expect(criterio(resultado, "area").percentualAtendido).toBeNull();
    expect(criterio(resultado, "parkingSpots").active).toBe(false);
    expect(criterio(resultado, "parkingSpots").percentualAtendido).toBeNull();
    // Único critério avaliável (city) bateu → score 100, não penalizado
    // pelos campos NULL do imóvel.
    expect(resultado.score).toBe(100);
  });

  test("extra/BB) zero critérios soft ativos (só hard filters preenchidos) → score 100 internamente, mas activeSoftCriteriaCount=0 sinaliza a UI a não exibir percentual", () => {
    const preference = preferenciaPadrao({ transactionType: "SALE", propertyTypes: ["Apartamento"] });
    const resultado = calcularCompatibilidade(
      preference,
      propertyPadrao({ purpose: "SALE", type: "Apartamento" })
    );
    expect(resultado.compatible).toBe(true);
    expect(resultado.criteria.filter((c) => c.weight > 0 && c.active)).toHaveLength(0);
    // Continua ordenável internamente (score 100 = "nenhum sinal negativo"),
    // mas o sinal explícito abaixo é o que a UI usa pra decidir entre
    // "100% compatível" (enganoso aqui) e "Compatível" (honesto).
    expect(resultado.score).toBe(100);
    expect(resultado.activeSoftCriteriaCount).toBe(0);
  });

  test("preço com dado do imóvel ausente falha o hard filter (diferente do tratamento neutro dos soft criteria)", () => {
    const preference = preferenciaPadrao({ transactionType: "SALE", minPrice: 100000 });
    const resultado = calcularCompatibilidade(preference, propertyPadrao({ price: null }));
    expect(resultado.compatible).toBe(false);
    expect(criterio(resultado, "price").matched).toBe(false);
  });

  test("AU) score real fracionário (49.6%) arredonda pra 50 numa única passagem, e passa no threshold", () => {
    // bathrooms (peso 10, bate 100%) + propertyFeatures (peso 15, 4 de 25
    // desejadas = 16%) — únicos dois critérios ativos.
    // ativos=25, atendido=10+15*0.16=12.4 → 12.4/25=49.6% exato antes do
    // round. calcularScore arredonda uma única vez (Math.round), e é esse
    // valor já inteiro que qualquer comparação de threshold usa depois —
    // não existe um "score real" separado guardado em lugar nenhum.
    const desejadas = Array.from({ length: 25 }, (_, i) => `feature-${i}`);
    const preference = preferenciaPadrao({ minBathrooms: 1, desiredPropertyFeatures: desejadas });
    const resultado = calcularCompatibilidade(
      preference,
      propertyPadrao({ bathrooms: 1, propertyFeatures: desejadas.slice(0, 4) })
    );
    expect(resultado.score).toBe(50);
    expect(resultado.score).toBeGreaterThanOrEqual(SCORE_MINIMO_RECOMENDACAO);
  });

  test("AX) Property SALE_AND_RENT + preferência SALE usa Property.price no hard filter de preço", () => {
    const preference = preferenciaPadrao({ transactionType: "SALE", minPrice: 400000, maxPrice: 600000 });
    const dentro = calcularCompatibilidade(
      preference,
      propertyPadrao({ purpose: "SALE_AND_RENT", price: 500000, rentPrice: 1 })
    );
    expect(dentro.compatible).toBe(true);
    expect(criterio(dentro, "price").matched).toBe(true);

    const fora = calcularCompatibilidade(
      preference,
      propertyPadrao({ purpose: "SALE_AND_RENT", price: 999999999, rentPrice: 500000 })
    );
    expect(fora.compatible).toBe(false); // rentPrice bateria na faixa, mas não é o campo usado pra SALE
  });

  test("AY) Property SALE_AND_RENT + preferência RENT usa Property.rentPrice no hard filter de preço", () => {
    const preference = preferenciaPadrao({ transactionType: "RENT", minPrice: 1000, maxPrice: 3000 });
    const dentro = calcularCompatibilidade(
      preference,
      propertyPadrao({ purpose: "SALE_AND_RENT", rentPrice: 2000, price: 1 })
    );
    expect(dentro.compatible).toBe(true);
    expect(criterio(dentro, "price").matched).toBe(true);

    const fora = calcularCompatibilidade(
      preference,
      propertyPadrao({ purpose: "SALE_AND_RENT", rentPrice: 999999999, price: 2000 })
    );
    expect(fora.compatible).toBe(false); // price bateria na faixa, mas não é o campo usado pra RENT
  });
});

describe("buscarImoveisCompativeis — orquestração (Prisma + tenant + entitlement)", () => {
  type Cenario = Awaited<ReturnType<typeof criarCenario>>;
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
  });

  async function criarPreferenciaNeutra(
    personId: string,
    organizationId: string,
    overrides: Omit<Prisma.PersonPreferenceUncheckedCreateInput, "personId" | "organizationId"> = {}
  ) {
    return prisma.personPreference.create({
      data: { personId, organizationId, ...overrides },
    });
  }

  test("A) isolamento de tenant — imóvel de outra organização nunca aparece na recomendação", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaA = await criarPessoa({ organizationId: cenario.organization.id });
    const imovelA = await criarImovel({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenarioB.organization.id });
    await criarPreferenciaNeutra(pessoaA.id, cenario.organization.id);

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoaA.id);

    expect(resultados).toHaveLength(1);
    expect(resultados[0].property.id).toBe(imovelA.id);
  });

  test("B) Person sem PersonPreference não recomenda nada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    expect(resultados).toEqual([]);
  });

  test("C) Property com status diferente de AVAILABLE nunca é recomendada", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const vendido = await criarImovel({ organizationId: cenario.organization.id, status: "SOLD" });
    const disponivel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id);

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    const ids = resultados.map((r) => r.property.id);
    expect(ids).not.toContain(vendido.id);
    expect(ids).toContain(disponivel.id);
  });

  test("AA) score 49 não aparece na recomendação (abaixo do threshold)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const desejadas = Array.from({ length: 100 }, (_, i) => `feature-${i}`);
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      propertyFeatures: desejadas.slice(0, 49),
    });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id, { desiredPropertyFeatures: desejadas });

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    expect(resultados.map((r) => r.property.id)).not.toContain(imovel.id);
  });

  test("AB) score 50 aparece na recomendação (exatamente no threshold)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const desejadas = Array.from({ length: 100 }, (_, i) => `feature-${i}`);
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      propertyFeatures: desejadas.slice(0, 50),
    });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id, { desiredPropertyFeatures: desejadas });

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    expect(resultados.map((r) => r.property.id)).toContain(imovel.id);
    expect(resultados.find((r) => r.property.id === imovel.id)?.score).toBe(50);
  });

  test("AC) ordenação por score decrescente", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const desejadas = Array.from({ length: 100 }, (_, i) => `feature-${i}`);
    const alto = await criarImovel({ organizationId: cenario.organization.id, propertyFeatures: desejadas.slice(0, 100) });
    const medio = await criarImovel({ organizationId: cenario.organization.id, propertyFeatures: desejadas.slice(0, 80) });
    const baixo = await criarImovel({ organizationId: cenario.organization.id, propertyFeatures: desejadas.slice(0, 60) });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id, { desiredPropertyFeatures: desejadas });

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    expect(resultados.map((r) => r.property.id)).toEqual([alto.id, medio.id, baixo.id]);
    expect(resultados.map((r) => r.score)).toEqual([100, 80, 60]);
  });

  test("AD) desempate por Property.updatedAt DESC quando o score empata", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const antigo = await criarImovel({ organizationId: cenario.organization.id });
    const recente = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id); // ambos score 100 (sem soft criteria ativo)

    await prisma.property.update({
      where: { id: antigo.id, organizationId: cenario.organization.id },
      data: { updatedAt: new Date("2020-01-01T00:00:00Z") },
    });
    await prisma.property.update({
      where: { id: recente.id, organizationId: cenario.organization.id },
      data: { updatedAt: new Date("2025-01-01T00:00:00Z") },
    });

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    expect(resultados.map((r) => r.property.id)).toEqual([recente.id, antigo.id]);
  });

  test("AE) desempate final por Property.id ASC quando score e updatedAt empatam", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel1 = await criarImovel({ organizationId: cenario.organization.id });
    const imovel2 = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id);

    const mesmoInstante = new Date("2024-06-01T00:00:00Z");
    await prisma.property.update({
      where: { id: imovel1.id, organizationId: cenario.organization.id },
      data: { updatedAt: mesmoInstante },
    });
    await prisma.property.update({
      where: { id: imovel2.id, organizationId: cenario.organization.id },
      data: { updatedAt: mesmoInstante },
    });

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    const esperado = [imovel1.id, imovel2.id].sort();
    expect(resultados.map((r) => r.property.id)).toEqual(esperado);
  });

  test("AF) top 5 — corta só depois de calcular o score de todos os candidatos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const desejadas = Array.from({ length: 100 }, (_, i) => `feature-${i}`);
    const percentuais = [100, 90, 80, 70, 60, 50];
    const imoveis = await Promise.all(
      percentuais.map((p) =>
        criarImovel({ organizationId: cenario!.organization.id, propertyFeatures: desejadas.slice(0, p) })
      )
    );
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id, { desiredPropertyFeatures: desejadas });

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);

    expect(resultados).toHaveLength(5);
    expect(resultados.map((r) => r.score)).toEqual([100, 90, 80, 70, 60]);
    // o candidato com score 50 (6º melhor) existe e passaria no threshold,
    // mas é cortado pelo top 5 — não pelo filtro de score.
    expect(resultados.map((r) => r.property.id)).not.toContain(imoveis[5].id);
  });

  // AW) existingInterest é carregado por uma única query batched (ver
  // property-matching.ts, ETAPA "PropertyInterest existente pros
  // candidatos" — um só findMany com propertyId: {in: [...]}, nunca um
  // findUnique por candidato dentro do .map()). Confirmado por leitura de
  // código nesta auditoria; não escrevo aqui um teste de contagem de
  // query porque este projeto não tem nenhuma infraestrutura de spy/mock
  // de query count (nenhum precedente em nenhum arquivo de teste) — um
  // teste assim exigiria instrumentar o Prisma Client artificialmente só
  // pra esta suíte, o que é mais frágil (acopla o teste a detalhes de
  // implementação do driver) do que o valor que agrega. Os testes AG/AH/AI
  // abaixo já exercitam esse caminho com múltiplos candidatos e um
  // PropertyInterest real, e o comportamento correto foi verificado por
  // leitura de código.
  test("AG) PropertyInterest existente aparece no resultado com stage e favorited corretos", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id);
    const interesse = await prisma.propertyInterest.create({
      data: {
        organizationId: cenario.organization.id,
        personId: pessoa.id,
        propertyId: imovel.id,
        stage: "VISITED",
        favorited: true,
      },
    });

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    const resultado = resultados.find((r) => r.property.id === imovel.id);
    expect(resultado?.existingInterest).toEqual({ id: interesse.id, stage: "VISITED", favorited: true });
  });

  test("AH) sem PropertyInterest existente, existingInterest é null", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id);

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    expect(resultados.find((r) => r.property.id === imovel.id)?.existingInterest).toBeNull();
  });

  test("AI) favorited não altera o score", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    const desejadas = Array.from({ length: 100 }, (_, i) => `feature-${i}`);
    const imovel = await criarImovel({
      organizationId: cenario.organization.id,
      propertyFeatures: desejadas.slice(0, 70),
    });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id, { desiredPropertyFeatures: desejadas });

    const antes = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    const scoreAntes = antes.find((r) => r.property.id === imovel.id)?.score;

    await prisma.propertyInterest.create({
      data: { organizationId: cenario.organization.id, personId: pessoa.id, propertyId: imovel.id, favorited: true },
    });

    const depois = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    const scoreDepois = depois.find((r) => r.property.id === imovel.id)?.score;

    expect(scoreDepois).toBe(scoreAntes);
    expect(scoreAntes).toBe(70);
  });

  test("AJ) matching nunca cria PropertyInterest — puramente leitura", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id);

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    expect(resultados.length).toBeGreaterThan(0);

    const total = await prisma.propertyInterest.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(0);
  });

  test("AZ) recarregar a busca de matching não cria ActivityLog nem Interaction", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id);

    await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    await buscarImoveisCompativeis(cenario.organization.id, pessoa.id); // "reload"

    const totalActivityLog = await prisma.activityLog.count({ where: { organizationId: cenario.organization.id } });
    const totalInteraction = await prisma.interaction.count({ where: { organizationId: cenario.organization.id } });
    expect(totalActivityLog).toBe(0);
    expect(totalInteraction).toBe(0);
  });

  test("BB) activeSoftCriteriaCount propaga até buscarImoveisCompativeis — sinal pra UI decidir se mostra percentual", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });
    // Preferência sem nenhum soft criterion preenchido — score interno
    // fica 100 (ordenável), mas activeSoftCriteriaCount deve chegar como 0
    // até o resultado final da orquestração, não só na função pura.
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id);

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    expect(resultados.length).toBeGreaterThan(0);
    for (const resultado of resultados) {
      expect(resultado.activeSoftCriteriaCount).toBe(0);
      expect(resultado.score).toBe(100);
    }
  });

  test("AK) personId de outra organização é rejeitado (Person validada por id + organizationId)", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarioB = await criarCenario({ modulos: ["core", "properties", "crm"] });
    const pessoaDeB = await criarPessoa({ organizationId: cenarioB.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferenciaNeutra(pessoaDeB.id, cenarioB.organization.id);

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoaDeB.id);
    expect(resultados).toEqual([]);
  });

  test("AL) sem entitlement do módulo CRM, não recomenda nada", async () => {
    // criarCenario() sem "crm" — default é ["core","properties"].
    cenario = await criarCenario();
    const pessoa = await criarPessoa({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });
    await criarPreferenciaNeutra(pessoa.id, cenario.organization.id);

    const resultados = await buscarImoveisCompativeis(cenario.organization.id, pessoa.id);
    expect(resultados).toEqual([]);
  });
});
