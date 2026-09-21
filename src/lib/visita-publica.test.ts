import { describe, test, expect } from "vitest";
import {
  LIMITE_OBSERVACAO_VISITA,
  comoDatetimeLocal,
  visitaPublicaSchema,
} from "@/lib/visita-publica";

// =======================================================================
// Forma do pedido de visita (Fase 55)
// =======================================================================
// Só a FORMA: o instante (e o "é futuro?") depende do fuso da
// organização e é decidido na action, contra o banco.

const base = {
  nome: "Joana Compradora",
  email: "joana@exemplo.test",
  telefone: "11999998888",
  data: "2026-12-20",
  hora: "14:30",
  imovelId: "imovel-1",
};

describe("visitaPublicaSchema", () => {
  test("pedido completo passa, com a observação opcional ausente", () => {
    const r = visitaPublicaSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.observacao).toBeUndefined();
  });

  test("nome, e-mail e telefone são obrigatórios — visita se confirma com alguém", () => {
    for (const campo of ["nome", "email", "telefone"] as const) {
      const r = visitaPublicaSchema.safeParse({ ...base, [campo]: "" });
      expect(r.success, campo).toBe(false);
    }
  });

  test.each([
    ["e-mail sem arroba", { email: "joana.exemplo.test" }],
    ["telefone curto demais", { telefone: "1199" }],
    ["data fora do formato", { data: "20/12/2026" }],
    ["hora fora do formato", { hora: "14h30" }],
    ["sem imóvel", { imovelId: "" }],
  ])("recusa: %s", (_nome, alteracao) => {
    expect(visitaPublicaSchema.safeParse({ ...base, ...alteracao }).success).toBe(false);
  });

  test("observação é aparada e tem teto", () => {
    const r = visitaPublicaSchema.safeParse({ ...base, observacao: "  Prefiro de manhã.  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.observacao).toBe("Prefiro de manhã.");
    expect(
      visitaPublicaSchema.safeParse({ ...base, observacao: "a".repeat(LIMITE_OBSERVACAO_VISITA) }).success
    ).toBe(true);
    expect(
      visitaPublicaSchema.safeParse({ ...base, observacao: "a".repeat(LIMITE_OBSERVACAO_VISITA + 1) }).success
    ).toBe(false);
  });

  test("data e hora viram a forma que o conversor de fuso entende", () => {
    expect(comoDatetimeLocal("2026-12-20", "14:30")).toBe("2026-12-20T14:30");
  });
});
