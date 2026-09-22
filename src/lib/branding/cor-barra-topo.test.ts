import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { estiloDaBarraTopo, normalizarCorBarraTopo } from "@/lib/branding/cor-barra-topo";
import { hexParaOklch, razaoContraste } from "@/lib/branding/oklch-color";

// =======================================================================
// Cor de fundo da barra superior (Fase 58.5)
// =======================================================================

describe("sem personalização", () => {
  test("null, undefined e vazio caem no visual padrão", () => {
    expect(estiloDaBarraTopo(null)).toBeNull();
    expect(estiloDaBarraTopo(undefined)).toBeNull();
    expect(estiloDaBarraTopo("")).toBeNull();
    expect(estiloDaBarraTopo("   ")).toBeNull();
  });

  test("normalizar devolve null para vazio — nunca string vazia", () => {
    expect(normalizarCorBarraTopo("")).toBeNull();
    expect(normalizarCorBarraTopo("  ")).toBeNull();
    expect(normalizarCorBarraTopo(null)).toBeNull();
  });
});

describe("validação e normalização", () => {
  test("hex de 6 dígitos é aceito e normalizado", () => {
    expect(normalizarCorBarraTopo("#F5F5F5")).toBe("#f5f5f5");
    expect(normalizarCorBarraTopo("  #0F172A  ")).toBe("#0f172a");
    expect(estiloDaBarraTopo("#FFFFFF")?.fundo).toBe("#ffffff");
  });

  const invalidos = [
    "#fff",
    "fff",
    "#ggghhh",
    "#12345",
    "#1234567",
    "white",
    "rgb(255,255,255)",
  ];
  for (const valor of invalidos) {
    test(`recusa ${valor}`, () => {
      expect(normalizarCorBarraTopo(valor)).toBeNull();
      expect(estiloDaBarraTopo(valor)).toBeNull();
    });
  }
});

describe("nada de CSS arbitrário", () => {
  // O valor vira propriedade de estilo numa página pública de um tenant.
  // A porta é allowlist estrita de "#RRGGBB": qualquer coisa que tente
  // carregar recurso, ler variável, desenhar gradiente ou fechar a
  // declaração para injetar outra simplesmente não passa.
  const ataques = [
    "url(https://exemplo.test/x.png)",
    "var(--primary)",
    "expression(alert(1))",
    "linear-gradient(red, blue)",
    "red; position: fixed; inset: 0",
    "#ffffff; background-image: url(x)",
    "#ffffff}</style><script>alert(1)</script>",
    "javascript:alert(1)",
    "</style>",
    "#fff\\0000",
  ];
  for (const valor of ataques) {
    test(`recusa ${valor.slice(0, 32)}`, () => {
      expect(estiloDaBarraTopo(valor)).toBeNull();
      expect(normalizarCorBarraTopo(valor)).toBeNull();
    });
  }

  test("o que sai é sempre #RRGGBB, nunca o texto recebido", () => {
    const estilo = estiloDaBarraTopo("#AbCdEf")!;
    for (const cor of [estilo.fundo, estilo.conteudo, estilo.whatsapp]) {
      expect(cor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("contraste automático do conteúdo", () => {
  const claros = ["#ffffff", "#f5f5f5", "#fafafa", "#e5e7eb"];
  const escuros = ["#000000", "#0f172a", "#1f2937", "#312e81"];

  for (const fundo of claros) {
    test(`fundo claro ${fundo} recebe conteúdo escuro e legível`, () => {
      const estilo = estiloDaBarraTopo(fundo)!;
      const c = razaoContraste(hexParaOklch(estilo.fundo)!, hexParaOklch(estilo.conteudo)!);
      // AA para texto normal.
      expect(c, `contraste ${c.toFixed(2)} em ${fundo}`).toBeGreaterThanOrEqual(4.5);
      // "Escuro" de verdade: mais perto do preto que do branco.
      expect(hexParaOklch(estilo.conteudo)!.l).toBeLessThan(0.5);
    });
  }

  for (const fundo of escuros) {
    test(`fundo escuro ${fundo} recebe conteúdo claro e legível`, () => {
      const estilo = estiloDaBarraTopo(fundo)!;
      const c = razaoContraste(hexParaOklch(estilo.fundo)!, hexParaOklch(estilo.conteudo)!);
      expect(c, `contraste ${c.toFixed(2)} em ${fundo}`).toBeGreaterThanOrEqual(4.5);
      expect(hexParaOklch(estilo.conteudo)!.l).toBeGreaterThan(0.5);
    });
  }

  test("cores intermediárias também alcançam AA", () => {
    for (const fundo of ["#6b7280", "#2563eb", "#b45309", "#15803d", "#7c3aed"]) {
      const estilo = estiloDaBarraTopo(fundo)!;
      const c = razaoContraste(hexParaOklch(estilo.fundo)!, hexParaOklch(estilo.conteudo)!);
      expect(c, `contraste ${c.toFixed(2)} em ${fundo}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("ícone do WhatsApp", () => {
  test("continua verde quando é distinguível do fundo", () => {
    const estilo = estiloDaBarraTopo("#ffffff")!;
    const verde = hexParaOklch(estilo.whatsapp)!;
    // Matiz de verde, não o conteúdo neutro.
    expect(verde.c).toBeGreaterThan(0.1);
    expect(verde.h).toBeGreaterThan(120);
    expect(verde.h).toBeLessThan(180);
  });

  test("cede a cor quando o verde sumiria no fundo", () => {
    // Fundo praticamente do mesmo verde: manter a marca deixaria o ícone
    // invisível.
    const estilo = estiloDaBarraTopo("#16a34a")!;
    expect(estilo.whatsapp).toBe(estilo.conteudo);
  });

  test("qualquer que seja o desfecho, o ícone permanece visível (>=3:1)", () => {
    for (const fundo of ["#ffffff", "#000000", "#16a34a", "#0f172a", "#22c55e", "#f5f5f5"]) {
      const estilo = estiloDaBarraTopo(fundo)!;
      const c = razaoContraste(hexParaOklch(estilo.fundo)!, hexParaOklch(estilo.whatsapp)!);
      expect(c, `WhatsApp com ${c.toFixed(2)} em ${fundo}`).toBeGreaterThanOrEqual(3);
    }
  });

  test("o token global do WhatsApp não foi tocado", () => {
    // A decisão de contraste é LOCAL da barra. Se alguém trocar o token
    // global, este teste avisa que a constante do servidor precisa
    // acompanhar.
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("--whatsapp-brand: var(--color-green-600)");
  });
});
