import { describe, test, expect } from "vitest";
import {
  interpretarAlocacao,
  validarAlocacaoContraTotal,
  resumirDivisao,
  paraParticipantes,
  agruparPorParticipante,
  calcularAlocacaoPorPercentual,
  ALOCACAO_MAXIMA,
  type ParticipanteExibicao,
} from "@/lib/participacao-comissao";

const ORG = "org-a";

describe("interpretarAlocacao", () => {
  test("valor válido passa", () => {
    expect(interpretarAlocacao("20000")).toEqual({ ok: true, valor: 20000 });
    expect(interpretarAlocacao("20000.50")).toEqual({ ok: true, valor: 20000.5 });
  });

  test("ausente e vazio viram null — parcela ainda não definida", () => {
    expect(interpretarAlocacao(null)).toEqual({ ok: true, valor: null });
    expect(interpretarAlocacao(undefined)).toEqual({ ok: true, valor: null });
    expect(interpretarAlocacao("")).toEqual({ ok: true, valor: null });
    expect(interpretarAlocacao("   ")).toEqual({ ok: true, valor: null });
  });

  test("zero é RECUSADO: 'sem parcela' já se diz com null", () => {
    const r = interpretarAlocacao("0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("maior que zero");
  });

  test("negativo é recusado", () => {
    expect(interpretarAlocacao("-1").ok).toBe(false);
  });

  test("mais de duas casas decimais é recusado (Decimal(14,2) truncaria)", () => {
    const r = interpretarAlocacao("100.123");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("duas casas");
  });

  test("acima do teto é recusado", () => {
    expect(interpretarAlocacao(String(ALOCACAO_MAXIMA + 1)).ok).toBe(false);
    expect(interpretarAlocacao(String(ALOCACAO_MAXIMA)).ok).toBe(true);
  });

  test("não-finito e tipo inválido são recusados", () => {
    expect(interpretarAlocacao("abc").ok).toBe(false);
    expect(interpretarAlocacao("Infinity").ok).toBe(false);
    expect(interpretarAlocacao({}).ok).toBe(false);
  });
});

describe("validarAlocacaoContraTotal", () => {
  test("soma dentro do total passa", () => {
    expect(validarAlocacaoContraTotal(20000, 40000, [20000]).ok).toBe(true);
  });

  test("soma EXATA com o total passa (distribuição completa)", () => {
    expect(validarAlocacaoContraTotal(20000, 40000, [20000]).ok).toBe(true);
    expect(validarAlocacaoContraTotal(15000, 40000, [25000]).ok).toBe(true);
  });

  test("soma acima do total é bloqueada", () => {
    const r = validarAlocacaoContraTotal(20001, 40000, [20000]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("não pode ultrapassar");
  });

  test("parcela null nunca é bloqueada — participar não exige valor", () => {
    expect(validarAlocacaoContraTotal(null, null, []).ok).toBe(true);
    expect(validarAlocacaoContraTotal(null, 40000, [40000]).ok).toBe(true);
  });

  test("sem comissão registrada, atribuir valor é bloqueado", () => {
    const r = validarAlocacaoContraTotal(1000, null, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Registre a comissão");
  });

  test("participantes sem parcela não consomem o total", () => {
    expect(validarAlocacaoContraTotal(40000, 40000, [null, null]).ok).toBe(true);
  });

  test("centavos não estouram por erro binário", () => {
    expect(validarAlocacaoContraTotal(0.2, 0.3, [0.1]).ok).toBe(true);
  });
});

describe("resumirDivisao", () => {
  test("sem participantes: nada distribuído, saldo é a comissão inteira", () => {
    const r = resumirDivisao(40000, []);
    expect(r.distribuido).toBe(0);
    expect(r.naoDistribuido).toBe(40000);
    expect(r.distribuicaoCompleta).toBe(false);
  });

  test("distribuição parcial declara o saldo", () => {
    const r = resumirDivisao(40000, [25000]);
    expect(r.distribuido).toBe(25000);
    expect(r.naoDistribuido).toBe(15000);
    expect(r.distribuicaoCompleta).toBe(false);
  });

  test("distribuição completa zera o saldo", () => {
    const r = resumirDivisao(40000, [20000, 20000]);
    expect(r.distribuido).toBe(40000);
    expect(r.naoDistribuido).toBe(0);
    expect(r.distribuicaoCompleta).toBe(true);
  });

  test("comissão null: não existe saldo — null, nunca R$ 0", () => {
    const r = resumirDivisao(null, [null, null]);
    expect(r.comissaoTotal).toBeNull();
    expect(r.naoDistribuido).toBeNull();
    expect(r.distribuicaoCompleta).toBe(false);
    expect(r.participantes).toBe(2);
    expect(r.participantesSemParcela).toBe(2);
  });

  test("participante sem parcela não entra como zero na soma", () => {
    const r = resumirDivisao(40000, [25000, null]);
    expect(r.distribuido).toBe(25000);
    expect(r.participantesSemParcela).toBe(1);
    expect(r.naoDistribuido).toBe(15000);
  });

  test("soma em centavos não acumula erro binário", () => {
    expect(resumirDivisao(1, [0.1, 0.2]).distribuido).toBe(0.3);
  });
});

describe("paraParticipantes", () => {
  const bruto = (over: Partial<{ id: string; memberId: string; org: string; memberOrg: string; status: "ACTIVE" | "SUSPENDED"; nome: string | null; valor: number | null }> = {}) => ({
    id: over.id ?? "p1",
    memberId: over.memberId ?? "m1",
    organizationId: over.org ?? ORG,
    allocationValue: over.valor === undefined ? 100 : over.valor,
    member: {
      status: over.status ?? ("ACTIVE" as const),
      organizationId: over.memberOrg ?? ORG,
      user: { name: over.nome === undefined ? "Ana" : over.nome },
    },
  });

  test("mapeia nome, parcela e estado ativo", () => {
    expect(paraParticipantes([bruto()], ORG)).toEqual([
      { id: "p1", memberId: "m1", nome: "Ana", inativo: false, alocacao: 100 },
    ]);
  });

  test("membro suspenso continua na divisão, marcado como inativo", () => {
    const [p] = paraParticipantes([bruto({ status: "SUSPENDED" })], ORG);
    expect(p.inativo).toBe(true);
    expect(p.nome).toBe("Ana");
    expect(p.alocacao).toBe(100);
  });

  test("linha de outro tenant é descartada — nome não chega à tela", () => {
    expect(paraParticipantes([bruto({ org: "org-b" })], ORG)).toEqual([]);
    expect(paraParticipantes([bruto({ memberOrg: "org-b" })], ORG)).toEqual([]);
  });

  test("nome vazio vira rótulo honesto", () => {
    expect(paraParticipantes([bruto({ nome: null })], ORG)[0].nome).toBe("Membro sem nome");
  });

  test("ordena por maior parcela, e quem não tem parcela vai ao fim", () => {
    const lista = paraParticipantes(
      [
        bruto({ id: "a", memberId: "ma", nome: "Ana", valor: null }),
        bruto({ id: "b", memberId: "mb", nome: "Bruno", valor: 500 }),
        bruto({ id: "c", memberId: "mc", nome: "Carla", valor: 900 }),
      ],
      ORG
    );
    expect(lista.map((p) => p.nome)).toEqual(["Carla", "Bruno", "Ana"]);
  });
});

describe("agruparPorParticipante", () => {
  const part = (nome: string, alocacao: number | null, inativo = false): ParticipanteExibicao => ({
    id: `p-${nome}-${alocacao}`,
    memberId: `m-${nome}`,
    nome,
    inativo,
    alocacao,
  });

  test("sem participações devolve lista vazia", () => {
    expect(agruparPorParticipante([])).toEqual([]);
  });

  test("soma parcelas do mesmo membro em negócios diferentes", () => {
    const linhas = agruparPorParticipante([
      { participante: part("Ana", 10000) },
      { participante: part("Ana", 5000) },
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].negocios).toBe(2);
    expect(linhas[0].comissaoAtribuida).toBe(15000);
    expect(linhas[0].semParcela).toBe(0);
  });

  test("participação sem parcela conta o negócio mas não vira R$ 0", () => {
    const linhas = agruparPorParticipante([
      { participante: part("Ana", null) },
      { participante: part("Ana", 3000) },
    ]);
    expect(linhas[0].negocios).toBe(2);
    expect(linhas[0].comissaoAtribuida).toBe(3000);
    expect(linhas[0].semParcela).toBe(1);
  });

  test("ordena por comissão atribuída", () => {
    const linhas = agruparPorParticipante([
      { participante: part("Ana", 100) },
      { participante: part("Bruno", 900) },
    ]);
    expect(linhas.map((l) => l.nome)).toEqual(["Bruno", "Ana"]);
  });

  test("membro inativo preserva nome e marca própria", () => {
    const linhas = agruparPorParticipante([{ participante: part("Carla", 1, true) }]);
    expect(linhas[0].inativo).toBe(true);
    expect(linhas[0].nome).toBe("Carla");
  });
});

describe("calcularAlocacaoPorPercentual", () => {
  test("calcula sobre a comissão total", () => {
    expect(calcularAlocacaoPorPercentual(40000, "50")).toBe(20000);
    expect(calcularAlocacaoPorPercentual(40000, "12,5")).toBe(5000);
  });

  test("sem comissão, fora de faixa ou entrada inválida devolve null", () => {
    expect(calcularAlocacaoPorPercentual(null, "50")).toBeNull();
    expect(calcularAlocacaoPorPercentual(0, "50")).toBeNull();
    expect(calcularAlocacaoPorPercentual(40000, "0")).toBeNull();
    expect(calcularAlocacaoPorPercentual(40000, "101")).toBeNull();
    expect(calcularAlocacaoPorPercentual(40000, "abc")).toBeNull();
  });
});
