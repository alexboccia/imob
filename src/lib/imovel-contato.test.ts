import { describe, expect, test } from "vitest";
import {
  enderecoPublico,
  mensagemFormularioImovel,
  mensagemWhatsAppImovel,
} from "./imovel-contato";

const BASE = {
  title: "Apartamento com 2 quartos à venda, 58m²",
  code: 100008,
  type: "APARTAMENTO",
  purpose: "SALE",
  neighborhood: "Santo Amaro",
  city: "São Paulo",
  state: "SP",
  street: "Rua das Flores",
  number: "100",
  price: 500000,
};

describe("enderecoPublico", () => {
  test("junta logradouro com número e bairro", () => {
    expect(enderecoPublico(BASE)).toBe("Rua das Flores, 100 - Santo Amaro");
  });

  // Comportamento pré-existente preservado: sem número, mostra a rua
  // sozinha em vez de "Rua X, undefined" — nunca inventa um número.
  test("sem número, mostra a rua sem inventar número", () => {
    expect(enderecoPublico({ ...BASE, number: null })).toBe(
      "Rua das Flores - Santo Amaro"
    );
  });

  test("sem rua, sobra o bairro — nunca um hífen solto", () => {
    expect(enderecoPublico({ ...BASE, street: null })).toBe("Santo Amaro");
  });
});

describe("mensagemWhatsAppImovel", () => {
  test("identifica o imóvel por título, código e localização reais", () => {
    const m = mensagemWhatsAppImovel(BASE);
    expect(m).toContain(BASE.title);
    expect(m).toContain("cód. 100008");
    expect(m).toContain("Santo Amaro");
    expect(m).toContain("São Paulo");
  });

  test("usa o prefixo de código do tenant quando configurado", () => {
    expect(mensagemWhatsAppImovel(BASE, "IMB")).toContain("cód. IMB-100008");
  });

  test("não vaza endereço nem preço na mensagem do WhatsApp", () => {
    const m = mensagemWhatsAppImovel(BASE);
    expect(m).not.toContain("Rua das Flores");
    expect(m).not.toContain("500");
  });
});

describe("mensagemFormularioImovel", () => {
  test("usa o verbo da finalidade de venda", () => {
    expect(mensagemFormularioImovel(BASE, "Imobiliária X")).toContain("para comprar");
  });

  test("aluguel vira 'alugar' e usa o preço de aluguel quando não há venda", () => {
    const m = mensagemFormularioImovel(
      { ...BASE, purpose: "RENT", price: null, rentPrice: 2500 },
      "Imobiliária X"
    );
    expect(m).toContain("para alugar");
    expect(m).toContain("2.500");
  });

  test("venda e locação juntas viram 'comprar ou alugar'", () => {
    expect(
      mensagemFormularioImovel({ ...BASE, purpose: "SALE_AND_RENT" }, "Imobiliária X")
    ).toContain("comprar ou alugar");
  });

  test("cita o nome da organização recebida, nunca um nome fixo", () => {
    expect(mensagemFormularioImovel(BASE, "Imobiliária Y")).toContain(
      "site da Imobiliária Y"
    );
  });

  test("sem preço nenhum, cai no texto neutro de formatarPreco", () => {
    const m = mensagemFormularioImovel(
      { ...BASE, price: null, rentPrice: null },
      "Imobiliária X"
    );
    expect(m).toContain("Consulte-nos");
  });

  test("sem endereço, não deixa vírgula dupla", () => {
    const m = mensagemFormularioImovel(
      { ...BASE, street: null, neighborhood: "" },
      "Imobiliária X"
    );
    expect(m).not.toContain(", ,");
  });
});
