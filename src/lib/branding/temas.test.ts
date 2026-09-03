import { describe, test, expect } from "vitest";
import {
  resolverTema,
  resolverTemaEfetivo,
  CATALOGO_TEMAS,
  TEMA_PADRAO_ID,
  THEME_ID_CUSTOMIZADO,
  type TokensTema,
} from "@/lib/branding/temas";
import { parseOklchSeguro, razaoContraste, BRANCO } from "@/lib/branding/oklch-color";

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

describe("CATALOGO_TEMAS — integridade dos 11 temas", () => {
  // Os 6 originais NUNCA podem sumir nem trocar de chave: organizações
  // já têm esses valores gravados em OrganizationBranding.themeId.
  const idsOriginais = [
    "classic-blue",
    "forest",
    "wine",
    "graphite",
    "gold",
    "violet",
  ];
  const idsNovos = ["petrol", "terracotta", "emerald", "navy", "rosewood"];
  const idsEsperados = [...idsOriginais, ...idsNovos];

  test("contém exatamente os 11 temas esperados", () => {
    expect(Object.keys(CATALOGO_TEMAS).sort()).toEqual([...idsEsperados].sort());
  });

  test("são 11 predefinidos, que com o Personalizado dão 12 opções", () => {
    expect(Object.keys(CATALOGO_TEMAS)).toHaveLength(11);
    expect(Object.keys(CATALOGO_TEMAS).length + 1).toBe(12);
  });

  test("as chaves são únicas e as novas não colidem com as originais", () => {
    expect(new Set(Object.keys(CATALOGO_TEMAS)).size).toBe(11);
    for (const novo of idsNovos) expect(idsOriginais).not.toContain(novo);
  });

  test("cada tema tem id igual à própria chave e um label não vazio", () => {
    for (const [chave, tema] of Object.entries(CATALOGO_TEMAS)) {
      expect(tema.id).toBe(chave);
      expect(tema.label.trim()).not.toBe("");
    }
  });

  test("os labels são únicos (nenhuma opção repetida na tela)", () => {
    const labels = Object.values(CATALOGO_TEMAS).map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
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

// Cada token do catálogo precisa ser uma cor OKLCH que o parser oficial
// aceita de volta — é ele que o site público usa pra ler o tema, então um
// valor mal formatado aqui viraria tema quebrado em produção.
describe("CATALOGO_TEMAS — formato e contraste de todos os temas", () => {
  const TOKENS: (keyof TokensTema)[] = [
    "primary",
    "primaryHover",
    "primaryLight",
    "onPrimary",
    "secondary",
    "border",
    "link",
  ];

  test.each(Object.keys(CATALOGO_TEMAS))(
    "%s: todos os tokens são OKLCH válidos pro parser oficial",
    (id) => {
      const tema = CATALOGO_TEMAS[id];
      for (const token of TOKENS) {
        expect(tema[token], `${id}.${token} ausente`).toBeTruthy();
        expect(parseOklchSeguro(tema[token]), `${id}.${token} inválido`).not.toBeNull();
      }
    }
  );

  // O texto do botão é escolhido por tema (branco OU quase-preto). Este
  // teste recalcula o contraste em vez de confiar na escolha feita à mão:
  // se alguém mexer numa cor primária e esquecer o onPrimary, quebra aqui.
  test.each(Object.keys(CATALOGO_TEMAS))(
    "%s: texto sobre o botão atinge WCAG AA (>=4.5) sobre a cor principal",
    (id) => {
      const tema = CATALOGO_TEMAS[id];
      const primary = parseOklchSeguro(tema.primary)!;
      const onPrimary = parseOklchSeguro(tema.onPrimary)!;
      expect(razaoContraste(primary, onPrimary)).toBeGreaterThanOrEqual(4.5);
    }
  );

  // Links são renderizados sobre o --background estático (branco).
  //
  // `gold` fica de fora: ele já estava em ~3.7:1 (abaixo de AA) ANTES
  // desta ampliação do catálogo, e corrigi-lo mudaria a cor de link de
  // quem já usa esse tema — fora do escopo de "adicionar opções novas".
  // A limitação fica registrada no teste logo abaixo, em vez de sumir.
  const semGold = Object.keys(CATALOGO_TEMAS).filter((id) => id !== "gold");

  test.each(semGold)("%s: link atinge WCAG AA (>=4.5) sobre fundo branco", (id) => {
    const link = parseOklchSeguro(CATALOGO_TEMAS[id].link)!;
    expect(razaoContraste(link, BRANCO)).toBeGreaterThanOrEqual(4.5);
  });

  // Dívida conhecida e deliberada, fixada aqui pra não piorar sem que
  // alguém perceba: se o gold for retocado um dia, este número muda e o
  // teste obriga a decisão consciente.
  test("gold: contraste de link abaixo de AA é uma limitação pré-existente conhecida", () => {
    const link = parseOklchSeguro(CATALOGO_TEMAS.gold.link)!;
    const razao = razaoContraste(link, BRANCO);
    expect(razao).toBeLessThan(4.5);
    expect(razao).toBeGreaterThan(3.5);
  });

  // Hover precisa comunicar interação: escuro o bastante pra se notar,
  // sem virar outra cor.
  test.each(Object.keys(CATALOGO_TEMAS))(
    "%s: hover é perceptivelmente mais escuro que a cor principal, no mesmo matiz",
    (id) => {
      const tema = CATALOGO_TEMAS[id];
      const primary = parseOklchSeguro(tema.primary)!;
      const hover = parseOklchSeguro(tema.primaryHover)!;
      expect(primary.l - hover.l).toBeGreaterThanOrEqual(0.05);
      // Cinzas (croma ~0) não têm matiz significativo pra comparar.
      if (primary.c > 0.02) expect(Math.abs(primary.h - hover.h)).toBeLessThanOrEqual(5);
    }
  );

  // Claros de apoio: precisam ser claros o bastante pra servir de fundo,
  // mas não tão brancos que sumam contra o --background.
  test.each(Object.keys(CATALOGO_TEMAS))(
    "%s: primaryLight e secondary são claros sem desaparecer no branco",
    (id) => {
      const tema = CATALOGO_TEMAS[id];
      for (const token of ["primaryLight", "secondary"] as const) {
        const cor = parseOklchSeguro(tema[token])!;
        expect(cor.l).toBeGreaterThanOrEqual(0.9);
        expect(cor.l).toBeLessThanOrEqual(0.98);
      }
    }
  );

  // Borda: tem que separar componentes sem virar um traço preto.
  test.each(Object.keys(CATALOGO_TEMAS))(
    "%s: borda tem luminosidade de separador, nem invisível nem pesada",
    (id) => {
      const borda = parseOklchSeguro(CATALOGO_TEMAS[id].border)!;
      expect(borda.l).toBeGreaterThanOrEqual(0.82);
      expect(borda.l).toBeLessThanOrEqual(0.93);
    }
  );

  // O ganho da ampliação é variedade: duas opções quase idênticas na
  // grade não servem pra nada. Compara cada par pela distância em
  // L/C/matiz.
  test("nenhum par de temas tem cor principal visualmente redundante", () => {
    const temas = Object.values(CATALOGO_TEMAS);
    for (let i = 0; i < temas.length; i++) {
      for (let j = i + 1; j < temas.length; j++) {
        const a = parseOklchSeguro(temas[i].primary)!;
        const b = parseOklchSeguro(temas[j].primary)!;
        let dh = Math.abs(a.h - b.h);
        if (dh > 180) dh = 360 - dh;
        const distancia = Math.sqrt(
          ((a.l - b.l) * 100) ** 2 + ((a.c - b.c) * 200) ** 2 + (dh * 0.5) ** 2
        );
        expect(
          distancia,
          `${temas[i].id} e ${temas[j].id} estão parecidos demais`
        ).toBeGreaterThan(10);
      }
    }
  });
});
