import { describe, test, expect } from "vitest";
import {
  paraItemPipeline,
  agruparPorColuna,
  ordenarColuna,
  interpretarFiltrosPipeline,
  calcularTaxaGanho,
  formatarPercentual,
  interpretarPeriodoPipeline,
  resolverIntervaloPeriodo,
  paraContagemPorStage,
  COLUNAS_ABERTAS,
  type ItemPipeline,
} from "@/lib/pipeline";
import type { PropertyInterestStage, PropertyStatus } from "@/generated/prisma/client";

// Fase P.4 — cobertura dos helpers puros (sem Prisma/banco), mesmo
// espírito de agenda.test.ts/scheduled-activity-date.test.ts.

const ORG = "org-a";

function linhaFake(overrides: {
  id?: string;
  stage?: PropertyInterestStage;
  closedAt?: Date | null;
  updatedAt?: Date;
  personOrganizationId?: string;
  propertyOrganizationId?: string;
  propertyStatus?: PropertyStatus;
  scheduledActivities?: { id: string; scheduledAt: Date }[];
}) {
  return {
    id: overrides.id ?? "interesse-1",
    stage: overrides.stage ?? "INTERESTED",
    closedAt: overrides.closedAt ?? null,
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00.000Z"),
    person: { id: "pessoa-1", name: "Fulano", organizationId: overrides.personOrganizationId ?? ORG },
    property: {
      id: "imovel-1",
      title: "Apto Teste",
      status: overrides.propertyStatus ?? "AVAILABLE",
      organizationId: overrides.propertyOrganizationId ?? ORG,
    },
    scheduledActivities: overrides.scheduledActivities ?? [],
  };
}

describe("paraItemPipeline", () => {
  test("mapeia campos básicos (id, stage, closedAtISO null, updatedAtISO)", () => {
    const item = paraItemPipeline(linhaFake({}), ORG);
    expect(item.id).toBe("interesse-1");
    expect(item.stage).toBe("INTERESTED");
    expect(item.closedAtISO).toBeNull();
    expect(item.updatedAtISO).toBe("2026-01-01T00:00:00.000Z");
  });

  test("closedAtISO preenchido quando closedAt não é null", () => {
    const item = paraItemPipeline(
      linhaFake({ closedAt: new Date("2026-02-02T10:00:00.000Z") }),
      ORG
    );
    expect(item.closedAtISO).toBe("2026-02-02T10:00:00.000Z");
  });

  test("F) sem visita agendada -> proximaVisita null", () => {
    const item = paraItemPipeline(linhaFake({ scheduledActivities: [] }), ORG);
    expect(item.proximaVisita).toBeNull();
  });

  test("E) com visita agendada -> proximaVisita preenchida com o item retornado pela query (id + scheduledAtISO)", () => {
    const item = paraItemPipeline(
      linhaFake({
        scheduledActivities: [{ id: "visita-1", scheduledAt: new Date("2026-03-01T14:00:00.000Z") }],
      }),
      ORG
    );
    expect(item.proximaVisita).toEqual({ id: "visita-1", scheduledAtISO: "2026-03-01T14:00:00.000Z" });
  });

  test("G) proximaAcao reaproveita obterProximaAcaoComercial (varia com stage/status, nunca reimplementada)", () => {
    const interessado = paraItemPipeline(linhaFake({ stage: "INTERESTED", propertyStatus: "AVAILABLE" }), ORG);
    expect(interessado.proximaAcao).toEqual({ key: "AGENDAR_VISITA", label: "Agendar visita", ativa: true });

    const proposta = paraItemPipeline(linhaFake({ stage: "PROPOSAL", propertyStatus: "AVAILABLE" }), ORG);
    expect(proposta.proximaAcao).toEqual({ key: "ACOMPANHAR_PROPOSTA", label: "Acompanhar proposta", ativa: true });

    const indisponivel = paraItemPipeline(linhaFake({ stage: "INTERESTED", propertyStatus: "SOLD" }), ORG);
    expect(indisponivel.proximaAcao).toEqual({ key: "INDISPONIVEL", label: "Imóvel indisponível", ativa: false });
  });

  test("Person redigida (null) quando organizationId da relação não bate com a sessão (anomalia cross-tenant)", () => {
    const item = paraItemPipeline(linhaFake({ personOrganizationId: "org-b" }), ORG);
    expect(item.person).toBeNull();
  });

  test("Property redigida (null) quando organizationId da relação não bate — proximaAcao também vira null (sem status pra calcular)", () => {
    const item = paraItemPipeline(linhaFake({ propertyOrganizationId: "org-b" }), ORG);
    expect(item.property).toBeNull();
    expect(item.proximaAcao).toBeNull();
  });
});

function itemFake(overrides: Partial<ItemPipeline> & { stage: PropertyInterestStage }): ItemPipeline {
  return {
    id: overrides.id ?? `item-${Math.random()}`,
    stage: overrides.stage,
    closedAtISO: overrides.closedAtISO ?? null,
    updatedAtISO: overrides.updatedAtISO ?? "2026-01-01T00:00:00.000Z",
    person: overrides.person ?? { id: "p1", name: "Fulano" },
    property: overrides.property ?? { id: "im1", title: "Imóvel", status: "AVAILABLE" },
    proximaVisita: overrides.proximaVisita ?? null,
    proximaAcao: overrides.proximaAcao ?? null,
  };
}

describe("agruparPorColuna", () => {
  test("A) agrupa corretamente nos 4 stages abertos", () => {
    const itens = [
      itemFake({ id: "a", stage: "INTERESTED" }),
      itemFake({ id: "b", stage: "VISIT_SCHEDULED" }),
      itemFake({ id: "c", stage: "VISITED" }),
      itemFake({ id: "d", stage: "PROPOSAL" }),
      itemFake({ id: "e", stage: "INTERESTED" }),
    ];
    const grupos = agruparPorColuna(itens);
    expect(grupos.INTERESTED.map((i) => i.id)).toEqual(["a", "e"]);
    expect(grupos.VISIT_SCHEDULED.map((i) => i.id)).toEqual(["b"]);
    expect(grupos.VISITED.map((i) => i.id)).toEqual(["c"]);
    expect(grupos.PROPOSAL.map((i) => i.id)).toEqual(["d"]);
  });

  test("B) WON não entra em nenhuma coluna aberta", () => {
    const grupos = agruparPorColuna([itemFake({ id: "won", stage: "WON" })]);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(grupos[coluna]).toEqual([]);
    }
  });

  test("C) REJECTED não entra em nenhuma coluna aberta", () => {
    const grupos = agruparPorColuna([itemFake({ id: "rej", stage: "REJECTED" })]);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(grupos[coluna]).toEqual([]);
    }
  });

  test("I) lista vazia produz as 4 colunas presentes, todas vazias (estado vazio)", () => {
    const grupos = agruparPorColuna([]);
    expect(Object.keys(grupos).sort()).toEqual([...COLUNAS_ABERTAS].sort());
    for (const coluna of COLUNAS_ABERTAS) {
      expect(grupos[coluna]).toEqual([]);
    }
  });
});

describe("ordenarColuna", () => {
  const agora = new Date("2026-06-15T12:00:00.000Z");

  test("D) determinístico — mesma entrada sempre produz a mesma ordem", () => {
    const itens = [
      itemFake({ id: "a", stage: "INTERESTED", proximaVisita: { id: "v1", scheduledAtISO: "2026-06-20T10:00:00.000Z" } }),
      itemFake({ id: "b", stage: "INTERESTED", proximaVisita: { id: "v2", scheduledAtISO: "2026-06-16T10:00:00.000Z" } }),
    ];
    const resultados = new Set(
      Array.from({ length: 10 }, () => ordenarColuna(itens, agora).map((i) => i.id).join(","))
    );
    expect(resultados.size).toBe(1);
  });

  test("pendência (visita SCHEDULED cujo dia já passou) vem antes de itens com visita futura", () => {
    const itens = [
      itemFake({
        id: "futura",
        stage: "INTERESTED",
        proximaVisita: { id: "v1", scheduledAtISO: "2026-06-20T10:00:00.000Z" },
      }),
      itemFake({
        id: "pendente",
        stage: "INTERESTED",
        proximaVisita: { id: "v2", scheduledAtISO: "2026-06-10T10:00:00.000Z" }, // dia já passado
      }),
    ];
    const ordenado = ordenarColuna(itens, agora);
    expect(ordenado.map((i) => i.id)).toEqual(["pendente", "futura"]);
  });

  test("entre itens com visita futura, a mais próxima vem primeiro", () => {
    const itens = [
      itemFake({ id: "longe", stage: "PROPOSAL", proximaVisita: { id: "v1", scheduledAtISO: "2026-07-01T10:00:00.000Z" } }),
      itemFake({ id: "perto", stage: "PROPOSAL", proximaVisita: { id: "v2", scheduledAtISO: "2026-06-16T10:00:00.000Z" } }),
    ];
    const ordenado = ordenarColuna(itens, agora);
    expect(ordenado.map((i) => i.id)).toEqual(["perto", "longe"]);
  });

  test("F) itens sem visita vêm por último, ordenados por updatedAt mais antigo primeiro (desempate, nunca exibido como idade da etapa)", () => {
    const itens = [
      itemFake({ id: "com-visita", stage: "VISITED", proximaVisita: { id: "v1", scheduledAtISO: "2026-06-20T10:00:00.000Z" } }),
      itemFake({ id: "sem-visita-novo", stage: "VISITED", updatedAtISO: "2026-06-10T00:00:00.000Z" }),
      itemFake({ id: "sem-visita-antigo", stage: "VISITED", updatedAtISO: "2026-01-01T00:00:00.000Z" }),
    ];
    const ordenado = ordenarColuna(itens, agora);
    expect(ordenado.map((i) => i.id)).toEqual(["com-visita", "sem-visita-antigo", "sem-visita-novo"]);
  });
});

describe("interpretarFiltrosPipeline", () => {
  test("H) defaults seguros sem nenhum param", () => {
    expect(interpretarFiltrosPipeline({})).toEqual({ busca: "", visao: "ABERTA", resultado: "TODOS" });
  });

  test("aceita visao=encerrada (case-insensitive)", () => {
    expect(interpretarFiltrosPipeline({ visao: "Encerrada" }).visao).toBe("ENCERRADA");
    expect(interpretarFiltrosPipeline({ visao: "aberta" }).visao).toBe("ABERTA");
  });

  test("visao inválida cai em ABERTA (default seguro)", () => {
    expect(interpretarFiltrosPipeline({ visao: "qualquer-coisa" }).visao).toBe("ABERTA");
  });

  test("aceita resultado=ganho/perdido (case-insensitive)", () => {
    expect(interpretarFiltrosPipeline({ resultado: "Ganho" }).resultado).toBe("GANHO");
    expect(interpretarFiltrosPipeline({ resultado: "PERDIDO" }).resultado).toBe("PERDIDO");
  });

  test("resultado inválido cai em TODOS (default seguro)", () => {
    expect(interpretarFiltrosPipeline({ resultado: "invalido" }).resultado).toBe("TODOS");
  });

  test("busca é normalizada (trim/espaços colapsados) — mesmo normalizarBusca do resto do projeto", () => {
    expect(interpretarFiltrosPipeline({ q: "  João   Silva  " }).busca).toBe("João Silva");
  });
});

// -------------------------------------------------------------------
// Métricas do Pipeline (Fase P.5) — helpers puros, sem Prisma/banco.
// -------------------------------------------------------------------

describe("calcularTaxaGanho", () => {
  test("A) 0/0 -> null (nunca 0%/NaN%/Infinity%)", () => {
    expect(calcularTaxaGanho(0, 0)).toBeNull();
  });

  test("B) 1/0 -> 100", () => {
    expect(calcularTaxaGanho(1, 0)).toBe(100);
  });

  test("C) 0/1 -> 0", () => {
    expect(calcularTaxaGanho(0, 1)).toBe(0);
  });

  test("D) 8/2 -> 80", () => {
    expect(calcularTaxaGanho(8, 2)).toBe(80);
  });

  test("valor fracionário preservado (arredondamento é responsabilidade de formatarPercentual, não daqui)", () => {
    expect(calcularTaxaGanho(2, 1)).toBeCloseTo(66.6666, 3);
  });
});

describe("formatarPercentual", () => {
  test("null -> '—' (nunca texto técnico)", () => {
    expect(formatarPercentual(null)).toBe("—");
  });

  test("inteiro não ganha casa decimal artificial", () => {
    expect(formatarPercentual(80)).toBe("80%");
  });

  test("fracionário formatado em pt-BR com no máximo 1 casa decimal", () => {
    expect(formatarPercentual(66.6666)).toBe("66,7%");
  });

  test("zero", () => {
    expect(formatarPercentual(0)).toBe("0%");
  });
});

describe("interpretarPeriodoPipeline", () => {
  test("E) 30d", () => {
    expect(interpretarPeriodoPipeline({ periodo: "30d" })).toBe("30d");
  });

  test("F) 90d", () => {
    expect(interpretarPeriodoPipeline({ periodo: "90d" })).toBe("90d");
  });

  test("G) ano (case-insensitive)", () => {
    expect(interpretarPeriodoPipeline({ periodo: "ano" })).toBe("ANO");
    expect(interpretarPeriodoPipeline({ periodo: "ANO" })).toBe("ANO");
  });

  test("H) todos (case-insensitive)", () => {
    expect(interpretarPeriodoPipeline({ periodo: "todos" })).toBe("TODOS");
  });

  test("I) período inválido/ausente cai no default seguro (30d)", () => {
    expect(interpretarPeriodoPipeline({})).toBe("30d");
    expect(interpretarPeriodoPipeline({ periodo: "60d" })).toBe("30d");
    expect(interpretarPeriodoPipeline({ periodo: "" })).toBe("30d");
  });
});

describe("resolverIntervaloPeriodo", () => {
  const agora = new Date("2026-06-15T12:00:00.000Z");

  test("30d: início é exatamente 30 dias antes de agora, fim é agora", () => {
    const intervalo = resolverIntervaloPeriodo("30d", agora);
    expect(intervalo).not.toBeNull();
    expect(intervalo?.fim).toEqual(agora);
    expect(intervalo?.inicio.getTime()).toBe(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  });

  test("90d: início é exatamente 90 dias antes de agora", () => {
    const intervalo = resolverIntervaloPeriodo("90d", agora);
    expect(intervalo?.inicio.getTime()).toBe(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
  });

  test("ANO: início do ano calendário UTC (1º de janeiro 00:00 UTC), não uma janela rolante", () => {
    const intervalo = resolverIntervaloPeriodo("ANO", agora);
    expect(intervalo?.inicio.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(intervalo?.fim).toEqual(agora);
  });

  test("TODOS: sem intervalo (null) -> caller não filtra por closedAt", () => {
    expect(resolverIntervaloPeriodo("TODOS", agora)).toBeNull();
  });

  test("J) boundary: início do intervalo usa o mesmo instante que seria usado como gte (inclusivo por construção do caller)", () => {
    const intervalo = resolverIntervaloPeriodo("30d", agora);
    // O próprio valor de `inicio` É o limite que o caller usa como `gte` —
    // um closedAt exatamente igual a `inicio` deve estar dentro do
    // intervalo (verificado com Postgres real em DF/DG da integração).
    expect(intervalo?.inicio.getTime()).toBeLessThanOrEqual(agora.getTime());
  });

  test("K) fim nunca é depois de agora (limite superior determinístico, nunca um valor futuro implícito)", () => {
    const intervalo = resolverIntervaloPeriodo("90d", agora);
    expect(intervalo?.fim.getTime()).toBe(agora.getTime());
  });
});

describe("paraContagemPorStage", () => {
  test("N) lista vazia -> todos os 4 stages abertos presentes com 0", () => {
    const contagem = paraContagemPorStage([]);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(contagem[coluna]).toBe(0);
    }
  });

  test("O) groupBy incompleto (só alguns stages retornados) -> stages ausentes viram 0, presentes mantêm o valor real", () => {
    const contagem = paraContagemPorStage([
      { stage: "VISIT_SCHEDULED", _count: { _all: 3 } },
      { stage: "PROPOSAL", _count: { _all: 7 } },
    ]);
    expect(contagem).toEqual({
      INTERESTED: 0,
      VISIT_SCHEDULED: 3,
      VISITED: 0,
      PROPOSAL: 7,
    });
  });

  test("stage terminal (WON/REJECTED) no groupBy bruto é ignorado — paraContagemPorStage só conhece as 4 colunas abertas", () => {
    const contagem = paraContagemPorStage([{ stage: "WON", _count: { _all: 5 } }]);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(contagem[coluna]).toBe(0);
    }
  });
});
