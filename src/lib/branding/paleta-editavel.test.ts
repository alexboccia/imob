import { describe, test, expect } from "vitest";
import { aplicarCorNaPaleta } from "@/lib/branding/paleta-editavel";
import { oklchParaHex, parseOklchSeguro } from "@/lib/branding/oklch-color";
import type { TokensTema } from "@/lib/branding/temas";

const PALETA_BASE: TokensTema = {
  primary: "oklch(0.55 0.18 255)",
  primaryHover: "oklch(0.47 0.18 255)",
  primaryLight: "oklch(0.93 0.036 255)",
  onPrimary: "oklch(1 0 0)",
  secondary: "oklch(0.96 0.02 255)",
  border: "oklch(0.875 0.027 255)",
  link: "oklch(0.55 0.18 255)",
};

function hexDe(paleta: TokensTema, chave: keyof TokensTema): string {
  const oklch = parseOklchSeguro(paleta[chave]);
  return oklch ? oklchParaHex(oklch) : "";
}

// Cada linha da "Paleta sugerida" tem seu próprio conta-gotas, e o
// requisito central é que um NUNCA encoste no outro. Cada caso abaixo
// escolhe uma cor e confere as outras seis chaves intactas.
describe("aplicarCorNaPaleta — cada cor é independente", () => {
  const CASOS: { chave: keyof TokensTema; rotulo: string; hex: string }[] = [
    { chave: "primary", rotulo: "Principal", hex: "#111111" },
    { chave: "primaryHover", rotulo: "Principal (hover)", hex: "#222222" },
    { chave: "primaryLight", rotulo: "Principal (clara)", hex: "#333333" },
    { chave: "secondary", rotulo: "Secundária", hex: "#444444" },
    { chave: "border", rotulo: "Borda", hex: "#555555" },
    { chave: "onPrimary", rotulo: "Texto sobre botão", hex: "#666666" },
  ];

  for (const { chave, rotulo, hex } of CASOS) {
    test(`${rotulo}: recebe ${hex} e nenhuma outra cor muda`, () => {
      const nova = aplicarCorNaPaleta(PALETA_BASE, chave, hex);

      // A cor escolhida virou exatamente o hex selecionado (ida e volta
      // pelo OKLCH preserva o valor, que é o que a UI mostra de volta).
      expect(hexDe(nova, chave)).toBe(hex);

      for (const outra of Object.keys(PALETA_BASE) as (keyof TokensTema)[]) {
        if (outra === chave) continue;
        expect(nova[outra]).toBe(PALETA_BASE[outra]);
      }
    });
  }

  test("não muta a paleta original (estado anterior continua íntegro)", () => {
    const copia = { ...PALETA_BASE };
    aplicarCorNaPaleta(PALETA_BASE, "primary", "#abcdef");
    expect(PALETA_BASE).toEqual(copia);
  });

  test("mantém `link` intacto, mesmo não sendo editável na UI", () => {
    const nova = aplicarCorNaPaleta(PALETA_BASE, "primary", "#003366");
    expect(nova.link).toBe(PALETA_BASE.link);
  });

  test("hex inválido devolve a paleta inalterada, sem quebrar a prévia", () => {
    for (const invalido of ["", "#12", "vermelho", "#GGGGGG", "123456"]) {
      expect(aplicarCorNaPaleta(PALETA_BASE, "primary", invalido)).toEqual(PALETA_BASE);
    }
  });

  test("aceita #RRGGBB em maiúsculas e a forma curta #RGB", () => {
    expect(hexDe(aplicarCorNaPaleta(PALETA_BASE, "primary", "#FFFFFF"), "primary")).toBe("#ffffff");
    expect(hexDe(aplicarCorNaPaleta(PALETA_BASE, "primary", "#000000"), "primary")).toBe("#000000");
    expect(hexDe(aplicarCorNaPaleta(PALETA_BASE, "primary", "#f13041"), "primary")).toBe("#f13041");
    expect(hexDe(aplicarCorNaPaleta(PALETA_BASE, "primary", "#fff"), "primary")).toBe("#ffffff");
  });

  test("edições sucessivas em cores diferentes se acumulam", () => {
    let p = PALETA_BASE;
    p = aplicarCorNaPaleta(p, "primary", "#111111");
    p = aplicarCorNaPaleta(p, "border", "#555555");
    expect(hexDe(p, "primary")).toBe("#111111");
    expect(hexDe(p, "border")).toBe("#555555");
    // As demais seguem como no original.
    expect(p.secondary).toBe(PALETA_BASE.secondary);
    expect(p.onPrimary).toBe(PALETA_BASE.onPrimary);
  });
});
