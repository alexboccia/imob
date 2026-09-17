import { describe, test, expect } from "vitest";
import { migalhasDoImovel } from "@/lib/breadcrumb-imovel";
import { rotulosAtivos } from "@/lib/format";
import { rotuloEstagioObra } from "@/lib/imovel-lancamento";

// =======================================================================
// Breadcrumb comercial da ficha (Fase 46)
// =======================================================================

const base = {
  isLaunch: false,
  purpose: "SALE",
  type: "Apartamento",
  neighborhood: "Santana",
  city: "São Paulo",
};

const labels = (m: { label: string }[]) => m.map((x) => x.label);
const params = (href: string) => Object.fromEntries(new URL(href, "https://x.test").searchParams);

describe("migalhasDoImovel", () => {
  test("A) lançamento: Home > Lançamentos > Apartamento > Santana, cumulativo", () => {
    const m = migalhasDoImovel("/imob-x", { ...base, isLaunch: true });
    expect(labels(m)).toEqual(["Home", "Lançamentos", "Apartamento", "Santana"]);
    expect(m[0].href).toBe("/imob-x");
    expect(m[1].href).toBe("/imob-x/imoveis?lancamento=1");
    expect(params(m[2].href)).toEqual({ lancamento: "1", tipo: "Apartamento" });
    expect(params(m[3].href)).toEqual({
      lancamento: "1",
      tipo: "Apartamento",
      cidade: "São Paulo",
      bairro: "Santana",
    });
    for (const x of m.slice(1)) expect(new URL(x.href, "https://x.test").pathname).toBe("/imob-x/imoveis");
  });

  test("B) não lançamento: a listagem do menu pela finalidade", () => {
    expect(labels(migalhasDoImovel("", { ...base, type: "Casa" }))).toEqual([
      "Home",
      "Comprar",
      "Casa",
      "Santana",
    ]);
    const venda = migalhasDoImovel("", base);
    expect(venda[1].href).toBe("/imoveis?finalidade=SALE");
    const aluguel = migalhasDoImovel("", { ...base, purpose: "RENT" });
    expect(labels(aluguel)[1]).toBe("Alugar");
    expect(aluguel[1].href).toBe("/imoveis?finalidade=RENT");
    // Venda E locação não está em nenhuma das duas listagens do menu.
    const ambos = migalhasDoImovel("", { ...base, purpose: "SALE_AND_RENT" });
    expect(labels(ambos)[1]).toBe("Imóveis");
    expect(ambos[1].href).toBe("/imoveis");
    expect(params(ambos[2].href)).toEqual({ tipo: "Apartamento" });
  });

  test("Home preserva o tenant: /slug no subcaminho, / na organização do domínio", () => {
    expect(migalhasDoImovel("/org-b", base)[0].href).toBe("/org-b");
    expect(migalhasDoImovel("", base)[0].href).toBe("/");
    for (const m of migalhasDoImovel("/org-b", base).slice(1)) expect(m.href.startsWith("/org-b/imoveis")).toBe(true);
  });

  test("C) sem bairro: a cidade é o contexto; sem nenhum dos dois, o nível some", () => {
    const semBairro = migalhasDoImovel("", { ...base, neighborhood: "  " });
    expect(labels(semBairro)).toEqual(["Home", "Comprar", "Apartamento", "São Paulo"]);
    expect(params(semBairro[3].href)).toEqual({ finalidade: "SALE", tipo: "Apartamento", cidade: "São Paulo" });

    const nada = migalhasDoImovel("", { ...base, neighborhood: null, city: null });
    expect(labels(nada)).toEqual(["Home", "Comprar", "Apartamento"]);
  });

  test("bairro sem cidade não inventa cidade no filtro", () => {
    const m = migalhasDoImovel("", { ...base, city: null });
    expect(params(m[3].href)).toEqual({ finalidade: "SALE", tipo: "Apartamento", bairro: "Santana" });
  });

  test("D) sem tipo: o nível some e o bairro não carrega tipo", () => {
    const m = migalhasDoImovel("", { ...base, type: "" });
    expect(labels(m)).toEqual(["Home", "Comprar", "Santana"]);
    expect(params(m[2].href)).toEqual({ finalidade: "SALE", cidade: "São Paulo", bairro: "Santana" });
  });

  test("nenhum placeholder, e valores aparados", () => {
    const m = migalhasDoImovel("", { ...base, type: "  Cobertura ", neighborhood: " Moema " });
    expect(labels(m)).toEqual(["Home", "Comprar", "Cobertura", "Moema"]);
    expect(labels(m).join(" ")).not.toMatch(/não informad|—|undefined|null/i);
  });

  test("caracteres especiais vão codificados no link", () => {
    const m = migalhasDoImovel("", { ...base, neighborhood: "Jardim & Vila", type: "Sala/Loja" });
    expect(m[2].href).toContain("tipo=Sala%2FLoja");
    expect(params(m[3].href).bairro).toBe("Jardim & Vila");
  });
});

// A faixa reaproveita as fontes que a ficha já usava — sem regra nova.
describe("fontes dos selos", () => {
  test("'Lançamento' é o rótulo isLaunch (mesma regra do filtro ?lancamento=1)", () => {
    const comRotulo = rotulosAtivos({ lancamento: true, destaque: false, oportunidade: false });
    expect(comRotulo.map((r) => r.label)).toEqual(["Lançamento"]);
    // Obra em andamento sem o rótulo NÃO vira "Lançamento".
    expect(rotulosAtivos({ lancamento: false, destaque: false, oportunidade: false })).toEqual([]);
  });

  test("F) estágio da obra vem do enum; sem estágio, nada", () => {
    expect(rotuloEstagioObra({ constructionStage: "UNDER_CONSTRUCTION" })).toBe("Em construção");
    expect(rotuloEstagioObra({ constructionStage: "PRE_CONSTRUCTION" })).toBe("Na planta");
    expect(rotuloEstagioObra({ constructionStage: "READY_TO_MOVE" })).toBe("Pronto para morar");
    expect(rotuloEstagioObra({ constructionStage: null })).toBeNull();
  });
});
