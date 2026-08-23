import { describe, test, expect } from "vitest";
import { formatarLocalizacaoImovel } from "@/lib/format";

describe("formatarLocalizacaoImovel", () => {
  test("com bairro, mostra bairro + cidade - UF", () => {
    expect(formatarLocalizacaoImovel("Centro", "São Paulo", "SP")).toBe("Centro, São Paulo - SP");
  });

  test("sem bairro (null), omite a vírgula solta", () => {
    expect(formatarLocalizacaoImovel(null, "São Paulo", "SP")).toBe("São Paulo - SP");
  });

  test("sem bairro (string vazia), tratado igual a ausente", () => {
    expect(formatarLocalizacaoImovel("", "São Paulo", "SP")).toBe("São Paulo - SP");
  });

  test("sem bairro (undefined), tratado igual a ausente", () => {
    expect(formatarLocalizacaoImovel(undefined, "São Paulo", "SP")).toBe("São Paulo - SP");
  });
});
