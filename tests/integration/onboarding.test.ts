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
import { criarCenario, criarImovel, criarUsuario, criarMembro } from "@/test/fixtures";
import { buscarOnboarding } from "@/lib/onboarding";

// =======================================================================
// Primeiros passos (Fase 26) — estado DERIVADO, nunca persistido
// =======================================================================

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const usuariosAvulsos: string[] = [];

afterEach(async () => {
  for (const id of usuariosAvulsos.splice(0)) {
    await prisma.organizationMember.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(limites?: Record<string, number | null>): Promise<Cenario> {
  const cenario = await criarCenario({
    modulos: ["core", "properties", "crm"],
    ...(limites ? { limites } : {}),
  });
  cenarios.push(cenario);
  return cenario;
}

const passo = (dados: Awaited<ReturnType<typeof buscarOnboarding>>, chave: string) =>
  dados.passos.find((p) => p.chave === chave);

describe("derivação dos primeiros passos", () => {
  test("organização recém-criada tem tudo pendente", async () => {
    const cenario = await novoCenario();
    const dados = await buscarOnboarding(cenario.organization.id, "OWNER");

    expect(passo(dados, "dados")?.concluido).toBe(false);
    expect(passo(dados, "imovel")?.concluido).toBe(false);
    expect(passo(dados, "site")?.concluido).toBe(false);
    expect(dados.pendentes).toBeGreaterThan(0);
  });

  test("uma forma de contato já conclui o passo de dados", async () => {
    const cenario = await novoCenario();
    // Telefone OU e-mail OU WhatsApp: o mínimo para o site servir para
    // alguma coisa é o visitante conseguir chamar.
    await prisma.organizationSettings.create({
      data: { organizationId: cenario.organization.id, whatsapp: "11999990000" },
    });

    expect(passo(await buscarOnboarding(cenario.organization.id, "OWNER"), "dados")?.concluido).toBe(true);
  });

  test("o primeiro imóvel conclui o passo do imóvel", async () => {
    const cenario = await novoCenario();
    expect(passo(await buscarOnboarding(cenario.organization.id, "OWNER"), "imovel")?.concluido).toBe(
      false
    );

    await criarImovel({ organizationId: cenario.organization.id });

    expect(passo(await buscarOnboarding(cenario.organization.id, "OWNER"), "imovel")?.concluido).toBe(true);
  });

  test("o logotipo conclui o passo do site", async () => {
    const cenario = await novoCenario();
    await prisma.organizationSettings.create({
      data: { organizationId: cenario.organization.id, logoUrl: "https://exemplo.test/logo.png" },
    });

    expect(passo(await buscarOnboarding(cenario.organization.id, "OWNER"), "site")?.concluido).toBe(true);
  });

  test("o estado se DESMARCA quando o fato deixa de valer", async () => {
    const cenario = await novoCenario();
    const config = await prisma.organizationSettings.create({
      data: { organizationId: cenario.organization.id, logoUrl: "https://exemplo.test/logo.png" },
    });
    expect(passo(await buscarOnboarding(cenario.organization.id, "OWNER"), "site")?.concluido).toBe(true);

    // organizationId explícito: a guarda de tenant exige isso em toda
    // operação de model multi-tenant, inclusive num teste.
    await prisma.organizationSettings.updateMany({
      where: { id: config.id, organizationId: cenario.organization.id },
      data: { logoUrl: null },
    });

    // É a consequência de derivar em vez de persistir: apagar o logotipo
    // volta o passo a pendente. Um booleano salvo diria "site
    // personalizado" para sempre.
    expect(passo(await buscarOnboarding(cenario.organization.id, "OWNER"), "site")?.concluido).toBe(false);
  });

  test("o passo de equipe NÃO aparece quando o plano permite um só usuário", async () => {
    // É o plano de entrada do self-service. Oferecer "convide sua
    // equipe" ali levaria a pessoa a uma parede: o próprio enforcement
    // de limite recusaria o convite.
    const cenario = await novoCenario({ USERS: 1 });
    const dados = await buscarOnboarding(cenario.organization.id, "OWNER");
    expect(passo(dados, "equipe")).toBeUndefined();
  });

  test("com plano que permite equipe, o passo aparece e conclui com um convite pendente", async () => {
    const cenario = await novoCenario({ USERS: 5 });
    expect(passo(await buscarOnboarding(cenario.organization.id, "OWNER"), "equipe")?.concluido).toBe(
      false
    );

    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membro = await criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { status: "INVITED" },
    });

    // Convite pendente JÁ conta: a pessoa fez a parte dela: quem falta
    // agir é a outra.
    expect(passo(await buscarOnboarding(cenario.organization.id, "OWNER"), "equipe")?.concluido).toBe(true);
  });

  test("tudo concluído zera as pendências — a lista some sozinha", async () => {
    const cenario = await novoCenario({ USERS: 1 });
    await prisma.organizationSettings.create({
      data: {
        organizationId: cenario.organization.id,
        whatsapp: "11999990000",
        logoUrl: "https://exemplo.test/logo.png",
      },
    });
    await criarImovel({ organizationId: cenario.organization.id });

    const dados = await buscarOnboarding(cenario.organization.id, "OWNER");
    expect(dados.pendentes).toBe(0);
  });

  test("os passos são da organização ATUAL, não vazam entre tenants", async () => {
    const configurada = await novoCenario();
    const vazia = await novoCenario();
    await criarImovel({ organizationId: configurada.organization.id });

    expect(passo(await buscarOnboarding(configurada.organization.id, "OWNER"), "imovel")?.concluido).toBe(
      true
    );
    expect(passo(await buscarOnboarding(vazia.organization.id, "OWNER"), "imovel")?.concluido).toBe(false);
  });
});

// =======================================================================
// Fase 108 — os passos não oferecem uma porta que o próprio papel do
// viewer não pode abrir
// =======================================================================
// "Complete os dados da imobiliária" e "Personalize seu site" levam a
// /app/configuracoes (PAPEIS_GESTAO_CONFIGURACOES: OWNER/ADMIN); "Convide
// sua equipe" leva a /app/usuarios (PAPEIS_GESTAO_USUARIOS: OWNER/ADMIN).
// Antes desta fase, buscarOnboarding ignorava quem estava vendo: um
// BROKER seguindo "Complete os dados" caía na tela de acesso negado de
// Configurações, e seguindo "Convide sua equipe" chegava a Usuários sem
// o botão de convite correspondente — a mesma armadilha que o menu
// lateral já evita deliberadamente (Fase 25).
describe("os passos respeitam o papel de quem está vendo", () => {
  test("BROKER não vê os passos que levam a Configurações nem a Usuários", async () => {
    const cenario = await novoCenario({ USERS: 5 });

    const paraOwner = await buscarOnboarding(cenario.organization.id, "OWNER");
    expect(passo(paraOwner, "dados")).toBeDefined();
    expect(passo(paraOwner, "site")).toBeDefined();
    expect(passo(paraOwner, "equipe")).toBeDefined();

    const paraBroker = await buscarOnboarding(cenario.organization.id, "BROKER");
    expect(passo(paraBroker, "dados")).toBeUndefined();
    expect(passo(paraBroker, "site")).toBeUndefined();
    expect(passo(paraBroker, "equipe")).toBeUndefined();
    // "Cadastre seu primeiro imóvel" continua oferecido — não exige papel
    // administrativo nenhum, só vínculo ativo.
    expect(passo(paraBroker, "imovel")).toBeDefined();
  });

  test("ADMIN vê os mesmos passos que OWNER", async () => {
    const cenario = await novoCenario({ USERS: 5 });
    const paraAdmin = await buscarOnboarding(cenario.organization.id, "ADMIN");
    expect(passo(paraAdmin, "dados")).toBeDefined();
    expect(passo(paraAdmin, "site")).toBeDefined();
    expect(passo(paraAdmin, "equipe")).toBeDefined();
  });

  test("sem papel (vínculo inativo) não vê nenhum passo administrativo", async () => {
    const cenario = await novoCenario({ USERS: 5 });
    const dados = await buscarOnboarding(cenario.organization.id, undefined);
    expect(passo(dados, "dados")).toBeUndefined();
    expect(passo(dados, "equipe")).toBeUndefined();
    expect(passo(dados, "imovel")).toBeDefined();
  });

  test("pendentes é contado só sobre os passos VISÍVEIS para o papel", async () => {
    // Tudo pendente para um OWNER, mas um BROKER só vê o passo de
    // imóvel — a contagem de pendências não pode mentir sobre o que a
    // própria pessoa não tem como resolver.
    const cenario = await novoCenario({ USERS: 5 });
    const paraBroker = await buscarOnboarding(cenario.organization.id, "BROKER");
    expect(paraBroker.passos).toHaveLength(1);
    expect(paraBroker.pendentes).toBe(1);
  });
});
