import { describe, test, expect } from "vitest";
import {
  interpretarPagamento,
  interpretarDataPagamento,
  resumirLiquidacao,
  validarPagamentoContraAtribuicao,
  validarAtribuicaoContraPagamentos,
  paraPagamentos,
  somarPagamentosValidos,
  agruparPagamentosPorParticipante,
  STATUS_LIQUIDACAO_LABEL,
  PAGAMENTO_MAXIMO,
} from "@/lib/pagamento-comissao";

const ORG = "org-a";
const AGORA = new Date("2026-09-07T10:00:00.000Z");

describe("interpretarPagamento", () => {
  test("valor válido passa", () => {
    expect(interpretarPagamento("5000")).toEqual({ ok: true, valor: 5000 });
    expect(interpretarPagamento("5000.50")).toEqual({ ok: true, valor: 5000.5 });
  });

  test("vazio e ausente são ERRO — pagamento sem valor não é pagamento", () => {
    // Diferente de allocationValue, que aceita null.
    expect(interpretarPagamento(null).ok).toBe(false);
    expect(interpretarPagamento(undefined).ok).toBe(false);
    expect(interpretarPagamento("").ok).toBe(false);
    expect(interpretarPagamento("   ").ok).toBe(false);
  });

  test("zero e negativo são recusados", () => {
    expect(interpretarPagamento("0").ok).toBe(false);
    expect(interpretarPagamento("-1").ok).toBe(false);
  });

  test("mais de duas casas decimais é recusado", () => {
    const r = interpretarPagamento("10.123");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("duas casas");
  });

  test("teto respeitado", () => {
    expect(interpretarPagamento(String(PAGAMENTO_MAXIMO)).ok).toBe(true);
    expect(interpretarPagamento(String(PAGAMENTO_MAXIMO + 1)).ok).toBe(false);
  });

  test("não-finito e tipo inválido recusados", () => {
    expect(interpretarPagamento("abc").ok).toBe(false);
    expect(interpretarPagamento("Infinity").ok).toBe(false);
    expect(interpretarPagamento({}).ok).toBe(false);
  });
});

describe("interpretarDataPagamento", () => {
  test("data passada e hoje passam", () => {
    const ontem = interpretarDataPagamento("2026-09-06", AGORA);
    expect(ontem.ok).toBe(true);
    expect(interpretarDataPagamento("2026-09-07", AGORA).ok).toBe(true);
  });

  test("data FUTURA é recusada — o ledger registra fato consumado", () => {
    const r = interpretarDataPagamento("2026-09-08", AGORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("futuro");
  });

  test("vazia e mal formada são recusadas", () => {
    expect(interpretarDataPagamento("", AGORA).ok).toBe(false);
    expect(interpretarDataPagamento("07/09/2026", AGORA).ok).toBe(false);
    expect(interpretarDataPagamento("2026-13-01", AGORA).ok).toBe(false);
  });

  test("o dia escolhido não escorrega em fuso negativo", () => {
    const r = interpretarDataPagamento("2026-09-06", AGORA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.toISOString()).toBe("2026-09-06T12:00:00.000Z");
  });
});

describe("resumirLiquidacao", () => {
  test("sem pagamento: PENDENTE, saldo é a parcela inteira", () => {
    const r = resumirLiquidacao(20000, []);
    expect(r.pago).toBe(0);
    expect(r.pendente).toBe(20000);
    expect(r.status).toBe("PENDENTE");
  });

  test("pagamento parcial: PARCIAL, saldo declarado", () => {
    const r = resumirLiquidacao(20000, [15000]);
    expect(r.pago).toBe(15000);
    expect(r.pendente).toBe(5000);
    expect(r.status).toBe("PARCIAL");
  });

  test("soma exata: LIQUIDADO", () => {
    const r = resumirLiquidacao(20000, [5000, 15000]);
    expect(r.pago).toBe(20000);
    expect(r.pendente).toBe(0);
    expect(r.status).toBe("LIQUIDADO");
  });

  test("sem atribuição: SEM_VALOR, pendente null — nunca 'Pendente R$ 0'", () => {
    const r = resumirLiquidacao(null, []);
    expect(r.atribuido).toBeNull();
    expect(r.pendente).toBeNull();
    expect(r.status).toBe("SEM_VALOR");
    expect(STATUS_LIQUIDACAO_LABEL[r.status]).toContain("sem valor");
  });

  test("centavos não acumulam erro binário", () => {
    expect(resumirLiquidacao(0.3, [0.1, 0.2]).pendente).toBe(0);
  });
});

describe("validarPagamentoContraAtribuicao", () => {
  test("dentro do saldo passa", () => {
    expect(validarPagamentoContraAtribuicao(5000, 20000, [10000]).ok).toBe(true);
  });

  test("soma exata passa (liquidação total)", () => {
    expect(validarPagamentoContraAtribuicao(10000, 20000, [10000]).ok).toBe(true);
  });

  test("acima do saldo é bloqueado", () => {
    const r = validarPagamentoContraAtribuicao(10001, 20000, [10000]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("não pode ultrapassar");
  });

  test("sem atribuição, pagamento é bloqueado — não há teto conhecido", () => {
    const r = validarPagamentoContraAtribuicao(1000, null, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Defina o valor da participação");
  });

  test("centavos", () => {
    expect(validarPagamentoContraAtribuicao(0.2, 0.3, [0.1]).ok).toBe(true);
    expect(validarPagamentoContraAtribuicao(0.21, 0.3, [0.1]).ok).toBe(false);
  });
});

describe("validarAtribuicaoContraPagamentos", () => {
  test("sem pagamento, qualquer atribuição passa", () => {
    expect(validarAtribuicaoContraPagamentos(null, []).ok).toBe(true);
    expect(validarAtribuicaoContraPagamentos(1, []).ok).toBe(true);
  });

  test("reduzir abaixo do pago é bloqueado", () => {
    const r = validarAtribuicaoContraPagamentos(4000, [5000]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("abaixo do que já foi pago");
  });

  test("igualar ao pago é permitido (vira LIQUIDADO)", () => {
    expect(validarAtribuicaoContraPagamentos(5000, [5000]).ok).toBe(true);
  });

  test("virar 'sem valor' com pagamento é bloqueado", () => {
    const r = validarAtribuicaoContraPagamentos(null, [5000]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("não pode ficar sem valor");
  });
});

describe("paraPagamentos e soma", () => {
  const bruto = (o: Partial<{ id: string; org: string; valor: number; iso: string; cancelado: boolean; atorOrg: string; nome: string | null }> = {}) => ({
    id: o.id ?? "pg1",
    organizationId: o.org ?? ORG,
    amount: o.valor ?? 100,
    paidAt: new Date(o.iso ?? "2026-09-01T12:00:00.000Z"),
    cancelledAt: o.cancelado ? new Date("2026-09-02T12:00:00.000Z") : null,
    createdByMember:
      o.nome === undefined && o.atorOrg === undefined
        ? { organizationId: ORG, user: { name: "Ana" } }
        : { organizationId: o.atorOrg ?? ORG, user: { name: o.nome ?? null } },
  });

  test("mapeia valor, data e ator", () => {
    const [p] = paraPagamentos([bruto()], ORG);
    expect(p).toMatchObject({ valor: 100, cancelado: false, registradoPor: "Ana" });
    expect(p.paidAtISO).toBe("2026-09-01T12:00:00.000Z");
  });

  test("cancelado é marcado mas NÃO some do histórico", () => {
    const lista = paraPagamentos([bruto({ cancelado: true })], ORG);
    expect(lista).toHaveLength(1);
    expect(lista[0].cancelado).toBe(true);
  });

  test("linha de outro tenant é descartada", () => {
    expect(paraPagamentos([bruto({ org: "org-b" })], ORG)).toEqual([]);
  });

  test("ator de outro tenant não tem o nome exposto", () => {
    const [p] = paraPagamentos([bruto({ atorOrg: "org-b", nome: "Vazado" })], ORG);
    expect(p.registradoPor).toBeNull();
  });

  test("ordena pela data do FATO, mais recente primeiro", () => {
    const lista = paraPagamentos(
      [
        bruto({ id: "a", iso: "2026-09-01T12:00:00.000Z" }),
        bruto({ id: "b", iso: "2026-09-05T12:00:00.000Z" }),
      ],
      ORG
    );
    expect(lista.map((p) => p.id)).toEqual(["b", "a"]);
  });

  test("a soma ignora cancelados", () => {
    const lista = paraPagamentos(
      [bruto({ id: "a", valor: 100 }), bruto({ id: "b", valor: 50, cancelado: true })],
      ORG
    );
    expect(somarPagamentosValidos(lista)).toBe(100);
  });
});

describe("agruparPagamentosPorParticipante", () => {
  const pg = (nome: string, valor: number, inativo = false) => ({
    memberId: `m-${nome}`,
    nome,
    inativo,
    valor,
  });

  test("sem pagamentos devolve lista vazia", () => {
    expect(agruparPagamentosPorParticipante([])).toEqual([]);
  });

  test("soma pagamentos do mesmo membro e conta as parcelas", () => {
    const linhas = agruparPagamentosPorParticipante([pg("Ana", 5000), pg("Ana", 3000)]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].pagamentos).toBe(2);
    expect(linhas[0].pago).toBe(8000);
  });

  test("ordena por valor pago", () => {
    const linhas = agruparPagamentosPorParticipante([pg("Ana", 100), pg("Bruno", 900)]);
    expect(linhas.map((l) => l.nome)).toEqual(["Bruno", "Ana"]);
  });

  test("membro inativo preserva nome e marca", () => {
    const linhas = agruparPagamentosPorParticipante([pg("Carla", 1, true)]);
    expect(linhas[0].inativo).toBe(true);
  });

  test("centavos", () => {
    expect(agruparPagamentosPorParticipante([pg("Ana", 0.1), pg("Ana", 0.2)])[0].pago).toBe(0.3);
  });
});
