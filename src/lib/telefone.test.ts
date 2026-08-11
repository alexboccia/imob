import { describe, test, expect } from "vitest";
import { formatarTelefone, telefoneValido, normalizarTelefone } from "@/lib/telefone";

describe("formatarTelefone", () => {
  test("formata celular com 11 dígitos", () => {
    expect(formatarTelefone("11999998888")).toBe("(11) 99999-8888");
  });

  test("formata fixo com 10 dígitos", () => {
    expect(formatarTelefone("1133334444")).toBe("(11) 3333-4444");
  });

  test("ignora caracteres não numéricos na entrada", () => {
    expect(formatarTelefone("(11) 99999-8888")).toBe("(11) 99999-8888");
  });

  test("formata progressivamente enquanto o usuário digita", () => {
    expect(formatarTelefone("1")).toBe("(1");
    expect(formatarTelefone("11")).toBe("(11");
    expect(formatarTelefone("119999")).toBe("(11) 9999");
  });

  test("string vazia retorna string vazia", () => {
    expect(formatarTelefone("")).toBe("");
  });

  test("trunca dígitos além do limite de 11", () => {
    expect(formatarTelefone("119999988887777")).toBe("(11) 99999-8888");
  });
});

describe("telefoneValido", () => {
  test("aceita 10 e 11 dígitos", () => {
    expect(telefoneValido("1133334444")).toBe(true);
    expect(telefoneValido("11999998888")).toBe(true);
  });

  test("aceita com máscara, contando só os dígitos", () => {
    expect(telefoneValido("(11) 99999-8888")).toBe(true);
  });

  test("recusa menos de 10 dígitos", () => {
    expect(telefoneValido("119999888")).toBe(false);
  });

  test("recusa mais de 11 dígitos", () => {
    expect(telefoneValido("119999988887")).toBe(false);
  });

  test("recusa vazio", () => {
    expect(telefoneValido("")).toBe(false);
  });
});

describe("normalizarTelefone", () => {
  test("formatos diferentes do mesmo número resolvem pro mesmo valor", () => {
    expect(normalizarTelefone("(11) 99999-9999")).toBe(normalizarTelefone("11999999999"));
    expect(normalizarTelefone("11999999999")).toBe("11999999999");
  });

  test("não inventa DDI — só remove o que não é dígito", () => {
    expect(normalizarTelefone("(11) 3333-4444")).toBe("1133334444");
  });

  test("telefone legado sem nenhum dígito retorna null, nunca string vazia", () => {
    expect(normalizarTelefone("abc")).toBeNull();
    expect(normalizarTelefone(" - ")).toBeNull();
  });

  test("string vazia retorna null", () => {
    expect(normalizarTelefone("")).toBeNull();
  });
});
