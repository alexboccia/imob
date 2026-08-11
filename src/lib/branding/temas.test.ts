import { describe, test, expect } from "vitest";
import { resolverTema, CATALOGO_TEMAS, TEMA_PADRAO_ID } from "@/lib/branding/temas";

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
