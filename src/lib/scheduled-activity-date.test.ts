import { describe, test, expect } from "vitest";
import { parseScheduledAt, atualizarObservacaoAgendamentoVisitaSchema } from "./scheduled-activity-schema";
import {
  formatarDataHora,
  formatarHora,
  paraDatetimeLocal,
  inicioDoDiaUTC,
  fimDoDiaUTC,
  classificarPeriodoAgenda,
  estaAtrasada,
  parseDataUTC,
  periodoDaVisita,
  horarioJaPassouHoje,
  proximaVisita,
  acaoOperacionalDaVisita,
  painelAgoraDoDia,
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

describe("acaoOperacionalDaVisita (Fase H.7)", () => {
  const AGORA_H7 = new Date("2026-08-20T14:00:00.000Z");

  test("A) SCHEDULED hoje antes de agora -> REGISTRAR_RESULTADO", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-20T10:00:00.000Z") };
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBe("REGISTRAR_RESULTADO");
  });

  test("B) SCHEDULED hoje exatamente agora -> VISITA_AGORA", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: AGORA_H7 };
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBe("VISITA_AGORA");
  });

  test("C) SCHEDULED hoje depois de agora -> PREPARAR_VISITA", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-20T18:00:00.000Z") };
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBe("PREPARAR_VISITA");
  });

  test("D) SCHEDULED de dia anterior -> RESOLVER_PENDENCIA", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-19T09:00:00.000Z") };
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBe("RESOLVER_PENDENCIA");
  });

  test("E) COMPLETED hoje -> null", () => {
    const atividade = { status: "COMPLETED" as const, scheduledAt: new Date("2026-08-20T10:00:00.000Z") };
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBeNull();
  });

  test("F) CANCELLED hoje -> null", () => {
    const atividade = { status: "CANCELLED" as const, scheduledAt: new Date("2026-08-20T10:00:00.000Z") };
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBeNull();
  });

  test("G) COMPLETED de dia anterior -> null (encerrada não tem ação, mesmo no passado)", () => {
    const atividade = { status: "COMPLETED" as const, scheduledAt: new Date("2026-08-19T09:00:00.000Z") };
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBeNull();
  });

  test("H) CANCELLED de dia anterior -> null", () => {
    const atividade = { status: "CANCELLED" as const, scheduledAt: new Date("2026-08-19T09:00:00.000Z") };
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBeNull();
  });

  test("I) visita de amanhã (SCHEDULED, período PROXIMAS) -> null (comportamento V1 documentado: ainda não é hora de agir)", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-21T09:00:00.000Z") };
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBeNull();
  });

  test("J) cruzamento com horarioJaPassouHoje/estaAtrasada: horário passado hoje", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-20T10:00:00.000Z") };
    expect(horarioJaPassouHoje(atividade, AGORA_H7)).toBe(true);
    expect(estaAtrasada(atividade, AGORA_H7)).toBe(false);
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBe("REGISTRAR_RESULTADO");
  });

  test("K) cruzamento com horarioJaPassouHoje/estaAtrasada: visita atrasada (dia anterior)", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-19T09:00:00.000Z") };
    expect(horarioJaPassouHoje(atividade, AGORA_H7)).toBe(false);
    expect(estaAtrasada(atividade, AGORA_H7)).toBe(true);
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBe("RESOLVER_PENDENCIA");
  });

  test("L) cruzamento com horarioJaPassouHoje: exatamente agora", () => {
    const atividade = { status: "SCHEDULED" as const, scheduledAt: AGORA_H7 };
    expect(horarioJaPassouHoje(atividade, AGORA_H7)).toBe(false);
    expect(acaoOperacionalDaVisita(atividade, AGORA_H7)).toBe("VISITA_AGORA");
  });

  test("M/N/O) determinístico sob TZ=UTC / America/Sao_Paulo / Asia/Tokyo", () => {
    const casos: Array<{ status: "SCHEDULED" | "COMPLETED" | "CANCELLED"; scheduledAt: Date; esperado: ReturnType<typeof acaoOperacionalDaVisita> }> = [
      { status: "SCHEDULED", scheduledAt: new Date("2026-08-20T10:00:00.000Z"), esperado: "REGISTRAR_RESULTADO" },
      { status: "SCHEDULED", scheduledAt: AGORA_H7, esperado: "VISITA_AGORA" },
      { status: "SCHEDULED", scheduledAt: new Date("2026-08-20T18:00:00.000Z"), esperado: "PREPARAR_VISITA" },
      { status: "SCHEDULED", scheduledAt: new Date("2026-08-19T09:00:00.000Z"), esperado: "RESOLVER_PENDENCIA" },
      { status: "COMPLETED", scheduledAt: new Date("2026-08-20T10:00:00.000Z"), esperado: null },
    ];
    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      for (const caso of casos) {
        const resultado = comTimezoneDoProcesso(tz, () => acaoOperacionalDaVisita(caso, AGORA_H7));
        expect(resultado).toBe(caso.esperado);
      }
    }
  });
});

describe("formatarHora (Fase H.7)", () => {
  test("extrai só HH:mm em UTC, independente do timezone do processo", () => {
    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      const resultado = comTimezoneDoProcesso(tz, () => formatarHora("2026-08-20T14:30:00.000Z"));
      expect(resultado).toBe("14:30");
    }
  });
});

describe("painelAgoraDoDia (Fase H.7)", () => {
  const AGORA_PA = new Date("2026-08-20T14:00:00.000Z");
  type Item = { id: string; status: "SCHEDULED" | "COMPLETED" | "CANCELLED"; scheduledAt: Date };

  test("P) nenhuma visita hoje -> estado vazio", () => {
    expect(painelAgoraDoDia<Item>([], AGORA_PA)).toEqual({ tipo: "VAZIO" });
  });

  test("Q) apenas visita futura -> mostra próxima", () => {
    const itens: Item[] = [{ id: "a", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T16:00:00.000Z") }];
    const estado = painelAgoraDoDia(itens, AGORA_PA);
    expect(estado.tipo).toBe("PROXIMA_VISITA");
    if (estado.tipo === "PROXIMA_VISITA") expect(estado.visita.id).toBe("a");
  });

  test("R) uma visita com horário passado -> prioridade para 'aguardando resultado'", () => {
    const itens: Item[] = [{ id: "a", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T10:00:00.000Z") }];
    const estado = painelAgoraDoDia(itens, AGORA_PA);
    expect(estado.tipo).toBe("AGUARDANDO_RESULTADO");
    if (estado.tipo === "AGUARDANDO_RESULTADO") {
      expect(estado.quantidade).toBe(1);
      expect(estado.maisAntiga.id).toBe("a");
    }
  });

  test("S) duas visitas com horário passado -> quantidade = 2, identifica a mais antiga", () => {
    const itens: Item[] = [
      { id: "mais-tarde", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T12:00:00.000Z") },
      { id: "mais-cedo", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T09:00:00.000Z") },
    ];
    const estado = painelAgoraDoDia(itens, AGORA_PA);
    expect(estado.tipo).toBe("AGUARDANDO_RESULTADO");
    if (estado.tipo === "AGUARDANDO_RESULTADO") {
      expect(estado.quantidade).toBe(2);
      expect(estado.maisAntiga.id).toBe("mais-cedo");
    }
  });

  test("T) horário passado + próxima futura -> painel prioriza a pendência passada", () => {
    const itens: Item[] = [
      { id: "passada", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T10:00:00.000Z") },
      { id: "futura", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T18:00:00.000Z") },
    ];
    const estado = painelAgoraDoDia(itens, AGORA_PA);
    expect(estado.tipo).toBe("AGUARDANDO_RESULTADO");
  });

  test("U) COMPLETED/CANCELLED não entram nas pendências nem na próxima visita", () => {
    const itens: Item[] = [
      { id: "completada-passada", status: "COMPLETED", scheduledAt: new Date("2026-08-20T10:00:00.000Z") },
      { id: "cancelada-futura", status: "CANCELLED", scheduledAt: new Date("2026-08-20T18:00:00.000Z") },
    ];
    expect(painelAgoraDoDia(itens, AGORA_PA)).toEqual({ tipo: "VAZIO" });
  });

  test("V) painel considera apenas o conjunto recebido (simula lista já filtrada pela H.4) — mesmo dado bruto, resultado muda conforme o conjunto visível", () => {
    const todosOsItens: Item[] = [
      { id: "pendente", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T10:00:00.000Z") },
      { id: "futura", status: "SCHEDULED", scheduledAt: new Date("2026-08-20T18:00:00.000Z") },
    ];
    const estadoSemFiltro = painelAgoraDoDia(todosOsItens, AGORA_PA);
    expect(estadoSemFiltro.tipo).toBe("AGUARDANDO_RESULTADO");

    // Conjunto reduzido (equivalente a um filtro H.4 escondendo a
    // pendência) — o painel nunca consulta nada além do array recebido.
    const conjuntoFiltrado = todosOsItens.filter((item) => item.id === "futura");
    const estadoComFiltro = painelAgoraDoDia(conjuntoFiltrado, AGORA_PA);
    expect(estadoComFiltro.tipo).toBe("PROXIMA_VISITA");
    if (estadoComFiltro.tipo === "PROXIMA_VISITA") expect(estadoComFiltro.visita.id).toBe("futura");
  });
});

describe("janela operacional de VISITA_AGORA (correção pós-auditoria H.7)", () => {
  // Visita de referência às 14:30 — mesmo exemplo usado na correção
  // solicitada, pra facilitar conferência cruzada com o pedido.
  const VISITA_1430 = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-20T14:30:00.000Z") };
  const CINCO_MIN_MS = 5 * 60 * 1000;

  test("A) exatamente -5min (agora = scheduledAt - 5min) -> VISITA_AGORA (limite inclusivo)", () => {
    const agora = new Date(VISITA_1430.scheduledAt.getTime() - CINCO_MIN_MS);
    expect(acaoOperacionalDaVisita(VISITA_1430, agora)).toBe("VISITA_AGORA");
  });

  test("B) -5min - 1ms -> PREPARAR_VISITA (fora da janela, ainda no futuro)", () => {
    const agora = new Date(VISITA_1430.scheduledAt.getTime() - CINCO_MIN_MS - 1);
    expect(acaoOperacionalDaVisita(VISITA_1430, agora)).toBe("PREPARAR_VISITA");
  });

  test("C) exatamente no horário agendado -> VISITA_AGORA", () => {
    expect(acaoOperacionalDaVisita(VISITA_1430, VISITA_1430.scheduledAt)).toBe("VISITA_AGORA");
  });

  test("D) +5min (agora = scheduledAt + 5min) -> VISITA_AGORA (limite inclusivo)", () => {
    const agora = new Date(VISITA_1430.scheduledAt.getTime() + CINCO_MIN_MS);
    expect(acaoOperacionalDaVisita(VISITA_1430, agora)).toBe("VISITA_AGORA");
  });

  test("E) +5min + 1ms -> REGISTRAR_RESULTADO (fora da janela, já passou)", () => {
    const agora = new Date(VISITA_1430.scheduledAt.getTime() + CINCO_MIN_MS + 1);
    expect(acaoOperacionalDaVisita(VISITA_1430, agora)).toBe("REGISTRAR_RESULTADO");
  });

  test("F) +2min (dentro da janela): horarioJaPassouHoje=true (relógio) e ação=VISITA_AGORA (orientação) coexistem de propósito", () => {
    const agora = new Date(VISITA_1430.scheduledAt.getTime() + 2 * 60 * 1000);
    expect(horarioJaPassouHoje(VISITA_1430, agora)).toBe(true);
    expect(acaoOperacionalDaVisita(VISITA_1430, agora)).toBe("VISITA_AGORA");
  });

  test("G) ontem, mesmo horário nominal -> RESOLVER_PENDENCIA, nunca VISITA_AGORA (período decide antes da janela)", () => {
    const ontem = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-19T14:30:00.000Z") };
    const agora = new Date("2026-08-20T14:31:00.000Z");
    expect(acaoOperacionalDaVisita(ontem, agora)).toBe("RESOLVER_PENDENCIA");
  });

  test("H) amanhã, mesmo horário nominal -> null, nunca VISITA_AGORA", () => {
    const amanha = { status: "SCHEDULED" as const, scheduledAt: new Date("2026-08-21T14:30:00.000Z") };
    const agora = new Date("2026-08-20T14:29:00.000Z");
    expect(acaoOperacionalDaVisita(amanha, agora)).toBeNull();
  });

  test("I) COMPLETED dentro da janela -> null", () => {
    const atividade = { status: "COMPLETED" as const, scheduledAt: VISITA_1430.scheduledAt };
    const agora = new Date(VISITA_1430.scheduledAt.getTime() + 60 * 1000);
    expect(acaoOperacionalDaVisita(atividade, agora)).toBeNull();
  });

  test("J) CANCELLED dentro da janela -> null", () => {
    const atividade = { status: "CANCELLED" as const, scheduledAt: VISITA_1430.scheduledAt };
    const agora = new Date(VISITA_1430.scheduledAt.getTime() + 60 * 1000);
    expect(acaoOperacionalDaVisita(atividade, agora)).toBeNull();
  });

  test("K/L/M) determinístico sob TZ=UTC / America/Sao_Paulo / Asia/Tokyo", () => {
    const casos: Array<{ agora: Date; esperado: ReturnType<typeof acaoOperacionalDaVisita> }> = [
      { agora: new Date(VISITA_1430.scheduledAt.getTime() - CINCO_MIN_MS), esperado: "VISITA_AGORA" },
      { agora: new Date(VISITA_1430.scheduledAt.getTime() - CINCO_MIN_MS - 1), esperado: "PREPARAR_VISITA" },
      { agora: new Date(VISITA_1430.scheduledAt.getTime() + CINCO_MIN_MS), esperado: "VISITA_AGORA" },
      { agora: new Date(VISITA_1430.scheduledAt.getTime() + CINCO_MIN_MS + 1), esperado: "REGISTRAR_RESULTADO" },
    ];
    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      for (const caso of casos) {
        const resultado = comTimezoneDoProcesso(tz, () => acaoOperacionalDaVisita(VISITA_1430, caso.agora));
        expect(resultado).toBe(caso.esperado);
      }
    }
  });
});

describe("painelAgoraDoDia × janela operacional (correção pós-auditoria H.7)", () => {
  const VISITA_1430 = new Date("2026-08-20T14:30:00.000Z");
  type Item = { id: string; status: "SCHEDULED" | "COMPLETED" | "CANCELLED"; scheduledAt: Date };

  test("N) visita dentro da janela (+2min) -> painel mostra VISITA_AGORA, não AGUARDANDO_RESULTADO", () => {
    const agora = new Date(VISITA_1430.getTime() + 2 * 60 * 1000);
    const itens: Item[] = [{ id: "a", status: "SCHEDULED", scheduledAt: VISITA_1430 }];
    const estado = painelAgoraDoDia(itens, agora);
    expect(estado.tipo).toBe("VISITA_AGORA");
    if (estado.tipo === "VISITA_AGORA") expect(estado.visita.id).toBe("a");
  });

  test("O) visita mais de 5min passada -> AGUARDANDO_RESULTADO", () => {
    const agora = new Date(VISITA_1430.getTime() + 6 * 60 * 1000);
    const itens: Item[] = [{ id: "a", status: "SCHEDULED", scheduledAt: VISITA_1430 }];
    const estado = painelAgoraDoDia(itens, agora);
    expect(estado.tipo).toBe("AGUARDANDO_RESULTADO");
  });

  test("P) pendência real (>5min) + visita na janela -> pendência real vence", () => {
    const agora = new Date(VISITA_1430.getTime() + 2 * 60 * 1000);
    const itens: Item[] = [
      { id: "na-janela", status: "SCHEDULED", scheduledAt: VISITA_1430 },
      { id: "pendencia-real", status: "SCHEDULED", scheduledAt: new Date(VISITA_1430.getTime() - 20 * 60 * 1000) },
    ];
    const estado = painelAgoraDoDia(itens, agora);
    expect(estado.tipo).toBe("AGUARDANDO_RESULTADO");
    if (estado.tipo === "AGUARDANDO_RESULTADO") expect(estado.maisAntiga.id).toBe("pendencia-real");
  });

  test("Q) visita na janela + futura -> visita agora vence", () => {
    const agora = new Date(VISITA_1430.getTime() + 2 * 60 * 1000);
    const itens: Item[] = [
      { id: "na-janela", status: "SCHEDULED", scheduledAt: VISITA_1430 },
      { id: "futura", status: "SCHEDULED", scheduledAt: new Date(VISITA_1430.getTime() + 60 * 60 * 1000) },
    ];
    const estado = painelAgoraDoDia(itens, agora);
    expect(estado.tipo).toBe("VISITA_AGORA");
    if (estado.tipo === "VISITA_AGORA") expect(estado.visita.id).toBe("na-janela");
  });

  test("R) somente futura -> próxima visita (H.5 proximaVisita, inalterado)", () => {
    const agora = new Date(VISITA_1430.getTime() - 60 * 60 * 1000);
    const itens: Item[] = [{ id: "futura", status: "SCHEDULED", scheduledAt: VISITA_1430 }];
    const estado = painelAgoraDoDia(itens, agora);
    expect(estado.tipo).toBe("PROXIMA_VISITA");
  });

  test("S) nenhuma visita -> vazio", () => {
    expect(painelAgoraDoDia<Item>([], new Date())).toEqual({ tipo: "VAZIO" });
  });

  test("COMPLETED/CANCELLED dentro da janela nunca contam como VISITA_AGORA nem AGUARDANDO_RESULTADO", () => {
    const agora = new Date(VISITA_1430.getTime() + 2 * 60 * 1000);
    const itens: Item[] = [
      { id: "completada", status: "COMPLETED", scheduledAt: VISITA_1430 },
      { id: "cancelada", status: "CANCELLED", scheduledAt: VISITA_1430 },
    ];
    expect(painelAgoraDoDia(itens, agora)).toEqual({ tipo: "VAZIO" });
  });
});
