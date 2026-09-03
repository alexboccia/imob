import { describe, test, expect } from "vitest";
import {
  LOGO_RODAPE_ALTURA_PADRAO,
  LOGO_RODAPE_ALTURA_MIN,
  LOGO_RODAPE_ALTURA_MAX,
  larguraCaixaLogoRodape,
} from "@/lib/logo";

describe("larguraCaixaLogoRodape", () => {
  // O rodapé usava uma caixa fixa de 44x112 antes da altura virar
  // configurável. Este é o teste que garante que quem NUNCA mexeu no
  // campo continua vendo exatamente o rodapé de antes.
  test("na altura padrão devolve a mesma largura que o rodapé tinha fixa", () => {
    expect(LOGO_RODAPE_ALTURA_PADRAO).toBe(44);
    expect(larguraCaixaLogoRodape(LOGO_RODAPE_ALTURA_PADRAO)).toBe(112);
  });

  test("mantém a proporção ao crescer, sem distorcer o logo", () => {
    const proporcaoPadrao =
      larguraCaixaLogoRodape(LOGO_RODAPE_ALTURA_PADRAO) / LOGO_RODAPE_ALTURA_PADRAO;
    for (const altura of [LOGO_RODAPE_ALTURA_MIN, 60, LOGO_RODAPE_ALTURA_MAX]) {
      expect(larguraCaixaLogoRodape(altura) / altura).toBeCloseTo(proporcaoPadrao, 1);
    }
  });

  test("devolve sempre inteiro (vira pixel em style inline)", () => {
    for (const altura of [25, 33, 47, 91]) {
      expect(Number.isInteger(larguraCaixaLogoRodape(altura))).toBe(true);
    }
  });
});
