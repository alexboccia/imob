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

class RedirecionouError extends Error {
  constructor(public destino: string) {
    super(`redirect:${destino}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new RedirecionouError(destino);
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  criarCenario,
  criarUsuario,
  criarMembro,
  criarImovel,
  criarSubscriptionTrial,
} from "@/test/fixtures";
import type { OrganizationRole } from "@/generated/prisma/client";
import { buscarAssinaturaOrganizacao } from "@/lib/assinatura-organizacao";
import { requireOrganizationId, requireOrganizationIdParaAssinatura } from "@/lib/tenant";
import { papelAtual } from "@/lib/papel-atual";
import { temPapel, PAPEIS_FINANCEIRO } from "@/lib/authorization";

// =======================================================================
// Assinatura (Fase 27) — contra o banco
// =======================================================================
// O domínio financeiro AINDA NÃO COBRA: não há provedor, checkout nem
// writer de Invoice/Payment. O que estes testes prendem é o que já é
// verdade e precisa continuar sendo: o estado é lido do banco, o trial
// expirado não vira beco sem saída, e a autorização financeira usa o
// papel EFETIVO desde o primeiro commit.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const usuariosAvulsos: string[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  for (const id of usuariosAvulsos.splice(0)) {
    await prisma.organizationMember.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  while (cenarios.length) await cenarios.pop()!.destruir();
});

// criarCenario NÃO cria Subscription — quem cria o período de trial no
// produto é o bootstrap da organização, e nos testes é uma fixture
// própria. O helper reproduz esse par para que o cenário represente um
// estado que o produto de fato produz.
async function novoCenario(opcoes: Parameters<typeof criarCenario>[0] = {}): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"], ...opcoes });
  cenarios.push(cenario);
  if (opcoes.isTrial) {
    const agora = new Date();
    await criarSubscriptionTrial({
      organizationId: cenario.organization.id,
      planId: cenario.plano.id,
      currentPeriodStart: agora,
      currentPeriodEnd: new Date(
        agora.getTime() + (opcoes.trialDays ?? 14) * 24 * 60 * 60 * 1000
      ),
    });
  }
  return cenario;
}

// FIDELIDADE DE FIXTURE (regra da Fase 27): se o teste afirma que a
// pessoa tem o papel X, o vínculo no banco precisa ter o papel X.
async function autenticarComo(cenario: Cenario, role: OrganizationRole = "OWNER") {
  await prisma.organizationMember.updateMany({
    where: { id: cenario.membro.id, organizationId: cenario.organization.id },
    data: { role },
  });
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role,
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function destinoDoRedirect(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (erro) {
    if (erro instanceof RedirecionouError) return erro.destino;
    throw erro;
  }
}

describe("estado do contrato", () => {
  test("organização em trial mostra plano, preço e prazo — tudo do banco", async () => {
    const cenario = await novoCenario({ isTrial: true, trialDays: 14, priceMonthlyCents: 0 });
    const assinatura = await buscarAssinaturaOrganizacao(cenario.organization.id);

    expect(assinatura.emTrial).toBe(true);
    expect(assinatura.status).toBe("TRIALING");
    expect(assinatura.statusRotulo).toBe("Período de avaliação");
    expect(assinatura.trialTerminaEmISO).not.toBeNull();
    expect(assinatura.trialExpirado).toBe(false);
    // Moeda vem do domínio, nunca do cliente.
    expect(assinatura.moeda).toBe("BRL");
  });

  test("preço ausente é ausência, nunca R$ 0,00", async () => {
    const cenario = await novoCenario({ priceMonthlyCents: null });
    const assinatura = await buscarAssinaturaOrganizacao(cenario.organization.id);
    expect(assinatura.precoMensalFormatado).toBeNull();
  });

  test("plano pago sem Subscription diz ausência, nunca 'ativa'", async () => {
    // É o estado real de toda organização em plano pago hoje: nenhum
    // fluxo cria Subscription para plano não-trial. Afirmar ACTIVE aqui
    // seria inventar um contrato que não existe.
    const cenario = await novoCenario({ isTrial: false, priceMonthlyCents: 9900 });
    const assinatura = await buscarAssinaturaOrganizacao(cenario.organization.id);

    expect(assinatura.emTrial).toBe(false);
    expect(assinatura.status).toBeNull();
    expect(assinatura.statusRotulo).toBeNull();
    expect(assinatura.trialExpirado).toBe(false);
  });

  test("trial vencido é reportado como vencido", async () => {
    const cenario = await novoCenario({ isTrial: true, trialDays: 14 });
    await prisma.subscription.updateMany({
      where: { organizationId: cenario.organization.id },
      data: { currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const assinatura = await buscarAssinaturaOrganizacao(cenario.organization.id);
    expect(assinatura.trialExpirado).toBe(true);
  });

  test("plano de trial SEM período válido conta como vencido — fail closed", async () => {
    // Mesma regra do enforcement: ausência de período nunca vira acesso
    // livre. Esta tela não pode dizer "tudo certo" para uma organização
    // que o portão está bloqueando.
    const cenario = await novoCenario({ isTrial: true, trialDays: 14 });
    await prisma.subscription.deleteMany({
      where: { organizationId: cenario.organization.id },
    });

    const assinatura = await buscarAssinaturaOrganizacao(cenario.organization.id);
    expect(assinatura.trialTerminaEmISO).toBeNull();
    expect(assinatura.trialExpirado).toBe(true);
  });

  test("uso e limites vêm do plano real, e ilimitado não vira número", async () => {
    const cenario = await novoCenario({ limites: { PROPERTIES: 10, USERS: null } });
    await criarImovel({ organizationId: cenario.organization.id });

    const assinatura = await buscarAssinaturaOrganizacao(cenario.organization.id);
    const imoveis = assinatura.limites.find((l) => l.rotulo === "Imóveis ativos");
    const usuarios = assinatura.limites.find((l) => l.rotulo === "Usuários ativos");

    expect(imoveis).toMatchObject({ usoAtual: 1, limite: 10 });
    // null = sem limite. Nunca 0, que significaria "não pode nenhum".
    expect(usuarios?.limite).toBeNull();
  });

  test("o DTO é plano: nada do Prisma atravessa a fronteira", async () => {
    const cenario = await novoCenario({ isTrial: true, trialDays: 14 });
    const assinatura = await buscarAssinaturaOrganizacao(cenario.organization.id);

    // Datas como ISO, valores como string formatada ou número inteiro.
    expect(typeof assinatura.trialTerminaEmISO).toBe("string");
    expect(JSON.parse(JSON.stringify(assinatura))).toEqual(assinatura);
  });

  test("o estado é de UMA organização — não vaza entre tenants", async () => {
    const trial = await novoCenario({ isTrial: true, trialDays: 14 });
    const pago = await novoCenario({ isTrial: false, priceMonthlyCents: 24900 });

    expect((await buscarAssinaturaOrganizacao(trial.organization.id)).emTrial).toBe(true);
    expect((await buscarAssinaturaOrganizacao(pago.organization.id)).emTrial).toBe(false);
  });
});

describe("autorização financeira", () => {
  test("OWNER e ADMIN respondem pelo contrato", async () => {
    for (const papel of ["OWNER", "ADMIN"] as const) {
      const cenario = await novoCenario();
      await autenticarComo(cenario, papel);
      expect(temPapel(await papelAtual(), PAPEIS_FINANCEIRO)).toBe(true);
    }
  });

  test("MANAGER, BROKER e ASSISTANT não respondem pelo contrato", async () => {
    for (const papel of ["MANAGER", "BROKER", "ASSISTANT"] as const) {
      const cenario = await novoCenario();
      await autenticarComo(cenario, papel);
      expect(temPapel(await papelAtual(), PAPEIS_FINANCEIRO)).toBe(false);
    }
  });

  test("OWNER rebaixado perde o acesso financeiro na MESMA sessão", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    expect(temPapel(await papelAtual(), PAPEIS_FINANCEIRO)).toBe(true);

    // Rebaixamento no banco, sem nova sessão. O token continua OWNER.
    await prisma.organizationMember.updateMany({
      where: { id: cenario.membro.id, organizationId: cenario.organization.id },
      data: { role: "BROKER" },
    });

    const session = await auth();
    expect(session!.user.role).toBe("OWNER");
    expect(temPapel(await papelAtual(), PAPEIS_FINANCEIRO)).toBe(false);
  });

  test("multi-org: OWNER em A e BROKER em B — finanças de B negadas", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membroA = await criarMembro({
      organizationId: orgA.organization.id,
      userId: usuario.id,
      role: "OWNER",
    });
    const membroB = await criarMembro({
      organizationId: orgB.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });

    const sessaoEm = (orgId: string, membroId: string) =>
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: usuario.id,
          organizationId: orgId,
          organizationMemberId: membroId,
          // O token diz OWNER nas DUAS: é justamente o que não pode
          // decidir nada.
          role: "OWNER",
          emitidaEm: Math.floor(Date.now() / 1000),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

    sessaoEm(orgA.organization.id, membroA.id);
    expect(temPapel(await papelAtual(), PAPEIS_FINANCEIRO)).toBe(true);

    sessaoEm(orgB.organization.id, membroB.id);
    // Nunca "alguma membership OWNER do usuário": o papel é o do tenant
    // atual.
    expect(temPapel(await papelAtual(), PAPEIS_FINANCEIRO)).toBe(false);
  });
});

describe("trial expirado não é beco sem saída", () => {
  async function comTrialExpirado() {
    const cenario = await novoCenario({ isTrial: true, trialDays: 14 });
    await prisma.subscription.updateMany({
      where: { organizationId: cenario.organization.id },
      data: { currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    await autenticarComo(cenario, "OWNER");
    return cenario;
  }

  test("a operação normal é bloqueada", async () => {
    await comTrialExpirado();
    expect(await destinoDoRedirect(() => requireOrganizationId())).toBe("/app/trial-expirado");
  });

  test("a tela de assinatura CONTINUA acessível", async () => {
    const cenario = await comTrialExpirado();
    // É a diferença entre "sua operação parou" e "você está preso".
    await expect(requireOrganizationIdParaAssinatura()).resolves.toBe(
      cenario.organization.id
    );
  });

  test("o portão de assinatura preserva todas as OUTRAS defesas", async () => {
    const cenario = await comTrialExpirado();

    // Vínculo suspenso continua expulsando.
    await prisma.organizationMember.updateMany({
      where: { id: cenario.membro.id, organizationId: cenario.organization.id },
      data: { status: "SUSPENDED" },
    });
    expect(await destinoDoRedirect(() => requireOrganizationIdParaAssinatura())).toBe(
      "/app/login"
    );

    // Organização suspensa pela plataforma continua expulsando.
    await prisma.organizationMember.updateMany({
      where: { id: cenario.membro.id, organizationId: cenario.organization.id },
      data: { status: "ACTIVE" },
    });
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { active: false },
    });
    expect(await destinoDoRedirect(() => requireOrganizationIdParaAssinatura())).toBe(
      "/app/suspenso"
    );
  });

  test("mesmo bloqueada, a organização vê o próprio estado financeiro", async () => {
    const cenario = await comTrialExpirado();
    const assinatura = await buscarAssinaturaOrganizacao(cenario.organization.id);

    expect(assinatura.trialExpirado).toBe(true);
    expect(assinatura.nomePlano).toBeTruthy();
  });
});
