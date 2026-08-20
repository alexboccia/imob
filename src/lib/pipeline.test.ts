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
  obterInicioStageAtual,
  calcularAgingStageMs,
  formatarAgingStage,
  COLUNAS_ABERTAS,
  ordenarEventosDaJornada,
  derivarEpisodiosDaJornada,
  calcularTempoMedioPorEtapa,
  calcularAgingAgregado,
  calcularGargalo,
  formatarDuracao,
  paraEntradasPorEtapa,
  paraTransicoesObservadas,
  calcularTempoMedioAteFechamento,
  classificarPrioridadePipeline,
  compararPrioridadePipeline,
  formatarMotivoPrioridade,
  interpretarFiltroPrioridade,
  type ItemPipeline,
  type EventoJornada,
  type EpisodioEtapa,
  type MotivoPrioridadePipeline,
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
  stageHistory?: { newStage: PropertyInterestStage; changedAt: Date }[];
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
      neighborhood: "Centro",
      organizationId: overrides.propertyOrganizationId ?? ORG,
    },
    scheduledActivities: overrides.scheduledActivities ?? [],
    stageHistory: overrides.stageHistory ?? [],
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

  describe("aging (Fase P.6)", () => {
    const agora = new Date("2026-06-15T12:00:00.000Z");

    test("stage aberto sem stageHistory -> aging null (registro anterior à P.6, nunca uma origem inventada)", () => {
      const item = paraItemPipeline(linhaFake({ stage: "VISITED", stageHistory: [] }), ORG, agora);
      expect(item.aging).toBeNull();
    });

    test("stage aberto com stageHistory correspondente -> aging calculado a partir de changedAt", () => {
      const item = paraItemPipeline(
        linhaFake({
          stage: "VISITED",
          stageHistory: [{ newStage: "VISITED", changedAt: new Date("2026-06-12T12:00:00.000Z") }],
        }),
        ORG,
        agora
      );
      expect(item.aging).toBe("Na etapa há 3 dias");
    });

    test("stage encerrado (WON) -> aging sempre null, mesmo com stageHistory presente (closedAtISO é a referência oficial)", () => {
      const item = paraItemPipeline(
        linhaFake({
          stage: "WON",
          closedAt: new Date("2026-06-14T12:00:00.000Z"),
          stageHistory: [{ newStage: "WON", changedAt: new Date("2026-06-14T12:00:00.000Z") }],
        }),
        ORG,
        agora
      );
      expect(item.aging).toBeNull();
    });
  });
});

function itemFake(overrides: Partial<ItemPipeline> & { stage: PropertyInterestStage }): ItemPipeline {
  return {
    id: overrides.id ?? `item-${Math.random()}`,
    stage: overrides.stage,
    closedAtISO: overrides.closedAtISO ?? null,
    updatedAtISO: overrides.updatedAtISO ?? "2026-01-01T00:00:00.000Z",
    person: overrides.person ?? { id: "p1", name: "Fulano" },
    property: overrides.property ?? { id: "im1", title: "Imóvel", status: "AVAILABLE", neighborhood: "Centro" },
    proximaVisita: overrides.proximaVisita ?? null,
    proximaAcao: overrides.proximaAcao ?? null,
    aging: overrides.aging ?? null,
    agingMs: overrides.agingMs ?? null,
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

// -------------------------------------------------------------------
// Aging do Pipeline (Fase P.6) — helpers puros, sem Prisma/banco.
// -------------------------------------------------------------------

describe("obterInicioStageAtual", () => {
  test("A) transição correspondente ao stage atual encontrada -> retorna seu changedAtISO", () => {
    const resultado = obterInicioStageAtual("VISITED", [
      { newStage: "VISITED", changedAtISO: "2026-06-10T00:00:00.000Z" },
    ]);
    expect(resultado).toBe("2026-06-10T00:00:00.000Z");
  });

  test("B) múltiplas entradas pro mesmo stage (reentrada) -> vence a mais recente, nunca a mais antiga", () => {
    const resultado = obterInicioStageAtual("VISITED", [
      { newStage: "VISITED", changedAtISO: "2026-01-01T00:00:00.000Z" },
      { newStage: "VISITED", changedAtISO: "2026-06-10T00:00:00.000Z" },
    ]);
    expect(resultado).toBe("2026-06-10T00:00:00.000Z");
  });

  test("C) entrada com newStage diferente do stage atual é ignorada", () => {
    const resultado = obterInicioStageAtual("VISITED", [
      { newStage: "PROPOSAL", changedAtISO: "2026-06-10T00:00:00.000Z" },
    ]);
    expect(resultado).toBeNull();
  });

  test("D) sem histórico -> null", () => {
    expect(obterInicioStageAtual("VISITED", [])).toBeNull();
  });
});

describe("calcularAgingStageMs", () => {
  test("sem início (null) -> null", () => {
    expect(calcularAgingStageMs(null, new Date("2026-06-15T12:00:00.000Z"))).toBeNull();
  });

  test("E) changedAt no futuro -> null (nunca aging negativo)", () => {
    const agora = new Date("2026-06-15T12:00:00.000Z");
    const futuro = new Date("2026-06-16T12:00:00.000Z").toISOString();
    expect(calcularAgingStageMs(futuro, agora)).toBeNull();
  });

  test("F) changedAt exatamente igual a agora -> 0 (não null — zero é um aging válido)", () => {
    const agora = new Date("2026-06-15T12:00:00.000Z");
    expect(calcularAgingStageMs(agora.toISOString(), agora)).toBe(0);
  });

  test("K) diferença em ms é a mesma independentemente de como o ISO representa o fuso (sempre epoch UTC internamente)", () => {
    const agora = new Date("2026-06-15T12:00:00.000Z");
    const semOffset = "2026-06-15T09:00:00.000Z";
    const comOffset = "2026-06-15T06:00:00.000-03:00"; // mesmo instante que 09:00 UTC
    expect(calcularAgingStageMs(semOffset, agora)).toBe(calcularAgingStageMs(comOffset, agora));
  });
});

describe("formatarAgingStage", () => {
  test("null -> null", () => {
    expect(formatarAgingStage(null)).toBeNull();
  });

  test("G) 30 minutos -> 'menos de 1h'", () => {
    expect(formatarAgingStage(30 * 60 * 1000)).toBe("Na etapa há menos de 1h");
  });

  test("H) 5 horas -> 'há 5h'", () => {
    expect(formatarAgingStage(5 * 60 * 60 * 1000)).toBe("Na etapa há 5h");
  });

  test("I) 1 dia exato -> 'há 1 dia' (singular)", () => {
    expect(formatarAgingStage(24 * 60 * 60 * 1000)).toBe("Na etapa há 1 dia");
  });

  test("J) 3 dias -> 'há 3 dias' (plural)", () => {
    expect(formatarAgingStage(3 * 24 * 60 * 60 * 1000)).toBe("Na etapa há 3 dias");
  });

  test("0ms -> 'menos de 1h' (zero é um aging válido, nunca null)", () => {
    expect(formatarAgingStage(0)).toBe("Na etapa há menos de 1h");
  });
});

// -------------------------------------------------------------------
// Analytics históricos do Pipeline (Fase P.7) — helpers puros, sem
// Prisma/banco.
// -------------------------------------------------------------------

function evento(overrides: Partial<EventoJornada>): EventoJornada {
  return {
    newStage: overrides.newStage ?? "INTERESTED",
    changedAtISO: overrides.changedAtISO ?? "2026-01-01T00:00:00.000Z",
    id: overrides.id ?? "h1",
  };
}

describe("ordenarEventosDaJornada", () => {
  test("G) ordem invertida na entrada é corrigida (changedAt ASC)", () => {
    const eventos = [
      evento({ id: "b", changedAtISO: "2026-01-03T00:00:00.000Z" }),
      evento({ id: "a", changedAtISO: "2026-01-01T00:00:00.000Z" }),
      evento({ id: "c", changedAtISO: "2026-01-02T00:00:00.000Z" }),
    ];
    expect(ordenarEventosDaJornada(eventos).map((e) => e.id)).toEqual(["a", "c", "b"]);
  });

  test("K) timestamps iguais -> desempate determinístico por id", () => {
    const eventos = [
      evento({ id: "z", changedAtISO: "2026-01-01T00:00:00.000Z" }),
      evento({ id: "a", changedAtISO: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(ordenarEventosDaJornada(eventos).map((e) => e.id)).toEqual(["a", "z"]);
  });

  test("não muta o array original", () => {
    const eventos = [evento({ id: "b" }), evento({ id: "a" })];
    const copia = [...eventos];
    ordenarEventosDaJornada(eventos);
    expect(eventos).toEqual(copia);
  });
});

describe("derivarEpisodiosDaJornada", () => {
  const agora = new Date("2026-01-10T00:00:00.000Z");

  test("A) genesis seguido de uma transição gera exatamente 2 episódios: 1 concluído + 1 aberto", () => {
    const jornada = [
      evento({ id: "1", newStage: "INTERESTED", changedAtISO: "2026-01-01T00:00:00.000Z" }),
      evento({ id: "2", newStage: "VISIT_SCHEDULED", changedAtISO: "2026-01-03T00:00:00.000Z" }),
    ];
    const episodios = derivarEpisodiosDaJornada("pi-1", jornada, agora);
    expect(episodios).toHaveLength(2);
    expect(episodios[0]).toMatchObject({
      stage: "INTERESTED",
      enteredAtISO: "2026-01-01T00:00:00.000Z",
      exitedAtISO: "2026-01-03T00:00:00.000Z",
      duracaoMs: 2 * 24 * 60 * 60 * 1000,
    });
    expect(episodios[1]).toMatchObject({
      stage: "VISIT_SCHEDULED",
      enteredAtISO: "2026-01-03T00:00:00.000Z",
      exitedAtISO: null,
      duracaoMs: 7 * 24 * 60 * 60 * 1000,
    });
  });

  test("B) múltiplas etapas em sequência gera um episódio por transição", () => {
    const jornada = [
      evento({ id: "1", newStage: "INTERESTED", changedAtISO: "2026-01-01T00:00:00.000Z" }),
      evento({ id: "2", newStage: "VISIT_SCHEDULED", changedAtISO: "2026-01-02T00:00:00.000Z" }),
      evento({ id: "3", newStage: "VISITED", changedAtISO: "2026-01-03T00:00:00.000Z" }),
      evento({ id: "4", newStage: "PROPOSAL", changedAtISO: "2026-01-04T00:00:00.000Z" }),
    ];
    const episodios = derivarEpisodiosDaJornada("pi-1", jornada, agora);
    expect(episodios.map((e) => e.stage)).toEqual(["INTERESTED", "VISIT_SCHEDULED", "VISITED", "PROPOSAL"]);
    expect(episodios.slice(0, 3).every((e) => e.exitedAtISO !== null)).toBe(true);
    expect(episodios[3].exitedAtISO).toBeNull();
  });

  test("C) reentrada na mesma etapa gera episódios INDEPENDENTES, nunca fundidos", () => {
    const jornada = [
      evento({ id: "1", newStage: "INTERESTED", changedAtISO: "2026-01-01T00:00:00.000Z" }),
      evento({ id: "2", newStage: "VISIT_SCHEDULED", changedAtISO: "2026-01-02T00:00:00.000Z" }),
      evento({ id: "3", newStage: "PROPOSAL", changedAtISO: "2026-01-03T00:00:00.000Z" }),
      evento({ id: "4", newStage: "VISIT_SCHEDULED", changedAtISO: "2026-01-05T00:00:00.000Z" }),
    ];
    const episodios = derivarEpisodiosDaJornada("pi-1", jornada, agora);
    const visitSched = episodios.filter((e) => e.stage === "VISIT_SCHEDULED");
    expect(visitSched).toHaveLength(2);
    expect(visitSched[0].duracaoMs).toBe(1 * 24 * 60 * 60 * 1000);
    expect(visitSched[1].exitedAtISO).toBeNull();
  });

  test("D) episódio atual (último evento) nunca tem exit — duração calculada até `agora`", () => {
    const jornada = [evento({ id: "1", newStage: "INTERESTED", changedAtISO: "2026-01-08T00:00:00.000Z" })];
    const episodios = derivarEpisodiosDaJornada("pi-1", jornada, agora);
    expect(episodios[0].exitedAtISO).toBeNull();
    expect(episodios[0].duracaoMs).toBe(2 * 24 * 60 * 60 * 1000);
  });

  test("E) histórico vazio -> nenhum episódio (nunca inventado)", () => {
    expect(derivarEpisodiosDaJornada("pi-1", [], agora)).toEqual([]);
  });

  test("F) histórico parcial (primeiro evento não é genesis) ainda gera episódios válidos a partir dali", () => {
    const jornada = [
      evento({ id: "5", newStage: "PROPOSAL", changedAtISO: "2026-01-05T00:00:00.000Z" }),
      evento({ id: "6", newStage: "WON", changedAtISO: "2026-01-07T00:00:00.000Z" }),
    ];
    const episodios = derivarEpisodiosDaJornada("pi-1", jornada, agora);
    expect(episodios).toHaveLength(2);
    expect(episodios[0]).toMatchObject({ stage: "PROPOSAL", exitedAtISO: "2026-01-07T00:00:00.000Z" });
    expect(episodios[1]).toMatchObject({ stage: "WON", exitedAtISO: null });
  });

  test("H) changedAt no futuro -> duracaoMs null (nunca negativo)", () => {
    const jornada = [evento({ id: "1", newStage: "INTERESTED", changedAtISO: "2026-01-15T00:00:00.000Z" })];
    const episodios = derivarEpisodiosDaJornada("pi-1", jornada, agora);
    expect(episodios[0].duracaoMs).toBeNull();
  });

  test("I) previousStage nunca é um insumo — EventoJornada estruturalmente não carrega esse campo, garantia por tipo, não por checagem em runtime", () => {
    const jornada: EventoJornada[] = [{ newStage: "PROPOSAL", changedAtISO: "2026-01-01T00:00:00.000Z", id: "1" }];
    // Se este objeto compila sem o campo previousStage, a garantia está
    // provada estruturalmente: a função não tem como ler algo que não existe.
    expect(derivarEpisodiosDaJornada("pi-1", jornada, agora)[0].stage).toBe("PROPOSAL");
  });

  test("J) terminal (WON/REJECTED) gera episódio com exitedAtISO null — nunca tem transição posterior", () => {
    const jornada = [
      evento({ id: "1", newStage: "PROPOSAL", changedAtISO: "2026-01-01T00:00:00.000Z" }),
      evento({ id: "2", newStage: "REJECTED", changedAtISO: "2026-01-05T00:00:00.000Z" }),
    ];
    const episodios = derivarEpisodiosDaJornada("pi-1", jornada, agora);
    expect(episodios[1]).toMatchObject({ stage: "REJECTED", exitedAtISO: null });
  });

  test("L) timezone não altera a duração absoluta calculada", () => {
    const jornadaSemOffset = [
      evento({ id: "1", newStage: "INTERESTED", changedAtISO: "2026-01-01T09:00:00.000Z" }),
      evento({ id: "2", newStage: "VISITED", changedAtISO: "2026-01-01T12:00:00.000Z" }),
    ];
    const jornadaComOffset = [
      evento({ id: "1", newStage: "INTERESTED", changedAtISO: "2026-01-01T06:00:00.000-03:00" }),
      evento({ id: "2", newStage: "VISITED", changedAtISO: "2026-01-01T09:00:00.000-03:00" }),
    ];
    const d1 = derivarEpisodiosDaJornada("pi-1", jornadaSemOffset, agora)[0].duracaoMs;
    const d2 = derivarEpisodiosDaJornada("pi-1", jornadaComOffset, agora)[0].duracaoMs;
    expect(d1).toBe(d2);
  });
});

function episodioFake(overrides: Partial<EpisodioEtapa>): EpisodioEtapa {
  return {
    propertyInterestId: overrides.propertyInterestId ?? "pi-1",
    stage: overrides.stage ?? "INTERESTED",
    enteredAtISO: overrides.enteredAtISO ?? "2026-01-01T00:00:00.000Z",
    exitedAtISO: overrides.exitedAtISO ?? null,
    duracaoMs: overrides.duracaoMs ?? null,
  };
}

describe("calcularTempoMedioPorEtapa", () => {
  test("M) uma única duração concluída", () => {
    const episodios = [episodioFake({ stage: "PROPOSAL", exitedAtISO: "2026-01-02T00:00:00.000Z", duracaoMs: 1000 })];
    expect(calcularTempoMedioPorEtapa(episodios, null).PROPOSAL).toBe(1000);
  });

  test("N) várias durações concluídas -> média aritmética simples", () => {
    const episodios = [
      episodioFake({ stage: "VISITED", exitedAtISO: "x", duracaoMs: 1000 }),
      episodioFake({ stage: "VISITED", exitedAtISO: "y", duracaoMs: 3000 }),
    ];
    expect(calcularTempoMedioPorEtapa(episodios, null).VISITED).toBe(2000);
  });

  test("O) etapa sem nenhum episódio concluído -> null (nunca 0)", () => {
    expect(calcularTempoMedioPorEtapa([], null).INTERESTED).toBeNull();
  });

  test("P) episódio ainda aberto (exitedAtISO null) é excluído da média histórica", () => {
    const episodios = [
      episodioFake({ stage: "VISITED", exitedAtISO: "x", duracaoMs: 1000 }),
      episodioFake({ stage: "VISITED", exitedAtISO: null, duracaoMs: 999999 }),
    ];
    expect(calcularTempoMedioPorEtapa(episodios, null).VISITED).toBe(1000);
  });

  test("Q) outlier não quebra o cálculo (só afeta a média, sem exceção)", () => {
    const episodios = [
      episodioFake({ stage: "PROPOSAL", exitedAtISO: "x", duracaoMs: 1000 }),
      episodioFake({ stage: "PROPOSAL", exitedAtISO: "y", duracaoMs: 100_000_000 }),
    ];
    expect(calcularTempoMedioPorEtapa(episodios, null).PROPOSAL).toBe((1000 + 100_000_000) / 2);
  });

  test("R) lista vazia -> todas as 4 etapas null (nunca divisão por zero/NaN)", () => {
    const resultado = calcularTempoMedioPorEtapa([], null);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(resultado[coluna]).toBeNull();
    }
  });

  test("terminal (WON/REJECTED) nunca aparece no resultado, mesmo se presente na lista de episódios", () => {
    const episodios = [episodioFake({ stage: "WON", exitedAtISO: null, duracaoMs: 1000 })];
    const resultado = calcularTempoMedioPorEtapa(episodios, null);
    expect(Object.keys(resultado)).toEqual([...COLUNAS_ABERTAS]);
  });

  test("período filtra por exitedAtISO (fim do episódio), fora do intervalo é excluído", () => {
    const intervalo = { inicio: new Date("2026-01-01T00:00:00.000Z"), fim: new Date("2026-01-10T00:00:00.000Z") };
    const dentro = episodioFake({ stage: "PROPOSAL", exitedAtISO: "2026-01-05T00:00:00.000Z", duracaoMs: 1000 });
    const fora = episodioFake({ stage: "PROPOSAL", exitedAtISO: "2026-02-01T00:00:00.000Z", duracaoMs: 5000 });
    expect(calcularTempoMedioPorEtapa([dentro, fora], intervalo).PROPOSAL).toBe(1000);
  });
});

describe("calcularAgingAgregado", () => {
  test("S) média do aging atual de episódios abertos", () => {
    const episodios = [
      episodioFake({ stage: "INTERESTED", exitedAtISO: null, duracaoMs: 1000 }),
      episodioFake({ stage: "INTERESTED", exitedAtISO: null, duracaoMs: 3000 }),
    ];
    expect(calcularAgingAgregado(episodios).INTERESTED).toBe(2000);
  });

  test("T) só episódios ABERTOS entram — concluídos são ignorados aqui", () => {
    const episodios = [
      episodioFake({ stage: "VISITED", exitedAtISO: "x", duracaoMs: 1000 }),
      episodioFake({ stage: "VISITED", exitedAtISO: null, duracaoMs: 5000 }),
    ];
    expect(calcularAgingAgregado(episodios).VISITED).toBe(5000);
  });

  test("U) terminais (WON/REJECTED) nunca aparecem no resultado", () => {
    const episodios = [episodioFake({ stage: "WON", exitedAtISO: null, duracaoMs: 1000 })];
    const resultado = calcularAgingAgregado(episodios);
    expect(Object.keys(resultado)).toEqual([...COLUNAS_ABERTAS]);
  });

  test("V) registro legado sem history (sem episódio nenhum) não contamina a média", () => {
    // Nenhum episódio pra esse propertyInterestId — equivalente a jornada
    // vazia, já provado em derivarEpisodiosDaJornada (E).
    expect(calcularAgingAgregado([]).INTERESTED).toBeNull();
  });

  test("W) episódio com changedAt futuro (duracaoMs null) é excluído da média", () => {
    const episodios = [
      episodioFake({ stage: "PROPOSAL", exitedAtISO: null, duracaoMs: null }),
      episodioFake({ stage: "PROPOSAL", exitedAtISO: null, duracaoMs: 2000 }),
    ];
    expect(calcularAgingAgregado(episodios).PROPOSAL).toBe(2000);
  });
});

describe("calcularGargalo", () => {
  test("X) etapa com maior aging médio vence", () => {
    const gargalo = calcularGargalo({ INTERESTED: 1000, VISIT_SCHEDULED: 5000, VISITED: 2000, PROPOSAL: null });
    expect(gargalo).toEqual({ stage: "VISIT_SCHEDULED", agingMedioMs: 5000 });
  });

  test("Y) empate -> a etapa que aparece primeiro em COLUNAS_ABERTAS vence, determinístico", () => {
    const gargalo = calcularGargalo({ INTERESTED: 5000, VISIT_SCHEDULED: 5000, VISITED: null, PROPOSAL: null });
    expect(gargalo?.stage).toBe("INTERESTED");
  });

  test("Z) sem nenhum dado -> null", () => {
    expect(calcularGargalo({ INTERESTED: null, VISIT_SCHEDULED: null, VISITED: null, PROPOSAL: null })).toBeNull();
  });
});

describe("formatarDuracao", () => {
  test("null -> null", () => {
    expect(formatarDuracao(null)).toBeNull();
  });

  test("< 1h", () => {
    expect(formatarDuracao(30 * 60 * 1000)).toBe("menos de 1h");
  });

  test("horas", () => {
    expect(formatarDuracao(5 * 60 * 60 * 1000)).toBe("5h");
  });

  test("dias, plural", () => {
    expect(formatarDuracao(3 * 24 * 60 * 60 * 1000)).toBe("3 dias");
  });

  test("1 dia, singular", () => {
    expect(formatarDuracao(24 * 60 * 60 * 1000)).toBe("1 dia");
  });
});

describe("paraEntradasPorEtapa", () => {
  test("AA) genesis (newStage INTERESTED) conta normalmente", () => {
    const resultado = paraEntradasPorEtapa([{ newStage: "INTERESTED", _count: { _all: 7 } }]);
    expect(resultado.INTERESTED).toBe(7);
  });

  test("AB) contagem alta (reentradas já somadas pelo groupBy do banco) é refletida sem alteração", () => {
    const resultado = paraEntradasPorEtapa([{ newStage: "VISIT_SCHEDULED", _count: { _all: 42 } }]);
    expect(resultado.VISIT_SCHEDULED).toBe(42);
  });

  test("stage ausente no groupBy bruto -> 0, nunca undefined", () => {
    const resultado = paraEntradasPorEtapa([]);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(resultado[coluna]).toBe(0);
    }
  });

  test("newStage terminal (WON/REJECTED) no bruto é ignorado — só as 4 etapas abertas", () => {
    const resultado = paraEntradasPorEtapa([{ newStage: "WON", _count: { _all: 3 } }]);
    for (const coluna of COLUNAS_ABERTAS) {
      expect(resultado[coluna]).toBe(0);
    }
  });
});

describe("paraTransicoesObservadas", () => {
  test("AF) mapeia previousStage/newStage/quantidade, ordenado por quantidade desc", () => {
    const resultado = paraTransicoesObservadas([
      { previousStage: "INTERESTED", newStage: "VISIT_SCHEDULED", _count: { _all: 5 } },
      { previousStage: "VISITED", newStage: "PROPOSAL", _count: { _all: 20 } },
    ]);
    expect(resultado[0]).toEqual({ de: "VISITED", para: "PROPOSAL", quantidade: 20 });
    expect(resultado[1]).toEqual({ de: "INTERESTED", para: "VISIT_SCHEDULED", quantidade: 5 });
  });

  test("AG) empate de quantidade -> desempate determinístico pela chave textual do par", () => {
    const linhas = [
      { previousStage: "VISITED" as const, newStage: "PROPOSAL" as const, _count: { _all: 10 } },
      { previousStage: "INTERESTED" as const, newStage: "VISIT_SCHEDULED" as const, _count: { _all: 10 } },
    ];
    const r1 = paraTransicoesObservadas(linhas);
    const r2 = paraTransicoesObservadas([...linhas].reverse());
    expect(r1).toEqual(r2);
  });

  test("AH) genesis (previousStage null) é representado com `de: null`, nunca uma string mágica", () => {
    const resultado = paraTransicoesObservadas([{ previousStage: null, newStage: "INTERESTED", _count: { _all: 12 } }]);
    expect(resultado[0].de).toBeNull();
  });

  test("AI) transição pra terminal (WON/REJECTED) aparece normalmente — não filtrada aqui", () => {
    const resultado = paraTransicoesObservadas([{ previousStage: "PROPOSAL", newStage: "WON", _count: { _all: 4 } }]);
    expect(resultado[0]).toEqual({ de: "PROPOSAL", para: "WON", quantidade: 4 });
  });

  test("lista vazia -> lista vazia", () => {
    expect(paraTransicoesObservadas([])).toEqual([]);
  });
});

function registroFechamentoFake(overrides: {
  stage?: "WON" | "REJECTED";
  closedAtISO?: string;
  genesisChangedAtISO?: string | null;
}) {
  return {
    stage: overrides.stage ?? "WON",
    closedAtISO: overrides.closedAtISO ?? "2026-01-10T00:00:00.000Z",
    // "genesisChangedAtISO" in overrides (não `??`): precisa distinguir
    // "não fornecido" (usa default) de "explicitamente null" (testa a
    // exclusão por histórico incompleto) — `??` trataria os dois casos
    // como iguais.
    genesisChangedAtISO:
      "genesisChangedAtISO" in overrides ? (overrides.genesisChangedAtISO ?? null) : "2026-01-01T00:00:00.000Z",
  };
}

describe("calcularTempoMedioAteFechamento", () => {
  test("AL) histórico completo, WON -> duração ganho + todos", () => {
    const resultado = calcularTempoMedioAteFechamento(
      [registroFechamentoFake({ stage: "WON", closedAtISO: "2026-01-06T00:00:00.000Z", genesisChangedAtISO: "2026-01-01T00:00:00.000Z" })],
      null
    );
    expect(resultado.ganho).toBe(5 * 24 * 60 * 60 * 1000);
    expect(resultado.perdido).toBeNull();
    expect(resultado.todos).toBe(5 * 24 * 60 * 60 * 1000);
  });

  test("AM) histórico completo, REJECTED -> duração perdido + todos", () => {
    const resultado = calcularTempoMedioAteFechamento(
      [registroFechamentoFake({ stage: "REJECTED", closedAtISO: "2026-01-04T00:00:00.000Z", genesisChangedAtISO: "2026-01-01T00:00:00.000Z" })],
      null
    );
    expect(resultado.perdido).toBe(3 * 24 * 60 * 60 * 1000);
    expect(resultado.ganho).toBeNull();
  });

  test("AN) sem genesis (histórico parcial) -> excluído, resultado null", () => {
    const resultado = calcularTempoMedioAteFechamento(
      [registroFechamentoFake({ genesisChangedAtISO: null })],
      null
    );
    expect(resultado.ganho).toBeNull();
    expect(resultado.todos).toBeNull();
  });

  test("AO) lista vazia -> tudo null", () => {
    const resultado = calcularTempoMedioAteFechamento([], null);
    expect(resultado).toEqual({ ganho: null, perdido: null, todos: null });
  });

  test("AP) closedAt antes da genesis -> excluído defensivamente (nunca duração negativa)", () => {
    const resultado = calcularTempoMedioAteFechamento(
      [registroFechamentoFake({ closedAtISO: "2025-01-01T00:00:00.000Z", genesisChangedAtISO: "2026-01-01T00:00:00.000Z" })],
      null
    );
    expect(resultado.todos).toBeNull();
  });

  test("AQ) período filtra por closedAt — fora do intervalo é excluído", () => {
    const intervalo = { inicio: new Date("2026-01-01T00:00:00.000Z"), fim: new Date("2026-01-10T00:00:00.000Z") };
    const dentro = registroFechamentoFake({ closedAtISO: "2026-01-05T00:00:00.000Z" });
    const fora = registroFechamentoFake({ closedAtISO: "2026-06-01T00:00:00.000Z" });
    const resultado = calcularTempoMedioAteFechamento([dentro, fora], intervalo);
    expect(resultado.todos).toBe(4 * 24 * 60 * 60 * 1000);
  });

  test("média de múltiplos registros ganhos", () => {
    const resultado = calcularTempoMedioAteFechamento(
      [
        registroFechamentoFake({ stage: "WON", closedAtISO: "2026-01-02T00:00:00.000Z" }), // 1 dia
        registroFechamentoFake({ stage: "WON", closedAtISO: "2026-01-04T00:00:00.000Z" }), // 3 dias
      ],
      null
    );
    expect(resultado.ganho).toBe(2 * 24 * 60 * 60 * 1000);
  });
});

// -----------------------------------------------------------------------
// Priorização comercial (Fase P.8) — helpers puros. `agora` sempre
// parâmetro explícito, mesmo racional de todo o resto do arquivo.
// -----------------------------------------------------------------------

const DIA = 24 * 60 * 60 * 1000;

function prioridadeItemFake(overrides: {
  stage?: ItemPipeline["stage"];
  proximaVisita?: ItemPipeline["proximaVisita"];
  agingMs?: number | null;
}) {
  return {
    stage: overrides.stage ?? "INTERESTED",
    proximaVisita: overrides.proximaVisita ?? null,
    agingMs: overrides.agingMs ?? null,
  } satisfies Pick<ItemPipeline, "stage" | "proximaVisita" | "agingMs">;
}

describe("classificarPrioridadePipeline", () => {
  const agora = new Date("2026-06-15T12:00:00.000Z");

  test("A) atividade vencida (visita SCHEDULED cujo dia já passou) -> ALTA com motivo ATIVIDADE_VENCIDA", () => {
    const item = prioridadeItemFake({
      stage: "VISIT_SCHEDULED",
      proximaVisita: { id: "v1", scheduledAtISO: "2026-06-10T10:00:00.000Z" },
    });
    const resultado = classificarPrioridadePipeline(item, null, agora);
    expect(resultado.nivel).toBe("ALTA");
    expect(resultado.motivos).toEqual([{ tipo: "ATIVIDADE_VENCIDA", scheduledAtISO: "2026-06-10T10:00:00.000Z" }]);
  });

  test("B) próxima ação futura (não vencida) -> NORMAL, sem motivos", () => {
    const item = prioridadeItemFake({
      stage: "VISIT_SCHEDULED",
      proximaVisita: { id: "v1", scheduledAtISO: "2026-06-20T10:00:00.000Z" },
    });
    const resultado = classificarPrioridadePipeline(item, null, agora);
    expect(resultado).toEqual({ nivel: "NORMAL", motivos: [] });
  });

  test("C/E) INTERESTED sem próxima ação -> NORMAL (estado esperado nesta etapa, nunca penalizado)", () => {
    const resultado = classificarPrioridadePipeline(prioridadeItemFake({ stage: "INTERESTED" }), null, agora);
    expect(resultado).toEqual({ nivel: "NORMAL", motivos: [] });
  });

  test("VISIT_SCHEDULED sem próxima ação -> NORMAL (não é a regra de PROPOSAL/VISITED)", () => {
    const resultado = classificarPrioridadePipeline(prioridadeItemFake({ stage: "VISIT_SCHEDULED" }), null, agora);
    expect(resultado).toEqual({ nivel: "NORMAL", motivos: [] });
  });

  test("D) PROPOSAL sem próxima ação -> ALTA com motivo PROPOSTA_SEM_PROXIMA_ACAO (etapa mais avançada do funil aberto)", () => {
    const resultado = classificarPrioridadePipeline(prioridadeItemFake({ stage: "PROPOSAL" }), null, agora);
    expect(resultado.nivel).toBe("ALTA");
    expect(resultado.motivos).toEqual([{ tipo: "PROPOSTA_SEM_PROXIMA_ACAO" }]);
  });

  test("VISITED sem próxima ação -> MEDIA com motivo VISITADO_SEM_PROXIMA_ACAO", () => {
    const resultado = classificarPrioridadePipeline(prioridadeItemFake({ stage: "VISITED" }), null, agora);
    expect(resultado.nivel).toBe("MEDIA");
    expect(resultado.motivos).toEqual([{ tipo: "VISITADO_SEM_PROXIMA_ACAO" }]);
  });

  test("F) aging acima da média histórica da etapa -> MEDIA com motivo AGING_ACIMA_DA_MEDIA", () => {
    const item = prioridadeItemFake({ stage: "INTERESTED", agingMs: 10 * DIA });
    const resultado = classificarPrioridadePipeline(item, 5 * DIA, agora);
    expect(resultado.nivel).toBe("MEDIA");
    expect(resultado.motivos).toEqual([{ tipo: "AGING_ACIMA_DA_MEDIA", agingMs: 10 * DIA, mediaMs: 5 * DIA }]);
  });

  test("aging abaixo ou igual à média -> sem motivo AGING_ACIMA_DA_MEDIA", () => {
    const abaixo = classificarPrioridadePipeline(prioridadeItemFake({ agingMs: 3 * DIA }), 5 * DIA, agora);
    const igual = classificarPrioridadePipeline(prioridadeItemFake({ agingMs: 5 * DIA }), 5 * DIA, agora);
    expect(abaixo).toEqual({ nivel: "NORMAL", motivos: [] });
    expect(igual).toEqual({ nivel: "NORMAL", motivos: [] });
  });

  test("G) agingMs null (legado sem history) -> nunca gera AGING_ACIMA_DA_MEDIA, mesmo com média disponível", () => {
    const resultado = classificarPrioridadePipeline(prioridadeItemFake({ agingMs: null }), 5 * DIA, agora);
    expect(resultado).toEqual({ nivel: "NORMAL", motivos: [] });
  });

  test("tempoMedioHistoricoMs null (sem base de comparação pra esta etapa) -> nunca gera AGING_ACIMA_DA_MEDIA", () => {
    const resultado = classificarPrioridadePipeline(prioridadeItemFake({ agingMs: 100 * DIA }), null, agora);
    expect(resultado).toEqual({ nivel: "NORMAL", motivos: [] });
  });

  test("H) legado sem history (agingMs null) mas com atividade vencida -> ainda ALTA (sinais independentes)", () => {
    const item = prioridadeItemFake({
      stage: "VISIT_SCHEDULED",
      proximaVisita: { id: "v1", scheduledAtISO: "2026-06-10T10:00:00.000Z" },
      agingMs: null,
    });
    const resultado = classificarPrioridadePipeline(item, 5 * DIA, agora);
    expect(resultado.nivel).toBe("ALTA");
  });

  test("J/K) WON/REJECTED nunca disparam as regras de PROPOSAL/VISITED (defensivo — caller nunca deve passar terminal)", () => {
    expect(classificarPrioridadePipeline(prioridadeItemFake({ stage: "WON" }), null, agora)).toEqual({
      nivel: "NORMAL",
      motivos: [],
    });
    expect(classificarPrioridadePipeline(prioridadeItemFake({ stage: "REJECTED" }), null, agora)).toEqual({
      nivel: "NORMAL",
      motivos: [],
    });
  });

  test("L/N) múltiplos motivos simultâneos (atividade vencida + aging acima da média) -> ALTA, ordem canônica sempre igual", () => {
    const item = prioridadeItemFake({
      stage: "VISIT_SCHEDULED",
      proximaVisita: { id: "v1", scheduledAtISO: "2026-06-10T10:00:00.000Z" },
      agingMs: 10 * DIA,
    });
    const resultado = classificarPrioridadePipeline(item, 5 * DIA, agora);
    expect(resultado.nivel).toBe("ALTA");
    expect(resultado.motivos.map((m) => m.tipo)).toEqual(["ATIVIDADE_VENCIDA", "AGING_ACIMA_DA_MEDIA"]);
  });

  test("M) determinístico — mesma entrada sempre produz o mesmo resultado", () => {
    const item = prioridadeItemFake({ stage: "PROPOSAL", agingMs: 10 * DIA });
    const resultados = new Set(
      Array.from({ length: 10 }, () => JSON.stringify(classificarPrioridadePipeline(item, 5 * DIA, agora)))
    );
    expect(resultados.size).toBe(1);
  });

  test("O) ausência total de sinais -> NORMAL, motivos vazio", () => {
    const resultado = classificarPrioridadePipeline(prioridadeItemFake({}), null, agora);
    expect(resultado).toEqual({ nivel: "NORMAL", motivos: [] });
  });

  test("S) boundary — visita SCHEDULED ainda hoje (mesmo dia calendário) não é atividade vencida", () => {
    const item = prioridadeItemFake({
      stage: "VISIT_SCHEDULED",
      proximaVisita: { id: "v1", scheduledAtISO: "2026-06-15T23:59:00.000Z" },
    });
    const resultado = classificarPrioridadePipeline(item, null, agora);
    expect(resultado.nivel).toBe("NORMAL");
  });

  test("boundary — visita SCHEDULED no dia calendário anterior já é atividade vencida", () => {
    const item = prioridadeItemFake({
      stage: "VISIT_SCHEDULED",
      proximaVisita: { id: "v1", scheduledAtISO: "2026-06-14T23:59:00.000Z" },
    });
    const resultado = classificarPrioridadePipeline(item, null, agora);
    expect(resultado.nivel).toBe("ALTA");
  });
});

describe("compararPrioridadePipeline", () => {
  test("T) ALTA < MEDIA < NORMAL — ordem de severidade determinística", () => {
    const alta: MotivoPrioridadePipeline = { tipo: "ATIVIDADE_VENCIDA", scheduledAtISO: "2026-01-01T00:00:00.000Z" };
    const media: MotivoPrioridadePipeline = { tipo: "VISITADO_SEM_PROXIMA_ACAO" };
    expect(compararPrioridadePipeline({ nivel: "ALTA", motivos: [alta] }, { nivel: "MEDIA", motivos: [media] })).toBeLessThan(0);
    expect(compararPrioridadePipeline({ nivel: "MEDIA", motivos: [media] }, { nivel: "NORMAL", motivos: [] })).toBeLessThan(0);
    expect(compararPrioridadePipeline({ nivel: "NORMAL", motivos: [] }, { nivel: "NORMAL", motivos: [] })).toBe(0);
  });
});

describe("formatarMotivoPrioridade", () => {
  test("P) texto fixo e semanticamente verdadeiro pra cada motivo", () => {
    expect(formatarMotivoPrioridade({ tipo: "ATIVIDADE_VENCIDA", scheduledAtISO: "2026-01-01T00:00:00.000Z" })).toBe(
      "Atividade vencida"
    );
    expect(formatarMotivoPrioridade({ tipo: "PROPOSTA_SEM_PROXIMA_ACAO" })).toBe(
      "Proposta sem próxima ação agendada"
    );
    expect(formatarMotivoPrioridade({ tipo: "VISITADO_SEM_PROXIMA_ACAO" })).toBe("Sem próxima ação agendada");
    expect(formatarMotivoPrioridade({ tipo: "AGING_ACIMA_DA_MEDIA", agingMs: DIA, mediaMs: DIA })).toBe(
      "Na etapa há mais tempo que a média histórica"
    );
  });

  test("Q) nenhum texto usa linguagem probabilística/alarmista proibida", () => {
    const proibidas = /chance|probabilidade|risco|esfriando|ia recomenda|score/i;
    const motivos: MotivoPrioridadePipeline[] = [
      { tipo: "ATIVIDADE_VENCIDA", scheduledAtISO: "2026-01-01T00:00:00.000Z" },
      { tipo: "PROPOSTA_SEM_PROXIMA_ACAO" },
      { tipo: "VISITADO_SEM_PROXIMA_ACAO" },
      { tipo: "AGING_ACIMA_DA_MEDIA", agingMs: DIA, mediaMs: DIA },
    ];
    for (const motivo of motivos) {
      expect(formatarMotivoPrioridade(motivo)).not.toMatch(proibidas);
      expect(formatarMotivoPrioridade(motivo)).not.toMatch(/atrasad|vencid.*sla|sla/i);
    }
    // ATIVIDADE_VENCIDA é a única exceção legítima a "vencid*" (fato real de agenda, não aging/SLA).
    expect(formatarMotivoPrioridade({ tipo: "ATIVIDADE_VENCIDA", scheduledAtISO: "2026-01-01T00:00:00.000Z" })).toMatch(
      /vencid/i
    );
  });
});

describe("interpretarFiltroPrioridade", () => {
  test("defaults seguros sem nenhum param ou valor inválido", () => {
    expect(interpretarFiltroPrioridade({})).toBe("TODAS");
    expect(interpretarFiltroPrioridade({ prioridade: "qualquer-coisa" })).toBe("TODAS");
  });

  test("aceita alta/media/normal (case-insensitive)", () => {
    expect(interpretarFiltroPrioridade({ prioridade: "Alta" })).toBe("ALTA");
    expect(interpretarFiltroPrioridade({ prioridade: "media" })).toBe("MEDIA");
    expect(interpretarFiltroPrioridade({ prioridade: "NORMAL" })).toBe("NORMAL");
  });
});
