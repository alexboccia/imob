import { describe, test, expect } from "vitest";
import { parseScheduledAt, atualizarObservacaoAgendamentoVisitaSchema } from "./scheduled-activity-schema";
import {
  formatarDataHora,
  paraDatetimeLocal,
  inicioDoDiaUTC,
  fimDoDiaUTC,
  classificarPeriodoAgenda,
  estaAtrasada,
  parseDataUTC,
  periodoDaVisita,
  horarioJaPassouHoje,
  proximaVisita,
} from "./scheduled-activity-date";

// Testes unitários puros (sem banco) — mesma pirâmide de testes do
// projeto (ver README.md / vitest.config.ts). Protegem especificamente o
// bug de timezone encontrado na auditoria pré-commit da H.2: o horário
// digitado pelo corretor precisa reaparecer EXATAMENTE igual, em
// qualquer timezone de quem está olhando a tela.

function comTimezoneDoProcesso<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

describe("parseScheduledAt", () => {
  test("BE) determinístico independente do timezone do processo", () => {
    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      const resultado = comTimezoneDoProcesso(tz, () => parseScheduledAt("2026-08-20T14:30"));
      expect(resultado.toISOString()).toBe("2026-08-20T14:30:00.000Z");
    }
  });
});

// Normalização de `notes` (Fase H.6) — mesma conversão feita por
// atualizarObservacaoAgendamentoVisita (`parsed.data.notes || null`),
// replicada aqui pra testar exatamente o que a Server Action produz sem
// precisar de banco/mocks de auth.
function normalizarNotes(valor: string): string | null {
  const parsed = atualizarObservacaoAgendamentoVisitaSchema.parse({ notes: valor });
  return parsed.notes || null;
}

describe("atualizarObservacaoAgendamentoVisitaSchema / normalização de notes (Fase H.6)", () => {
  test("A) texto normal é preservado", () => {
    expect(normalizarNotes("Cliente pediu para ver a área de lazer.")).toBe(
      "Cliente pediu para ver a área de lazer."
    );
  });

  test("B) espaços nas bordas são removidos (trim)", () => {
    expect(normalizarNotes("   Levar tabela de financiamento.   ")).toBe(
      "Levar tabela de financiamento."
    );
  });

  test("C) string vazia vira null", () => {
    expect(normalizarNotes("")).toBeNull();
  });

  test("D) só espaços vira null (trim antes da checagem de vazio)", () => {
    expect(normalizarNotes("   ")).toBeNull();
  });

  test("E) exatamente 2000 caracteres é aceito", () => {
    const texto = "a".repeat(2000);
    expect(normalizarNotes(texto)).toBe(texto);
  });

  test("F) mais de 2000 caracteres é rejeitado pelo schema", () => {
    const texto = "a".repeat(2001);
    const resultado = atualizarObservacaoAgendamentoVisitaSchema.safeParse({ notes: texto });
    expect(resultado.success).toBe(false);
  });
});

describe("round-trip visual (horário digitado === horário exibido)", () => {
  test("BF) digitado → persistido → formatado → reaberto pra remarcar, tudo com os mesmos componentes", () => {
    const digitado = "2026-08-20T14:30";

    const persistido = parseScheduledAt(digitado);
    expect(persistido.toISOString()).toBe("2026-08-20T14:30:00.000Z");

    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      const formatado = comTimezoneDoProcesso(tz, () => formatarDataHora(persistido.toISOString()));
      expect(formatado).toContain("14:30");
      expect(formatado).toContain("20/08/2026");
      expect(formatado).not.toContain("11:30");
      expect(formatado).not.toContain("23:30");

      const paraEdicao = comTimezoneDoProcesso(tz, () => paraDatetimeLocal(persistido.toISOString()));
      expect(paraEdicao).toBe(digitado);
    }
  });
});

// "agora" fixo em 2026-08-20T12:00:00Z pra todos os testes de período —
// meio-dia UTC evita qualquer ambiguidade de borda entre "hoje" e
// "ontem/amanhã" nos três timezones testados.
const AGORA = new Date("2026-08-20T12:00:00.000Z");

describe("classificarPeriodoAgenda / estaAtrasada (Fase H.3)", () => {
  test("A) SCHEDULED de hoje → HOJE", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-20T18:00:00.000Z") };
    expect(classificarPeriodoAgenda(atividade, AGORA)).toBe("HOJE");
    expect(estaAtrasada(atividade, AGORA)).toBe(false);
  });

  test("B) SCHEDULED futura → PROXIMAS", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-21T09:00:00.000Z") };
    expect(classificarPeriodoAgenda(atividade, AGORA)).toBe("PROXIMAS");
    expect(estaAtrasada(atividade, AGORA)).toBe(false);
  });

  test("C) SCHEDULED passada (dia anterior) → ANTERIORES e atrasada", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-19T09:00:00.000Z") };
    expect(classificarPeriodoAgenda(atividade, AGORA)).toBe("ANTERIORES");
    expect(estaAtrasada(atividade, AGORA)).toBe(true);
  });

  test("D) COMPLETED → ANTERIORES, nunca atrasada", () => {
    const atividade = { status: "COMPLETED" as const, scheduledAt: new Date("2026-08-19T09:00:00.000Z") };
    expect(classificarPeriodoAgenda(atividade, AGORA)).toBe("ANTERIORES");
    expect(estaAtrasada(atividade, AGORA)).toBe(false);
  });

  test("E) CANCELLED → ANTERIORES, nunca atrasada", () => {
    const atividade = { status: "CANCELLED" as const, scheduledAt: new Date("2026-08-25T09:00:00.000Z") };
    expect(classificarPeriodoAgenda(atividade, AGORA)).toBe("ANTERIORES");
    expect(estaAtrasada(atividade, AGORA)).toBe(false);
  });

  test("F) classificação determinística sob UTC / America/Sao_Paulo / Asia/Tokyo", () => {
    const casos: Array<{ status: "SCHEDULED" | "COMPLETED" | "CANCELLED"; scheduledAt: Date; esperado: string }> = [
      { status: "SCHEDULED", scheduledAt: new Date("2026-08-20T18:00:00.000Z"), esperado: "HOJE" },
      { status: "SCHEDULED", scheduledAt: new Date("2026-08-21T09:00:00.000Z"), esperado: "PROXIMAS" },
      { status: "SCHEDULED", scheduledAt: new Date("2026-08-19T09:00:00.000Z"), esperado: "ANTERIORES" },
      { status: "COMPLETED", scheduledAt: new Date("2026-08-19T09:00:00.000Z"), esperado: "ANTERIORES" },
    ];
    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      for (const caso of casos) {
        const resultado = comTimezoneDoProcesso(tz, () => classificarPeriodoAgenda(caso, AGORA));
        expect(resultado).toBe(caso.esperado);
      }
    }
  });

  test("início e fim do dia UTC cobrem exatamente 00:00:00.000 a 23:59:59.999", () => {
    expect(inicioDoDiaUTC(AGORA).toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(fimDoDiaUTC(AGORA).toISOString()).toBe("2026-08-20T23:59:59.999Z");
  });
});

describe("parseDataUTC (Fase H.4 — filtro de período)", () => {
  test("data válida vira meia-noite UTC do dia informado", () => {
    const data = parseDataUTC("2026-08-20");
    expect(data?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  test("29/02 em ano bissexto é aceito", () => {
    const data = parseDataUTC("2028-02-29");
    expect(data?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  test("29/02 em ano NÃO bissexto retorna null (nunca rola silenciosamente pra 03-01)", () => {
    expect(parseDataUTC("2026-02-29")).toBeNull();
  });

  test("30/02 (dia que não existe em nenhum mês) retorna null", () => {
    expect(parseDataUTC("2026-02-30")).toBeNull();
  });

  test("formato fora do padrão YYYY-MM-DD retorna null", () => {
    expect(parseDataUTC("20/08/2026")).toBeNull();
    expect(parseDataUTC("2026-8-20")).toBeNull();
    expect(parseDataUTC("")).toBeNull();
    expect(parseDataUTC("not-a-date")).toBeNull();
    expect(parseDataUTC("2026-08-20T00:00:00Z")).toBeNull();
  });

  test("determinístico independente do timezone do processo", () => {
    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      const resultado = comTimezoneDoProcesso(tz, () => parseDataUTC("2026-08-20"));
      expect(resultado?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    }
  });
});

describe("periodoDaVisita (Fase H.5 — agrupamento da aba Hoje)", () => {
  const casos: Array<{ letra: string; hora: string; esperado: "MANHA" | "TARDE" | "NOITE" }> = [
    { letra: "A", hora: "00:00:00.000Z", esperado: "MANHA" },
    { letra: "B", hora: "11:59:59.999Z", esperado: "MANHA" },
    { letra: "C", hora: "12:00:00.000Z", esperado: "TARDE" },
    { letra: "D", hora: "17:59:59.999Z", esperado: "TARDE" },
    { letra: "E", hora: "18:00:00.000Z", esperado: "NOITE" },
    { letra: "F", hora: "23:59:59.999Z", esperado: "NOITE" },
  ];

  for (const caso of casos) {
    test(`${caso.letra}) 2026-08-20T${caso.hora} -> ${caso.esperado}`, () => {
      expect(periodoDaVisita(new Date(`2026-08-20T${caso.hora}`))).toBe(caso.esperado);
    });
  }

  test("determinístico sob TZ=UTC / America/Sao_Paulo / Asia/Tokyo (usa getUTCHours, nunca fuso local)", () => {
    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      for (const caso of casos) {
        const resultado = comTimezoneDoProcesso(tz, () =>
          periodoDaVisita(new Date(`2026-08-20T${caso.hora}`))
        );
        expect(resultado).toBe(caso.esperado);
      }
    }
  });
});

describe("horarioJaPassouHoje (Fase H.5 — distinto de estaAtrasada/H.3)", () => {
  const AGORA_H5 = new Date("2026-08-20T14:00:00.000Z");

  test("G) visita hoje antes de agora -> horário passou", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-20T10:00:00.000Z") };
    expect(horarioJaPassouHoje(atividade, AGORA_H5)).toBe(true);
  });

  test("H) visita hoje exatamente agora -> NÃO passou (scheduledAt >= agora)", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: AGORA_H5 };
    expect(horarioJaPassouHoje(atividade, AGORA_H5)).toBe(false);
  });

  test("I) visita hoje depois de agora -> NÃO passou", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-20T18:00:00.000Z") };
    expect(horarioJaPassouHoje(atividade, AGORA_H5)).toBe(false);
  });

  test("J) visita de ONTEM não é \"horário passou\" — é caso de estaAtrasada(), nunca deste helper", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-19T10:00:00.000Z") };
    expect(horarioJaPassouHoje(atividade, AGORA_H5)).toBe(false);
    // A mesma atividade É atrasada pelo helper correto (H.3) — confirma
    // que os dois conceitos são distintos e mutuamente exclusivos, nunca
    // um substituindo o outro.
    expect(estaAtrasada(atividade, AGORA_H5)).toBe(true);
  });

  test("visita COMPLETED/CANCELLED hoje nunca é \"horário passou\" (rótulo só faz sentido pra SCHEDULED)", () => {
    const completada = { status: "COMPLETED" as const, scheduledAt: new Date("2026-08-20T10:00:00.000Z") };
    const cancelada = { status: "CANCELLED" as const, scheduledAt: new Date("2026-08-20T10:00:00.000Z") };
    expect(horarioJaPassouHoje(completada, AGORA_H5)).toBe(false);
    expect(horarioJaPassouHoje(cancelada, AGORA_H5)).toBe(false);
  });

  test("determinístico sob UTC / America/Sao_Paulo / Asia/Tokyo", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-20T10:00:00.000Z") };
    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      const resultado = comTimezoneDoProcesso(tz, () => horarioJaPassouHoje(atividade, AGORA_H5));
      expect(resultado).toBe(true);
    }
  });
});

describe("proximaVisita (Fase H.5)", () => {
  const AGORA_PV = new Date("2026-08-20T14:00:00.000Z");
  type Item = { id: string; status: "SCHEDULED" | "COMPLETED" | "CANCELLED"; scheduledAt: Date };

  test("K) lista vazia -> nenhuma próxima", () => {
    expect(proximaVisita<Item>([], AGORA_PV)).toBeNull();
  });

  test("L) todas as visitas de hoje já passaram -> nenhuma próxima", () => {
    const itens: Item[] = [
      { id: "a", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T09:00:00.000Z") },
      { id: "b", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T10:00:00.000Z") },
    ];
    expect(proximaVisita(itens, AGORA_PV)).toBeNull();
  });

  test("M) uma futura -> ela é a próxima", () => {
    const itens: Item[] = [
      { id: "a", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T09:00:00.000Z") },
      { id: "b", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T16:00:00.000Z") },
    ];
    expect(proximaVisita(itens, AGORA_PV)?.id).toBe("b");
  });

  test("N) várias futuras -> a de menor scheduledAt", () => {
    const itens: Item[] = [
      { id: "tarde", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T20:00:00.000Z") },
      { id: "logo", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T15:00:00.000Z") },
      { id: "meio", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T18:00:00.000Z") },
    ];
    expect(proximaVisita(itens, AGORA_PV)?.id).toBe("logo");
  });

  test("O) mistura passado/futuro -> a primeira futura, ignorando as passadas", () => {
    const itens: Item[] = [
      { id: "passada1", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T08:00:00.000Z") },
      { id: "passada2", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T10:00:00.000Z") },
      { id: "futura", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T16:00:00.000Z") },
    ];
    expect(proximaVisita(itens, AGORA_PV)?.id).toBe("futura");
  });

  test("P) scheduledAt exatamente agora -> elegível como próxima", () => {
    const itens: Item[] = [{ id: "agora", status: "SCHEDULED", scheduledAt: AGORA_PV }];
    expect(proximaVisita(itens, AGORA_PV)?.id).toBe("agora");
  });

  test("COMPLETED/CANCELLED futuras nunca são elegíveis (só SCHEDULED)", () => {
    const itens: Item[] = [
      { id: "completada", status: "COMPLETED", scheduledAt: new Date("2026-08-20T16:00:00.000Z") },
      { id: "cancelada", status: "CANCELLED", scheduledAt: new Date("2026-08-20T17:00:00.000Z") },
      { id: "agendada", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T18:00:00.000Z") },
    ];
    expect(proximaVisita(itens, AGORA_PV)?.id).toBe("agendada");
  });
});
