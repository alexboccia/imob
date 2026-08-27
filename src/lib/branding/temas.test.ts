import { describe, test, expect } from "vitest";
import {
  resolverTema,
  resolverTemaEfetivo,
  CATALOGO_TEMAS,
  TEMA_PADRAO_ID,
  THEME_ID_CUSTOMIZADO,
} from "@/lib/branding/temas";

const TOKENS_CUSTOM = {
  primary: "oklch(0.5 0.2 40)",
  primaryHover: "oklch(0.42 0.2 40)",
  primaryLight: "oklch(0.93 0.04 40)",
  onPrimary: "oklch(1 0 0)",
  secondary: "oklch(0.96 0.02 40)",
  border: "oklch(0.875 0.03 40)",
  link: "oklch(0.5 0.2 40)",
};

describe("resolverTema — fallback obrigatório pra classic-blue", () => {
  test("themeId ausente (undefined) cai no tema padrão", () => {
    expect(resolverTema(undefined).id).toBe(TEMA_PADRAO_ID);
  });

  test("themeId nulo cai no tema padrão", () => {
    expect(resolverTema(null).id).toBe(TEMA_PADRAO_ID);
  });

  test("themeId vazio cai no tema padrão", () => {
    expect(resolverTema("").id).toBe(TEMA_PADRAO_ID);
  });

  test("themeId que não existe mais no catálogo (tema descontinuado) cai no tema padrão", () => {
    expect(resolverTema("tema-removido-no-passado").id).toBe(TEMA_PADRAO_ID);
  });

  test("themeId válido resolve pro tema correspondente", () => {
    expect(resolverTema("forest").id).toBe("forest");
  });
});

describe("CATALOGO_TEMAS — integridade dos 6 temas", () => {
  const idsEsperados = [
    "classic-blue",
    "forest",
    "wine",
    "graphite",
    "gold",
    "violet",
  ];

  test("contém exatamente os 6 temas esperados", () => {
    expect(Object.keys(CATALOGO_TEMAS).sort()).toEqual(idsEsperados.sort());
  });

  test.each(idsEsperados)("%s define todos os 7 tokens", (id) => {
    const tema = CATALOGO_TEMAS[id];
    expect(tema.primary).toBeTruthy();
    expect(tema.primaryHover).toBeTruthy();
    expect(tema.primaryLight).toBeTruthy();
    expect(tema.onPrimary).toBeTruthy();
    expect(tema.secondary).toBeTruthy();
    expect(tema.border).toBeTruthy();
    expect(tema.link).toBeTruthy();
  });

  test.each(idsEsperados)("%s: link segue primary", (id) => {
    const tema = CATALOGO_TEMAS[id];
    expect(tema.link).toBe(tema.primary);
  });
});

describe("resolverTemaEfetivo — tema personalizado (gerado do logotipo) + fallback pros 6 fixos", () => {
  test("themeId=custom com customTheme válido usa o tema personalizado", () => {
    const tema = resolverTemaEfetivo(THEME_ID_CUSTOMIZADO, TOKENS_CUSTOM);
    expect(tema.id).toBe(THEME_ID_CUSTOMIZADO);
    expect(tema.primary).toBe(TOKENS_CUSTOM.primary);
  });

  test("themeId=custom SEM customTheme (nunca gerou ainda) cai no tema padrão, nunca quebra", () => {
    expect(resolverTemaEfetivo(THEME_ID_CUSTOMIZADO, null).id).toBe(TEMA_PADRAO_ID);
    expect(resolverTemaEfetivo(THEME_ID_CUSTOMIZADO, undefined).id).toBe(TEMA_PADRAO_ID);
  });

  test("themeId de um tema fixo continua funcionando normalmente (customTheme é ignorado)", () => {
    const tema = resolverTemaEfetivo("forest", TOKENS_CUSTOM);
    expect(tema.id).toBe("forest");
    expect(tema.primary).toBe(CATALOGO_TEMAS.forest.primary);
  });

  test("themeId ausente/inválido cai no tema padrão, com ou sem customTheme presente", () => {
    expect(resolverTemaEfetivo(null, TOKENS_CUSTOM).id).toBe(TEMA_PADRAO_ID);
    expect(resolverTemaEfetivo("tema-que-nao-existe", TOKENS_CUSTOM).id).toBe(TEMA_PADRAO_ID);
  });

  test("THEME_ID_CUSTOMIZADO nunca colide com nenhuma chave do catálogo fixo", () => {
    expect(Object.keys(CATALOGO_TEMAS)).not.toContain(THEME_ID_CUSTOMIZADO);
  });
});
