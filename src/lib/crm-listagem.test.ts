import { describe, test, expect } from "vitest";
import { resumirInteresse, resumirUltimoContato, resumirProximaAcao } from "@/lib/crm-listagem";

// Redesenho da tela de Clientes — funções puras (sem Prisma/I/O), mesmo
// espírito dos testes de obterProximaAcaoComercial (proxima-acao-comercial.test.ts).

describe("resumirInteresse", () => {
  test("sem preferência cadastrada -> null (quem chama decide o texto de fallback)", () => {
    expect(resumirInteresse(null)).toBeNull();
  });

  test("preferência totalmente vazia -> null (nenhuma linha resumível)", () => {
    const r = resumirInteresse({
      propertyTypes: [],
      transactionType: null,
      neighborhoods: [],
      cities: [],
      minPrice: null,
      maxPrice: null,
      minBedrooms: null,
    });
    expect(r).toBeNull();
  });

  test("tipo + transação viram uma linha 'Tipo • Transação'", () => {
    const r = resumirInteresse({
      propertyTypes: ["Apartamento"],
      transactionType: "SALE",
      neighborhoods: [],
      cities: [],
      minPrice: null,
      maxPrice: null,
      minBedrooms: null,
    });
    expect(r).toEqual(["Apartamento • Comprar"]);
  });

  test("neighborhoods tem prioridade sobre cities quando ambos presentes", () => {
    const r = resumirInteresse({
      propertyTypes: [],
      transactionType: null,
      neighborhoods: ["Pinheiros", "Vila Madalena"],
      cities: ["São Paulo"],
      minPrice: null,
      maxPrice: null,
      minBedrooms: null,
    });
    expect(r).toEqual(["Pinheiros, Vila Madalena"]);
  });

  test("sem neighborhoods, cai para cities", () => {
    const r = resumirInteresse({
      propertyTypes: [],
      transactionType: null,
      neighborhoods: [],
      cities: ["São Paulo", "Campinas"],
      minPrice: null,
      maxPrice: null,
      minBedrooms: null,
    });
    expect(r).toEqual(["São Paulo, Campinas"]);
  });

  test("faixa de preço completa formatada com formatarPreco", () => {
    const r = resumirInteresse({
      propertyTypes: [],
      transactionType: null,
      neighborhoods: [],
      cities: [],
      minPrice: 300000,
      maxPrice: 500000,
      minBedrooms: null,
    });
    expect(r).toHaveLength(1);
    expect(r![0]).toContain("-");
  });

  test("só maxPrice -> 'até X'", () => {
    const r = resumirInteresse({
      propertyTypes: [],
      transactionType: null,
      neighborhoods: [],
      cities: [],
      minPrice: null,
      maxPrice: 500000,
      minBedrooms: null,
    });
    expect(r![0]).toMatch(/^até /);
  });

  test("minBedrooms vira 'X+ quartos' (schema não tem maxBedrooms — nunca inventar faixa)", () => {
    const r = resumirInteresse({
      propertyTypes: [],
      transactionType: null,
      neighborhoods: [],
      cities: [],
      minPrice: null,
      maxPrice: null,
      minBedrooms: 3,
    });
    expect(r).toEqual(["3+ quartos"]);
  });

  test("todas as dimensões combinadas produzem uma linha por dimensão presente", () => {
    const r = resumirInteresse({
      propertyTypes: ["Casa"],
      transactionType: "RENT",
      neighborhoods: ["Moema"],
      cities: [],
      minPrice: 2000,
      maxPrice: 4000,
      minBedrooms: 2,
    });
    expect(r).toHaveLength(4);
    expect(r![0]).toBe("Casa • Alugar");
    expect(r![1]).toBe("Moema");
    expect(r![3]).toBe("2+ quartos");
  });
});

describe("resumirUltimoContato", () => {
  test("sem interação -> null", () => {
    expect(resumirUltimoContato(null)).toBeNull();
  });

  test("interação de hoje -> texto 'Hoje, HH:mm'", () => {
    const agora = new Date();
    const r = resumirUltimoContato({ occurredAt: agora, type: "CALL" });
    expect(r!.texto).toMatch(/^Hoje, \d{2}:\d{2}$/);
    expect(r!.tipoLabel).toBe("CALL");
  });

  test("interação de ontem -> texto 'Ontem, HH:mm'", () => {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const r = resumirUltimoContato({ occurredAt: ontem, type: "MESSAGE" });
    expect(r!.texto).toMatch(/^Ontem, \d{2}:\d{2}$/);
  });

  test("interação de 5 dias atrás -> texto 'DD/MM, HH:mm'", () => {
    const dias5 = new Date();
    dias5.setDate(dias5.getDate() - 5);
    const r = resumirUltimoContato({ occurredAt: dias5, type: "VISIT" });
    expect(r!.texto).toMatch(/^\d{2}\/\d{2}, \d{2}:\d{2}$/);
  });

  test("tipoLabel devolve o enum bruto — a UI resolve o rótulo em português", () => {
    const r = resumirUltimoContato({ occurredAt: new Date(), type: "EMAIL" });
    expect(r!.tipoLabel).toBe("EMAIL");
  });
});

describe("resumirProximaAcao", () => {
  test("nenhuma visita agendada e nenhum interesse aberto -> null", () => {
    const r = resumirProximaAcao({ proximaVisita: null, interesseAberto: null });
    expect(r).toBeNull();
  });

  test("visita agendada tem prioridade sobre PropertyInterest aberto", () => {
    const data = new Date("2026-09-01T14:30:00");
    const r = resumirProximaAcao({
      proximaVisita: { scheduledAt: data },
      interesseAberto: { stage: "PROPOSAL", propertyStatus: "AVAILABLE" },
    });
    expect(r!.texto).toBe("Visita agendada");
    expect(r!.dataTexto).toContain("14:30");
    expect(r!.urgente).toBe(false);
  });

  test("sem visita, usa obterProximaAcaoComercial do interesse aberto quando ativa", () => {
    const r = resumirProximaAcao({
      proximaVisita: null,
      interesseAberto: { stage: "INTERESTED", propertyStatus: "AVAILABLE" },
    });
    expect(r).toEqual({ texto: "Agendar visita", dataTexto: null, urgente: false });
  });

  test("interesse aberto mas ação não-ativa (imóvel indisponível) -> null, não mostra ação encerrada como pendente", () => {
    const r = resumirProximaAcao({
      proximaVisita: null,
      interesseAberto: { stage: "INTERESTED", propertyStatus: "SOLD" },
    });
    expect(r).toBeNull();
  });

  test("interesse aberto com stage encerrado (REJECTED/WON) -> null (nunca deveria chegar aqui, mas resumirProximaAcao não confia sozinho)", () => {
    const r = resumirProximaAcao({
      proximaVisita: null,
      interesseAberto: { stage: "WON", propertyStatus: "AVAILABLE" },
    });
    expect(r).toBeNull();
  });
});
