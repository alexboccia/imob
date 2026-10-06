import { describe, expect, test } from "vitest";
import {
  FORMATOS_ANUNCIO,
  formatoAnuncioPorId,
  opcoesFinalidadeAnuncio,
  finalidadeAnuncioAmbigua,
  finalidadeAnuncioValida,
  precoParaFinalidadeAnuncio,
  midiaPertenceAoImovel,
  nomeArquivoAnuncio,
} from "@/lib/anuncio-imovel";

describe("FORMATOS_ANUNCIO", () => {
  test("exatamente os três destinos da V1, com as dimensões documentadas", () => {
    expect(FORMATOS_ANUNCIO.map((f) => f.id)).toEqual(["feed", "story", "whatsapp"]);
    expect(formatoAnuncioPorId("feed")).toMatchObject({ largura: 1080, altura: 1350 });
    expect(formatoAnuncioPorId("story")).toMatchObject({ largura: 1080, altura: 1920 });
    expect(formatoAnuncioPorId("whatsapp")).toMatchObject({ largura: 1080, altura: 1080 });
  });

  test("formato desconhecido (ex.: query string adulterada) não resolve nada", () => {
    expect(formatoAnuncioPorId("tiktok")).toBeNull();
    expect(formatoAnuncioPorId("")).toBeNull();
  });
});

describe("finalidade do anúncio — SALE_AND_RENT nunca decide sozinho", () => {
  test("A) SALE tem exatamente uma opção, sem ambiguidade", () => {
    expect(opcoesFinalidadeAnuncio("SALE")).toEqual(["SALE"]);
    expect(finalidadeAnuncioAmbigua("SALE")).toBe(false);
  });

  test("B) RENT tem exatamente uma opção, sem ambiguidade", () => {
    expect(opcoesFinalidadeAnuncio("RENT")).toEqual(["RENT"]);
    expect(finalidadeAnuncioAmbigua("RENT")).toBe(false);
  });

  test("C) SALE_AND_RENT é ambíguo e oferece as duas opções — nunca escolhe sozinho", () => {
    expect(opcoesFinalidadeAnuncio("SALE_AND_RENT")).toEqual(["SALE", "RENT"]);
    expect(finalidadeAnuncioAmbigua("SALE_AND_RENT")).toBe(true);
  });

  test("purpose desconhecido não autoriza finalidade nenhuma", () => {
    expect(opcoesFinalidadeAnuncio("QUALQUER_COISA")).toEqual([]);
  });

  test("revalidação do servidor recusa finalidade que o purpose real não suporta (adulteração de query string)", () => {
    expect(finalidadeAnuncioValida("SALE", "RENT")).toBe(false);
    expect(finalidadeAnuncioValida("RENT", "SALE")).toBe(false);
    expect(finalidadeAnuncioValida("SALE", "SALE")).toBe(true);
    expect(finalidadeAnuncioValida("SALE_AND_RENT", "RENT")).toBe(true);
    expect(finalidadeAnuncioValida("SALE", null)).toBe(false);
    expect(finalidadeAnuncioValida("SALE", "alugar")).toBe(false);
  });
});

describe("preço do anúncio — ausência nunca vira zero", () => {
  test("D) imóvel sem preço: finalidade SALE sem price retorna null, nunca 0", () => {
    expect(precoParaFinalidadeAnuncio("SALE", { price: null, rentPrice: null })).toBeNull();
  });

  test("A) SALE com preço usa price, nunca rentPrice", () => {
    expect(
      precoParaFinalidadeAnuncio("SALE", { price: 500_000, rentPrice: 2_500 })
    ).toBe(500_000);
  });

  test("B) RENT com rentPrice usa rentPrice, nunca price", () => {
    expect(
      precoParaFinalidadeAnuncio("RENT", { price: 500_000, rentPrice: 2_500 })
    ).toBe(2_500);
  });

  test("C) SALE_AND_RENT: a finalidade já resolvida escolhe o valor correspondente, nunca mistura os dois", () => {
    const precos = { price: 500_000, rentPrice: 2_500 };
    expect(precoParaFinalidadeAnuncio("SALE", precos)).toBe(500_000);
    expect(precoParaFinalidadeAnuncio("RENT", precos)).toBe(2_500);
  });
});

describe("isolamento de tenant — mídia precisa pertencer ao imóvel pedido", () => {
  test("R) mídia da MESMA property é aceita", () => {
    expect(midiaPertenceAoImovel({ propertyId: "imovel-1" }, "imovel-1")).toBe(true);
  });

  test("S) mediaId de outro imóvel/tenant é recusado", () => {
    expect(midiaPertenceAoImovel({ propertyId: "imovel-2" }, "imovel-1")).toBe(false);
  });

  test("mediaId inexistente (não encontrado na lista do imóvel) é recusado", () => {
    expect(midiaPertenceAoImovel(undefined, "imovel-1")).toBe(false);
    expect(midiaPertenceAoImovel(null, "imovel-1")).toBe(false);
  });
});

describe("nome do arquivo — previsível, seguro, sem dado sensível", () => {
  test("O) monta um slug sem acento/espaço, terminando no formato escolhido", () => {
    const nome = nomeArquivoAnuncio({
      titulo: "Apartamento com 2 quartos à venda",
      cidade: "São Paulo",
      formatoId: "feed",
    });
    expect(nome).toBe("apartamento-com-2-quartos-a-venda-sao-paulo-feed.png");
  });

  test("títulos vazios/só símbolos ainda produzem um nome de arquivo válido", () => {
    const nome = nomeArquivoAnuncio({ titulo: "!!!", cidade: "", formatoId: "story" });
    expect(nome).toBe("story.png");
  });
});
