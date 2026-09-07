import { describe, test, expect } from "vitest";
import {
  paraAtorTransicao,
  rotuloAtorTransicao,
  ATOR_NAO_REGISTRADO,
} from "@/lib/ator-transicao";

const ORG = "org-a";

const membro = (
  over: Partial<{
    id: string;
    status: "ACTIVE" | "INVITED" | "SUSPENDED";
    org: string;
    nome: string | null;
  }> = {}
) => ({
  id: over.id ?? "m1",
  status: over.status ?? ("ACTIVE" as const),
  organizationId: over.org ?? ORG,
  user: { name: over.nome === undefined ? "Bruno Gerente" : over.nome },
});

describe("paraAtorTransicao", () => {
  test("membro ativo vira ator com nome", () => {
    expect(paraAtorTransicao(membro(), ORG)).toEqual({
      memberId: "m1",
      nome: "Bruno Gerente",
      inativo: false,
    });
  });

  test("null e undefined viram null — histórico sem ator registrado", () => {
    expect(paraAtorTransicao(null, ORG)).toBeNull();
    expect(paraAtorTransicao(undefined, ORG)).toBeNull();
  });

  test("membro suspenso CONTINUA sendo o ator, marcado como inativo", () => {
    const ator = paraAtorTransicao(membro({ status: "SUSPENDED" }), ORG);
    // O ponto: quem moveu não deixa de ter movido porque foi desativado.
    expect(ator).not.toBeNull();
    expect(ator?.nome).toBe("Bruno Gerente");
    expect(ator?.inativo).toBe(true);
  });

  test("membro convidado também conta como inativo", () => {
    expect(paraAtorTransicao(membro({ status: "INVITED" }), ORG)?.inativo).toBe(true);
  });

  test("membro de OUTRO tenant é redigido — nome jamais chega à tela", () => {
    expect(paraAtorTransicao(membro({ org: "org-b" }), ORG)).toBeNull();
  });

  test("nome vazio ou só espaços vira rótulo honesto", () => {
    expect(paraAtorTransicao(membro({ nome: null }), ORG)?.nome).toBe("Membro sem nome");
    expect(paraAtorTransicao(membro({ nome: "   " }), ORG)?.nome).toBe("Membro sem nome");
  });
});

describe("rotuloAtorTransicao", () => {
  test("ator ativo aparece só com o nome", () => {
    expect(rotuloAtorTransicao({ memberId: "m1", nome: "Ana", inativo: false })).toBe("Ana");
  });

  test("ator inativo mantém nome + marca textual, nunca só cor", () => {
    expect(rotuloAtorTransicao({ memberId: "m1", nome: "Ana", inativo: true })).toBe(
      "Ana (inativo)"
    );
  });

  test("sem ator, o rótulo diz NÃO REGISTRADO — não 'ninguém moveu'", () => {
    expect(rotuloAtorTransicao(null)).toBe(ATOR_NAO_REGISTRADO);
    expect(ATOR_NAO_REGISTRADO).toBe("Ator não registrado");
  });
});
