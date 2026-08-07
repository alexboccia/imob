import { describe, test, expect } from "vitest";
import { formatarTelefone, telefoneValido } from "@/lib/telefone";

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
