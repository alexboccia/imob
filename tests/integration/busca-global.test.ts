import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { auth } from "@/lib/auth";
import { criarCenario, criarPessoa, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import { buscarGlobal } from "@/lib/busca-global";

// =======================================================================
// Busca global (Fase 86)
// =======================================================================
// buscarGlobal reusa construirWhereClientes/construirWhereImoveis (já
// testadas em listagens-admin-query.test.ts) — esta suíte prova a
// COMPOSIÇÃO: tenant, módulo CRM e escopo comercial aplicados
// corretamente na camada que os junta, e os limites/mínimo de caracteres
// que só existem aqui.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(
  opcoes: { visibilidade?: "COLLABORATIVE" | "RESTRICTED"; modulosDesabilitados?: string[] } = {}
): Promise<Cenario> {
  const crmDesabilitado = opcoes.modulosDesabilitados?.includes("crm") ?? false;
  const cenario = await criarCenario({
    modulos: crmDesabilitado ? ["core", "properties"] : ["core", "properties", "crm"],
    modulosDesabilitados: opcoes.modulosDesabilitados,
  });
  cenarios.push(cenario);
  if (opcoes.visibilidade) {
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { commercialVisibility: opcoes.visibilidade },
    });
  }
  return cenario;
}

async function membro(cenario: Cenario, nome: string, role = "BROKER") {
  const usuario = await criarUsuario({ name: nome });
  const m = await criarMembro({ organizationId: cenario.organization.id, userId: usuario.id, role: role as "BROKER" });
  return { ...m, userId: usuario.id };
}

function autenticarComo(cenario: Cenario, m: { id: string; userId: string }, role = "OWNER") {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: m.userId,
      organizationId: cenario.organization.id,
      organizationMemberId: m.id,
      role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("mínimo de caracteres", () => {
  test("com menos de 2 caracteres não consulta o banco — devolve vazio", async () => {
    const c = await novoCenario();
    const dono = await membro(c, "Dono");
    autenticarComo(c, dono);
    await criarPessoa({ organizationId: c.organization.id, name: "Ana Silva" });

    const r = await buscarGlobal(c.organization.id, "a");
    expect(r.clientes).toHaveLength(0);
    expect(r.imoveis).toHaveLength(0);
  });
});

describe("clientes", () => {
  test("busca por nome, telefone e e-mail", async () => {
    const c = await novoCenario();
    const dono = await membro(c, "Dono");
    autenticarComo(c, dono);
    await criarPessoa({
      organizationId: c.organization.id,
      name: "Ana Busca Global",
      phone: "11999998888",
      email: "ana.busca@e2e.test",
    });

    expect((await buscarGlobal(c.organization.id, "Ana Busca")).clientes).toHaveLength(1);
    expect((await buscarGlobal(c.organization.id, "99998888")).clientes).toHaveLength(1);
    expect((await buscarGlobal(c.organization.id, "ana.busca@e2e.test")).clientes).toHaveLength(1);
    expect((await buscarGlobal(c.organization.id, "Nome Que Nunca Existe")).clientes).toHaveLength(0);
  });

  // Fase 129 — achado real: o teste acima guarda o telefone já SEM
  // máscara ("11999998888"), mas isso nunca é o que fica gravado por um
  // cadastro feito pela UI de verdade. `CampoTelefone` (o único campo de
  // telefone do produto) formata ao vivo com `formatarTelefone`, então
  // `Person.phone` sai do formulário como "(11) 99999-8888" — nunca os
  // dígitos crus. A busca (aqui e em /app/clientes, mesmo
  // construirWhereClientes) faz `contains` direto em `phone`, nunca em
  // `phoneNormalized` (que existe só para dedup, person-dedup.ts). Um
  // corretor que cole o número de outro sistema/discador sem máscara
  // não encontra o cliente que ele sabe que existe.
  test("telefone armazenado COM máscara (como a UI real grava) não é encontrado buscando só os dígitos", async () => {
    const c = await novoCenario();
    const dono = await membro(c, "Dono");
    autenticarComo(c, dono);
    await criarPessoa({
      organizationId: c.organization.id,
      name: "Bruno Busca Mascara",
      phone: "(11) 99999-8888",
    });

    // Com a máscara, busca normalmente.
    expect((await buscarGlobal(c.organization.id, "(11) 99999-8888")).clientes).toHaveLength(1);
    // Só dígitos — o mesmo número, a forma mais natural de colar de
    // outro lugar — não encontra.
    expect((await buscarGlobal(c.organization.id, "11999998888")).clientes).toHaveLength(1);
  });

  test("módulo CRM desabilitado: clientes nunca aparecem, imóveis continuam", async () => {
    const c = await novoCenario({ modulosDesabilitados: ["crm"] });
    const dono = await membro(c, "Dono");
    autenticarComo(c, dono);
    await criarPessoa({ organizationId: c.organization.id, name: "Cliente Sem Crm" });
    await criarImovel({ organizationId: c.organization.id, title: "Imovel Sem Crm Busca" });

    const r = await buscarGlobal(c.organization.id, "Sem Crm");
    expect(r.clientes).toHaveLength(0);
    expect(r.imoveis).toHaveLength(1);
    // Fase 87 — crmHabilitado reflete o mesmo hasModule já usado para
    // filtrar clientes: é o que o cliente usa para decidir se mostra o
    // atalho "Ver clientes" (imóvel → #clientes-compativeis), que sem o
    // módulo não existiria na ficha de destino.
    expect(r.crmHabilitado).toBe(false);
  });

  test("crmHabilitado é true quando o módulo está ativo (Fase 87 — atalho 'Ver clientes')", async () => {
    const c = await novoCenario();
    const dono = await membro(c, "Dono");
    autenticarComo(c, dono);
    await criarImovel({ organizationId: c.organization.id, title: "Imovel Com Crm Busca" });

    const r = await buscarGlobal(c.organization.id, "Com Crm Busca");
    expect(r.crmHabilitado).toBe(true);
  });

  test("escopo comercial RESTRICTED: corretor não encontra cliente de outro corretor", async () => {
    const c = await novoCenario({ visibilidade: "RESTRICTED" });
    const bruno = await membro(c, "Bruno");
    const carla = await membro(c, "Carla");
    const pessoaDeCarla = await criarPessoa({
      organizationId: c.organization.id,
      name: "Cliente Escopo Restrito",
    });
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await prisma.propertyInterest.create({
      data: {
        organizationId: c.organization.id,
        personId: pessoaDeCarla.id,
        propertyId: imovel.id,
        responsibleMemberId: carla.id,
      },
    });

    autenticarComo(c, bruno, "BROKER");
    expect((await buscarGlobal(c.organization.id, "Cliente Escopo")).clientes).toHaveLength(0);

    autenticarComo(c, carla, "BROKER");
    expect((await buscarGlobal(c.organization.id, "Cliente Escopo")).clientes).toHaveLength(1);
  });

  test("limite de 5 por categoria, mesmo com mais correspondências", async () => {
    const c = await novoCenario();
    const dono = await membro(c, "Dono");
    autenticarComo(c, dono);
    for (let i = 0; i < 7; i++) {
      await criarPessoa({ organizationId: c.organization.id, name: `Cliente Limite ${i}` });
    }
    const r = await buscarGlobal(c.organization.id, "Cliente Limite");
    expect(r.clientes).toHaveLength(5);
  });
});

describe("imóveis", () => {
  test("busca por título, cidade, bairro e código", async () => {
    const c = await novoCenario();
    const dono = await membro(c, "Dono");
    autenticarComo(c, dono);
    const imovel = await criarImovel({
      organizationId: c.organization.id,
      title: "Apartamento Busca Global Teste",
      city: "São Paulo",
      neighborhood: "Bairro Busca Global",
    });
    const linha = await withOrganization(c.organization.id, () =>
      prisma.property.findUniqueOrThrow({
        where: { id: imovel.id, organizationId: c.organization.id },
        select: { code: true },
      })
    );

    expect((await buscarGlobal(c.organization.id, "Busca Global Teste")).imoveis).toHaveLength(1);
    expect((await buscarGlobal(c.organization.id, "Bairro Busca Global")).imoveis).toHaveLength(1);
    expect((await buscarGlobal(c.organization.id, String(linha.code))).imoveis).toHaveLength(1);
  });

  test("imóveis não são filtrados por escopo comercial (inventário é da organização)", async () => {
    const c = await novoCenario({ visibilidade: "RESTRICTED" });
    const bruno = await membro(c, "Bruno");
    await criarImovel({ organizationId: c.organization.id, title: "Imovel De Ninguem Busca" });

    autenticarComo(c, bruno, "BROKER");
    expect((await buscarGlobal(c.organization.id, "Ninguem Busca")).imoveis).toHaveLength(1);
  });
});

describe("isolamento entre organizações", () => {
  test("cliente e imóvel de B nunca aparecem na busca de A", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const donoA = await membro(a, "Dono A");
    autenticarComo(a, donoA);

    await criarPessoa({ organizationId: b.organization.id, name: "Cliente Isolamento Busca" });
    await criarImovel({ organizationId: b.organization.id, title: "Imovel Isolamento Busca" });

    const r = await buscarGlobal(a.organization.id, "Isolamento Busca");
    expect(r.clientes).toHaveLength(0);
    expect(r.imoveis).toHaveLength(0);
  });
});
