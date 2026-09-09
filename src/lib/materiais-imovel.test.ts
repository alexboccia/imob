import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  MAX_MATERIAIS_POR_IMOVEL,
  blocoDeMateriaisVisivel,
  mimeDeMaterialValido,
  parseMateriais,
  sanitizarNomeMaterial,
  tituloDosMateriais,
} from "@/lib/materiais-imovel";

const BASE = "https://cdn.exemplo.test";
const ORG = "org-a";
const OUTRA_ORG = "org-b";
const OPCOES = { organizationId: ORG };

// A validação da URL usa o mesmo helper de favicon/logo/Hero, que lê
// R2_PUBLIC_URL do ambiente — mesmo padrão de stub já usado por
// favicon-url.test.ts.
beforeEach(() => {
  vi.stubEnv("R2_PUBLIC_URL", BASE);
});

function urlDe(org: string, arquivo: string) {
  return `${BASE}/${org}/materiais/${arquivo}`;
}
const PDF_A = urlDe(ORG, "11111111-2222-4333-8444-555555555555.pdf");
const PDF_B = urlDe(ORG, "66666666-7777-4888-9999-aaaaaaaaaaaa.pdf");

describe("URL do material", () => {
  test("objeto desta organização, na pasta de materiais, em PDF", () => {
    expect(mimeDeMaterialValido(PDF_A, OPCOES)).toBe("application/pdf");
  });

  test("objeto de OUTRO tenant é recusado", () => {
    expect(mimeDeMaterialValido(urlDe(OUTRA_ORG, "11111111-2222-4333-8444-555555555555.pdf"), OPCOES)).toBeNull();
  });

  test("domínio externo é recusado", () => {
    expect(
      mimeDeMaterialValido(
        `https://evil.test/${ORG}/materiais/11111111-2222-4333-8444-555555555555.pdf`,
        OPCOES
      )
    ).toBeNull();
  });

  test("outra pasta do mesmo bucket é recusada", () => {
    expect(
      mimeDeMaterialValido(`${BASE}/${ORG}/imoveis/11111111-2222-4333-8444-555555555555.pdf`, OPCOES)
    ).toBeNull();
  });

  test("travessia de caminho é recusada", () => {
    expect(
      mimeDeMaterialValido(`${BASE}/${ORG}/materiais/../../${OUTRA_ORG}/materiais/x.pdf`, OPCOES)
    ).toBeNull();
    expect(
      mimeDeMaterialValido(`${BASE}/${ORG}/materiais/sub/11111111-2222-4333-8444-555555555555.pdf`, OPCOES)
    ).toBeNull();
  });

  test("query string ou fragmento colados no fim são recusados", () => {
    expect(mimeDeMaterialValido(`${PDF_A}?x=1`, OPCOES)).toBeNull();
    expect(mimeDeMaterialValido(`${PDF_A}#a`, OPCOES)).toBeNull();
  });

  test("extensão fora da allowlist é recusada — inclusive executável", () => {
    for (const ext of ["exe", "sh", "html", "svg", "zip", "docx"]) {
      expect(
        mimeDeMaterialValido(urlDe(ORG, `11111111-2222-4333-8444-555555555555.${ext}`), OPCOES)
      ).toBeNull();
    }
  });

  test("nome de arquivo fora do formato que o servidor emite é recusado", () => {
    expect(mimeDeMaterialValido(urlDe(ORG, "book.pdf"), OPCOES)).toBeNull();
  });

  test("valor que não é string é recusado", () => {
    for (const valor of [null, undefined, 42, {}, []]) {
      expect(mimeDeMaterialValido(valor, OPCOES)).toBeNull();
    }
  });

  test("barra sobrando na base configurada não quebra a comparação", () => {
    vi.stubEnv("R2_PUBLIC_URL", `${BASE}/`);
    expect(mimeDeMaterialValido(PDF_A, OPCOES)).toBe("application/pdf");
  });

  test("sem R2_PUBLIC_URL configurado, nenhuma URL é aceita", () => {
    vi.stubEnv("R2_PUBLIC_URL", "");
    expect(mimeDeMaterialValido(PDF_A, OPCOES)).toBeNull();
  });

  test("host que apenas COMEÇA com o do bucket é recusado", () => {
    // "cdn.exemplo.test.attacker.com" bateria num startsWith ingênuo — a
    // comparação é por origin.
    expect(
      mimeDeMaterialValido(
        `https://cdn.exemplo.test.attacker.com/${ORG}/materiais/11111111-2222-4333-8444-555555555555.pdf`,
        OPCOES
      )
    ).toBeNull();
  });
});

describe("nome do material", () => {
  test("texto normal passa intacto", () => {
    expect(sanitizarNomeMaterial("Book do empreendimento")).toBe("Book do empreendimento");
  });

  test("caractere de controle e quebra de linha viram espaço", () => {
    expect(sanitizarNomeMaterial("Book\ndo\tempreendimento")).toBe("Book do empreendimento");
  });

  test("nome vazio ou só espaço cai no padrão, em vez de virar item sem rótulo", () => {
    expect(sanitizarNomeMaterial("   ")).toBe("Material de apresentação");
    expect(sanitizarNomeMaterial(123)).toBe("Material de apresentação");
  });

  test("nome quilométrico é cortado", () => {
    expect(sanitizarNomeMaterial("a".repeat(500))).toHaveLength(120);
  });

  test("markup fica como TEXTO — quem escapa é o React, não este módulo", () => {
    // O nome nunca é injetado como HTML; guardar o texto original é o
    // comportamento correto, e o teste existe pra que ninguém "conserte"
    // isso com uma remoção de tags que corromperia nomes legítimos.
    expect(sanitizarNomeMaterial("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });
});

describe("parse da lista do formulário", () => {
  test("lista válida vira materiais ordenados pela posição submetida", () => {
    const json = JSON.stringify([
      { name: "Tabela de preços", url: PDF_B, active: true },
      { name: "Book", url: PDF_A, active: false },
    ]);
    expect(parseMateriais(json, OPCOES)).toEqual([
      { name: "Tabela de preços", url: PDF_B, mimeType: "application/pdf", sortOrder: 0, active: true },
      { name: "Book", url: PDF_A, mimeType: "application/pdf", sortOrder: 1, active: false },
    ]);
  });

  test("material de outro tenant é DESCARTADO, e a ordem se fecha sem buraco", () => {
    const json = JSON.stringify([
      { name: "Do outro tenant", url: urlDe(OUTRA_ORG, "11111111-2222-4333-8444-555555555555.pdf") },
      { name: "Book", url: PDF_A },
    ]);
    expect(parseMateriais(json, OPCOES)).toEqual([
      { name: "Book", url: PDF_A, mimeType: "application/pdf", sortOrder: 0, active: true },
    ]);
  });

  test("o mimeType vem da URL validada, nunca do que o formulário declarou", () => {
    const json = JSON.stringify([
      { name: "Book", url: PDF_A, mimeType: "application/x-msdownload", active: true },
    ]);
    expect(parseMateriais(json, OPCOES)[0].mimeType).toBe("application/pdf");
  });

  test("URL repetida entra uma vez só", () => {
    const json = JSON.stringify([
      { name: "Book", url: PDF_A },
      { name: "Book de novo", url: PDF_A },
    ]);
    expect(parseMateriais(json, OPCOES)).toHaveLength(1);
  });

  test("material sem o campo active nasce ativo", () => {
    expect(parseMateriais(JSON.stringify([{ name: "Book", url: PDF_A }]), OPCOES)[0].active).toBe(
      true
    );
  });

  test("teto por imóvel é aplicado no servidor", () => {
    const itens = Array.from({ length: MAX_MATERIAIS_POR_IMOVEL + 5 }, (_, i) => ({
      name: `Material ${i}`,
      url: urlDe(ORG, `1111111${i % 10}-2222-4333-8444-55555555555${i % 10}.pdf`),
    }));
    expect(parseMateriais(JSON.stringify(itens), OPCOES)).toHaveLength(MAX_MATERIAIS_POR_IMOVEL);
  });

  test("JSON quebrado, ausente ou que não é lista vira lista vazia", () => {
    expect(parseMateriais(undefined, OPCOES)).toEqual([]);
    expect(parseMateriais("", OPCOES)).toEqual([]);
    expect(parseMateriais("{{{", OPCOES)).toEqual([]);
    expect(parseMateriais(JSON.stringify({ nao: "lista" }), OPCOES)).toEqual([]);
    expect(parseMateriais(JSON.stringify([null, 3, "x"]), OPCOES)).toEqual([]);
  });
});

describe("elegibilidade do bloco público", () => {
  test("com material ativo o bloco aparece", () => {
    expect(blocoDeMateriaisVisivel([{ id: "1", name: "Book" }])).toBe(true);
  });

  test("sem material o bloco NÃO aparece — nem para lançamento", () => {
    // isLaunch não entra nesta decisão de propósito: um lançamento sem
    // arquivo cadastrado prometeria um book que não existe.
    expect(blocoDeMateriaisVisivel([])).toBe(false);
  });

  test("o título é a única coisa que isLaunch muda", () => {
    expect(tituloDosMateriais(true)).toBe("Quer receber os materiais deste empreendimento?");
    expect(tituloDosMateriais(false)).toBe("Quer receber os materiais deste imóvel?");
  });
});
