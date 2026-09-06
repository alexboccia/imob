import { describe, test, expect } from "vitest";
import {
  membroPodeReceberNegociacao,
  paraResponsavel,
  agruparPorResponsavel,
  ordenarOpcoesResponsavel,
  SEM_RESPONSAVEL_CHAVE,
  SEM_RESPONSAVEL_LABEL,
  type ResponsavelNegociacao,
} from "@/lib/responsavel-negociacao";

const ORG = "org-a";

function membro(overrides: Partial<{ id: string; status: "ACTIVE" | "INVITED" | "SUSPENDED"; organizationId: string; nome: string | null }> = {}) {
  return {
    id: overrides.id ?? "membro-1",
    status: overrides.status ?? ("ACTIVE" as const),
    organizationId: overrides.organizationId ?? ORG,
    user: { name: overrides.nome === undefined ? "Ana Corretora" : overrides.nome },
  };
}

function responsavel(nome: string, inativo = false): ResponsavelNegociacao {
  return { memberId: `m-${nome}`, nome, inativo };
}

describe("membroPodeReceberNegociacao", () => {
  test("só ACTIVE recebe atribuição nova", () => {
    expect(membroPodeReceberNegociacao("ACTIVE")).toBe(true);
    expect(membroPodeReceberNegociacao("SUSPENDED")).toBe(false);
    // INVITED ainda não aceitou o convite: não trabalha, não recebe.
    expect(membroPodeReceberNegociacao("INVITED")).toBe(false);
  });
});

describe("paraResponsavel", () => {
  test("null/undefined viram null — negociação sem responsável", () => {
    expect(paraResponsavel(null, ORG)).toBeNull();
    expect(paraResponsavel(undefined, ORG)).toBeNull();
  });

  test("membro ativo vira nome + inativo:false", () => {
    expect(paraResponsavel(membro(), ORG)).toEqual({
      memberId: "membro-1",
      nome: "Ana Corretora",
      inativo: false,
    });
  });

  test("membro suspenso continua sendo o responsável, marcado como inativo", () => {
    const r = paraResponsavel(membro({ status: "SUSPENDED" }), ORG);
    expect(r?.nome).toBe("Ana Corretora");
    // O ponto central: NUNCA vira "sem responsável".
    expect(r).not.toBeNull();
    expect(r?.inativo).toBe(true);
  });

  test("membro de OUTRO tenant é redigido — nome nunca chega à tela", () => {
    expect(paraResponsavel(membro({ organizationId: "org-b" }), ORG)).toBeNull();
  });

  test("nome vazio ou só espaços vira rótulo honesto, não string vazia", () => {
    expect(paraResponsavel(membro({ nome: null }), ORG)?.nome).toBe("Membro sem nome");
    expect(paraResponsavel(membro({ nome: "   " }), ORG)?.nome).toBe("Membro sem nome");
  });
});

describe("ordenarOpcoesResponsavel", () => {
  test("ativos primeiro, depois por nome", () => {
    const opcoes = ordenarOpcoesResponsavel([
      { id: "3", status: "ACTIVE", user: { name: "Carlos" } },
      { id: "1", status: "SUSPENDED", user: { name: "Ana" } },
      { id: "2", status: "ACTIVE", user: { name: "Beatriz" } },
    ]);
    expect(opcoes.map((o) => o.nome)).toEqual(["Beatriz", "Carlos", "Ana"]);
    expect(opcoes.at(-1)?.inativo).toBe(true);
  });
});

describe("agruparPorResponsavel", () => {
  test("sem dado nenhum devolve lista vazia — nunca uma linha fantasma", () => {
    expect(agruparPorResponsavel([], [])).toEqual([]);
  });

  test("oportunidades criadas e fechamentos entram na MESMA linha do responsável", () => {
    const ana = responsavel("Ana");
    const linhas = agruparPorResponsavel(
      [{ responsavel: ana }, { responsavel: ana }],
      [{ responsavel: ana, ganho: true, closedValue: 100, commissionValue: 5 }]
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].oportunidades).toBe(2);
    expect(linhas[0].ganhos).toBe(1);
    expect(linhas[0].valorFechado).toBe(100);
    expect(linhas[0].comissao).toBe(5);
  });

  test("taxa de ganho usa SÓ a coorte de fechados, nunca as oportunidades criadas", () => {
    const ana = responsavel("Ana");
    // 10 oportunidades criadas no período, mas só 4 fechamentos: se a taxa
    // dividisse por oportunidades daria 25%; a correta é 3/4 = 75%.
    const linhas = agruparPorResponsavel(
      Array.from({ length: 10 }, () => ({ responsavel: ana })),
      [
        { responsavel: ana, ganho: true, closedValue: null, commissionValue: null },
        { responsavel: ana, ganho: true, closedValue: null, commissionValue: null },
        { responsavel: ana, ganho: true, closedValue: null, commissionValue: null },
        { responsavel: ana, ganho: false, closedValue: null, commissionValue: null },
      ]
    );
    expect(linhas[0].oportunidades).toBe(10);
    expect(linhas[0].taxaGanho).toBe(75);
  });

  test("sem NENHUM fechamento no período a taxa é null, nunca 0%", () => {
    const linhas = agruparPorResponsavel([{ responsavel: responsavel("Ana") }], []);
    expect(linhas[0].taxaGanho).toBeNull();
  });

  test("responsável null cai no balde 'Sem responsável', com rótulo próprio", () => {
    const linhas = agruparPorResponsavel(
      [{ responsavel: null }],
      [{ responsavel: null, ganho: true, closedValue: 200, commissionValue: null }]
    );
    expect(linhas[0].chave).toBe(SEM_RESPONSAVEL_CHAVE);
    expect(linhas[0].nome).toBe(SEM_RESPONSAVEL_LABEL);
    expect(linhas[0].inativo).toBe(false);
    expect(linhas[0].valorFechado).toBe(200);
  });

  test("ganho sem valor/comissão não entra como zero — é declarado à parte", () => {
    const ana = responsavel("Ana");
    const linhas = agruparPorResponsavel(
      [],
      [
        { responsavel: ana, ganho: true, closedValue: 300, commissionValue: 15 },
        { responsavel: ana, ganho: true, closedValue: null, commissionValue: null },
      ]
    );
    expect(linhas[0].ganhos).toBe(2);
    expect(linhas[0].valorFechado).toBe(300);
    expect(linhas[0].comissao).toBe(15);
    expect(linhas[0].ganhosSemValor).toBe(1);
    expect(linhas[0].ganhosSemComissao).toBe(1);
  });

  test("perdido conta como encerrado e não soma dinheiro nenhum", () => {
    const ana = responsavel("Ana");
    const linhas = agruparPorResponsavel(
      [],
      [{ responsavel: ana, ganho: false, closedValue: 999, commissionValue: 999 }]
    );
    expect(linhas[0].perdidos).toBe(1);
    expect(linhas[0].ganhos).toBe(0);
    expect(linhas[0].valorFechado).toBe(0);
    expect(linhas[0].comissao).toBe(0);
    expect(linhas[0].taxaGanho).toBe(0);
  });

  test("responsável inativo mantém nome próprio e a marca de inativo", () => {
    const linhas = agruparPorResponsavel([{ responsavel: responsavel("Ana", true) }], []);
    expect(linhas[0].nome).toBe("Ana");
    expect(linhas[0].inativo).toBe(true);
  });

  test("cada responsável tem a sua linha, ordenadas por ganhos", () => {
    const ana = responsavel("Ana");
    const bruno = responsavel("Bruno");
    const linhas = agruparPorResponsavel(
      [{ responsavel: ana }, { responsavel: bruno }],
      [
        { responsavel: bruno, ganho: true, closedValue: 10, commissionValue: null },
        { responsavel: bruno, ganho: true, closedValue: 10, commissionValue: null },
        { responsavel: ana, ganho: true, closedValue: 10, commissionValue: null },
      ]
    );
    expect(linhas.map((l) => l.nome)).toEqual(["Bruno", "Ana"]);
  });

  test("'Sem responsável' fica por último quando empata com uma pessoa", () => {
    const ana = responsavel("Ana");
    const linhas = agruparPorResponsavel(
      [{ responsavel: ana }, { responsavel: null }],
      []
    );
    expect(linhas.at(-1)?.chave).toBe(SEM_RESPONSAVEL_CHAVE);
  });

  test("somas monetárias são arredondadas em centavos (sem erro binário)", () => {
    const ana = responsavel("Ana");
    const linhas = agruparPorResponsavel(
      [],
      [
        { responsavel: ana, ganho: true, closedValue: 0.1, commissionValue: 0.1 },
        { responsavel: ana, ganho: true, closedValue: 0.2, commissionValue: 0.2 },
      ]
    );
    expect(linhas[0].valorFechado).toBe(0.3);
    expect(linhas[0].comissao).toBe(0.3);
  });
});
