import { describe, test, expect } from "vitest";
import { formatarPreco } from "@/lib/format";
import {
  AUSENTE,
  apenasDiferencas,
  linhaTemDiferenca,
  linhasCaracteristicas,
  montarComparacao,
  precoPorMetro,
  type ImovelComparado,
} from "@/lib/comparador";

// =======================================================================
// Comparador de imóveis (Fase 59)
// =======================================================================

const BASE: ImovelComparado = {
  id: "a",
  titulo: "Imóvel A",
  codigo: 101,
  tipo: "Apartamento",
  finalidade: "SALE",
  situacao: null,
  bairro: "Centro",
  cidade: "São Paulo",
  estado: "SP",
  preco: 320000,
  precoAluguel: null,
  condominio: 900,
  iptu: 300,
  areaTotal: 80,
  areaPrivativa: 64,
  quartos: 2,
  suites: 1,
  banheiros: 2,
  vagas: 1,
  caracteristicas: ["Piscina", "Varanda"],
  empreendimento: null,
  lancamento: false,
  foto: null,
};

const imovel = (over: Partial<ImovelComparado>): ImovelComparado => ({ ...BASE, ...over });

/** Busca uma linha pela chave em qualquer grupo. */
function linha(grupos: ReturnType<typeof montarComparacao>, chave: string) {
  return grupos.flatMap((g) => g.linhas).find((l) => l.chave === chave);
}

describe("preço por m²", () => {
  test("preço de venda dividido pela área total", () => {
    expect(precoPorMetro(imovel({ preco: 320000, areaTotal: 80 }))).toBe(4000);
  });

  test("sem preço de venda não calcula — nem usando o aluguel", () => {
    // Base ÚNICA: misturar venda e aluguel produziria números que
    // parecem comparáveis e não são.
    expect(precoPorMetro(imovel({ preco: null, precoAluguel: 2500 }))).toBeNull();
  });

  test("sem área total não calcula — nem usando a privativa", () => {
    expect(precoPorMetro(imovel({ areaTotal: null, areaPrivativa: 64 }))).toBeNull();
  });

  test("valores não positivos não viram divisão", () => {
    expect(precoPorMetro(imovel({ areaTotal: 0 }))).toBeNull();
    expect(precoPorMetro(imovel({ preco: 0 }))).toBeNull();
  });

  test("a célula mostra ausência quando não dá para calcular", () => {
    const grupos = montarComparacao([imovel({ preco: null }), imovel({ id: "b" })]);
    expect(linha(grupos, "preco-m2")!.valores[0].texto).toBe(AUSENTE);
    expect(linha(grupos, "preco-m2")!.valores[1].texto).toContain("/m²");
  });
});

describe("dados ausentes", () => {
  test("cada campo não informado vira a MESMA marca", () => {
    const vazio = imovel({
      id: "vazio",
      preco: null,
      precoAluguel: null,
      condominio: null,
      iptu: null,
      areaTotal: null,
      areaPrivativa: null,
      quartos: null,
      suites: null,
      banheiros: null,
      vagas: null,
      empreendimento: null,
    });
    const grupos = montarComparacao([vazio, imovel({ id: "b" })]);
    for (const chave of ["preco", "aluguel", "condominio", "iptu", "area-total", "quartos", "vagas", "empreendimento"]) {
      expect(linha(grupos, chave)!.valores[0].texto, chave).toBe(AUSENTE);
    }
  });

  test("ausência nunca quebra a comparação", () => {
    const grupos = montarComparacao([
      imovel({ id: "a", condominio: 900, iptu: null }),
      imovel({ id: "b", condominio: null, iptu: 300 }),
    ]);
    // Comparado contra o formatador do projeto, nunca contra um literal
    // digitado: `toLocaleString` separa "R$" do número com espaço
    // não-quebrável, e um literal com espaço comum falharia por um
    // caractere invisível.
    expect(linha(grupos, "condominio")!.valores.map((v) => v.texto)).toEqual([
      formatarPreco(900),
      AUSENTE,
    ]);
    expect(linha(grupos, "iptu")!.valores.map((v) => v.texto)).toEqual([
      AUSENTE,
      formatarPreco(300),
    ]);
  });

  test("zero é informação, não ausência", () => {
    const grupos = montarComparacao([imovel({ vagas: 0 }), imovel({ id: "b", vagas: null })]);
    expect(linha(grupos, "vagas")!.valores[0].texto).toBe("0");
    expect(linha(grupos, "vagas")!.valores[1].texto).toBe(AUSENTE);
    // E são fatos diferentes.
    expect(linhaTemDiferenca(linha(grupos, "vagas")!)).toBe(true);
  });
});

describe("comparação é semântica, não textual", () => {
  test("o valor bruto é o número, não o texto formatado", () => {
    const grupos = montarComparacao([imovel({}), imovel({ id: "b" })]);
    const preco = linha(grupos, "preco")!;
    expect(preco.valores[0].bruto).toBe(320000);
    expect(preco.valores[0].texto).toBe(formatarPreco(320000));
  });

  test("mesmo número em imóveis diferentes não é diferença", () => {
    const grupos = montarComparacao([imovel({ preco: 320000 }), imovel({ id: "b", preco: 320000 })]);
    expect(linhaTemDiferenca(linha(grupos, "preco")!)).toBe(false);
  });

  test("duas ausências não são uma diferença", () => {
    const grupos = montarComparacao([imovel({ iptu: null }), imovel({ id: "b", iptu: null })]);
    expect(linhaTemDiferenca(linha(grupos, "iptu")!)).toBe(false);
  });

  test("ausência contra valor É diferença", () => {
    const grupos = montarComparacao([imovel({ iptu: null }), imovel({ id: "b", iptu: 300 })]);
    expect(linhaTemDiferenca(linha(grupos, "iptu")!)).toBe(true);
  });

  test("uma coluna só nunca tem diferença", () => {
    const grupos = montarComparacao([imovel({})]);
    expect(grupos.flatMap((g) => g.linhas).every((l) => !linhaTemDiferenca(l))).toBe(true);
  });
});

describe("apenas diferenças", () => {
  test("esconde a linha igual em TODOS e mantém a que difere", () => {
    const grupos = montarComparacao([
      imovel({ id: "a", quartos: 2, preco: 300000 }),
      imovel({ id: "b", quartos: 2, preco: 400000 }),
      imovel({ id: "c", quartos: 2, preco: 500000 }),
    ]);
    const filtrado = apenasDiferencas(grupos);
    const chaves = filtrado.flatMap((g) => g.linhas.map((l) => l.chave));
    expect(chaves).not.toContain("quartos");
    expect(chaves).toContain("preco");
  });

  test("um valor diferente entre três já mantém a linha", () => {
    const grupos = montarComparacao([
      imovel({ id: "a", quartos: 2 }),
      imovel({ id: "b", quartos: 3 }),
      imovel({ id: "c", quartos: 2 }),
    ]);
    const chaves = apenasDiferencas(grupos).flatMap((g) => g.linhas.map((l) => l.chave));
    expect(chaves).toContain("quartos");
  });

  test("grupo que fica sem linhas desaparece — nada de título órfão", () => {
    const iguais = [imovel({ id: "a" }), imovel({ id: "b" })];
    const filtrado = apenasDiferencas(montarComparacao(iguais));
    // Imóveis idênticos: nenhuma diferença, nenhum grupo.
    expect(filtrado).toHaveLength(0);
  });

  test("todos os dados continua mostrando tudo", () => {
    const grupos = montarComparacao([imovel({ id: "a" }), imovel({ id: "b" })]);
    expect(grupos.flatMap((g) => g.linhas).length).toBeGreaterThan(
      apenasDiferencas(grupos).flatMap((g) => g.linhas).length
    );
  });
});

describe("características", () => {
  test("uma linha por característica presente em algum imóvel, em ordem", () => {
    const linhas = linhasCaracteristicas([
      imovel({ id: "a", caracteristicas: ["Piscina", "Varanda"] }),
      imovel({ id: "b", caracteristicas: ["Academia", "Varanda"] }),
    ]);
    expect(linhas.map((l) => l.rotulo)).toEqual(["Academia", "Piscina", "Varanda"]);
  });

  test("✓ e — por coluna, como booleano comparável", () => {
    const linhas = linhasCaracteristicas([
      imovel({ id: "a", caracteristicas: ["Piscina"] }),
      imovel({ id: "b", caracteristicas: [] }),
    ]);
    const piscina = linhas.find((l) => l.rotulo === "Piscina")!;
    expect(piscina.tipo).toBe("booleano");
    expect(piscina.valores.map((v) => v.bruto)).toEqual([true, false]);
  });

  test("característica que todos têm some em 'apenas diferenças'", () => {
    const imoveis = [
      imovel({ id: "a", caracteristicas: ["Piscina", "Varanda"] }),
      imovel({ id: "b", caracteristicas: ["Academia", "Varanda"] }),
      imovel({ id: "c", caracteristicas: ["Varanda"] }),
    ];
    const filtrado = apenasDiferencas(montarComparacao(imoveis));
    const rotulos = filtrado.flatMap((g) => g.linhas.map((l) => l.rotulo));
    expect(rotulos).toContain("Piscina");
    expect(rotulos).toContain("Academia");
    // Varanda está nos três: não é diferença.
    expect(rotulos).not.toContain("Varanda");
  });

  test("ninguém com característica nenhuma não cria grupo vazio", () => {
    const grupos = montarComparacao([
      imovel({ id: "a", caracteristicas: [] }),
      imovel({ id: "b", caracteristicas: [] }),
    ]);
    expect(grupos.map((g) => g.chave)).not.toContain("caracteristicas");
  });

  test("o comparador não inventa catálogo: só o que alguém cadastrou", () => {
    const linhas = linhasCaracteristicas([
      imovel({ id: "a", caracteristicas: ["Piscina"] }),
      imovel({ id: "b", caracteristicas: ["Piscina"] }),
    ]);
    expect(linhas.map((l) => l.rotulo)).toEqual(["Piscina"]);
  });

  test("espaços em branco não criam característica fantasma", () => {
    const linhas = linhasCaracteristicas([
      imovel({ id: "a", caracteristicas: ["  Piscina  ", "", "   "] }),
      imovel({ id: "b", caracteristicas: ["Piscina"] }),
    ]);
    expect(linhas.map((l) => l.rotulo)).toEqual(["Piscina"]);
    expect(linhas[0].valores.map((v) => v.bruto)).toEqual([true, true]);
  });
});

describe("o comparador não decide por ninguém", () => {
  test("nenhuma linha ou grupo sugere vencedor", () => {
    const grupos = montarComparacao([imovel({ id: "a" }), imovel({ id: "b", preco: 1 })]);
    const textos = JSON.stringify(grupos).toLowerCase();
    for (const palavra of ["melhor", "recomend", "vencedor", "custo-benef", "ideal", "top "]) {
      expect(textos).not.toContain(palavra);
    }
  });
});
