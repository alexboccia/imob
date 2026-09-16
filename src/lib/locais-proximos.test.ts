import { describe, test, expect } from "vitest";
import {
  CATEGORIAS_LOCAL,
  CATEGORIA_LOCAL_LABEL,
  LIMITE_LOCAIS_PROXIMOS,
  colunasDoLocal,
  distanciaParaCampo,
  formatarDistancia,
  interpretarDistancia,
  interpretarLocaisProximos,
  resumoDoLocal,
  type LocalProximo,
} from "@/lib/locais-proximos";

const local = (extra: Partial<LocalProximo> = {}): LocalProximo => ({
  categoria: "PHARMACY",
  nome: "Drogasil",
  distancia: 350,
  unidade: "METERS",
  ...extra,
});

describe("vocabulário", () => {
  test("as 14 categorias, na ordem do formulário, com rótulo em português", () => {
    expect(CATEGORIAS_LOCAL.map((c) => CATEGORIA_LOCAL_LABEL[c])).toEqual([
      "Mercado",
      "Padaria",
      "Farmácia",
      "Saúde",
      "Escola",
      "Faculdade",
      "Metrô",
      "Transporte",
      "Parque",
      "Shopping",
      "Academia",
      "Restaurante",
      "Pet shop",
      "Outros",
    ]);
  });
});

describe("interpretarDistancia", () => {
  test("campo vazio devolve o PAR nulo, descartando a unidade selecionada", () => {
    expect(interpretarDistancia("", "KILOMETERS")).toEqual({ ok: true, distancia: null, unidade: null });
    expect(interpretarDistancia("   ", "METERS")).toEqual({ ok: true, distancia: null, unidade: null });
    expect(interpretarDistancia(null, "METERS")).toEqual({ ok: true, distancia: null, unidade: null });
  });

  test("metros inteiros e km com vírgula ou ponto", () => {
    expect(interpretarDistancia("350", "METERS")).toEqual({ ok: true, distancia: 350, unidade: "METERS" });
    expect(interpretarDistancia("1,2", "KILOMETERS")).toEqual({ ok: true, distancia: 1.2, unidade: "KILOMETERS" });
    expect(interpretarDistancia("1.15", "KILOMETERS")).toEqual({ ok: true, distancia: 1.15, unidade: "KILOMETERS" });
  });

  test.each([
    ["abc", "METERS"],
    ["1.200,5", "METERS"],
    ["-3", "METERS"],
    ["0", "METERS"],
    ["1,5", "METERS"],
    ["100001", "METERS"],
    ["1,234", "KILOMETERS"],
    ["1001", "KILOMETERS"],
  ] as const)("recusa %s em %s", (bruto, unidade) => {
    expect(interpretarDistancia(bruto, unidade).ok).toBe(false);
  });
});

describe("interpretarLocaisProximos", () => {
  test("ausente ou vazio é lista vazia", () => {
    expect(interpretarLocaisProximos(undefined)).toEqual({ ok: true, locais: [] });
    expect(interpretarLocaisProximos("")).toEqual({ ok: true, locais: [] });
    expect(interpretarLocaisProximos("[]")).toEqual({ ok: true, locais: [] });
  });

  test("apara o nome e preserva o id", () => {
    const r = interpretarLocaisProximos(JSON.stringify([local({ id: "abc", nome: "  Drogasil  " })]));
    expect(r).toEqual({ ok: true, locais: [local({ id: "abc" })] });
  });

  test("km com duas casas passa apesar do ponto flutuante", () => {
    const r = interpretarLocaisProximos(JSON.stringify([local({ distancia: 1.15, unidade: "KILOMETERS" })]));
    expect(r.ok).toBe(true);
  });

  test("sem distância é válido", () => {
    const r = interpretarLocaisProximos(JSON.stringify([local({ distancia: null, unidade: null })]));
    expect(r.ok).toBe(true);
  });

  test.each([
    ["JSON malformado", "[{"],
    ["não é lista", JSON.stringify({ a: 1 })],
    ["categoria desconhecida", JSON.stringify([{ ...local(), categoria: "CASINO" }])],
    ["nome vazio", JSON.stringify([local({ nome: "   " })])],
    ["nome longo", JSON.stringify([local({ nome: "x".repeat(81) })])],
    ["unidade sem distância", JSON.stringify([local({ distancia: null })])],
    ["distância sem unidade", JSON.stringify([local({ unidade: null })])],
    ["metros fracionados", JSON.stringify([local({ distancia: 1.5 })])],
    ["km com três casas", JSON.stringify([local({ distancia: 1.234, unidade: "KILOMETERS" })])],
    ["distância negativa", JSON.stringify([local({ distancia: -1 })])],
    ["acima do limite de itens", JSON.stringify(Array.from({ length: LIMITE_LOCAIS_PROXIMOS + 1 }, () => local()))],
  ])("recusa a coleção inteira: %s", (_nome, json) => {
    expect(interpretarLocaisProximos(json).ok).toBe(false);
  });

  test("exatamente no limite de itens é aceito", () => {
    const json = JSON.stringify(Array.from({ length: LIMITE_LOCAIS_PROXIMOS }, () => local()));
    expect(interpretarLocaisProximos(json).ok).toBe(true);
  });
});

describe("exibição — nunca há placeholder de distância", () => {
  test("formatarDistancia", () => {
    expect(formatarDistancia(350, "METERS")).toBe("350 m");
    expect(formatarDistancia(1.2, "KILOMETERS")).toBe("1,2 km");
    expect(formatarDistancia(null, null)).toBeNull();
    expect(formatarDistancia(null, "METERS")).toBeNull();
  });

  test("resumoDoLocal omite a distância ausente, sem traço", () => {
    expect(resumoDoLocal(local())).toBe("Farmácia · 350 m");
    expect(resumoDoLocal(local({ categoria: "PARK", distancia: null, unidade: null }))).toBe("Parque");
  });

  test("distanciaParaCampo volta ao formato do campo", () => {
    expect(distanciaParaCampo(1.2)).toBe("1,2");
    expect(distanciaParaCampo(350)).toBe("350");
    expect(distanciaParaCampo(null)).toBe("");
  });
});

test("colunasDoLocal usa a posição como ordem e não carrega o id", () => {
  expect(colunasDoLocal(local({ id: "x" }), 3)).toEqual({
    category: "PHARMACY",
    name: "Drogasil",
    distance: 350,
    distanceUnit: "METERS",
    order: 3,
  });
});
