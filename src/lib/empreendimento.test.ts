import { describe, test, expect } from "vitest";
import {
  nomeEmpreendimentoSchema,
  interpretarVinculoEmpreendimento,
  SEM_EMPREENDIMENTO,
  ROTULO_SEM_EMPREENDIMENTO,
  LIMITE_NOME_EMPREENDIMENTO,
} from "@/lib/empreendimento";

// Fase 38 — as regras puras do empreendimento. A identidade estrutural
// vive no banco; aqui só o que decide o nome e o vínculo, sem Prisma,
// porque este módulo atravessa para o Client Component do formulário.

describe("nome do empreendimento", () => {
  test("aceita um nome real, já sem espaços nas pontas", () => {
    const r = nomeEmpreendimentoSchema.safeParse("  Residencial Jardim das Acácias  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("Residencial Jardim das Acácias");
  });

  test("recusa vazio e nome curto demais", () => {
    for (const invalido of ["", "   ", "A"]) {
      expect(nomeEmpreendimentoSchema.safeParse(invalido).success).toBe(false);
    }
  });

  test("recusa acima do teto e aceita exatamente no teto", () => {
    expect(
      nomeEmpreendimentoSchema.safeParse("x".repeat(LIMITE_NOME_EMPREENDIMENTO)).success
    ).toBe(true);
    expect(
      nomeEmpreendimentoSchema.safeParse("x".repeat(LIMITE_NOME_EMPREENDIMENTO + 1)).success
    ).toBe(false);
  });
});

describe("vínculo da unidade", () => {
  test("string vazia significa SEM empreendimento — não é erro", () => {
    // É o estado de toda unidade avulsa, e o caminho de DESVINCULAR.
    expect(interpretarVinculoEmpreendimento(SEM_EMPREENDIMENTO)).toBeNull();
    expect(interpretarVinculoEmpreendimento("   ")).toBeNull();
  });

  test("ausência também é 'sem empreendimento'", () => {
    expect(interpretarVinculoEmpreendimento(null)).toBeNull();
    expect(interpretarVinculoEmpreendimento(undefined)).toBeNull();
  });

  test("um id é preservado como veio, sem espaços nas pontas", () => {
    expect(interpretarVinculoEmpreendimento("  dev_123  ")).toBe("dev_123");
  });

  test("o rótulo da opção vazia é TEXTO, nunca um traço", () => {
    // "Sem empreendimento" é uma escolha declarada; "—" faria parecer
    // campo não preenchido.
    expect(ROTULO_SEM_EMPREENDIMENTO).toMatch(/sem empreendimento/i);
  });
});
