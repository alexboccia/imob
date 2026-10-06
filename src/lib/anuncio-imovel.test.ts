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
  resolverPapelSlide,
  quantidadeDeSlidesValida,
  mediaIdsSemDuplicatas,
  papelPorPosicao,
  nomeArquivoCarrossel,
  LIMITE_SLIDES_CARROSSEL,
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

describe("carrossel (MKT-002) — papel do slide", () => {
  test("papel desconhecido/adulterado na query string cai no padrão 'capa' (mesmo comportamento de hoje)", () => {
    expect(resolverPapelSlide(null)).toBe("capa");
    expect(resolverPapelSlide("")).toBe("capa");
    expect(resolverPapelSlide("qualquer-coisa")).toBe("capa");
  });

  test("papel explícito válido é respeitado", () => {
    expect(resolverPapelSlide("foto")).toBe("foto");
    expect(resolverPapelSlide("cta")).toBe("cta");
    expect(resolverPapelSlide("capa")).toBe("capa");
  });
});

describe("carrossel — quantidade de slides (D, E)", () => {
  test(`D) abaixo do mínimo (${LIMITE_SLIDES_CARROSSEL.min}) é recusado`, () => {
    expect(quantidadeDeSlidesValida(LIMITE_SLIDES_CARROSSEL.min - 1)).toBe(false);
    expect(quantidadeDeSlidesValida(1)).toBe(false);
    expect(quantidadeDeSlidesValida(0)).toBe(false);
  });

  test(`E) acima do máximo (${LIMITE_SLIDES_CARROSSEL.max}) é recusado`, () => {
    expect(quantidadeDeSlidesValida(LIMITE_SLIDES_CARROSSEL.max + 1)).toBe(false);
    expect(quantidadeDeSlidesValida(99)).toBe(false);
  });

  test("dentro da faixa (incluindo as bordas) é aceito", () => {
    expect(quantidadeDeSlidesValida(LIMITE_SLIDES_CARROSSEL.min)).toBe(true);
    expect(quantidadeDeSlidesValida(LIMITE_SLIDES_CARROSSEL.max)).toBe(true);
    expect(quantidadeDeSlidesValida(5)).toBe(true);
  });

  test("não-inteiro nunca é uma quantidade válida", () => {
    expect(quantidadeDeSlidesValida(2.5)).toBe(false);
  });
});

describe("carrossel — ordem sem duplicata (N)", () => {
  test("N) mediaId repetido na ordem é recusado — não é uma sequência coerente", () => {
    expect(mediaIdsSemDuplicatas(["a", "b", "a"])).toBe(false);
  });

  test("ordem sem repetição é aceita, em qualquer tamanho", () => {
    expect(mediaIdsSemDuplicatas(["a", "b", "c"])).toBe(true);
    expect(mediaIdsSemDuplicatas([])).toBe(true);
  });
});

describe("carrossel — papel por posição", () => {
  test("primeira posição é sempre capa, última é sempre cta", () => {
    expect(papelPorPosicao(0, 5)).toBe("capa");
    expect(papelPorPosicao(4, 5)).toBe("cta");
  });

  test("posições do meio são 'foto'", () => {
    expect(papelPorPosicao(1, 5)).toBe("foto");
    expect(papelPorPosicao(2, 5)).toBe("foto");
    expect(papelPorPosicao(3, 5)).toBe("foto");
  });

  test("com o mínimo de 2 slides não existe posição 'foto' — só capa e cta", () => {
    expect(papelPorPosicao(0, 2)).toBe("capa");
    expect(papelPorPosicao(1, 2)).toBe("cta");
  });
});

describe("carrossel — nome de arquivo numerado (seção 19)", () => {
  test("K) numeração com dois dígitos, em ordem, terminando em -carrossel-NN", () => {
    const base = { titulo: "Apartamento em Pinheiros", cidade: "São Paulo" };
    expect(nomeArquivoCarrossel({ ...base, indice: 0, total: 3 })).toBe(
      "apartamento-em-pinheiros-sao-paulo-carrossel-01.png"
    );
    expect(nomeArquivoCarrossel({ ...base, indice: 1, total: 3 })).toBe(
      "apartamento-em-pinheiros-sao-paulo-carrossel-02.png"
    );
    expect(nomeArquivoCarrossel({ ...base, indice: 9, total: 10 })).toBe(
      "apartamento-em-pinheiros-sao-paulo-carrossel-10.png"
    );
  });

  test("nunca inclui e-mail, telefone ou id interno — só o que o próprio anúncio já expõe", () => {
    const nome = nomeArquivoCarrossel({
      titulo: "Casa",
      cidade: "Campinas",
      indice: 0,
      total: 2,
    });
    expect(nome).not.toMatch(/@|\d{4,}/);
  });
});
