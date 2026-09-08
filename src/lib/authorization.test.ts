import { describe, test, expect } from "vitest";
import {
  temPapel,
  PAPEIS_VISAO_EQUIPE,
  PAPEIS_GESTAO_CONFIGURACOES,
  PAPEIS_GESTAO_USUARIOS,
  PAPEIS_GESTAO_CATALOGOS,
  PAPEIS_LIQUIDACAO_COMISSAO,
  PAPEIS_RESOLUCAO_IDENTIDADE,
} from "./authorization";

// ---------------------------------------------------------------------
// Testes anteriores à Fase 21 — preservados integralmente. Esta fase
// não substitui nenhum deles; só acrescenta a matriz abaixo.
// ---------------------------------------------------------------------

describe("temPapel", () => {
  test("papel presente no conjunto é autorizado", () => {
    expect(temPapel("OWNER", PAPEIS_GESTAO_CONFIGURACOES)).toBe(true);
    expect(temPapel("ADMIN", PAPEIS_GESTAO_CONFIGURACOES)).toBe(true);
  });

  test("papel ausente no conjunto não é autorizado", () => {
    expect(temPapel("BROKER", PAPEIS_GESTAO_CONFIGURACOES)).toBe(false);
    expect(temPapel("MANAGER", PAPEIS_GESTAO_CONFIGURACOES)).toBe(false);
  });

  test("papel undefined nunca é autorizado", () => {
    expect(temPapel(undefined, PAPEIS_GESTAO_CONFIGURACOES)).toBe(false);
  });

  test("string vazia nunca é autorizada", () => {
    expect(temPapel("", PAPEIS_GESTAO_USUARIOS)).toBe(false);
  });

  test("PAPEIS_GESTAO_CATALOGOS inclui MANAGER além de OWNER/ADMIN", () => {
    expect(temPapel("MANAGER", PAPEIS_GESTAO_CATALOGOS)).toBe(true);
    expect(temPapel("MANAGER", PAPEIS_GESTAO_USUARIOS)).toBe(false);
  });

  test("BROKER e ASSISTANT nunca gerenciam usuários", () => {
    expect(temPapel("BROKER", PAPEIS_GESTAO_USUARIOS)).toBe(false);
    expect(temPapel("ASSISTANT", PAPEIS_GESTAO_USUARIOS)).toBe(false);
  });
});

// Fase 21 — a MATRIZ DE CAPACIDADES, escrita como teste.
//
// Este arquivo existe porque a fase começou por uma auditoria de papéis,
// e o resultado dela não deveria viver só num relatório. Se alguém mudar
// um desses conjuntos por engano, o teste diz exatamente qual capacidade
// mudou de mãos.

const TODOS_OS_PAPEIS = ["OWNER", "ADMIN", "MANAGER", "BROKER", "ASSISTANT"] as const;

describe("matriz de capacidades da organização", () => {
  // A auditoria encontrou CINCO papéis, não quatro: ASSISTANT existe no
  // enum OrganizationRole e não participa de nenhuma capacidade
  // gerencial hoje.
  const matriz: Record<string, ReadonlySet<string>> = {
    "configurações (inclui fuso horário)": PAPEIS_GESTAO_CONFIGURACOES,
    "gestão de usuários": PAPEIS_GESTAO_USUARIOS,
    "catálogos (características, tipos de imóvel)": PAPEIS_GESTAO_CATALOGOS,
    "liquidação de comissão": PAPEIS_LIQUIDACAO_COMISSAO,
    "visão de equipe": PAPEIS_VISAO_EQUIPE,
  };

  const esperado: Record<string, string[]> = {
    "configurações (inclui fuso horário)": ["OWNER", "ADMIN"],
    "gestão de usuários": ["OWNER", "ADMIN"],
    "catálogos (características, tipos de imóvel)": ["OWNER", "ADMIN", "MANAGER"],
    "liquidação de comissão": ["OWNER", "ADMIN", "MANAGER"],
    "visão de equipe": ["OWNER", "ADMIN", "MANAGER"],
  };

  test.each(Object.keys(matriz))("%s tem exatamente os papéis auditados", (capacidade) => {
    expect([...matriz[capacidade]].sort()).toEqual([...esperado[capacidade]].sort());
  });
});

describe("visão de equipe", () => {
  test.each(["OWNER", "ADMIN", "MANAGER"])("%s tem autoridade comercial", (papel) => {
    expect(temPapel(papel, PAPEIS_VISAO_EQUIPE)).toBe(true);
  });

  test.each(["BROKER", "ASSISTANT"])("%s não tem", (papel) => {
    expect(temPapel(papel, PAPEIS_VISAO_EQUIPE)).toBe(false);
  });

  // Nenhum papel novo foi criado nesta fase — a checagem é sobre o
  // conjunto de papéis existentes, não sobre um TEAM_LEAD inventado.
  test("nenhum papel fora do enum OrganizationRole aparece na capacidade", () => {
    for (const papel of PAPEIS_VISAO_EQUIPE) {
      expect(TODOS_OS_PAPEIS).toContain(papel);
    }
  });

  // A visão de equipe é a MESMA camada gerencial já usada em catálogos e
  // liquidação — não uma autoridade paralela.
  test("reusa exatamente a camada gerencial que o domínio já tinha", () => {
    expect([...PAPEIS_VISAO_EQUIPE].sort()).toEqual([...PAPEIS_GESTAO_CATALOGOS].sort());
    expect([...PAPEIS_VISAO_EQUIPE].sort()).toEqual([...PAPEIS_LIQUIDACAO_COMISSAO].sort());
  });

  // ... e é DIFERENTE da autoridade institucional: acompanhar a equipe
  // não é o mesmo que mexer em quem entra na organização.
  test("não se confunde com a autoridade institucional de OWNER/ADMIN", () => {
    expect(PAPEIS_VISAO_EQUIPE.has("MANAGER")).toBe(true);
    expect(PAPEIS_GESTAO_USUARIOS.has("MANAGER")).toBe(false);
    expect(PAPEIS_GESTAO_CONFIGURACOES.has("MANAGER")).toBe(false);
  });

  test("papel ausente, vazio ou desconhecido nunca autoriza", () => {
    for (const valor of [undefined, "", "SUPER_ADMIN", "manager", "TEAM_LEAD"]) {
      expect(temPapel(valor, PAPEIS_VISAO_EQUIPE)).toBe(false);
    }
  });
});

// =======================================================================
// Fase 24 — resolução de identidade de captação pública
// =======================================================================
describe("PAPEIS_RESOLUCAO_IDENTIDADE", () => {
  test("a camada gerencial identifica contatos ambíguos", () => {
    expect(temPapel("OWNER", PAPEIS_RESOLUCAO_IDENTIDADE)).toBe(true);
    expect(temPapel("ADMIN", PAPEIS_RESOLUCAO_IDENTIDADE)).toBe(true);
    expect(temPapel("MANAGER", PAPEIS_RESOLUCAO_IDENTIDADE)).toBe(true);
  });

  test("BROKER e ASSISTANT não decidem a qual cliente um contato pertence", () => {
    // A captação pendente NÃO tem responsável — não existe "meu lead"
    // aqui que justificasse dar a decisão a um corretor.
    expect(temPapel("BROKER", PAPEIS_RESOLUCAO_IDENTIDADE)).toBe(false);
    expect(temPapel("ASSISTANT", PAPEIS_RESOLUCAO_IDENTIDADE)).toBe(false);
  });

  test("papel ausente ou desconhecido nunca resolve", () => {
    expect(temPapel(undefined, PAPEIS_RESOLUCAO_IDENTIDADE)).toBe(false);
    expect(temPapel("", PAPEIS_RESOLUCAO_IDENTIDADE)).toBe(false);
    expect(temPapel("SUPER_ADMIN", PAPEIS_RESOLUCAO_IDENTIDADE)).toBe(false);
  });

  test("é um conjunto PRÓPRIO: mudar visão de equipe não pode mudar quem identifica", () => {
    // Mesmo valor hoje, significados diferentes. O teste existe para que
    // uma futura fusão dos dois conjuntos seja uma decisão consciente, e
    // não um efeito colateral silencioso.
    expect(PAPEIS_RESOLUCAO_IDENTIDADE).not.toBe(PAPEIS_VISAO_EQUIPE);
  });
});
