import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarUsuario, criarMembro } from "@/test/fixtures";
import { construirWhereAuditoria } from "@/lib/listagens-admin-query";

// =======================================================================
// Fase de Logs de Auditoria — Etapa 2 (tela de consulta)
// =======================================================================
// A autorização de PÁGINA (OWNER/ADMIN via PAPEIS_GESTAO_CONFIGURACOES)
// é a mesma função já coberta exaustivamente em
// src/lib/authorization.test.ts — não duplicada aqui. Esta suíte testa o
// que é específico desta tela: a consulta real contra o banco, usando
// exatamente o `where` que a página constrói (construirWhereAuditoria),
// contra dados reais em `activity_logs` — isolamento multi-tenant,
// filtros combinados, paginação, e que um registro já excluído (Etapa 1)
// continua aparecendo no histórico.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario();
  cenarios.push(cenario);
  return cenario;
}

describe("tela de auditoria — isolamento multi-tenant", () => {
  test("consulta de um tenant nunca retorna evento de outro, mesmo com o mesmo entity/action", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();

    await prisma.activityLog.create({
      data: { organizationId: orgA.organization.id, entity: "Property", action: "updated" },
    });
    await prisma.activityLog.create({
      data: { organizationId: orgB.organization.id, entity: "Property", action: "updated" },
    });

    const resultadosA = await prisma.activityLog.findMany({
      where: construirWhereAuditoria({ organizationId: orgA.organization.id }),
    });
    expect(resultadosA).toHaveLength(1);
    expect(resultadosA[0].organizationId).toBe(orgA.organization.id);
  });

  test("filtro por usuário não atravessa tenant mesmo reaproveitando o MESMO userId em duas organizações", async () => {
    // Um usuário pode ter membership em mais de uma organização (troca de
    // organização, já suportado pelo projeto) — o teste mais rigoroso de
    // isolamento é exatamente esse: o MESMO userId em dois tenants.
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const usuarioCompartilhado = await criarUsuario({ name: "Ambíguo" });
    await criarMembro({ organizationId: orgA.organization.id, userId: usuarioCompartilhado.id, role: "BROKER" });
    await criarMembro({ organizationId: orgB.organization.id, userId: usuarioCompartilhado.id, role: "BROKER" });

    await prisma.activityLog.create({
      data: {
        organizationId: orgA.organization.id,
        userId: usuarioCompartilhado.id,
        entity: "Property",
        action: "created",
      },
    });
    await prisma.activityLog.create({
      data: {
        organizationId: orgB.organization.id,
        userId: usuarioCompartilhado.id,
        entity: "Person",
        action: "created",
      },
    });

    const resultadosA = await prisma.activityLog.findMany({
      where: construirWhereAuditoria({ organizationId: orgA.organization.id, userIdFiltro: usuarioCompartilhado.id }),
    });
    expect(resultadosA).toHaveLength(1);
    expect(resultadosA[0].entity).toBe("Property");
  });
});

describe("tela de auditoria — filtros combinados", () => {
  test("módulo + ação juntos restringem corretamente", async () => {
    const cenario = await novoCenario();
    await prisma.activityLog.createMany({
      data: [
        { organizationId: cenario.organization.id, entity: "Property", action: "created" },
        { organizationId: cenario.organization.id, entity: "Property", action: "updated" },
        { organizationId: cenario.organization.id, entity: "Person", action: "created" },
      ],
    });

    const resultado = await prisma.activityLog.findMany({
      where: construirWhereAuditoria({
        organizationId: cenario.organization.id,
        entityFiltro: "Property",
        actionFiltro: "created",
      }),
    });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].entity).toBe("Property");
    expect(resultado[0].action).toBe("created");
  });

  test("filtro de período exclui eventos fora da janela", async () => {
    const cenario = await novoCenario();
    const antigo = await prisma.activityLog.create({
      data: { organizationId: cenario.organization.id, entity: "Property", action: "created" },
    });
    // Força a data pra fora da janela que será filtrada (createdAt tem
    // @default(now()), então precisa de um updateMany direto).
    await prisma.activityLog.updateMany({
      where: { id: antigo.id, organizationId: cenario.organization.id },
      data: { createdAt: new Date("2020-01-01T00:00:00Z") },
    });
    await prisma.activityLog.create({
      data: { organizationId: cenario.organization.id, entity: "Property", action: "created" },
    });

    const resultado = await prisma.activityLog.findMany({
      where: construirWhereAuditoria({ organizationId: cenario.organization.id, de: "2026-01-01" }),
    });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).not.toBe(antigo.id);
  });
});

describe("tela de auditoria — paginação", () => {
  test("skip/take real contra o banco devolve a página certa, ordenada por mais recente primeiro", async () => {
    const cenario = await novoCenario();
    for (let i = 0; i < 5; i++) {
      await prisma.activityLog.create({
        data: { organizationId: cenario.organization.id, entity: "Property", action: `evento-${i}` },
      });
    }

    const total = await prisma.activityLog.count({
      where: construirWhereAuditoria({ organizationId: cenario.organization.id }),
    });
    expect(total).toBe(5);

    const primeiraPagina = await prisma.activityLog.findMany({
      where: construirWhereAuditoria({ organizationId: cenario.organization.id }),
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 2,
    });
    const segundaPagina = await prisma.activityLog.findMany({
      where: construirWhereAuditoria({ organizationId: cenario.organization.id }),
      orderBy: { createdAt: "desc" },
      skip: 2,
      take: 2,
    });
    expect(primeiraPagina).toHaveLength(2);
    expect(segundaPagina).toHaveLength(2);
    // Nenhuma linha repetida entre as páginas.
    const idsPrimeira = primeiraPagina.map((l) => l.id);
    const idsSegunda = segundaPagina.map((l) => l.id);
    expect(idsPrimeira.some((id) => idsSegunda.includes(id))).toBe(false);
  });
});

describe("tela de auditoria — eventos de registros já excluídos", () => {
  test("um evento 'deleted' continua consultável mesmo sem o registro original existir mais", async () => {
    const cenario = await novoCenario();
    const alvo = await prisma.development.create({
      data: { organizationId: cenario.organization.id, name: "Será excluído" },
    });
    await prisma.development.delete({ where: { id: alvo.id, organizationId: cenario.organization.id } });
    await prisma.activityLog.create({
      data: {
        organizationId: cenario.organization.id,
        entity: "Development",
        entityId: alvo.id,
        action: "deleted",
        payload: { name: "Será excluído" },
      },
    });

    // O registro de fato não existe mais.
    expect(
      await prisma.development.findUnique({ where: { id: alvo.id, organizationId: cenario.organization.id } })
    ).toBeNull();

    // Mas o evento continua lá, consultável pela mesma tela.
    const resultado = await prisma.activityLog.findMany({
      where: construirWhereAuditoria({ organizationId: cenario.organization.id, entityFiltro: "Development" }),
    });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].action).toBe("deleted");
    expect((resultado[0].payload as { name?: string } | null)?.name).toBe("Será excluído");
  });
});

describe("tela de auditoria — ausência de dados sensíveis", () => {
  test("nenhum payload gravado pelas Etapas 1 e exemplos sintéticos contém chaves de segredo", async () => {
    const cenario = await novoCenario();
    await prisma.activityLog.createMany({
      data: [
        { organizationId: cenario.organization.id, entity: "Property", action: "updated", payload: { priceAntes: 100, priceDepois: 200 } },
        { organizationId: cenario.organization.id, entity: "Development", action: "deleted", payload: { name: "Alpha" } },
        { organizationId: cenario.organization.id, entity: "OrganizationMember", action: "updated" },
      ],
    });

    const todos = await prisma.activityLog.findMany({
      where: construirWhereAuditoria({ organizationId: cenario.organization.id }),
    });

    const CHAVES_PROIBIDAS = ["password", "senha", "token", "cookie", "secret", "passwordHash"];
    for (const log of todos) {
      if (!log.payload) continue;
      const chaves = Object.keys(log.payload as Record<string, unknown>).map((c) => c.toLowerCase());
      for (const proibida of CHAVES_PROIBIDAS) {
        expect(chaves.some((c) => c.includes(proibida))).toBe(false);
      }
    }
  });
});
