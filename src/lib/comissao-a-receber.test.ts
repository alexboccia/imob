import { describe, test, expect } from "vitest";
import {
  saldoAReceber,
  ordenarNegocios,
  resumirCarteira,
  STATUS_A_RECEBER_LABEL,
  type NegocioDaComissao,
} from "@/lib/comissao-a-receber";
import { resumirLiquidacao } from "@/lib/pagamento-comissao";

// Fase 35 — a carteira de comissão do corretor.
//
// A aritmética de UMA parcela é de resumirLiquidacao e já tem os seus
// próprios testes (pagamento-comissao.test.ts). O que se prova aqui é o
// AGREGADO: somar várias parcelas sem perder a distinção entre "não
// atribuído" e "zero", sem deixar centavo para trás e sem um negócio
// contaminar o saldo de outro.

// Constrói um negócio a partir dos fatos reais — parcela e pagamentos
// VÁLIDOS — passando pela mesma função da ficha do cliente, como a
// consulta faz. Nada de valores agregados escritos à mão.
function negocio(
  id: string,
  atribuido: number | null,
  pagamentosValidos: number[],
  extras: Partial<NegocioDaComissao> = {}
): NegocioDaComissao {
  const liquidacao = resumirLiquidacao(atribuido, pagamentosValidos);
  return {
    participacaoId: id,
    negociacaoId: `neg-${id}`,
    pessoaId: `pessoa-${id}`,
    pessoaNome: `Pessoa ${id}`,
    imovelId: `imovel-${id}`,
    imovelTitulo: `Imóvel ${id}`,
    closedAtISO: "2026-01-10T12:00:00.000Z",
    closedValue: 500000,
    comissaoDoNegocio: 30000,
    liquidacao,
    aReceber: saldoAReceber(liquidacao),
    ...extras,
  };
}

describe("saldoAReceber", () => {
  test("sem pagamento: o saldo é a parcela inteira", () => {
    expect(saldoAReceber(resumirLiquidacao(20000, []))).toBe(20000);
  });

  test("pagamento parcial: saldo é a diferença", () => {
    expect(saldoAReceber(resumirLiquidacao(20000, [5000, 3000]))).toBe(12000);
  });

  test("pagamento total: saldo zero", () => {
    expect(saldoAReceber(resumirLiquidacao(20000, [20000]))).toBe(0);
  });

  test("parcela não definida: saldo NULL, jamais R$ 0", () => {
    // Um "R$ 0,00 a receber" aqui afirmaria que não há nada a receber,
    // quando o fato é que ninguém disse quanto é.
    expect(saldoAReceber(resumirLiquidacao(null, []))).toBeNull();
  });

  test("parcela ZERO é diferente de parcela ausente", () => {
    // Zero é uma obrigação conhecida de valor nulo; ausente é o
    // desconhecido. A escrita recusa zero hoje, mas a leitura não pode
    // confundir os dois se um dia aparecer.
    expect(saldoAReceber(resumirLiquidacao(0, []))).toBe(0);
    expect(resumirLiquidacao(0, []).atribuido).toBe(0);
    expect(resumirLiquidacao(null, []).atribuido).toBeNull();
  });

  test("pago a mais: saldo com piso zero, sem inventar crédito", () => {
    const liquidacao = resumirLiquidacao(10000, [10500]);
    // O RECEBIDO verdadeiro é preservado — nada é subtraído dele.
    expect(liquidacao.pago).toBe(10500);
    expect(saldoAReceber(liquidacao)).toBe(0);
  });
});

describe("resumirCarteira", () => {
  test("soma participação, recebido e saldo de vários negócios", () => {
    const carteira = resumirCarteira([
      negocio("a", 15000, [5000]),
      negocio("b", 8000, [3000]),
    ]);
    expect(carteira.totalAtribuido).toBe(23000);
    expect(carteira.totalRecebido).toBe(8000);
    expect(carteira.totalAReceber).toBe(15000);
    expect(carteira.semValorAtribuido).toBe(0);
  });

  test("participação sem valor é contada à parte, nunca somada como zero", () => {
    const carteira = resumirCarteira([negocio("a", 10000, []), negocio("b", null, [])]);
    expect(carteira.totalAtribuido).toBe(10000);
    expect(carteira.totalAReceber).toBe(10000);
    expect(carteira.semValorAtribuido).toBe(1);
    expect(STATUS_A_RECEBER_LABEL.SEM_VALOR).toContain("sem valor");
  });

  test("participação ZERO entra na soma e não é contada como ausente", () => {
    const carteira = resumirCarteira([negocio("a", 0, [])]);
    expect(carteira.totalAtribuido).toBe(0);
    expect(carteira.semValorAtribuido).toBe(0);
  });

  test("centavos: nenhum erro binário na soma", () => {
    const carteira = resumirCarteira([
      negocio("a", 0.01, []),
      negocio("b", 0.1, []),
      negocio("c", 10.37, [0.1, 0.2]),
    ]);
    expect(carteira.totalAtribuido).toBe(10.48);
    expect(carteira.totalRecebido).toBe(0.3);
    expect(carteira.totalAReceber).toBe(10.18);
  });

  test("excedente de um negócio não abate o saldo de outro", () => {
    // Piso por LINHA, não sobre o total: se o piso fosse aplicado só no
    // fim, os R$ 500 pagos a mais em "a" apagariam metade do saldo real
    // de "b" — e o corretor veria uma dívida menor do que a verdadeira.
    const carteira = resumirCarteira([negocio("a", 10000, [10500]), negocio("b", 1000, [])]);
    expect(carteira.totalAReceber).toBe(1000);
    expect(carteira.totalRecebido).toBe(10500);
  });

  test("carteira vazia: zeros, sem erro", () => {
    const carteira = resumirCarteira([]);
    expect(carteira.totalAtribuido).toBe(0);
    expect(carteira.totalRecebido).toBe(0);
    expect(carteira.totalAReceber).toBe(0);
    expect(carteira.negocios).toEqual([]);
  });
});

describe("ordenarNegocios", () => {
  test("com saldo primeiro; sem valor definido antes do já recebido", () => {
    const ordenados = ordenarNegocios([
      negocio("liquidado", 5000, [5000]),
      negocio("semvalor", null, []),
      negocio("pendente", 9000, []),
    ]);
    expect(ordenados.map((n) => n.participacaoId)).toEqual([
      "pendente",
      "semvalor",
      "liquidado",
    ]);
  });

  test("dentro do grupo, fechamento mais recente primeiro", () => {
    const ordenados = ordenarNegocios([
      negocio("antigo", 1000, [], { closedAtISO: "2026-01-01T12:00:00.000Z" }),
      negocio("novo", 1000, [], { closedAtISO: "2026-03-01T12:00:00.000Z" }),
    ]);
    expect(ordenados.map((n) => n.participacaoId)).toEqual(["novo", "antigo"]);
  });

  test("empate desempata por id — a lista nunca troca de ordem sozinha", () => {
    const mesmaData = { closedAtISO: "2026-02-02T12:00:00.000Z" };
    const entrada = [
      negocio("bbb", 1000, [], mesmaData),
      negocio("aaa", 1000, [], mesmaData),
    ];
    expect(ordenarNegocios(entrada).map((n) => n.participacaoId)).toEqual(["aaa", "bbb"]);
    expect(ordenarNegocios([...entrada].reverse()).map((n) => n.participacaoId)).toEqual([
      "aaa",
      "bbb",
    ]);
  });

  test("negócio sem closedAt não quebra a ordenação nem some", () => {
    const ordenados = ordenarNegocios([
      negocio("semdata", 1000, [], { closedAtISO: null }),
      negocio("comdata", 1000, [], { closedAtISO: "2026-05-05T12:00:00.000Z" }),
    ]);
    expect(ordenados.map((n) => n.participacaoId)).toEqual(["comdata", "semdata"]);
  });
});
