import { describe, test, expect } from "vitest";
import { obterProximaAcaoComercial } from "@/lib/proxima-acao-comercial";

// Fase G do CRM — função pura, sem banco. Cobertura mínima acordada
// (cenários A–K) + determinismo/imutabilidade, mesmo espírito dos testes
// puros de calcularCompatibilidade (property-matching.test.ts, Fase E).
describe("obterProximaAcaoComercial", () => {
  test("A) AVAILABLE + INTERESTED -> Agendar visita, ativa", () => {
    const r = obterProximaAcaoComercial("INTERESTED", "AVAILABLE");
    expect(r).toEqual({ key: "AGENDAR_VISITA", label: "Agendar visita", ativa: true });
  });

  test("B) AVAILABLE + VISIT_SCHEDULED -> Realizar visita, ativa", () => {
    const r = obterProximaAcaoComercial("VISIT_SCHEDULED", "AVAILABLE");
    expect(r).toEqual({ key: "REALIZAR_VISITA", label: "Realizar visita", ativa: true });
  });

  test("C) AVAILABLE + VISITED -> Registrar retorno, ativa", () => {
    const r = obterProximaAcaoComercial("VISITED", "AVAILABLE");
    expect(r).toEqual({ key: "REGISTRAR_RETORNO", label: "Registrar retorno", ativa: true });
  });

  test("D) AVAILABLE + PROPOSAL -> Acompanhar proposta, ativa", () => {
    const r = obterProximaAcaoComercial("PROPOSAL", "AVAILABLE");
    expect(r).toEqual({ key: "ACOMPANHAR_PROPOSTA", label: "Acompanhar proposta", ativa: true });
  });

  test("E) AVAILABLE + REJECTED -> Encerrado, não ativa", () => {
    const r = obterProximaAcaoComercial("REJECTED", "AVAILABLE");
    expect(r).toEqual({ key: "ENCERRADO", label: "Encerrado", ativa: false });
  });

  test("F) SOLD + INTERESTED -> Imóvel indisponível, não ativa", () => {
    const r = obterProximaAcaoComercial("INTERESTED", "SOLD");
    expect(r).toEqual({ key: "INDISPONIVEL", label: "Imóvel indisponível", ativa: false });
  });

  test("G) RENTED + VISITED -> Imóvel indisponível, não ativa", () => {
    const r = obterProximaAcaoComercial("VISITED", "RENTED");
    expect(r).toEqual({ key: "INDISPONIVEL", label: "Imóvel indisponível", ativa: false });
  });

  test("H) INACTIVE + PROPOSAL -> Imóvel indisponível, não ativa", () => {
    const r = obterProximaAcaoComercial("PROPOSAL", "INACTIVE");
    expect(r).toEqual({ key: "INDISPONIVEL", label: "Imóvel indisponível", ativa: false });
  });

  test("I) RESERVED + PROPOSAL -> Imóvel indisponível, não ativa (sem inferir se a reserva é deste cliente)", () => {
    const r = obterProximaAcaoComercial("PROPOSAL", "RESERVED");
    expect(r).toEqual({ key: "INDISPONIVEL", label: "Imóvel indisponível", ativa: false });
  });

  test("J) DRAFT + INTERESTED -> Imóvel indisponível, não ativa", () => {
    const r = obterProximaAcaoComercial("INTERESTED", "DRAFT");
    expect(r).toEqual({ key: "INDISPONIVEL", label: "Imóvel indisponível", ativa: false });
  });

  test("K) SOLD + REJECTED -> Encerrado (REJECTED tem precedência sobre o status do imóvel)", () => {
    const r = obterProximaAcaoComercial("REJECTED", "SOLD");
    expect(r).toEqual({ key: "ENCERRADO", label: "Encerrado", ativa: false });
  });

  test("determinístico — mesma entrada sempre produz a mesma saída", () => {
    const resultados = new Set(
      Array.from({ length: 50 }, () => JSON.stringify(obterProximaAcaoComercial("VISIT_SCHEDULED", "AVAILABLE")))
    );
    expect(resultados.size).toBe(1);
  });

  test("todos os stages não-REJECTED cobertos para AVAILABLE, nenhum undefined", () => {
    const stages = ["INTERESTED", "VISIT_SCHEDULED", "VISITED", "PROPOSAL"] as const;
    for (const stage of stages) {
      const r = obterProximaAcaoComercial(stage, "AVAILABLE");
      expect(r).toBeDefined();
      expect(r.ativa).toBe(true);
    }
  });

  test("todos os PropertyStatus não-AVAILABLE resultam em INDISPONIVEL para stage não-REJECTED", () => {
    const statusNaoDisponiveis = ["DRAFT", "RESERVED", "SOLD", "RENTED", "INACTIVE"] as const;
    for (const status of statusNaoDisponiveis) {
      const r = obterProximaAcaoComercial("INTERESTED", status);
      expect(r.key).toBe("INDISPONIVEL");
      expect(r.ativa).toBe(false);
    }
  });
});
