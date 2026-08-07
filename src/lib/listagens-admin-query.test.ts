import { describe, test, expect } from "vitest";
import {
  construirWhereImoveis,
  construirWhereClientes,
  construirWhereUsuarios,
} from "@/lib/listagens-admin-query";

describe("construirWhereImoveis — isolamento de tenant", () => {
  test("organizationId está sempre presente no where", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "" });
    expect(where.organizationId).toBe("org-a");
  });

  test("organizações diferentes nunca produzem o mesmo where, mesmo com busca/filtro idênticos", () => {
    const whereA = construirWhereImoveis({ organizationId: "org-a", busca: "apartamento", statusFiltro: "AVAILABLE" });
    const whereB = construirWhereImoveis({ organizationId: "org-b", busca: "apartamento", statusFiltro: "AVAILABLE" });
    expect(whereA.organizationId).not.toBe(whereB.organizationId);
    expect(whereA.organizationId).toBe("org-a");
    expect(whereB.organizationId).toBe("org-b");
  });

  test("busca vazia não adiciona cláusula OR (evita filtro caro desnecessário)", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "" });
    expect("OR" in where).toBe(false);
  });
});

describe("construirWhereImoveis — filtros funcionam", () => {
  test("busca de texto vira OR case-insensitive em título/cidade/bairro/tipo", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "Pinheiros" });
    expect(Array.isArray(where.OR)).toBeTruthy();
    const campos = where.OR!.map((c) => Object.keys(c)[0]);
    expect(new Set(campos)).toEqual(new Set(["title", "city", "neighborhood", "type"]));
    for (const clausula of where.OR!) {
      const valor = Object.values(clausula)[0] as { mode?: string };
      if ("mode" in valor) expect(valor.mode).toBe("insensitive");
    }
  });

  test("busca numérica também tenta casar com o código do imóvel", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "100234" });
    const temCodigo = where.OR!.some((c) => "code" in c);
    expect(temCodigo).toBe(true);
  });

  test("filtro de status é aplicado quando informado", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "", statusFiltro: "SOLD" });
    expect(where.status).toBe("SOLD");
  });

  test("sem filtro de status, a cláusula não é incluída (não filtra por engano)", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "" });
    expect("status" in where).toBe(false);
  });
});

describe("construirWhereClientes — isolamento e filtros", () => {
  test("organizationId sempre presente", () => {
    const where = construirWhereClientes({ organizationId: "org-a", busca: "" });
    expect(where.organizationId).toBe("org-a");
  });

  test("filtro de estágio do funil aplicado só quando informado", () => {
    const comFiltro = construirWhereClientes({ organizationId: "org-a", busca: "", estagioFiltro: "PROPOSAL" });
    const semFiltro = construirWhereClientes({ organizationId: "org-a", busca: "" });
    expect(comFiltro.pipelineStage).toBe("PROPOSAL");
    expect("pipelineStage" in semFiltro).toBe(false);
  });

  test("busca cobre nome/e-mail/telefone, nunca dados de outra organização", () => {
    const where = construirWhereClientes({ organizationId: "org-a", busca: "joão" });
    const campos = where.OR!.map((c) => Object.keys(c)[0]);
    expect(new Set(campos)).toEqual(new Set(["name", "email", "phone"]));
    expect(where.organizationId).toBe("org-a");
  });
});

describe("construirWhereUsuarios — isolamento e filtros", () => {
  test("organizationId sempre presente", () => {
    const where = construirWhereUsuarios({ organizationId: "org-a", busca: "" });
    expect(where.organizationId).toBe("org-a");
  });

  test("filtro de papel aplicado só quando informado", () => {
    const comFiltro = construirWhereUsuarios({ organizationId: "org-a", busca: "", papelFiltro: "BROKER" });
    expect(comFiltro.role).toBe("BROKER");
  });

  test("busca é aplicada nos campos do usuário relacionado (nome/e-mail)", () => {
    const where = construirWhereUsuarios({ organizationId: "org-a", busca: "maria" });
    expect(where.user).toBeTruthy();
    const userWhere = where.user as { OR?: unknown[] };
    expect(userWhere.OR?.length).toBe(2);
  });
});
