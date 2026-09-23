import { describe, test, expect } from "vitest";
import { formatarAtuacao } from "@/lib/atuacao-organizacao";

describe("região de atuação", () => {
  test("cidade e estado viram uma linha só", () => {
    expect(formatarAtuacao({ cidade: "São Paulo", estado: "SP" })).toBe("São Paulo - SP");
  });

  test("sem estado, mostra só a cidade — nada de traço solto", () => {
    expect(formatarAtuacao({ cidade: "São Paulo", estado: "" })).toBe("São Paulo");
  });

  test("sem atuação conhecida devolve null, nunca um texto de exemplo", () => {
    // É isto que faz o item sumir da faixa em vez de virar placeholder.
    expect(formatarAtuacao(null)).toBeNull();
  });
});
