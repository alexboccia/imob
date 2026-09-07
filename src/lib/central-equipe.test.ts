import { describe, test, expect } from "vitest";
import { resolverVisaoCentral, VISAO_EQUIPE } from "./central-equipe";

// =======================================================================
// Fase 21 — quem recebe a visão de equipe
// =======================================================================
// A garantia central desta fase, testada de forma exaustiva: um BROKER
// não obtém a visão da organização manipulando a URL.

const comCrm = (role: string | undefined, visaoPedida?: string) =>
  resolverVisaoCentral({ role, temCrm: true, visaoPedida });

describe("papel gerencial recebe a visão de equipe quando pede", () => {
  test.each(["OWNER", "ADMIN", "MANAGER"])("%s", (role) => {
    expect(comCrm(role, VISAO_EQUIPE)).toEqual({ visao: "equipe", podeVerEquipe: true });
  });

  test.each(["OWNER", "ADMIN", "MANAGER"])("%s sem pedir continua no pessoal", (role) => {
    // O padrão é o trabalho da própria pessoa, mesmo para o gestor: a
    // Central não vira dashboard administrativo por causa do papel.
    expect(comCrm(role)).toEqual({ visao: "pessoal", podeVerEquipe: true });
  });
});

describe("BROKER não obtém a equipe manipulando a URL", () => {
  // O ponto da fase inteira: o parâmetro é um PEDIDO, não uma decisão.
  test.each([
    VISAO_EQUIPE,
    "EQUIPE",
    "Equipe",
    " equipe ",
    "equipe&visao=equipe",
    "1",
    "true",
    "pessoal",
  ])("?visao=%j não muda nada para BROKER", (valor) => {
    expect(comCrm("BROKER", valor)).toEqual({ visao: "pessoal", podeVerEquipe: false });
  });

  test("ASSISTANT idem", () => {
    expect(comCrm("ASSISTANT", VISAO_EQUIPE)).toEqual({
      visao: "pessoal",
      podeVerEquipe: false,
    });
  });

  // `podeVerEquipe: false` também esconde o alternador — o BROKER não vê
  // um controle que não pode usar, em vez de ver um erro.
  test("o alternador não é oferecido a quem não tem autoridade", () => {
    expect(comCrm("BROKER", VISAO_EQUIPE).podeVerEquipe).toBe(false);
    expect(comCrm("MANAGER", VISAO_EQUIPE).podeVerEquipe).toBe(true);
  });
});

describe("papel ausente ou desconhecido", () => {
  test.each([undefined, "", "SUPER_ADMIN", "TEAM_LEAD", "manager"])(
    "%j nunca recebe a equipe",
    (role) => {
      expect(comCrm(role, VISAO_EQUIPE).visao).toBe("pessoal");
    }
  );
});

describe("módulo CRM", () => {
  // Sem CRM não existe Central nem equipe — mesmo gate de Agenda,
  // Clientes e Pipeline. Papel gerencial não contorna módulo.
  test.each(["OWNER", "ADMIN", "MANAGER"])("%s sem CRM não vê equipe", (role) => {
    expect(resolverVisaoCentral({ role, temCrm: false, visaoPedida: VISAO_EQUIPE })).toEqual({
      visao: "pessoal",
      podeVerEquipe: false,
    });
  });
});

describe("valor do parâmetro", () => {
  test("só o valor exato 'equipe' é aceito — nada de prefixo ou caixa diferente", () => {
    expect(VISAO_EQUIPE).toBe("equipe");
    for (const valor of ["equipes", "equip", "EQUIPE", "equipe "]) {
      expect(comCrm("OWNER", valor).visao).toBe("pessoal");
    }
    expect(comCrm("OWNER", "equipe").visao).toBe("equipe");
  });

  test("ausência do parâmetro é o padrão pessoal", () => {
    expect(comCrm("OWNER", undefined).visao).toBe("pessoal");
  });
});
