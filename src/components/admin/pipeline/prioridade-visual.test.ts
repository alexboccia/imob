import { describe, test, expect } from "vitest";
import { formatarMotivoPrioridade, PRIORIDADE_BADGE_CLASSE, PRIORIDADE_LABEL_CURTO } from "./prioridade-visual";

const DIA = 24 * 60 * 60 * 1000;

// Cobertura da duplicata client-safe de formatarMotivoPrioridade (ver
// comentário em prioridade-visual.ts sobre por que não é uma reimportação
// de src/lib/pipeline.ts) — mesmo texto esperado do original
// (src/lib/pipeline.test.ts), nunca deixar os dois divergirem.
describe("formatarMotivoPrioridade (prioridade-visual)", () => {
  test("texto fixo e semanticamente verdadeiro pra cada motivo, idêntico ao original de src/lib/pipeline.ts", () => {
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
});

describe("PRIORIDADE_LABEL_CURTO / PRIORIDADE_BADGE_CLASSE", () => {
  test("os 3 níveis têm label e classe de badge definidos", () => {
    for (const nivel of ["ALTA", "MEDIA", "NORMAL"] as const) {
      expect(PRIORIDADE_LABEL_CURTO[nivel]).toBeTruthy();
      expect(PRIORIDADE_BADGE_CLASSE[nivel]).toBeTruthy();
    }
  });
});
