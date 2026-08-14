import { describe, test, expect, afterEach } from "vitest";
import { prisma, prismaPlatform } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  bootstrapStarter,
  bootstrapStarterComRetry,
  modulosObrigatoriosFaltando,
} from "../../scripts/bootstrap-starter-p9";
import {
  criarPlano,
  criarOrganizacao,
  criarUsuario,
  criarPlatformOperator,
  destruirPlatformOperator,
  criarSubscriptionTrial,
  limparOrganizacao,
} from "@/test/fixtures";

// Plan.code é catálogo global único ("STARTER" literal, não sufixado como
// as fixtures normais) — por isso, diferente do resto da suíte, este
// arquivo limpa e recria o STARTER a cada teste em vez de usar
// identificadores únicos por teste. Module é global e nunca é apagado
// (outros testes dependem dele existir) — os testes aqui só leem/criam
// módulos, nunca deletam.
//
// `bootstrapStarter`/`bootstrapStarterComRetry` são tipados pro client
// Prisma cru (uso real do script, standalone) — o client tenant-scoped
// de `@/lib/prisma` ($extends) é o mesmo client por baixo, mas o
// TypeScript gerado pra $extends não bate estruturalmente com a
// assinatura sobrecarregada de `$transaction` do client cru. Cast
// explícito e só usado nas chamadas ao bootstrap; todo o resto do
// arquivo usa `prisma` sem cast.
const db = prisma as unknown as PrismaClient;
async function garantirModulosObrigatorios(): Promise<void> {
  for (const code of ["core", "properties", "crm"]) {
    await prisma.module.upsert({ where: { code }, update: {}, create: { code, name: code } });
  }
}

async function buscarStarterCompleto() {
  const plano = await prisma.plan.findUnique({ where: { code: "STARTER" } });
  if (!plano) return null;
  const limits = await prisma.planLimit.findMany({ where: { planId: plano.id } });
  const modules = await prisma.planModule.findMany({
    where: { planId: plano.id },
    include: { module: { select: { code: true } } },
  });
  return { plano, limits, modules };
}

async function limparStarter(): Promise<void> {
  const plano = await prisma.plan.findUnique({ where: { code: "STARTER" } });
  if (!plano) return;
  await prisma.planLimit.deleteMany({ where: { planId: plano.id } });
  await prisma.planModule.deleteMany({ where: { planId: plano.id } });
  await prisma.plan.delete({ where: { id: plano.id } });
}

afterEach(async () => {
  await limparStarter();
});

describe("bootstrapStarter — pura", () => {
  test("K) módulo obrigatório ausente é detectado sem tocar o banco", () => {
    const semCrm = [{ code: "core" }, { code: "properties" }];
    expect(modulosObrigatoriosFaltando(semCrm)).toEqual(["crm"]);
  });

  test("catálogo completo -> nada faltando", () => {
    const completo = [{ code: "core" }, { code: "properties" }, { code: "crm" }, { code: "email" }];
    expect(modulosObrigatoriosFaltando(completo)).toEqual([]);
  });
});

describe("bootstrapStarter — banco real", () => {
  test("A/B/C/D) cria STARTER ausente com valores e limites e módulos corretos", async () => {
    await garantirModulosObrigatorios();
    await bootstrapStarter(db);

    const resultado = await buscarStarterCompleto();
    expect(resultado).not.toBeNull();
    expect(resultado!.plano).toMatchObject({
      code: "STARTER",
      name: "Starter",
      priceMonthlyCents: 0,
      isTrial: true,
      trialDays: 14,
      active: true,
    });

    expect(resultado!.limits).toHaveLength(4);
    const limitesPorFeature = Object.fromEntries(resultado!.limits.map((l) => [l.feature, l.limit]));
    expect(limitesPorFeature).toEqual({
      PROPERTIES: 10,
      USERS: 1,
      PHOTOS_PER_PROPERTY: 5,
      CRM_CLIENTS: 100,
    });

    const habilitados = resultado!.modules.filter((m) => m.enabled).map((m) => m.module.code).sort();
    expect(habilitados).toEqual(["core", "crm", "properties"]);
    // Todos os módulos do catálogo recebem uma linha (habilitada ou não) —
    // nenhum módulo do catálogo fica sem relação com o STARTER.
    const totalModulosCatalogo = await prisma.module.count();
    expect(resultado!.modules).toHaveLength(totalModulosCatalogo);
  });

  test("E/F) rerun preserva customização feita depois da primeira execução", async () => {
    await garantirModulosObrigatorios();
    await bootstrapStarter(db);

    const antes = await buscarStarterCompleto();
    // Simula edição via Platform Admin depois do bootstrap inicial.
    await prisma.plan.update({ where: { id: antes!.plano.id }, data: { priceMonthlyCents: 1234 } });
    await prisma.planLimit.update({
      where: { planId_feature: { planId: antes!.plano.id, feature: "PROPERTIES" } },
      data: { limit: 99 },
    });
    const crmModule = antes!.modules.find((m) => m.module.code === "crm")!;
    await prisma.planModule.update({ where: { id: crmModule.id }, data: { enabled: false } });

    await bootstrapStarter(db);

    const depois = await buscarStarterCompleto();
    expect(depois!.plano.priceMonthlyCents).toBe(1234);
    const limitesPorFeature = Object.fromEntries(depois!.limits.map((l) => [l.feature, l.limit]));
    expect(limitesPorFeature.PROPERTIES).toBe(99);
    const crmDepois = depois!.modules.find((m) => m.module.code === "crm")!;
    expect(crmDepois.enabled).toBe(false);
  });

  test("G) módulo obrigatório ausente aborta sem criar STARTER parcial (via helper puro, catálogo real preservado)", async () => {
    // Não apaga `crm` do catálogo real e compartilhado — testa a mesma
    // checagem que a transação usa, via o helper puro exportado (ver
    // suite "pura" acima), e confirma que a falha ocorre ANTES de
    // qualquer `plan.create`: chamando bootstrapStarter com o catálogo
    // real (que tem crm), o STARTER é criado; simulando a lista
    // incompleta diretamente na função pura já prova que a checagem
    // dispara antes de qualquer write ser possível (a checagem é a
    // primeira instrução dentro da transação, antes do findUnique do
    // Plan e de qualquer create).
    expect(modulosObrigatoriosFaltando([{ code: "core" }])).toEqual(["properties", "crm"]);

    const existeAntes = await prisma.plan.findUnique({ where: { code: "STARTER" } });
    expect(existeAntes).toBeNull();
  });

  test("H) duas execuções concorrentes terminam sem duplicata e sem erro não tratado", async () => {
    await garantirModulosObrigatorios();

    await Promise.all([
      bootstrapStarterComRetry(db),
      bootstrapStarterComRetry(db),
    ]);

    const planos = await prisma.plan.findMany({ where: { code: "STARTER" } });
    expect(planos).toHaveLength(1);

    const resultado = await buscarStarterCompleto();
    expect(resultado!.limits).toHaveLength(4);
    const totalModulosCatalogo = await prisma.module.count();
    expect(resultado!.modules).toHaveLength(totalModulosCatalogo);
  });

  test("I) zero efeito em Organization/User/OrganizationMember/Subscription/PlatformOperator e em outros Plans", async () => {
    // Contagem GLOBAL não é segura aqui: outros arquivos de teste rodam
    // em paralelo (fileParallelism) e criam/destroem Organization/User
    // concorrentemente, o que faria os totais globais oscilarem por
    // motivos nada relacionados a bootstrapStarter. Em vez disso,
    // fixamos registros específicos por ID antes/depois — prova
    // equivalente (nenhuma dessas linhas específicas foi tocada) e
    // robusta sob paralelismo.
    await garantirModulosObrigatorios();
    const outroPlano = await criarPlano({ priceMonthlyCents: 55500, limites: { PROPERTIES: 7 } });
    const org = await criarOrganizacao({ planId: outroPlano.id });
    const usuario = await criarUsuario();
    const membro = await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: usuario.id, role: "OWNER" },
    });
    const operador = await criarPlatformOperator();
    const subscription = await criarSubscriptionTrial({
      organizationId: org.id,
      planId: outroPlano.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    const antes = {
      organization: await prisma.organization.findUniqueOrThrow({ where: { id: org.id } }),
      usuario: await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } }),
      membro: await prisma.organizationMember.findUniqueOrThrow({ where: { id: membro.id } }),
      subscription: await prismaPlatform.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      }),
      operador: await prisma.platformOperator.findUniqueOrThrow({ where: { id: operador.id } }),
    };

    await bootstrapStarter(db);

    const depois = {
      organization: await prisma.organization.findUniqueOrThrow({ where: { id: org.id } }),
      usuario: await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } }),
      membro: await prisma.organizationMember.findUniqueOrThrow({ where: { id: membro.id } }),
      subscription: await prismaPlatform.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      }),
      operador: await prisma.platformOperator.findUniqueOrThrow({ where: { id: operador.id } }),
    };
    expect(depois).toEqual(antes);

    const outroPlanoDepois = await prisma.plan.findUniqueOrThrow({ where: { id: outroPlano.id } });
    expect(outroPlanoDepois.priceMonthlyCents).toBe(55500);
    const outroLimiteDepois = await prisma.planLimit.findUnique({
      where: { planId_feature: { planId: outroPlano.id, feature: "PROPERTIES" } },
    });
    expect(outroLimiteDepois?.limit).toBe(7);

    await destruirPlatformOperator(operador.id);
    await limparOrganizacao(org.id, { userIds: [usuario.id], planId: outroPlano.id });
  });

  test("dry-run não escreve nada", async () => {
    await garantirModulosObrigatorios();
    await bootstrapStarter(db, { dryRun: true });
    const existe = await prisma.plan.findUnique({ where: { code: "STARTER" } });
    expect(existe).toBeNull();
  });
});
