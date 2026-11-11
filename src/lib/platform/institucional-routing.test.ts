import { describe, test, expect } from "vitest";
import { decidirRotaInstitucional } from "@/lib/platform/institucional-routing";

describe("decidirRotaInstitucional", () => {
  test("raiz reescreve para /institucional", () => {
    expect(decidirRotaInstitucional("/")).toEqual({ tipo: "rewrite", destino: "/institucional" });
  });

  test("qualquer outro caminho não é encontrado (lista fechada)", () => {
    expect(decidirRotaInstitucional("/imoveis")).toEqual({ tipo: "nao_encontrado" });
    expect(decidirRotaInstitucional("/corretores/abc")).toEqual({ tipo: "nao_encontrado" });
    expect(decidirRotaInstitucional("/institucional")).toEqual({ tipo: "nao_encontrado" });
  });
});
