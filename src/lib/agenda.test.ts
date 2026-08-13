import { describe, test, expect } from "vitest";
import { interpretarFiltrosAgenda } from "./agenda";

// Testes unitários puros (sem banco) — interpretarFiltrosAgenda é a única
// porta de entrada dos filtros da Agenda (Fase H.4): nunca confia em
// searchParams cru, sempre cai em default seguro, nunca deixa um valor
// malformado virar exception/query inválida.

describe("interpretarFiltrosAgenda", () => {
  test("sem parâmetros: tudo em default (sem busca, sem período, status TODAS)", () => {
    const filtros = interpretarFiltrosAgenda({});
    expect(filtros).toEqual({ busca: "", de: null, ate: null, intervaloInvalido: false, status: "TODAS" });
  });

  test("busca é normalizada (trim + colapso de espaços) via o mesmo helper de pagination.ts", () => {
    const filtros = interpretarFiltrosAgenda({ q: "  joão   silva  " });
    expect(filtros.busca).toBe("joão silva");
  });

  test("data inicial válida é interpretada", () => {
    const filtros = interpretarFiltrosAgenda({ de: "2026-08-20" });
    expect(filtros.de?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(filtros.ate).toBeNull();
    expect(filtros.intervaloInvalido).toBe(false);
  });

  test("data final válida é interpretada", () => {
    const filtros = interpretarFiltrosAgenda({ ate: "2026-08-27" });
    expect(filtros.ate?.toISOString()).toBe("2026-08-27T00:00:00.000Z");
    expect(filtros.de).toBeNull();
  });

  test("intervalo completo (de + ate) é interpretado", () => {
    const filtros = interpretarFiltrosAgenda({ de: "2026-08-20", ate: "2026-08-27" });
    expect(filtros.de?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(filtros.ate?.toISOString()).toBe("2026-08-27T00:00:00.000Z");
    expect(filtros.intervaloInvalido).toBe(false);
  });

  test("data com formato inválido é ignorada (null), nunca lança exception", () => {
    const filtros = interpretarFiltrosAgenda({ de: "não-é-uma-data", ate: "2026-13-99" });
    expect(filtros.de).toBeNull();
    expect(filtros.ate).toBeNull();
    expect(filtros.intervaloInvalido).toBe(false);
  });

  test("de > ate: intervalo marcado como inválido e AMBAS as datas são descartadas (nunca trocadas entre si)", () => {
    const filtros = interpretarFiltrosAgenda({ de: "2026-08-27", ate: "2026-08-20" });
    expect(filtros.intervaloInvalido).toBe(true);
    expect(filtros.de).toBeNull();
    expect(filtros.ate).toBeNull();
  });

  test("de === ate (um único dia) não é inválido", () => {
    const filtros = interpretarFiltrosAgenda({ de: "2026-08-20", ate: "2026-08-20" });
    expect(filtros.intervaloInvalido).toBe(false);
    expect(filtros.de?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(filtros.ate?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  test("status válido (qualquer caixa) é aceito e normalizado pra maiúsculas", () => {
    expect(interpretarFiltrosAgenda({ status: "concluidas" }).status).toBe("CONCLUIDAS");
    expect(interpretarFiltrosAgenda({ status: "ATRASADAS" }).status).toBe("ATRASADAS");
    expect(interpretarFiltrosAgenda({ status: "Canceladas" }).status).toBe("CANCELADAS");
  });

  test("status inválido/arbitrário cai em TODAS, nunca é repassado cru", () => {
    expect(interpretarFiltrosAgenda({ status: "DROP TABLE" }).status).toBe("TODAS");
    expect(interpretarFiltrosAgenda({ status: "" }).status).toBe("TODAS");
    expect(interpretarFiltrosAgenda({ status: "completed" }).status).toBe("TODAS");
  });
});
