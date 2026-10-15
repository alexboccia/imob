import { describe, test, expect } from "vitest";
import {
  construirWhereImoveis,
  construirWhereClientes,
  construirWhereUsuarios,
  construirWhereAuditoria,
} from "@/lib/listagens-admin-query";
import { sanitizarFiltro, ORIGEM_LABEL, PAPEL_LABEL } from "@/lib/crm-labels";

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

  // Redesenho de Imóveis — achado real (ver comentário em
  // listagens-admin-query.ts): `code` é Postgres `integer` (máx.
  // 2147483647). Uma busca com uma sequência longa de dígitos (CEP colado,
  // telefone, timestamp) não pode mais gerar um `{code: N}` fora desse
  // range — isso lançava PrismaClientKnownRequestError (HTTP 500) antes
  // desta correção.
  test("busca com dígitos fora do range de Int32 não inclui cláusula de código (evita 500 no Prisma)", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "Ordenacao1787391239982" });
    const temCodigo = where.OR!.some((c) => "code" in c);
    expect(temCodigo).toBe(false);
    // Continua buscando por título/cidade/bairro/tipo normalmente.
    const campos = where.OR!.map((c) => Object.keys(c)[0]);
    expect(new Set(campos)).toEqual(new Set(["title", "city", "neighborhood", "type"]));
  });

  test("busca com código exatamente no limite de Int32 ainda inclui a cláusula de código", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "2147483647" });
    const clausulaCodigo = where.OR!.find((c) => "code" in c) as { code: number } | undefined;
    expect(clausulaCodigo?.code).toBe(2147483647);
  });

  test("filtro de status é aplicado quando informado", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "", statusFiltro: "SOLD" });
    expect(where.status).toBe("SOLD");
  });

  test("sem filtro de status, a cláusula não é incluída (não filtra por engano)", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "" });
    expect("status" in where).toBe(false);
  });

  // Redesenho de Imóveis — filtros de tipo/finalidade, expostos como
  // filtro de URL pela primeira vez (mesmo racional de status acima).
  test("filtro de tipo é aplicado quando informado", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "", tipoFiltro: "Cobertura duplex" });
    expect(where.type).toBe("Cobertura duplex");
  });

  test("sem filtro de tipo, a cláusula não é incluída", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "" });
    expect("type" in where).toBe(false);
  });

  test("filtro de finalidade é aplicado quando informado", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "", finalidadeFiltro: "RENT" });
    expect(where.purpose).toBe("RENT");
  });

  test("sem filtro de finalidade, a cláusula não é incluída", () => {
    const where = construirWhereImoveis({ organizationId: "org-a", busca: "" });
    expect("purpose" in where).toBe(false);
  });

  test("status, tipo e finalidade combinam sem se sobrescreverem", () => {
    const where = construirWhereImoveis({
      organizationId: "org-a",
      busca: "",
      statusFiltro: "AVAILABLE",
      tipoFiltro: "Studio",
      finalidadeFiltro: "SALE",
    });
    expect(where.status).toBe("AVAILABLE");
    expect(where.type).toBe("Studio");
    expect(where.purpose).toBe("SALE");
    expect(where.organizationId).toBe("org-a");
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

  // Redesenho da tela de Clientes — filtros por origem (Person.source) e
  // papel (Person.roles), expostos como filtro de URL pela primeira vez.
  test("filtro de origem aplicado só quando informado", () => {
    const comFiltro = construirWhereClientes({ organizationId: "org-a", busca: "", origemFiltro: "WEBSITE" });
    const semFiltro = construirWhereClientes({ organizationId: "org-a", busca: "" });
    expect(comFiltro.source).toBe("WEBSITE");
    expect("source" in semFiltro).toBe(false);
  });

  test("filtro de papel usa `has` (roles é array — Person pode ter mais de um papel)", () => {
    const comFiltro = construirWhereClientes({ organizationId: "org-a", busca: "", papelFiltro: "CLIENT" });
    const semFiltro = construirWhereClientes({ organizationId: "org-a", busca: "" });
    expect(comFiltro.roles).toEqual({ has: "CLIENT" });
    expect("roles" in semFiltro).toBe(false);
  });

  test("estágio, origem e papel combinam sem se sobrescrever", () => {
    const where = construirWhereClientes({
      organizationId: "org-a",
      busca: "",
      estagioFiltro: "CONTACTED",
      origemFiltro: "REFERRAL",
      papelFiltro: "LEAD",
    });
    expect(where.pipelineStage).toBe("CONTACTED");
    expect(where.source).toBe("REFERRAL");
    expect(where.roles).toEqual({ has: "LEAD" });
    expect(where.organizationId).toBe("org-a");
  });
});

// Correção cirúrgica pós-auditoria — reproduz exatamente o que page.tsx faz
// (sanitizarFiltro ANTES de construirWhereClientes) pros 7 cenários que
// causavam PrismaClientValidationError (HTTP 500) antes da correção.
// "nenhum where Prisma inválido é produzido" = nunca um valor fora da
// allowlist sobrevive até aqui.
describe("construirWhereClientes — filtro inválido nunca chega ao where (pipeline sanitizarFiltro + construirWhereClientes)", () => {
  const ORIGENS_VALIDAS = new Set<string>(Object.keys(ORIGEM_LABEL));
  const PAPEIS_VALIDOS = new Set<string>(Object.keys(PAPEL_LABEL));

  function construirComoAPagina(params: { origem?: string; papel?: string }) {
    return construirWhereClientes({
      organizationId: "org-a",
      busca: "",
      origemFiltro: sanitizarFiltro(params.origem, ORIGENS_VALIDAS),
      papelFiltro: sanitizarFiltro(params.papel, PAPEIS_VALIDOS),
    });
  }

  test("A) origem válida sozinha -> aplicada", () => {
    const where = construirComoAPagina({ origem: "WEBSITE" });
    expect(where.source).toBe("WEBSITE");
    expect("roles" in where).toBe(false);
  });

  test("B) origem inválida sozinha -> ignorada, where sem `source`", () => {
    const where = construirComoAPagina({ origem: "GARBAGE" });
    expect("source" in where).toBe(false);
  });

  test("C) papel válido sozinho -> aplicado", () => {
    const where = construirComoAPagina({ papel: "CLIENT" });
    expect(where.roles).toEqual({ has: "CLIENT" });
  });

  test("D) papel inválido sozinho -> ignorado, where sem `roles`", () => {
    const where = construirComoAPagina({ papel: "GARBAGE" });
    expect("roles" in where).toBe(false);
  });

  test("E) origem válida + papel inválido -> só origem aplicada, papel ignorado", () => {
    const where = construirComoAPagina({ origem: "REFERRAL", papel: "GARBAGE" });
    expect(where.source).toBe("REFERRAL");
    expect("roles" in where).toBe(false);
  });

  test("F) origem inválida + papel válido -> só papel aplicado, origem ignorada", () => {
    const where = construirComoAPagina({ origem: "GARBAGE", papel: "LEAD" });
    expect("source" in where).toBe(false);
    expect(where.roles).toEqual({ has: "LEAD" });
  });

  test("G) ambos inválidos -> where só com organizationId, nenhum dos dois aplicado", () => {
    const where = construirComoAPagina({ origem: "GARBAGE", papel: "GARBAGE" });
    expect("source" in where).toBe(false);
    expect("roles" in where).toBe(false);
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

  // Redesenho de Usuários — filtro de status (Ativo/Suspenso) adicionado à
  // barra unificada.
  test("filtro de status aplicado só quando informado", () => {
    const comFiltro = construirWhereUsuarios({ organizationId: "org-a", busca: "", statusFiltro: "SUSPENDED" });
    expect(comFiltro.status).toBe("SUSPENDED");
  });

  test("sem filtro de status, a cláusula status não aparece no where", () => {
    const where = construirWhereUsuarios({ organizationId: "org-a", busca: "" });
    expect("status" in where).toBe(false);
  });

  test("papel e status combinados aplicam os dois filtros ao mesmo tempo", () => {
    const where = construirWhereUsuarios({
      organizationId: "org-a",
      busca: "",
      papelFiltro: "ADMIN",
      statusFiltro: "ACTIVE",
    });
    expect(where.role).toBe("ADMIN");
    expect(where.status).toBe("ACTIVE");
  });
});

describe("construirWhereAuditoria — isolamento, filtros e período", () => {
  test("organizationId está sempre presente, mesmo sem nenhum filtro", () => {
    const where = construirWhereAuditoria({ organizationId: "org-a" });
    expect(where.organizationId).toBe("org-a");
    expect(where.userId).toBeUndefined();
    expect(where.entity).toBeUndefined();
    expect(where.action).toBeUndefined();
    expect(where.createdAt).toBeUndefined();
  });

  test("organizações diferentes nunca produzem o mesmo where, mesmo com filtros idênticos", () => {
    const whereA = construirWhereAuditoria({ organizationId: "org-a", entityFiltro: "Property" });
    const whereB = construirWhereAuditoria({ organizationId: "org-b", entityFiltro: "Property" });
    expect(whereA.organizationId).not.toBe(whereB.organizationId);
  });

  test("filtro de usuário, módulo (entity) e ação são aplicados", () => {
    const where = construirWhereAuditoria({
      organizationId: "org-a",
      userIdFiltro: "user-1",
      entityFiltro: "Property",
      actionFiltro: "deleted",
    });
    expect(where.userId).toBe("user-1");
    expect(where.entity).toBe("Property");
    expect(where.action).toBe("deleted");
  });

  test("período: só 'de' define um piso (gte), sem teto", () => {
    const where = construirWhereAuditoria({ organizationId: "org-a", de: "2026-01-01" });
    const createdAt = where.createdAt as { gte?: Date; lte?: Date };
    expect(createdAt.gte).toBeInstanceOf(Date);
    expect(createdAt.lte).toBeUndefined();
  });

  test("período: 'ate' é o FIM do dia escolhido, não a meia-noite dele", () => {
    const where = construirWhereAuditoria({ organizationId: "org-a", ate: "2026-01-15" });
    const createdAt = where.createdAt as { gte?: Date; lte?: Date };
    // 2026-01-15T23:59:59.999 — um evento às 20h desse dia precisa bater.
    expect(createdAt.lte!.toISOString().startsWith("2026-01-15T23:59:59")).toBe(true);
  });

  test("data inválida ou vazia é ignorada, nunca quebra nem vira filtro vazio", () => {
    const where = construirWhereAuditoria({ organizationId: "org-a", de: "não é uma data", ate: "" });
    expect(where.createdAt).toBeUndefined();
  });

  test("período completo: gte e lte juntos, intervalo fechado", () => {
    const where = construirWhereAuditoria({
      organizationId: "org-a",
      de: "2026-01-01",
      ate: "2026-01-31",
    });
    const createdAt = where.createdAt as { gte?: Date; lte?: Date };
    expect(createdAt.gte!.getTime()).toBeLessThan(createdAt.lte!.getTime());
  });
});
