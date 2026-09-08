import { describe, test, expect } from "vitest";

// Sem mock nenhum: o módulo é PURO por construção — é o que permite o
// formulário de imóvel (Client Component) importá-lo sem arrastar
// Prisma para o bundle do navegador.
import {
  MAX_DESTAQUES_HOME,
  POSICOES_DESTAQUE,
  posicaoValida,
  interpretarPosicao,
} from "./vitrine-home";

describe("teto da vitrine", () => {
  test("são quatro posições, e apenas quatro", () => {
    expect(MAX_DESTAQUES_HOME).toBe(4);
    expect([...POSICOES_DESTAQUE]).toEqual([1, 2, 3, 4]);
  });

  test("uma quinta posição não é estado válido", () => {
    // O teto não é uma contagem em memória: é o conjunto de posições
    // que existem. Não há "quinto destaque escondido".
    expect(posicaoValida(5)).toBe(false);
    expect(posicaoValida(0)).toBe(false);
    expect(posicaoValida(-1)).toBe(false);
  });

  test("posição precisa ser inteira", () => {
    expect(posicaoValida(1.5)).toBe(false);
    expect(posicaoValida(NaN)).toBe(false);
    expect(posicaoValida(Infinity)).toBe(false);
  });

  test("nada além de número é posição", () => {
    expect(posicaoValida("1")).toBe(false);
    expect(posicaoValida(null)).toBe(false);
    expect(posicaoValida(undefined)).toBe(false);
    expect(posicaoValida({})).toBe(false);
  });
});

describe("interpretação do formulário", () => {
  test("vazio e zero significam remover da vitrine", () => {
    expect(interpretarPosicao("")).toEqual({ valido: true, posicao: null });
    expect(interpretarPosicao("0")).toEqual({ valido: true, posicao: null });
    expect(interpretarPosicao(null)).toEqual({ valido: true, posicao: null });
  });

  test("1 a 4 viram posições", () => {
    for (const posicao of POSICOES_DESTAQUE) {
      expect(interpretarPosicao(String(posicao))).toEqual({ valido: true, posicao });
    }
  });

  test("valor inesperado é RECUSADO, nunca lido como 'remover'", () => {
    // É a diferença entre um erro visível e uma remoção silenciosa: um
    // formulário adulterado com "9" não pode derrubar o imóvel da
    // vitrine como efeito colateral.
    for (const valor of ["5", "9", "abc", "-1", "1.5", "  "]) {
      expect(interpretarPosicao(valor)).toEqual({ valido: false });
    }
  });
});
