import { describe, expect, test } from "vitest";
import {
  ORIGENS_CAPTACAO,
  origemDoContato,
  origemValida,
  rotuloOrigemCaptacao,
} from "./captacao";

describe("origemDoContato — decidida pelo servidor", () => {
  test("com imóvel validado, o contato nasceu na página do imóvel", () => {
    expect(origemDoContato("imovel-123")).toBe("IMOVEL");
  });

  test("sem imóvel, veio da página de contato", () => {
    expect(origemDoContato(null)).toBe("CONTATO");
  });

  // O parâmetro é o id JÁ validado contra a organização — um imovelId de
  // outro tenant é anulado antes de chegar aqui, então cai em CONTATO em
  // vez de forjar uma origem de imóvel.
  test("id anulado pela validação de tenant cai em CONTATO", () => {
    expect(origemDoContato(null)).toBe(ORIGENS_CAPTACAO.CONTATO);
  });
});

describe("origemValida — só grava o que o produto conhece", () => {
  test("aceita as três origens do catálogo", () => {
    expect(origemValida("IMOVEL")).toBe(true);
    expect(origemValida("CONTATO")).toBe(true);
    expect(origemValida("ANUNCIE")).toBe(true);
  });

  test("recusa valor fora do catálogo, nulo ou de outro tipo", () => {
    expect(origemValida("PORTAL_INEXISTENTE")).toBe(false);
    expect(origemValida("")).toBe(false);
    expect(origemValida(null)).toBe(false);
    expect(origemValida(undefined)).toBe(false);
    expect(origemValida(42)).toBe(false);
  });

  test("não confunde propriedade herdada de Object com origem válida", () => {
    expect(origemValida("toString")).toBe(false);
    expect(origemValida("constructor")).toBe(false);
  });
});

describe("rotuloOrigemCaptacao", () => {
  test("traduz as três origens para o corretor", () => {
    expect(rotuloOrigemCaptacao("IMOVEL")).toBe("Página do imóvel");
    expect(rotuloOrigemCaptacao("CONTATO")).toBe("Página de contato");
    expect(rotuloOrigemCaptacao("ANUNCIE")).toBe("Anuncie seu imóvel");
  });

  // Interações anteriores a esta fase têm origin null: a etiqueta
  // simplesmente não aparece, em vez de "undefined" na tela.
  test("origem ausente ou desconhecida não vira etiqueta", () => {
    expect(rotuloOrigemCaptacao(null)).toBeNull();
    expect(rotuloOrigemCaptacao(undefined)).toBeNull();
    expect(rotuloOrigemCaptacao("QUALQUER_COISA")).toBeNull();
  });
});
