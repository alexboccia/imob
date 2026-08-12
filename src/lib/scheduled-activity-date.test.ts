import { describe, test, expect } from "vitest";
import { parseScheduledAt } from "./scheduled-activity-schema";
import {
  formatarDataHora,
  paraDatetimeLocal,
  inicioDoDiaUTC,
  fimDoDiaUTC,
  classificarPeriodoAgenda,
  estaAtrasada,
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
