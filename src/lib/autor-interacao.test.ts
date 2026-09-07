import { describe, test, expect } from "vitest";
import {
  paraAutorInteracao,
  rotuloAutorInteracao,
  AUTOR_NAO_REGISTRADO,
} from "@/lib/autor-interacao";

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
  user: { name: over.nome === undefined ? "Bruno Souza" : over.nome },
});

describe("paraAutorInteracao", () => {
  test("membro ativo vira autor com nome", () => {
    expect(paraAutorInteracao(membro(), ORG)).toEqual({
      memberId: "m1",
      nome: "Bruno Souza",
      inativo: false,
    });
  });

  test("null e undefined viram null — interação sem ator interno", () => {
    expect(paraAutorInteracao(null, ORG)).toBeNull();
    expect(paraAutorInteracao(undefined, ORG)).toBeNull();
  });

  test("membro suspenso CONTINUA sendo o autor, marcado como inativo", () => {
    const autor = paraAutorInteracao(membro({ status: "SUSPENDED" }), ORG);
    expect(autor?.nome).toBe("Bruno Souza");
    expect(autor?.inativo).toBe(true);
  });

  test("membro de OUTRO tenant é redigido — nome jamais chega à tela", () => {
    expect(paraAutorInteracao(membro({ org: "org-b" }), ORG)).toBeNull();
  });

  test("nome vazio vira rótulo honesto", () => {
    expect(paraAutorInteracao(membro({ nome: null }), ORG)?.nome).toBe("Membro sem nome");
    expect(paraAutorInteracao(membro({ nome: "  " }), ORG)?.nome).toBe("Membro sem nome");
  });
});

describe("rotuloAutorInteracao", () => {
  const autor = { memberId: "m1", nome: "Bruno Souza", inativo: false };

  test("interação interna mostra o nome", () => {
    expect(rotuloAutorInteracao(autor, null)).toBe("Bruno Souza");
  });

  test("autor inativo mantém nome + marca textual, nunca só cor", () => {
    expect(rotuloAutorInteracao({ ...autor, inativo: true }, null)).toBe("Bruno Souza (inativo)");
  });

  test("CAPTAÇÃO PÚBLICA não recebe rótulo de autor", () => {
    // O fato é completo: quem originou foi o visitante. Dizer "autor não
    // registrado" sugeriria dado faltante onde não há.
    for (const origem of ["IMOVEL", "CONTATO", "ANUNCIE"]) {
      expect(rotuloAutorInteracao(null, origem)).toBeNull();
    }
  });

  test("sem ator e SEM origem: legado, aí sim 'Autor não registrado'", () => {
    expect(rotuloAutorInteracao(null, null)).toBe(AUTOR_NAO_REGISTRADO);
    expect(AUTOR_NAO_REGISTRADO).toBe("Autor não registrado");
  });

  test("autor conhecido prevalece mesmo com origem preenchida", () => {
    // Caso raro mas possível: contato do site que a equipe depois
    // reprocessou. Se há ator interno real, ele é mostrado.
    expect(rotuloAutorInteracao(autor, "IMOVEL")).toBe("Bruno Souza");
  });
});
