import { describe, test, expect } from "vitest";
import {
  tipoEventoValido,
  placementValido,
  visitorIdValido,
  calcularVisitorHash,
  JANELA_DEDUP_MINUTOS,
  JANELA_DEDUP_MS,
  TIPOS_EVENTO_ANALYTICS,
  LABEL_TIPO_EVENTO,
} from "@/lib/analytics-eventos";
import { normalizarPlacement } from "@/lib/analytics-tracking";

describe("catálogo de tipos de evento", () => {
  test("aceita só os dois tipos da fase", () => {
    expect(tipoEventoValido("PROPERTY_VIEW")).toBe(true);
    expect(tipoEventoValido("WHATSAPP_CLICK")).toBe(true);
    expect(tipoEventoValido("CONTACT_SUBMIT")).toBe(false);
    expect(tipoEventoValido("PAGEVIEW")).toBe(false);
    expect(tipoEventoValido(null)).toBe(false);
    expect(tipoEventoValido(42)).toBe(false);
  });

  test("chave herdada do prototype não vira tipo válido", () => {
    expect(tipoEventoValido("toString")).toBe(false);
    expect(tipoEventoValido("constructor")).toBe(false);
  });

  test("NÃO existe evento de contato — essa etapa é Interaction, sem dupla contagem", () => {
    expect(Object.keys(TIPOS_EVENTO_ANALYTICS)).toEqual(["PROPERTY_VIEW", "WHATSAPP_CLICK"]);
  });

  test("rótulo do WhatsApp fala em CLIQUE, nunca em lead (o dado é o clique)", () => {
    expect(LABEL_TIPO_EVENTO.WHATSAPP_CLICK).toBe("Cliques no WhatsApp");
    expect(LABEL_TIPO_EVENTO.WHATSAPP_CLICK.toLowerCase()).not.toContain("lead");
  });
});

describe("placement", () => {
  test("aceita só os três CTAs reais da página do imóvel", () => {
    expect(placementValido("SIDEBAR")).toBe(true);
    expect(placementValido("MOBILE_BAR")).toBe(true);
    expect(placementValido("GALLERY")).toBe(true);
    expect(placementValido("QUALQUER_OUTRO")).toBe(false);
    expect(placementValido(undefined)).toBe(false);
  });

  test("só existe em WHATSAPP_CLICK — visualização nunca grava placement", () => {
    expect(normalizarPlacement("WHATSAPP_CLICK", "SIDEBAR")).toBe("SIDEBAR");
    expect(normalizarPlacement("PROPERTY_VIEW", "SIDEBAR")).toBeNull();
  });

  test("placement inválido não invalida o evento, só é descartado", () => {
    // Descartar uma visualização/clique REAL por causa de um campo
    // decorativo seria perder dado de verdade por nada.
    expect(normalizarPlacement("WHATSAPP_CLICK", "INVENTADO")).toBeNull();
    expect(normalizarPlacement("WHATSAPP_CLICK", undefined)).toBeNull();
  });
});

describe("visitorId", () => {
  test("aceita o UUID v4 que a própria aplicação emite", () => {
    expect(visitorIdValido("3f8a1c2e-5b6d-4a7f-9c1e-2d3b4a5c6d7e")).toBe(true);
  });

  test("rejeita qualquer coisa que não seja esse formato", () => {
    for (const invalido of [
      "",
      "abc",
      "pessoa@exemplo.com",
      "11999998888",
      "3f8a1c2e5b6d4a7f9c1e2d3b4a5c6d7e",
      "x".repeat(500),
      null,
      undefined,
      123,
      {},
    ]) {
      expect(visitorIdValido(invalido), `deveria rejeitar ${String(invalido).slice(0, 20)}`).toBe(false);
    }
  });
});

describe("visitorHash — minimização por escopo", () => {
  const visitante = "3f8a1c2e-5b6d-4a7f-9c1e-2d3b4a5c6d7e";

  test("determinístico: mesmo visitante + imóvel + org = mesmo hash (é o que deduplica)", () => {
    expect(calcularVisitorHash(visitante, "org-1", "imovel-1")).toBe(
      calcularVisitorHash(visitante, "org-1", "imovel-1")
    );
  });

  test("O PONTO DA FASE: o mesmo visitante em outro imóvel gera hash sem relação", () => {
    // Se estes fossem iguais, a tabela permitiria reconstruir a
    // navegação de uma pessoa pelo site — exatamente o tracking que esta
    // fase se recusa a fazer.
    expect(calcularVisitorHash(visitante, "org-1", "imovel-1")).not.toBe(
      calcularVisitorHash(visitante, "org-1", "imovel-2")
    );
  });

  test("escopado por organização: mesmo visitante e mesmo id de imóvel em orgs diferentes não colide", () => {
    expect(calcularVisitorHash(visitante, "org-1", "imovel-1")).not.toBe(
      calcularVisitorHash(visitante, "org-2", "imovel-1")
    );
  });

  test("não é reversível nem contém o id original", () => {
    const hash = calcularVisitorHash(visitante, "org-1", "imovel-1");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain(visitante);
  });

  test("visitantes diferentes no mesmo imóvel produzem hashes diferentes", () => {
    expect(calcularVisitorHash(visitante, "org-1", "imovel-1")).not.toBe(
      calcularVisitorHash("11111111-2222-4333-8444-555555555555", "org-1", "imovel-1")
    );
  });
});

describe("janela de deduplicação", () => {
  test("30 minutos, expressos em ms de forma coerente", () => {
    expect(JANELA_DEDUP_MINUTOS).toBe(30);
    expect(JANELA_DEDUP_MS).toBe(30 * 60 * 1000);
  });
});
