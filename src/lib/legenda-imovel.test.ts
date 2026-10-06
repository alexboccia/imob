import { describe, expect, test } from "vitest";
import {
  CANAIS_LEGENDA,
  montarFatosLegenda,
  formatarLegenda,
  formatarLegendaInstagram,
  formatarLegendaFacebook,
  formatarLegendaWhatsapp,
} from "@/lib/legenda-imovel";

// Fixture mínima (seção 35): um apartamento com 2 quartos em São Paulo,
// nada mais. A saída NUNCA pode adicionar suíte, varanda, vagas,
// piscina, academia, metragem, "reformado" ou "mobiliado" — nenhum
// desses é dado desta fixture.
function fatosMinimos(overrides: Partial<Parameters<typeof montarFatosLegenda>[0]> = {}) {
  return montarFatosLegenda({
    type: "Apartamento",
    finalidade: "SALE",
    precos: { price: null, rentPrice: null },
    condoFee: null,
    propertyTax: null,
    neighborhood: "",
    city: "São Paulo",
    state: "SP",
    totalArea: null,
    privateArea: null,
    bedrooms: 2,
    suites: null,
    bathrooms: null,
    parkingSpots: null,
    nomeOrganizacao: "Imobiliária Exemplo",
    whatsapp: null,
    ...overrides,
  });
}

const loc = { bairro: null as string | null, cidade: "São Paulo" };

// formatarPreco usa Intl (NBSP entre "R$" e o número, convenção já
// estabelecida em valores-publicos.test.ts) — normalizado aqui só pra
// comparação textual, nunca no módulo em si.
const semNbsp = (s: string) => s.replace(/\s/g, " ");

describe("CANAIS_LEGENDA", () => {
  test("exatamente os três canais da V1 (seção 10) — nunca LinkedIn/TikTok/X/e-mail/SMS", () => {
    expect(CANAIS_LEGENDA.map((c) => c.id)).toEqual(["instagram", "facebook", "whatsapp"]);
  });
});

describe("proteção contra conteúdo inventado (seção 35)", () => {
  test("dados mínimos (2 quartos, São Paulo): nenhum fato não fornecido aparece em nenhum canal", () => {
    const fatos = fatosMinimos();
    for (const canal of ["instagram", "facebook", "whatsapp"] as const) {
      const texto = formatarLegenda(canal, fatos, loc).toLowerCase();
      for (const palavra of [
        "suíte",
        "varanda",
        "vaga",
        "piscina",
        "academia",
        "m²",
        "reformado",
        "mobiliado",
        "financiamento",
        "vista",
      ]) {
        expect(texto, `canal ${canal} não deveria conter "${palavra}"`).not.toContain(palavra);
      }
    }
  });

  test("Q) nenhum campo interno aparece (comissão, id, e-mail, telefone privado)", () => {
    const fatos = fatosMinimos();
    const texto = formatarLegendaInstagram(fatos, loc);
    expect(texto).not.toMatch(/@|comiss|cm[a-z0-9]{20,}/i);
  });

  test("R) texto determinístico para a mesma entrada", () => {
    const fatos = fatosMinimos();
    expect(formatarLegendaInstagram(fatos, loc)).toBe(formatarLegendaInstagram(fatos, loc));
  });
});

describe("SALE / RENT / SALE_AND_RENT (seções 14-16)", () => {
  test("D) SALE usa price, nunca rentPrice", () => {
    const fatos = fatosMinimos({
      finalidade: "SALE",
      precos: { price: 500_000, rentPrice: 2_500 },
    });
    expect(semNbsp(fatos.precoFormatado!)).toBe("R$ 500.000");
    expect(formatarLegendaFacebook(fatos)).not.toMatch(/2\.500/);
  });

  test("E) RENT usa rentPrice, nunca price, e o canal WhatsApp marca o valor com /mês", () => {
    const fatos = fatosMinimos({
      finalidade: "RENT",
      precos: { price: 500_000, rentPrice: 2_500 },
    });
    expect(semNbsp(fatos.precoFormatado!)).toBe("R$ 2.500");
    expect(semNbsp(formatarLegendaWhatsapp(fatos))).toMatch(/R\$ 2\.500\/mês/);
    expect(formatarLegendaWhatsapp(fatos)).not.toMatch(/500\.000/);
  });

  test("F) SALE_AND_RENT: a finalidade já resolvida (reaproveitando o helper do anúncio) decide o valor — nunca mistura os dois no mesmo texto", () => {
    const precos = { price: 900_000, rentPrice: 5_000 };
    const venda = fatosMinimos({ finalidade: "SALE", precos });
    const aluguel = fatosMinimos({ finalidade: "RENT", precos });
    expect(semNbsp(venda.precoFormatado!)).toBe("R$ 900.000");
    expect(semNbsp(aluguel.precoFormatado!)).toBe("R$ 5.000");
    expect(formatarLegendaFacebook(venda)).not.toMatch(/5\.000/);
    expect(formatarLegendaFacebook(aluguel)).not.toMatch(/900\.000/);
  });
});

describe("ausência ≠ zero (seção 17)", () => {
  test("G) preço ausente nunca vira R$ 0 nem 'Consulte-nos' — a linha some", () => {
    const fatos = fatosMinimos({ precos: { price: null, rentPrice: null } });
    expect(fatos.precoFormatado).toBeNull();
    for (const texto of [
      formatarLegendaInstagram(fatos, loc),
      formatarLegendaFacebook(fatos),
      formatarLegendaWhatsapp(fatos),
    ]) {
      expect(texto).not.toMatch(/R\$\s*0\b/);
      expect(texto).not.toMatch(/consulte/i);
    }
  });

  test("H) área ausente não aparece como '0 m²'", () => {
    const fatos = fatosMinimos({ totalArea: null, privateArea: null });
    expect(formatarLegendaFacebook(fatos)).not.toMatch(/0\s*m²/);
  });

  test("I) quartos ausentes não aparecem como '0 quartos'", () => {
    const fatos = fatosMinimos({ bedrooms: null });
    expect(formatarLegendaFacebook(fatos)).not.toMatch(/0 quartos?/);
  });

  test("J) vagas ausentes não aparecem como '0 vagas'", () => {
    const fatos = fatosMinimos({ parkingSpots: null });
    expect(formatarLegendaFacebook(fatos)).not.toMatch(/0 vagas?/);
  });

  test("dados completos: cada atributo real aparece exatamente uma vez, sem repetição", () => {
    const fatos = fatosMinimos({
      totalArea: 78,
      bedrooms: 2,
      suites: 1,
      bathrooms: 2,
      parkingSpots: 2,
    });
    const texto = formatarLegendaFacebook(fatos);
    expect(texto.match(/quartos?/gi)).toHaveLength(1);
    expect(texto).toMatch(/78 m²/);
  });
});

describe("formatação de parágrafos (achado da inspeção manual)", () => {
  test("preço sem nenhum item estrutural ainda tem respiro — nunca cola na frase de abertura", () => {
    const fatos = fatosMinimos({
      bedrooms: null,
      precos: { price: 500_000, rentPrice: null },
    });
    const texto = formatarLegendaInstagram(fatos, loc);
    expect(texto).toContain("\n\nR$");
    expect(texto.split("\n\n")[0]).toMatch(/\.$/);
  });
});

describe("localização (K)", () => {
  test("bairro ausente ainda produz uma localização válida (cidade - UF)", () => {
    const fatos = fatosMinimos({ neighborhood: "", city: "Campinas", state: "SP" });
    expect(fatos.localizacao).toBe("Campinas - SP");
  });
});

describe("branding e contato (L, M)", () => {
  test("L) branding ausente: nome da organização ainda aparece (fallback já resolvido por quem chama)", () => {
    const fatos = fatosMinimos({ nomeOrganizacao: "Organização Sem Marca" });
    expect(formatarLegendaFacebook(fatos)).toContain("Organização Sem Marca");
  });

  test("M) sem WhatsApp configurado, o CTA cai no convite genérico — nunca um número vazio/quebrado", () => {
    const fatos = fatosMinimos({ whatsapp: null });
    const texto = formatarLegendaInstagram(fatos, loc);
    expect(texto).toContain("Entre em contato com Imobiliária Exemplo para mais informações.");
    expect(texto).not.toMatch(/WhatsApp:\s*$/m);
  });

  test("com WhatsApp configurado, o CTA usa o número real do tenant e o nome da organização", () => {
    const fatos = fatosMinimos({ whatsapp: "(11) 98888-7777" });
    expect(formatarLegendaInstagram(fatos, loc)).toContain(
      "Fale com Imobiliária Exemplo pelo WhatsApp: (11) 98888-7777"
    );
  });
});

describe("custos — condomínio/IPTU (seção 15)", () => {
  test("aparecem só quando cadastrados, nunca somados nem inventados", () => {
    const fatos = fatosMinimos({ condoFee: 720, propertyTax: 310 });
    expect(semNbsp(formatarLegendaFacebook(fatos))).toMatch(/Condomínio: R\$ 720[\s\S]*IPTU: R\$ 310/);
  });

  test("sem condomínio nem IPTU, a linha não existe", () => {
    const fatos = fatosMinimos({ condoFee: null, propertyTax: null });
    expect(formatarLegendaFacebook(fatos)).not.toMatch(/condom|iptu/i);
  });
});

describe("diferença entre canais (seção 11) — mesmos fatos, apresentação distinta", () => {
  const fatos = fatosMinimos({
    finalidade: "RENT",
    precos: { price: null, rentPrice: 3_200 },
    neighborhood: "Pinheiros",
    bedrooms: 2,
  });
  const locComBairro = { bairro: "Pinheiros", cidade: "São Paulo" };

  test("A) Instagram tem hashtags; Facebook e WhatsApp não", () => {
    expect(formatarLegendaInstagram(fatos, locComBairro)).toMatch(/#\w+/);
    expect(formatarLegendaFacebook(fatos)).not.toMatch(/#\w+/);
    expect(formatarLegendaWhatsapp(fatos)).not.toMatch(/#\w+/);
  });

  test("B) Facebook é só texto corrido, sem marcação", () => {
    expect(formatarLegendaFacebook(fatos)).not.toMatch(/\*/);
  });

  test("C) WhatsApp preserva compatibilidade de formatação (negrito nativo) no preço", () => {
    expect(semNbsp(formatarLegendaWhatsapp(fatos))).toMatch(/\*R\$ 3\.200\/mês\*/);
  });
});
