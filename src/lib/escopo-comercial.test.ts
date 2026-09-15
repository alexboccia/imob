import { describe, test, expect } from "vitest";
import {
  resolverEscopoComercial,
  whereNegociacao,
  wherePessoa,
  wherePessoaNaFilaDeEntrada,
  whereAtividade,
  whereNegociacaoAlvo,
  wherePessoaAlvo,
  whereAtividadeAlvo,
  escopoEhOrganizacao,
} from "./escopo-comercial";

// =======================================================================
// Fase 22 — a matriz de visibilidade, escrita como teste
// =======================================================================
// Política × papel, exaustivo. Se alguém mudar um dos dois eixos, este
// arquivo diz exatamente qual combinação passou a ver o quê.

const PAPEIS = ["OWNER", "ADMIN", "MANAGER", "BROKER", "ASSISTANT"] as const;
const GERENCIAIS = ["OWNER", "ADMIN", "MANAGER"] as const;
const OPERACIONAIS = ["BROKER", "ASSISTANT"] as const;
const EU = "membro-eu";

const escopo = (politica: "COLLABORATIVE" | "RESTRICTED", role: string | undefined) =>
  resolverEscopoComercial({ politica, role, memberId: EU });

describe("COLLABORATIVE — comportamento histórico para todos", () => {
  test.each(PAPEIS)("%s vê a organização", (role) => {
    expect(escopo("COLLABORATIVE", role)).toEqual({ tipo: "ORGANIZACAO" });
  });

  // A garantia mais forte de não-regressão: no modo colaborativo os
  // fragmentos são `{}`, então as queries ficam idênticas às de sempre.
  test.each(PAPEIS)("%s produz fragmentos vazios — a query não muda", (role) => {
    const e = escopo("COLLABORATIVE", role);
    expect(whereNegociacao(e)).toEqual({});
    expect(wherePessoa(e)).toEqual({});
    expect(whereAtividade(e)).toEqual({});
  });
});

describe("RESTRICTED — camada gerencial mantém a organização", () => {
  test.each(GERENCIAIS)("%s continua vendo tudo", (role) => {
    expect(escopo("RESTRICTED", role)).toEqual({ tipo: "ORGANIZACAO" });
    expect(whereNegociacao(escopo("RESTRICTED", role))).toEqual({});
  });

  // É a MESMA camada da Fase 21: quem acompanha o trabalho da equipe
  // precisa alcançar a carteira dela.
  test("é exatamente o conjunto de PAPEIS_VISAO_EQUIPE", () => {
    for (const role of GERENCIAIS) expect(escopoEhOrganizacao(escopo("RESTRICTED", role))).toBe(true);
    for (const role of OPERACIONAIS) expect(escopoEhOrganizacao(escopo("RESTRICTED", role))).toBe(false);
  });
});

describe("RESTRICTED — membro operacional fica na própria carteira", () => {
  test.each(OPERACIONAIS)("%s vira escopo de membro", (role) => {
    expect(escopo("RESTRICTED", role)).toEqual({ tipo: "MEMBRO", memberId: EU });
  });

  test("negociação: o predicado é o responsável — nunca autor nem criador", () => {
    expect(whereNegociacao(escopo("RESTRICTED", "BROKER"))).toEqual({
      responsibleMemberId: EU,
    });
  });

  // Decisão explícita: sem responsável NÃO entra. Não existe fluxo de
  // "pegar para si" no produto; a fila sem dono é gerencial.
  test("negociação sem responsável não entra no escopo do membro", () => {
    const w = whereNegociacao(escopo("RESTRICTED", "BROKER"));
    expect(w.responsibleMemberId).toBe(EU);
    expect(w.responsibleMemberId).not.toBeNull();
  });

  test("pessoa: negociação, POSSE DECLARADA e a ponte estreita de registro", () => {
    // Fase 36 — a posse da pessoa passou a existir e entrou como ramo
    // próprio. Os outros dois ramos continuam idênticos: ninguém perdeu
    // visibilidade, e a ampliação é exatamente uma.
    expect(wherePessoa(escopo("RESTRICTED", "BROKER"))).toEqual({
      OR: [
        { propertyInterests: { some: { responsibleMemberId: EU } } },
        { responsibleMemberId: EU },
        { assignedMemberId: EU, propertyInterests: { none: {} } },
      ],
    });
  });

  // A diferença entre os dois ramos de "pessoa sem negociação" é a
  // invariante central da fase: POSSE não é AUTORIA.
  test("posse não tem a restrição de 'sem negociação' que a autoria tem", () => {
    const w = wherePessoa(escopo("RESTRICTED", "BROKER")) as {
      OR: { responsibleMemberId?: string; assignedMemberId?: string; propertyInterests?: unknown }[];
    };
    // Sou responsável pela pessoa: continuo vendo mesmo que um colega
    // conduza uma negociação com ela. Perder a pessoa de vista nesse caso
    // seria perder o próprio trabalho.
    const posse = w.OR.find((c) => c.responsibleMemberId === EU && !c.assignedMemberId)!;
    expect(posse.propertyInterests).toBeUndefined();
    // Já a autoria continua valendo só enquanto ninguém conduz nada.
    const autoria = w.OR.find((c) => c.assignedMemberId === EU)!;
    expect(autoria.propertyInterests).toEqual({ none: {} });
  });

  // A fila de entrada é o ÚNICO lugar com alcance maior — e a diferença
  // é exatamente um ramo: o lead que não é de ninguém.
  test("fila de entrada acrescenta apenas os contatos sem responsável", () => {
    expect(wherePessoaNaFilaDeEntrada(escopo("RESTRICTED", "BROKER"))).toEqual({
      OR: [
        { propertyInterests: { some: { responsibleMemberId: EU } } },
        { responsibleMemberId: EU },
        { assignedMemberId: EU, propertyInterests: { none: {} } },
        { responsibleMemberId: null },
      ],
    });
  });

  // Lead de COLEGA nunca entra na fila: sem dono é trabalho aberto da
  // organização, com dono é carteira de alguém.
  test("fila de entrada NÃO alcança lead de colega", () => {
    const w = wherePessoaNaFilaDeEntrada(escopo("RESTRICTED", "BROKER")) as {
      OR: { responsibleMemberId?: string | null }[];
    };
    const valores = w.OR.map((c) => c.responsibleMemberId);
    expect(valores).toContain(EU);
    expect(valores).toContain(null);
    expect(valores.some((v) => typeof v === "string" && v !== EU)).toBe(false);
  });

  // assignedMemberId é AUTORIA do registro (um writer, nunca transferido,
  // null em lead público). Sozinho ele não concede acesso: só vale
  // enquanto a pessoa não tem negociação nenhuma.
  test("assignedMemberId não dá acesso a pessoa que já tem negociações", () => {
    const w = wherePessoa(escopo("RESTRICTED", "BROKER")) as {
      OR: { assignedMemberId?: string; propertyInterests?: unknown }[];
    };
    const ponte = w.OR.find((c) => c.assignedMemberId === EU)!;
    expect(ponte.propertyInterests).toEqual({ none: {} });
  });

  test("compromisso: dono da negociação quando existe, dono próprio quando não, nunca createdByMemberId", () => {
    // Fase 32 — a posse ganhou uma segunda dimensão, e o formato mudou
    // junto. O que NÃO mudou, e é o que este teste protege: a negociação
    // continua soberana, e autoria continua não sendo posse.
    const w = whereAtividade(escopo("RESTRICTED", "BROKER"));
    expect(w).toEqual({
      OR: [
        { propertyInterest: { is: { responsibleMemberId: EU } } },
        // O `propertyInterestId: null` é a PRECEDÊNCIA em forma de
        // predicado: uma atividade que pertence a uma negociação não
        // pode ser reivindicada pela coluna da própria atividade.
        { propertyInterestId: null, responsibleMemberId: EU },
      ],
    });
    expect(JSON.stringify(w)).not.toContain("createdByMemberId");
  });
});

describe("falha fechada", () => {
  // Sessão sem vínculo de membro não pode virar acesso à organização.
  test.each([undefined, null, ""])("memberId %j em RESTRICTED não abre nada", (memberId) => {
    const e = resolverEscopoComercial({ politica: "RESTRICTED", role: "BROKER", memberId });
    expect(e).toEqual({ tipo: "MEMBRO", memberId: "__nenhum__" });
    expect(whereNegociacao(e)).toEqual({ responsibleMemberId: "__nenhum__" });
  });

  test.each([undefined, "", "SUPER_ADMIN", "TEAM_LEAD", "manager"])(
    "papel %j desconhecido cai no escopo de membro, nunca no de organização",
    (role) => {
      expect(escopoEhOrganizacao(resolverEscopoComercial({ politica: "RESTRICTED", role, memberId: EU }))).toBe(false);
    }
  );
});

describe("predicados de alvo (escritas)", () => {
  const ORG = "org-1";

  test("no modo organização o alvo é só id + tenant — igual ao que sempre foi", () => {
    const e = escopo("COLLABORATIVE", "BROKER");
    expect(whereNegociacaoAlvo(e, "int-1", ORG)).toEqual({ id: "int-1", organizationId: ORG });
    expect(wherePessoaAlvo(e, "p-1", ORG)).toEqual({ id: "p-1", organizationId: ORG });
    expect(whereAtividadeAlvo(e, "a-1", ORG)).toEqual({ id: "a-1", organizationId: ORG });
  });

  // TENANT continua sendo a primeira fronteira: o escopo é somado a ela,
  // nunca a substitui.
  test("o tenant nunca sai do predicado, em nenhum modo", () => {
    for (const politica of ["COLLABORATIVE", "RESTRICTED"] as const) {
      for (const role of PAPEIS) {
        const e = escopo(politica, role);
        expect(whereNegociacaoAlvo(e, "int-1", ORG).organizationId).toBe(ORG);
        expect(wherePessoaAlvo(e, "p-1", ORG).organizationId).toBe(ORG);
        expect(whereAtividadeAlvo(e, "a-1", ORG).organizationId).toBe(ORG);
      }
    }
  });

  test("no modo restrito o alvo carrega o predicado de posse", () => {
    const e = escopo("RESTRICTED", "BROKER");
    expect(whereNegociacaoAlvo(e, "int-1", ORG)).toEqual({
      responsibleMemberId: EU,
      id: "int-1",
      organizationId: ORG,
    });
  });
});
