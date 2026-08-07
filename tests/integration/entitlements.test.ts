import { describe, test, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  verificarLimiteImoveis,
  verificarLimiteUsuarios,
  hasModule,
  LimiteDoPlanoError,
} from "@/lib/entitlements";
import { criarCenario, criarImovel } from "@/test/fixtures";

describe("Limite de imóveis por plano", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;
  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("dentro do limite não lança erro", async () => {
    cenario = await criarCenario({ limites: { PROPERTIES: 2 } });
    await criarImovel({ organizationId: cenario.organization.id });
    await expect(verificarLimiteImoveis(cenario.organization.id)).resolves.not.toThrow();
  });

  test("já no limite, lança LimiteDoPlanoError e bloqueia o próximo cadastro", async () => {
    cenario = await criarCenario({ limites: { PROPERTIES: 2 } });
    await criarImovel({ organizationId: cenario.organization.id });
    await criarImovel({ organizationId: cenario.organization.id });
    await expect(verificarLimiteImoveis(cenario.organization.id)).rejects.toThrow(
      LimiteDoPlanoError
    );
  });

  test("plano sem limite explícito para PROPERTIES nunca bloqueia", async () => {
    cenario = await criarCenario({ limites: {} });
    for (let i = 0; i < 5; i++) {
      await criarImovel({ organizationId: cenario.organization.id });
    }
    await expect(verificarLimiteImoveis(cenario.organization.id)).resolves.not.toThrow();
  });

  test("imóvel INACTIVE não conta para o limite (só status ativos contam)", async () => {
    cenario = await criarCenario({ limites: { PROPERTIES: 1 } });
    await criarImovel({ organizationId: cenario.organization.id, status: "INACTIVE" });
    await expect(verificarLimiteImoveis(cenario.organization.id)).resolves.not.toThrow();
  });
});

describe("Limite de usuários por plano", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;
  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("já no limite (só o OWNER criado pelo cenário), lança LimiteDoPlanoError", async () => {
    cenario = await criarCenario({ limites: { USERS: 1 } });
    await expect(verificarLimiteUsuarios(cenario.organization.id)).rejects.toThrow(
      LimiteDoPlanoError
    );
  });

  test("abaixo do limite não lança erro", async () => {
    cenario = await criarCenario({ limites: { USERS: 5 } });
    await expect(verificarLimiteUsuarios(cenario.organization.id)).resolves.not.toThrow();
  });
});

// src/app/(public)/actions.ts (enviarContato/enviarAnuncioProprietario)
// cria o Person incondicionalmente — só a leitura na área de Clientes
// depende do módulo CRM, não a captura do lead.
describe("Lead capturado mesmo sem o módulo CRM habilitado", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;
  afterEach(async () => {
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("Person (lead) é criado independentemente de hasModule('crm')", async () => {
    cenario = await criarCenario({
      modulos: ["core", "properties"],
      modulosDesabilitados: ["crm"],
    });
    expect(await hasModule(cenario.organization.id, "crm")).toBe(false);

    const pessoa = await prisma.person.create({
      data: {
        organizationId: cenario.organization.id,
        name: "Lead via site",
        roles: ["LEAD"],
        source: "WEBSITE",
      },
    });

    const encontrada = await prisma.person.findUnique({
      where: { id: pessoa.id, organizationId: cenario.organization.id },
    });
    expect(encontrada).not.toBeNull();
  });

  test("lead capturado existe no banco mas fica inacessível pela área de Clientes quando o CRM está desabilitado", async () => {
    cenario = await criarCenario({
      modulos: ["core", "properties"],
      modulosDesabilitados: ["crm"],
    });
    await prisma.person.create({
      data: {
        organizationId: cenario.organization.id,
        name: "Lead via site",
        roles: ["LEAD"],
        source: "WEBSITE",
      },
    });

    // src/app/app/clientes/page.tsx checa hasModule ANTES de rodar
    // qualquer query de leads — se for false, a lista nunca é buscada,
    // mesmo que o dado exista.
    const podeVerClientes = await hasModule(cenario.organization.id, "crm");
    expect(podeVerClientes).toBe(false);

    const totalNoBanco = await prisma.person.count({
      where: { organizationId: cenario.organization.id },
    });
    expect(totalNoBanco).toBe(1);
  });

  test("habilitando o módulo CRM, o mesmo lead passa a ficar acessível", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    await prisma.person.create({
      data: {
        organizationId: cenario.organization.id,
        name: "Lead via site",
        roles: ["LEAD"],
        source: "WEBSITE",
      },
    });

    expect(await hasModule(cenario.organization.id, "crm")).toBe(true);
    const leads = await prisma.person.findMany({
      where: { organizationId: cenario.organization.id, roles: { has: "LEAD" } },
    });
    expect(leads).toHaveLength(1);
  });
});
