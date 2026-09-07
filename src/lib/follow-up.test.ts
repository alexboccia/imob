import { describe, test, expect } from "vitest";
import {
  TIPO_ATIVIDADE_LABEL,
  LIMITE_ASSUNTO_FOLLOW_UP,
  normalizarAssunto,
  efeitosDaConclusao,
  FOLLOW_UP_EXIGE_NEGOCIACAO,
} from "./follow-up";
import { criarFollowUpSchema, atualizarFollowUpSchema } from "./scheduled-activity-schema";

// Fase 19 — o domínio do follow-up, sem banco e sem DOM.
describe("tipo do compromisso", () => {
  test("os dois tipos têm rótulo em português, sempre TEXTO", () => {
    expect(TIPO_ATIVIDADE_LABEL.VISIT).toBe("Visita");
    expect(TIPO_ATIVIDADE_LABEL.FOLLOW_UP).toBe("Follow-up");
  });

  // "Tarefa" foi recusado de propósito: o domínio é comercial
  // imobiliário, não um gerenciador de tarefas.
  test("nenhum rótulo chama o compromisso de tarefa", () => {
    for (const rotulo of Object.values(TIPO_ATIVIDADE_LABEL)) {
      expect(rotulo.toLowerCase()).not.toContain("tarefa");
      expect(rotulo.toLowerCase()).not.toContain("task");
    }
  });
});

describe("normalização do assunto", () => {
  test("trim sempre", () => {
    expect(normalizarAssunto("  Enviar proposta  ")).toBe("Enviar proposta");
  });

  test("string vazia ou só espaços vira null — nunca um assunto em branco no banco", () => {
    expect(normalizarAssunto("")).toBeNull();
    expect(normalizarAssunto("   ")).toBeNull();
    expect(normalizarAssunto("\t\n ")).toBeNull();
  });

  test("ausência é null, não erro — quem chama decide se ausência é válida", () => {
    expect(normalizarAssunto(null)).toBeNull();
    expect(normalizarAssunto(undefined)).toBeNull();
  });
});

describe("validação do formulário de follow-up", () => {
  const base = { scheduledAt: "2026-09-08T14:30", notes: "" };

  test("assunto é OBRIGATÓRIO: um follow-up sem ele não responde 'o quê?'", () => {
    const r = criarFollowUpSchema.safeParse({ ...base, subject: "" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toContain("Descreva a ação");
  });

  test("assunto só de espaços é recusado, não salvo em branco", () => {
    expect(criarFollowUpSchema.safeParse({ ...base, subject: "     " }).success).toBe(false);
  });

  test("o assunto chega ao banco já com trim", () => {
    const r = criarFollowUpSchema.safeParse({ ...base, subject: "  Cobrar documentos  " });
    expect(r.success).toBe(true);
    expect(r.data!.subject).toBe("Cobrar documentos");
  });

  test(`exatamente ${LIMITE_ASSUNTO_FOLLOW_UP} caracteres é aceito`, () => {
    const r = criarFollowUpSchema.safeParse({
      ...base,
      subject: "a".repeat(LIMITE_ASSUNTO_FOLLOW_UP),
    });
    expect(r.success).toBe(true);
  });

  test(`${LIMITE_ASSUNTO_FOLLOW_UP + 1} caracteres é recusado`, () => {
    const r = criarFollowUpSchema.safeParse({
      ...base,
      subject: "a".repeat(LIMITE_ASSUNTO_FOLLOW_UP + 1),
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toContain(String(LIMITE_ASSUNTO_FOLLOW_UP));
  });

  // O limite é curto porque o assunto é uma linha; a observação continua
  // com 2.000. São campos de natureza diferente.
  test("o limite do assunto é bem menor que o de observações", () => {
    expect(LIMITE_ASSUNTO_FOLLOW_UP).toBe(120);
    const r = criarFollowUpSchema.safeParse({
      subject: "Enviar proposta",
      scheduledAt: "2026-09-08T14:30",
      notes: "n".repeat(2000),
    });
    expect(r.success).toBe(true);
  });

  test("data em formato inválido é recusada pela forma, antes de virar instante", () => {
    for (const valor of ["", "08/09/2026 14:30", "2026-09-08", "2026-09-08T14:30:00"]) {
      expect(
        criarFollowUpSchema.safeParse({ subject: "Ligar", scheduledAt: valor, notes: "" }).success
      ).toBe(false);
    }
  });

  test("edição valida exatamente os mesmos três campos", () => {
    const r = atualizarFollowUpSchema.safeParse({
      subject: "Enviar proposta revisada",
      scheduledAt: "2026-09-08T14:30",
      notes: "Cliente pediu entrada menor.",
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      subject: "Enviar proposta revisada",
      scheduledAt: "2026-09-08T14:30",
      notes: "Cliente pediu entrada menor.",
    });
  });
});

// =======================================================================
// O ponto mais importante do arquivo
// =======================================================================
// PLANEJADO ≠ REALIZADO. Concluir um follow-up prova que alguém o marcou
// como concluído — nada além disso.
describe("efeitos da conclusão, por tipo", () => {
  test("VISIT preserva o comportamento histórico: Interaction VISIT + avanço de stage", () => {
    expect(efeitosDaConclusao("VISIT")).toEqual({
      criaInteracaoVisita: true,
      avancaStageParaVisitado: true,
    });
  });

  test("FOLLOW_UP não cria Interaction: não sabemos se a ligação aconteceu", () => {
    expect(efeitosDaConclusao("FOLLOW_UP").criaInteracaoVisita).toBe(false);
  });

  test("FOLLOW_UP não move stage: concluir 'cobrar documentos' não é uma visita realizada", () => {
    expect(efeitosDaConclusao("FOLLOW_UP").avancaStageParaVisitado).toBe(false);
  });

  test("os dois tipos divergem em TODOS os efeitos — a separação não é parcial", () => {
    const visita = efeitosDaConclusao("VISIT");
    const followUp = efeitosDaConclusao("FOLLOW_UP");
    for (const chave of Object.keys(visita) as (keyof typeof visita)[]) {
      expect(followUp[chave]).not.toBe(visita[chave]);
    }
  });
});

describe("de quem é o follow-up", () => {
  // Não é uma constante decorativa: ela documenta a razão de a action
  // exigir propertyInterestId. Sem negociação não há responsável
  // objetivo, e Person.assignedMemberId é outra dimensão (Fase 11).
  test("follow-up exige negociação, porque é dela que vem o responsável", () => {
    expect(FOLLOW_UP_EXIGE_NEGOCIACAO).toBe(true);
  });
});
