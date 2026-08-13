import { describe, test, expect } from "vitest";
import {
  ESTAGIOS_INTERESSE,
  atualizarEstagioInteresseSchema,
  estagioInteresseEncerrado,
} from "@/lib/property-interest-schema";

// Fase P.3 — cobertura mínima do helper puro estagioInteresseEncerrado e
// da lista ESTAGIOS_INTERESSE (agora com WON e REJECTED excluídos, ver
// comentário no arquivo fonte). Sem banco, mesmo espírito de
// proxima-acao-comercial.test.ts.
describe("estagioInteresseEncerrado", () => {
  test("WON é encerrado", () => {
    expect(estagioInteresseEncerrado("WON")).toBe(true);
  });

  test("REJECTED é encerrado", () => {
    expect(estagioInteresseEncerrado("REJECTED")).toBe(true);
  });

  test("INTERESTED, VISIT_SCHEDULED, VISITED, PROPOSAL não são encerrados", () => {
    for (const stage of ["INTERESTED", "VISIT_SCHEDULED", "VISITED", "PROPOSAL"]) {
      expect(estagioInteresseEncerrado(stage)).toBe(false);
    }
  });

  test("determinístico — mesma entrada sempre produz a mesma saída", () => {
    const resultados = new Set(
      Array.from({ length: 20 }, () => estagioInteresseEncerrado("WON"))
    );
    expect(resultados.size).toBe(1);
  });
});

describe("ESTAGIOS_INTERESSE (Fase P.3 — narrowed pra excluir WON e REJECTED)", () => {
  test("contém exatamente os 4 stages abertos, nenhum terminal", () => {
    expect(ESTAGIOS_INTERESSE).toEqual(["INTERESTED", "VISIT_SCHEDULED", "VISITED", "PROPOSAL"]);
  });

  test("nenhum valor de ESTAGIOS_INTERESSE é considerado encerrado", () => {
    for (const stage of ESTAGIOS_INTERESSE) {
      expect(estagioInteresseEncerrado(stage)).toBe(false);
    }
  });
});

describe("atualizarEstagioInteresseSchema (defesa Zod da action genérica)", () => {
  test("rejeita WON", () => {
    const resultado = atualizarEstagioInteresseSchema.safeParse({ stage: "WON", notes: "" });
    expect(resultado.success).toBe(false);
  });

  test("rejeita REJECTED", () => {
    const resultado = atualizarEstagioInteresseSchema.safeParse({ stage: "REJECTED", notes: "" });
    expect(resultado.success).toBe(false);
  });

  test("aceita os 4 stages abertos", () => {
    for (const stage of ESTAGIOS_INTERESSE) {
      const resultado = atualizarEstagioInteresseSchema.safeParse({ stage, notes: "" });
      expect(resultado.success).toBe(true);
    }
  });
});
