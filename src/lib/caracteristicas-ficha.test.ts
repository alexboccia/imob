import { describe, expect, test } from "vitest";
import {
  montarItensCondominio,
  montarItensUnidade,
  pluralizar,
  type DadosFichaUnidade,
} from "@/lib/caracteristicas-ficha";

const VAZIO: DadosFichaUnidade = {
  totalArea: null,
  privateArea: null,
  bedrooms: null,
  suites: null,
  bathrooms: null,
  parkingSpots: null,
  propertyFeatures: [],
};

function textos(imovel: Partial<DadosFichaUnidade>) {
  return montarItensUnidade({ ...VAZIO, ...imovel }).map((i) => i.texto);
}

describe("área", () => {
  test("área total e área privativa saem com o rótulo do próprio campo", () => {
    expect(textos({ totalArea: 78, privateArea: 62 })).toEqual([
      "Área total: 78 m²",
      "Área privativa: 62 m²",
    ]);
  });

  test("só área total NÃO vira 'área privativa'", () => {
    expect(textos({ totalArea: 78 })).toEqual(["Área total: 78 m²"]);
  });

  test("decimal sai em pt-BR, com vírgula", () => {
    expect(textos({ privateArea: 58.5 })).toEqual(["Área privativa: 58,5 m²"]);
  });
});

describe("pluralização", () => {
  test("quarto no singular e no plural", () => {
    expect(textos({ bedrooms: 1 })).toEqual(["1 quarto"]);
    expect(textos({ bedrooms: 3 })).toEqual(["3 quartos"]);
  });

  test("suíte no singular e no plural", () => {
    expect(textos({ suites: 1 })).toEqual(["1 suíte"]);
    expect(textos({ suites: 2 })).toEqual(["2 suítes"]);
  });

  test("banheiro no singular e no plural", () => {
    expect(textos({ bathrooms: 1 })).toEqual(["1 banheiro"]);
    expect(textos({ bathrooms: 2 })).toEqual(["2 banheiros"]);
  });

  test("vaga de garagem no singular e no plural — o plural não é só o 's'", () => {
    expect(textos({ parkingSpots: 1 })).toEqual(["1 vaga de garagem"]);
    expect(textos({ parkingSpots: 2 })).toEqual(["2 vagas de garagem"]);
  });

  test("pluralizar declara as duas formas em vez de derivar", () => {
    expect(pluralizar(1, "vaga de garagem", "vagas de garagem")).toBe(
      "1 vaga de garagem"
    );
    expect(pluralizar(0, "quarto", "quartos")).toBe("0 quartos");
  });

  test("suíte NÃO é agregada aos quartos: o domínio não garante suites <= bedrooms", () => {
    // bedrooms=2 com suites=3 é dado possível (dois campos numéricos
    // independentes). "2 quartos (3 suítes)" afirmaria uma continência
    // que o cadastro nunca prometeu.
    expect(textos({ bedrooms: 2, suites: 3 })).toEqual(["2 quartos", "3 suítes"]);
  });
});

describe("ausência", () => {
  test("nulo em tudo não produz item nenhum", () => {
    expect(montarItensUnidade(VAZIO)).toEqual([]);
  });

  test("contador em ZERO é ausência, não característica", () => {
    expect(
      textos({ bedrooms: 0, suites: 0, bathrooms: 0, parkingSpots: 0, totalArea: 0 })
    ).toEqual([]);
  });

  test("número negativo (importação suja) também não vira linha", () => {
    expect(textos({ bedrooms: -1, totalArea: -5 })).toEqual([]);
  });

  test("sem característica de condomínio a lista é vazia — a seção não renderiza", () => {
    expect(montarItensCondominio([])).toEqual([]);
  });
});

describe("características configuráveis", () => {
  test("as da unidade entram depois dos atributos estruturais", () => {
    expect(
      textos({
        bedrooms: 2,
        propertyFeatures: ["Varanda gourmet", "Armários planejados"],
      })
    ).toEqual(["2 quartos", "Armários planejados", "Varanda gourmet"]);
  });

  test("as do condomínio saem sozinhas, sem atributo estrutural", () => {
    expect(montarItensCondominio(["Salão de festas", "Piscina"]).map((i) => i.texto)).toEqual(
      ["Piscina", "Salão de festas"]
    );
  });

  test("ícone: estrutural tem o seu; configurável é resolvido no componente", () => {
    const itens = montarItensUnidade({
      ...VAZIO,
      bedrooms: 1,
      propertyFeatures: ["Piscina"],
    });
    expect(itens.map((i) => i.icone)).toEqual(["quartos", "catalogo"]);
  });
});

describe("ordem determinística", () => {
  test("área, quartos, suítes, banheiros, vagas e então o catálogo", () => {
    expect(
      textos({
        parkingSpots: 2,
        bathrooms: 2,
        suites: 1,
        bedrooms: 3,
        privateArea: 90,
        totalArea: 110,
        propertyFeatures: ["Sacada"],
      })
    ).toEqual([
      "Área total: 110 m²",
      "Área privativa: 90 m²",
      "3 quartos",
      "1 suíte",
      "2 banheiros",
      "2 vagas de garagem",
      "Sacada",
    ]);
  });

  test("o catálogo sai em ordem pt-BR, não na ordem em que foi marcado", () => {
    // A ordem do array na Property é a ordem em que o corretor marcou as
    // caixas: estável, mas sem significado — dois imóveis com as mesmas
    // características apareceriam diferentes.
    expect(
      montarItensCondominio(["Salão de festas", "Área de lazer", "Portaria 24 horas"]).map(
        (i) => i.texto
      )
    ).toEqual(["Área de lazer", "Portaria 24 horas", "Salão de festas"]);
  });
});

describe("duplicidade", () => {
  test("o mesmo nome repetido no array vira um item só", () => {
    expect(montarItensCondominio(["Piscina", "Piscina"]).map((i) => i.texto)).toEqual([
      "Piscina",
    ]);
  });

  test("chaves são únicas dentro da seção", () => {
    const chaves = montarItensUnidade({
      ...VAZIO,
      totalArea: 50,
      privateArea: 45,
      bedrooms: 2,
      propertyFeatures: ["Sacada", "Sacada"],
    }).map((i) => i.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  test("atributo estrutural e catálogo são fontes distintas — não se comparam por texto", () => {
    // Se a imobiliária cadastrou no catálogo uma opção chamada
    // "2 banheiros" E preencheu bathrooms=2, os dois aparecem: são dois
    // dados diferentes que ela cadastrou. Suprimir um exigiria adivinhar
    // por string qual "significa a mesma coisa" — exatamente o tipo de
    // comparação frágil que este módulo não faz. O lugar de evitar essa
    // duplicidade é o catálogo, no painel.
    expect(textos({ bathrooms: 2, propertyFeatures: ["2 banheiros"] })).toEqual([
      "2 banheiros",
      "2 banheiros",
    ]);
  });
});

describe("classificação vem do domínio, nunca do nome", () => {
  test("'Piscina' cadastrada como característica da UNIDADE fica na unidade", () => {
    // Qualquer heurística de nome mandaria "Piscina" pro condomínio.
    // Quem decide é o array que ela ocupa na Property, espelho de
    // FeatureOption.category (PROPERTY|CONDO).
    expect(textos({ propertyFeatures: ["Piscina"] })).toEqual(["Piscina"]);
  });

  test("o mesmo nome nos dois catálogos aparece em cada seção, sem vazar", () => {
    expect(textos({ propertyFeatures: ["Churrasqueira"] })).toEqual(["Churrasqueira"]);
    expect(montarItensCondominio(["Churrasqueira"]).map((i) => i.texto)).toEqual([
      "Churrasqueira",
    ]);
  });
});
