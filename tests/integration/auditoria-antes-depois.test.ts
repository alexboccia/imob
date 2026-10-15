import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));
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
import { auth } from "@/lib/auth";
import { criarCenario, criarImovel } from "@/test/fixtures";
import { atualizarImovel } from "@/app/app/imoveis/actions";
import { atualizarEstagioFunil } from "@/app/app/clientes/actions";
import { atualizarUsuario, alternarStatusUsuario } from "@/app/app/usuarios/actions";
import { salvarComissaoPadrao } from "@/app/app/configuracoes/comissao-actions";

// =======================================================================
// Logs de Auditoria — histórico antes/depois (Etapa 3)
// =======================================================================
// Clientes (alteração de responsável) JÁ tinha antes/depois antes desta
// fase (assumirContato/atribuirContato, payload deMemberId/paraMemberId)
// — não duplicado aqui. Esta suíte cobre o que foi instrumentado agora:
// Imóveis (preço/status), Usuários (papel/status) e Configurações
// (comissão padrão).

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

function autenticarComo(cenario: Cenario, role = "OWNER") {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function ultimoLog(organizationId: string, entity: string) {
  return prisma.activityLog.findFirst({
    where: { organizationId, entity },
    orderBy: { createdAt: "desc" },
  });
}

describe("antes/depois — Imóveis (preço e status)", () => {
  test("alterar preço grava priceAntes/priceDepois", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await criarImovel({ organizationId: cenario.organization.id, status: "AVAILABLE" });

    const fd = new FormData();
    fd.set("titulo", "Casa Teste");
    fd.set("tipo", "Casa");
    fd.set("finalidade", "SALE");
    fd.set("status", "AVAILABLE");
    fd.set("bairro", "Centro");
    fd.set("cidade", "São Paulo");
    fd.set("estado", "SP");
    fd.set("preco", "500000");
    fd.set("midiasJson", "[]");
    fd.set("materiaisJson", "[]");
    fd.set("locaisProximosJson", "[]");
    fd.set("caracteristicasImovel", "[]");
    fd.set("caracteristicasCondominio", "[]");
    fd.set("lancamento", "false");
    fd.set("destaque", "false");
    fd.set("oportunidade", "false");
    fd.set("slideshow", "false");

    await expect(atualizarImovel(imovel.id, { success: false }, fd)).rejects.toThrow("redirect:");

    const log = await ultimoLog(cenario.organization.id, "Property");
    expect(log!.action).toBe("updated");
    const payload = log!.payload as Record<string, unknown>;
    expect(Number(payload.priceDepois)).toBe(500000);
    expect(payload.priceAntes).not.toBe(payload.priceDepois);
  });

  test("sem mudança real de preço/status: payload vazio ({}), nunca um diff falso", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const imovel = await prisma.property.create({
      data: {
        organizationId: cenario.organization.id,
        title: "Casa Idêntica",
        type: "Casa",
        purpose: "SALE",
        status: "AVAILABLE",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        price: 300000,
      },
    });

    const fd = new FormData();
    fd.set("titulo", "Casa Idêntica");
    fd.set("tipo", "Casa");
    fd.set("finalidade", "SALE");
    fd.set("status", "AVAILABLE");
    fd.set("bairro", "Centro");
    fd.set("cidade", "São Paulo");
    fd.set("estado", "SP");
    fd.set("preco", "300000");
    fd.set("midiasJson", "[]");
    fd.set("materiaisJson", "[]");
    fd.set("locaisProximosJson", "[]");
    fd.set("caracteristicasImovel", "[]");
    fd.set("caracteristicasCondominio", "[]");
    fd.set("lancamento", "false");
    fd.set("destaque", "false");
    fd.set("oportunidade", "false");
    fd.set("slideshow", "false");

    await expect(atualizarImovel(imovel.id, { success: false }, fd)).rejects.toThrow("redirect:");

    const log = await ultimoLog(cenario.organization.id, "Property");
    expect(log!.payload).toEqual({});
  });
});

describe("antes/depois — Usuários (papel e status)", () => {
  test("mudar o papel de um membro grava roleAntes/roleDepois", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const outroUsuario = await prisma.user.create({
      data: { name: "Outro", email: `outro-${Date.now()}@teste.com`, passwordHash: "x" },
    });
    const outroMembro = await prisma.organizationMember.create({
      data: { organizationId: cenario.organization.id, userId: outroUsuario.id, role: "BROKER", status: "ACTIVE" },
    });

    const fd = new FormData();
    fd.set("nome", "Outro Atualizado");
    fd.set("papel", "MANAGER");
    fd.set("ativo", "on");

    await expect(atualizarUsuario(outroMembro.id, { success: false }, fd)).rejects.toThrow("redirect:");

    const log = await ultimoLog(cenario.organization.id, "User");
    const payload = log!.payload as Record<string, unknown>;
    expect(payload.roleAntes).toBe("BROKER");
    expect(payload.roleDepois).toBe("MANAGER");

    await prisma.organizationMember.deleteMany({ where: { id: outroMembro.id } });
    await prisma.user.deleteMany({ where: { id: outroUsuario.id } });
  });

  test("alternarStatusUsuario grava statusAntes/statusDepois", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const outroUsuario = await prisma.user.create({
      data: { name: "Suspenso", email: `suspenso-${Date.now()}@teste.com`, passwordHash: "x" },
    });
    const outroMembro = await prisma.organizationMember.create({
      data: { organizationId: cenario.organization.id, userId: outroUsuario.id, role: "BROKER", status: "ACTIVE" },
    });

    await alternarStatusUsuario(outroMembro.id, false, { success: false }, new FormData());

    const log = await ultimoLog(cenario.organization.id, "User");
    const payload = log!.payload as Record<string, unknown>;
    expect(payload.statusAntes).toBe("ACTIVE");
    expect(payload.statusDepois).toBe("SUSPENDED");

    await prisma.organizationMember.deleteMany({ where: { id: outroMembro.id } });
    await prisma.user.deleteMany({ where: { id: outroUsuario.id } });
  });
});

describe("cobertura adicional — Pipeline (estágio do funil)", () => {
  test("mudar o estágio grava pipelineStageAntes/pipelineStageDepois", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const pessoa = await prisma.person.create({
      data: { organizationId: cenario.organization.id, name: "Lead Teste", pipelineStage: "NEW_LEAD" },
    });

    const fd = new FormData();
    fd.set("estagioFunil", "PROPOSAL");
    await atualizarEstagioFunil(pessoa.id, fd);

    const log = await ultimoLog(cenario.organization.id, "Person");
    expect(log!.action).toBe("pipeline_stage_updated");
    const payload = log!.payload as Record<string, unknown>;
    expect(payload.pipelineStageAntes).toBe("NEW_LEAD");
    expect(payload.pipelineStageDepois).toBe("PROPOSAL");
  });
});

describe("antes/depois — Configurações (comissão padrão)", () => {
  test("salvar um percentual novo grava percentualAntes/percentualDepois, e cobre um módulo antes sem nenhuma auditoria", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);

    const fd1 = new FormData();
    fd1.set("percentualComissaoPadrao", "5");
    await salvarComissaoPadrao({ success: false }, fd1);

    const fd2 = new FormData();
    fd2.set("percentualComissaoPadrao", "8");
    await salvarComissaoPadrao({ success: false }, fd2);

    const log = await ultimoLog(cenario.organization.id, "OrganizationSettings");
    expect(log!.action).toBe("default_commission_percent_updated");
    const payload = log!.payload as Record<string, unknown>;
    expect(payload.percentualAntes).toBe(5);
    expect(payload.percentualDepois).toBe(8);
  });
});
