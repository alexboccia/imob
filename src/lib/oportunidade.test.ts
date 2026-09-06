import { describe, test, expect } from "vitest";
import { oportunidadeElegivel } from "@/lib/oportunidade";

// Regra de elegibilidade da Fase 8. É a mesma função usada pela tela
// (mostrar o botão) e pelo servidor (autorizar a conversão) — a tela é só
// UX, a action revalida.
describe("oportunidadeElegivel", () => {
  test("contato de página de imóvel COM imóvel é elegível", () => {
    expect(oportunidadeElegivel({ origin: "IMOVEL", propertyId: "imovel-1" })).toBe(true);
  });

  test("CONTATO não é elegível — conversa geral, sem imóvel definido", () => {
    // Transformar isto em oportunidade exigiria adivinhar QUAL imóvel.
    expect(oportunidadeElegivel({ origin: "CONTATO", propertyId: null })).toBe(false);
    // Nem mesmo se por acaso houver um propertyId: o contexto continua
    // sendo conversa geral, não interesse declarado naquele imóvel.
    expect(oportunidadeElegivel({ origin: "CONTATO", propertyId: "imovel-1" })).toBe(false);
  });

  test("ANUNCIE não é elegível — é o oposto comercial do funil de comprador", () => {
    expect(oportunidadeElegivel({ origin: "ANUNCIE", propertyId: null })).toBe(false);
    expect(oportunidadeElegivel({ origin: "ANUNCIE", propertyId: "imovel-1" })).toBe(false);
  });

  test("interação registrada à mão (origin=null) não é elegível", () => {
    // Não é captação e nunca teve origem de tráfego pra preservar.
    expect(oportunidadeElegivel({ origin: null, propertyId: "imovel-1" })).toBe(false);
  });

  test("IMOVEL SEM propertyId não é elegível (registro antigo ou adulterado)", () => {
    expect(oportunidadeElegivel({ origin: "IMOVEL", propertyId: null })).toBe(false);
  });

  test("origem fora do catálogo nunca é promovida a elegível", () => {
    for (const origem of ["VISIT", "PORTAL_FUTURO", "toString", "constructor", ""]) {
      expect(oportunidadeElegivel({ origin: origem, propertyId: "imovel-1" })).toBe(false);
    }
  });
});
