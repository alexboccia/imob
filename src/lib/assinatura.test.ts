import { describe, test, expect } from "vitest";
import {
  ESTADOS_ASSINATURA,
  TRANSICOES_ASSINATURA,
  transicaoPermitida,
  formatarPrecoMensal,
} from "./assinatura";

describe("estados da assinatura", () => {
  test("cobre exatamente o enum real, sem inventar estado", () => {
    // Se alguém acrescentar um estado ao schema, este teste falha até
    // que o significado dele seja escrito — e não o contrário.
    expect(Object.keys(ESTADOS_ASSINATURA).sort()).toEqual([
      "ACTIVE",
      "CANCELED",
      "PAST_DUE",
      "TRIALING",
    ]);
  });

  test("todo estado tem rótulo e descrição em português claro", () => {
    for (const estado of Object.values(ESTADOS_ASSINATURA)) {
      expect(estado.rotulo.length).toBeGreaterThan(3);
      expect(estado.descricao.length).toBeGreaterThan(20);
    }
  });
});

describe("transições", () => {
  test("trial pode virar assinatura ativa ou ser encerrado", () => {
    expect(transicaoPermitida("TRIALING", "ACTIVE")).toBe(true);
    expect(transicaoPermitida("TRIALING", "CANCELED")).toBe(true);
  });

  test("trial NÃO pula direto para inadimplência", () => {
    // Não existe dívida sem contrato: PAST_DUE pressupõe uma assinatura
    // que um dia esteve ativa.
    expect(transicaoPermitida("TRIALING", "PAST_DUE")).toBe(false);
  });

  test("assinatura encerrada não volta sozinha", () => {
    // Reativar é CONTRATAR DE NOVO, e isso é decisão comercial que o
    // repositório não define. Deixar a seta aqui seria inventá-la.
    expect(TRANSICOES_ASSINATURA.CANCELED).toEqual([]);
    expect(transicaoPermitida("CANCELED", "ACTIVE")).toBe(false);
    expect(transicaoPermitida("CANCELED", "TRIALING")).toBe(false);
  });

  test("inadimplência pode ser regularizada ou encerrada", () => {
    expect(transicaoPermitida("PAST_DUE", "ACTIVE")).toBe(true);
    expect(transicaoPermitida("PAST_DUE", "CANCELED")).toBe(true);
  });

  test("repetir o mesmo estado é permitido — é o que torna reprocessar inócuo", () => {
    // Um provedor que reenvia "pagamento confirmado" não pode quebrar
    // nada: idempotência começa aqui, na própria tabela de transições.
    for (const status of Object.keys(TRANSICOES_ASSINATURA) as (keyof typeof TRANSICOES_ASSINATURA)[]) {
      expect(transicaoPermitida(status, status)).toBe(true);
    }
  });

  test("nenhuma transição aponta para um estado inexistente", () => {
    const validos = new Set(Object.keys(ESTADOS_ASSINATURA));
    for (const destinos of Object.values(TRANSICOES_ASSINATURA)) {
      for (const destino of destinos) expect(validos.has(destino)).toBe(true);
    }
  });
});

// Intl.NumberFormat separa o símbolo do valor com ESPAÇO NÃO SEPARÁVEL
// (U+00A0), não com espaço comum. Normalizar aqui é sobre o teste falar
// da mesma coisa que o produto produz — não sobre afrouxar a asserção.
const semNbsp = (valor: string | null) => valor?.replace(/\u00a0/g, " ") ?? null;

describe("dinheiro", () => {
  test("centavos inteiros viram moeda na borda, nunca o contrário", () => {
    expect(semNbsp(formatarPrecoMensal(9900))).toBe("R$ 99,00");
    expect(semNbsp(formatarPrecoMensal(24900))).toBe("R$ 249,00");
    expect(semNbsp(formatarPrecoMensal(0))).toBe("R$ 0,00");
  });

  test("preço ausente é ausência, nunca zero", () => {
    // null significa "o plano não declara preço" — exibir R$ 0,00 no
    // lugar afirmaria que é gratuito, que é outra coisa.
    expect(formatarPrecoMensal(null)).toBeNull();
  });

  test("nenhum float participa: o valor de entrada é inteiro", () => {
    // 1999 centavos jamais vira 19.99 em nenhum ponto do domínio; a
    // divisão existe só dentro do formatador, para exibição.
    expect(semNbsp(formatarPrecoMensal(1999))).toBe("R$ 19,99");
    expect(Number.isInteger(1999)).toBe(true);
  });
});
