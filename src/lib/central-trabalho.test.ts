import { describe, test, expect } from "vitest";
import { paraCompromisso, LIMITE_CENTRAL } from "@/lib/central-trabalho";
import { classificarPeriodoAgenda, estaAtrasada } from "@/lib/scheduled-activity-date";

const ORG = "org-a";

// A Central reusa a classificação temporal da Agenda em vez de duplicá-la
// — estes casos existem para travar essa reutilização e as BORDAS de dia
// em UTC, que são o ponto sensível de "hoje". Relógio sempre fixo: nada
// aqui depende do timezone da máquina do CI.
const meiaNoite = new Date("2026-09-07T00:00:00.000Z");
const quaseMeiaNoite = new Date("2026-09-07T23:59:59.999Z");
const meioDia = new Date("2026-09-07T12:00:00.000Z");

const atividade = (iso: string, status: "SCHEDULED" | "COMPLETED" | "CANCELLED" = "SCHEDULED") => ({
  status,
  scheduledAt: new Date(iso),
});

describe("classificação temporal (bordas de dia em UTC)", () => {
  test("00:00:00.000 do dia é HOJE, não atrasada", () => {
    expect(classificarPeriodoAgenda(atividade("2026-09-07T00:00:00.000Z"), meioDia)).toBe("HOJE");
    expect(estaAtrasada(atividade("2026-09-07T00:00:00.000Z"), meioDia)).toBe(false);
  });

  test("23:59:59.999 do dia ainda é HOJE", () => {
    expect(classificarPeriodoAgenda(atividade("2026-09-07T23:59:59.999Z"), meioDia)).toBe("HOJE");
  });

  test("1ms antes da meia-noite do dia é ATRASADA", () => {
    expect(classificarPeriodoAgenda(atividade("2026-09-06T23:59:59.999Z"), meioDia)).toBe(
      "ANTERIORES"
    );
    expect(estaAtrasada(atividade("2026-09-06T23:59:59.999Z"), meioDia)).toBe(true);
  });

  test("1ms depois do fim do dia é PRÓXIMA", () => {
    expect(classificarPeriodoAgenda(atividade("2026-09-08T00:00:00.000Z"), meioDia)).toBe(
      "PROXIMAS"
    );
  });

  test("visita de hoje cujo horário já passou continua em HOJE", () => {
    // Decisão de produto herdada da Agenda: só o DIA calendário conta.
    // Se as duas telas divergissem, o mesmo compromisso apareceria em
    // categorias diferentes.
    const agora15h = new Date("2026-09-07T15:00:00.000Z");
    expect(classificarPeriodoAgenda(atividade("2026-09-07T09:00:00.000Z"), agora15h)).toBe("HOJE");
    expect(estaAtrasada(atividade("2026-09-07T09:00:00.000Z"), agora15h)).toBe(false);
  });

  test("a classificação independe da hora de `agora` dentro do dia", () => {
    for (const agora of [meiaNoite, meioDia, quaseMeiaNoite]) {
      expect(classificarPeriodoAgenda(atividade("2026-09-07T10:00:00.000Z"), agora)).toBe("HOJE");
      expect(classificarPeriodoAgenda(atividade("2026-09-06T10:00:00.000Z"), agora)).toBe(
        "ANTERIORES"
      );
      expect(classificarPeriodoAgenda(atividade("2026-09-08T10:00:00.000Z"), agora)).toBe(
        "PROXIMAS"
      );
    }
  });

  test("COMPLETED e CANCELLED nunca são pendência, mesmo hoje", () => {
    expect(classificarPeriodoAgenda(atividade("2026-09-07T10:00:00.000Z", "COMPLETED"), meioDia)).toBe(
      "ANTERIORES"
    );
    expect(classificarPeriodoAgenda(atividade("2026-09-07T10:00:00.000Z", "CANCELLED"), meioDia)).toBe(
      "ANTERIORES"
    );
    expect(estaAtrasada(atividade("2026-09-06T10:00:00.000Z", "COMPLETED"), meioDia)).toBe(false);
    expect(estaAtrasada(atividade("2026-09-06T10:00:00.000Z", "CANCELLED"), meioDia)).toBe(false);
  });

  test("as três categorias são mutuamente exclusivas", () => {
    const casos = ["2026-09-05T10:00:00.000Z", "2026-09-07T10:00:00.000Z", "2026-09-09T10:00:00.000Z"];
    const vistos = casos.map((iso) => classificarPeriodoAgenda(atividade(iso), meioDia));
    expect(new Set(vistos).size).toBe(3);
  });
});

describe("paraCompromisso", () => {
  const linha = (over: Partial<{ pessoaOrg: string; imovelOrg: string; semImovel: boolean }> = {}) => ({
    id: "a1",
    scheduledAt: new Date("2026-09-07T14:30:00.000Z"),
    notes: "Levar a documentação",
    person: { id: "p1", name: "Ana Cliente", organizationId: over.pessoaOrg ?? ORG },
    property: over.semImovel
      ? null
      : { id: "im1", title: "Apartamento Centro", organizationId: over.imovelOrg ?? ORG },
  });

  test("mapeia pessoa, imóvel e data em ISO", () => {
    expect(paraCompromisso(linha(), ORG)).toEqual({
      id: "a1",
      scheduledAtISO: "2026-09-07T14:30:00.000Z",
      notes: "Levar a documentação",
      pessoa: { id: "p1", name: "Ana Cliente" },
      imovel: { id: "im1", title: "Apartamento Centro" },
    });
  });

  test("atividade sem imóvel continua válida", () => {
    expect(paraCompromisso(linha({ semImovel: true }), ORG).imovel).toBeNull();
  });

  test("pessoa de OUTRO tenant é redigida — nome jamais chega à tela", () => {
    expect(paraCompromisso(linha({ pessoaOrg: "org-b" }), ORG).pessoa).toBeNull();
  });

  test("imóvel de OUTRO tenant é redigido", () => {
    expect(paraCompromisso(linha({ imovelOrg: "org-b" }), ORG).imovel).toBeNull();
  });

  test("o resultado é plain e serializável na fronteira Server→Client", () => {
    // Fase 16 preservada: nada de Date nem Decimal cru cruzando.
    const dto = paraCompromisso(linha(), ORG);
    expect(typeof dto.scheduledAtISO).toBe("string");
    expect(() => structuredClone(dto)).not.toThrow();
  });
});

describe("limite de apresentação", () => {
  test("existe um teto explícito e pequeno", () => {
    // A lista é truncada; a CONTAGEM continua exata, vinda de query
    // própria — é o que permite o "Ver todos (N)".
    expect(LIMITE_CENTRAL).toBeGreaterThan(0);
    expect(LIMITE_CENTRAL).toBeLessThanOrEqual(10);
  });
});
