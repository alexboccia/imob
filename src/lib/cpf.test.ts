import { describe, test, expect } from "vitest";
import { normalizarCpf, formatarCpf, cpfValido } from "@/lib/cpf";

describe("normalizarCpf", () => {
  test("remove máscara, mantendo só dígitos", () => {
    expect(normalizarCpf("529.982.247-25")).toBe("52998224725");
  });

  test("trunca em 11 dígitos", () => {
    expect(normalizarCpf("529982247258888")).toBe("52998224725");
  });

  test("string vazia retorna vazia", () => {
    expect(normalizarCpf("")).toBe("");
  });
});

describe("formatarCpf", () => {
  test("formata progressivamente enquanto o usuário digita", () => {
    expect(formatarCpf("5")).toBe("5");
    expect(formatarCpf("529")).toBe("529");
    expect(formatarCpf("529982")).toBe("529.982");
    expect(formatarCpf("529982247")).toBe("529.982.247");
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });

  test("aceita entrada já mascarada, reformatando", () => {
    expect(formatarCpf("529.982.247-25")).toBe("529.982.247-25");
  });
});

describe("cpfValido", () => {
  test("aceita CPFs com dígito verificador correto", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.444.777-35")).toBe(true);
    expect(cpfValido("123.456.789-09")).toBe(true);
  });

  test("recusa dígito verificador incorreto", () => {
    expect(cpfValido("529.982.247-26")).toBe(false);
  });

  test("recusa todos os dígitos iguais, mesmo que passassem no cálculo", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("000.000.000-00")).toBe(false);
  });

  test("recusa quantidade de dígitos diferente de 11", () => {
    expect(cpfValido("529.982.247-2")).toBe(false);
    expect(cpfValido("")).toBe(false);
  });
});
