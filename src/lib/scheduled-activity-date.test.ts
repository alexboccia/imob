import { describe, test, expect } from "vitest";
import { parseScheduledAt } from "./scheduled-activity-schema";
import { formatarDataHora, paraDatetimeLocal } from "./scheduled-activity-date";

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
