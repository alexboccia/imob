import { describe, test, expect } from "vitest";
import { opcoesDeFuso } from "./fusos-opcoes";
import { fusoValido } from "./fuso-horario";

// Fase 18 — o seletor de fuso das Configurações.
describe("opcoesDeFuso", () => {
  test("o Brasil e o UTC vêm primeiro, para ninguém procurar numa lista de 400", () => {
    const [primeiro] = opcoesDeFuso("UTC");
    expect(primeiro.titulo).toBe("Brasil e UTC");
    const valores = primeiro.opcoes.map((o) => o.valor);
    expect(valores[0]).toBe("UTC");
    expect(valores).toContain("America/Sao_Paulo");
    expect(valores).toContain("America/Manaus");
    expect(valores).toContain("America/Noronha");
    expect(valores).toContain("America/Rio_Branco");
  });

  test("todo valor oferecido é um identificador IANA válido — nunca um offset", () => {
    for (const grupo of opcoesDeFuso("UTC")) {
      for (const opcao of grupo.opcoes) {
        expect(fusoValido(opcao.valor)).toBe(true);
        expect(opcao.valor).not.toMatch(/^[+-]\d{2}:\d{2}$/);
      }
    }
  });

  test("nenhum fuso aparece duas vezes", () => {
    const valores = opcoesDeFuso("UTC").flatMap((g) => g.opcoes.map((o) => o.valor));
    expect(new Set(valores).size).toBe(valores.length);
  });

  test("o rótulo é legível e traz o offset, mas o valor salvo continua sendo o IANA", () => {
    const referencia = new Date("2026-01-15T12:00:00.000Z");
    const brasil = opcoesDeFuso("UTC", referencia)[0];
    const sp = brasil.opcoes.find((o) => o.valor === "America/Sao_Paulo")!;
    expect(sp.rotulo).toBe("São Paulo (UTC−03:00)");
  });

  test("o catálogo completo está presente e é grande", () => {
    const grupos = opcoesDeFuso("UTC");
    const completo = grupos.find((g) => g.titulo === "Todos os fusos")!;
    expect(completo.opcoes.length).toBeGreaterThan(300);
    expect(completo.opcoes.map((o) => o.valor)).toContain("Europe/Lisbon");
  });

  // Um fuso que saiu da lista canônica numa atualização de tzdata
  // continuaria válido no banco. Se sumisse do seletor, salvar o
  // formulário o trocaria em silêncio por outro.
  test("um fuso configurado fora do catálogo aparece como opção própria", () => {
    const grupos = opcoesDeFuso("Antiga/Zona");
    expect(grupos[0].titulo).toBe("Configuração atual");
    expect(grupos[0].opcoes[0].valor).toBe("Antiga/Zona");
  });

  test("um fuso canônico já listado NÃO gera um grupo duplicado", () => {
    expect(opcoesDeFuso("America/Sao_Paulo")[0].titulo).toBe("Brasil e UTC");
    expect(opcoesDeFuso("Europe/Lisbon")[0].titulo).toBe("Brasil e UTC");
  });
});
