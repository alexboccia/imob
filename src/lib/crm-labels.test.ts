import { describe, test, expect } from "vitest";
import { sanitizarFiltro, ORIGEM_LABEL, PAPEL_LABEL, ESTAGIOS_PIPELINE } from "@/lib/crm-labels";

// Correção cirúrgica pós-auditoria — origem/papel na URL de /app/clientes
// causavam PrismaClientValidationError (HTTP 500) porque interpretarFiltros
// só valida FORMA (string não-vazia), nunca CONTEÚDO. sanitizarFiltro é o
// guard que fecha essa lacuna — testado aqui isolado (sem Prisma/Next),
// mesmo espírito de crm-listagem.test.ts.
describe("sanitizarFiltro", () => {
  const ORIGENS_VALIDAS = new Set<string>(Object.keys(ORIGEM_LABEL));
  const PAPEIS_VALIDOS = new Set<string>(Object.keys(PAPEL_LABEL));
  const ESTAGIOS_VALIDOS = new Set<string>(ESTAGIOS_PIPELINE);

  test("valor undefined -> undefined", () => {
    expect(sanitizarFiltro(undefined, ORIGENS_VALIDAS)).toBeUndefined();
  });

  test("string vazia -> undefined", () => {
    expect(sanitizarFiltro("", ORIGENS_VALIDAS)).toBeUndefined();
  });

  test("valor real da allowlist -> devolvido tal qual", () => {
    expect(sanitizarFiltro("WEBSITE", ORIGENS_VALIDAS)).toBe("WEBSITE");
  });

  test("valor arbitrário (manipulado na URL) -> undefined, nunca lançado nem repassado", () => {
    expect(sanitizarFiltro("GARBAGE", ORIGENS_VALIDAS)).toBeUndefined();
  });

  test("valor de OUTRO enum (ex: papel usado no lugar de origem) -> undefined", () => {
    expect(sanitizarFiltro("LEAD", ORIGENS_VALIDAS)).toBeUndefined();
  });

  test("case-sensitive — 'website' minúsculo não é 'WEBSITE'", () => {
    expect(sanitizarFiltro("website", ORIGENS_VALIDAS)).toBeUndefined();
  });

  test("funciona igual para as 3 allowlists reais desta tela (estágio/origem/papel)", () => {
    expect(sanitizarFiltro("PROPOSAL", ESTAGIOS_VALIDOS)).toBe("PROPOSAL");
    expect(sanitizarFiltro("GARBAGE", ESTAGIOS_VALIDOS)).toBeUndefined();
    expect(sanitizarFiltro("CLIENT", PAPEIS_VALIDOS)).toBe("CLIENT");
    expect(sanitizarFiltro("GARBAGE", PAPEIS_VALIDOS)).toBeUndefined();
  });
});
