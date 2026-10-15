import { describe, test, expect, afterEach, vi } from "vitest";

// Mesmo padrão de tests/integration/empreendimento.test.ts — mocka
// auth()/next-cache pra poder invocar as Server Actions de verdade (não
// só o padrão de isolamento), já que é exatamente a Server Action que
// precisa gravar o ActivityLog.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
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
import { criarCenario, criarUsuario, criarMembro } from "@/test/fixtures";
import { removerEmpreendimento } from "@/app/app/empreendimentos/actions";
import { removerCaracteristica } from "@/app/app/caracteristicas/actions";
import { removerTipoImovel } from "@/app/app/tipos-imovel/actions";
import { logActivity } from "@/lib/activity-log";

// =======================================================================
// Fase de Logs de Auditoria — Etapa 1 (correção de lacunas)
// =======================================================================
// O diagnóstico (docs/tecnico/DIAGNOSTICO-LOGS-AUDITORIA-EASYMOB.md)
// encontrou 3 exclusões reais, em produção, sem nenhum rastro: Development
// (empreendimento), FeatureOption (característica) e PropertyTypeOption
// (tipo de imóvel). Esta suíte prova que as 3 agora geram ActivityLog —
// com o autor certo, a organização certa, e um identificador útil do que
// foi excluído (o nome, já que o registro em si deixa de existir).

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

function autenticarComo(
  cenario: Cenario,
  m: { id: string; userId: string } = { id: cenario.membro.id, userId: cenario.usuario.id },
  role = "OWNER"
) {
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

// papelAtual() lê o papel do banco (buscarEstadoDaSessao), nunca do
// token mockado — então "autenticar como BROKER" exige um membro BROKER
// de verdade no banco, mesmo padrão de empreendimento.test.ts.
async function membro(cenario: Cenario, nome: string, role: string) {
  const usuario = await criarUsuario({ name: nome });
  const m = await criarMembro({
    organizationId: cenario.organization.id,
    userId: usuario.id,
    role: role as "BROKER",
  });
  return { ...m, userId: usuario.id };
}

async function ultimoLog(organizationId: string) {
  return prisma.activityLog.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

describe("auditoria de exclusões de catálogo (Etapa 1)", () => {
  test("excluir empreendimento grava ActivityLog com autor, entidade e nome preservado", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const alpha = await prisma.development.create({
      data: { organizationId: cenario.organization.id, name: "Residencial Teste" },
    });

    const resultado = await removerEmpreendimento(alpha.id, { success: false }, new FormData());
    expect(resultado.success).toBe(true);

    const log = await ultimoLog(cenario.organization.id);
    expect(log).not.toBeNull();
    expect(log!.entity).toBe("Development");
    expect(log!.entityId).toBe(alpha.id);
    expect(log!.action).toBe("deleted");
    expect(log!.userId).toBe(cenario.usuario.id);
    expect((log!.payload as { name?: string } | null)?.name).toBe("Residencial Teste");
  });

  test("excluir característica grava ActivityLog com nome e categoria preservados", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const caracteristica = await prisma.featureOption.create({
      data: { organizationId: cenario.organization.id, category: "PROPERTY", name: "Aceita pet" },
    });

    await removerCaracteristica(caracteristica.id);

    const log = await ultimoLog(cenario.organization.id);
    expect(log!.entity).toBe("FeatureOption");
    expect(log!.entityId).toBe(caracteristica.id);
    expect(log!.action).toBe("deleted");
    expect(log!.userId).toBe(cenario.usuario.id);
    expect((log!.payload as { name?: string; category?: string } | null)?.name).toBe("Aceita pet");
    expect((log!.payload as { name?: string; category?: string } | null)?.category).toBe("PROPERTY");
  });

  test("excluir tipo de imóvel grava ActivityLog com nome e categoria preservados", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const tipo = await prisma.propertyTypeOption.create({
      data: { organizationId: cenario.organization.id, category: "RESIDENTIAL", name: "Cobertura" },
    });

    await removerTipoImovel(tipo.id);

    const log = await ultimoLog(cenario.organization.id);
    expect(log!.entity).toBe("PropertyTypeOption");
    expect(log!.entityId).toBe(tipo.id);
    expect(log!.action).toBe("deleted");
    expect(log!.userId).toBe(cenario.usuario.id);
    expect((log!.payload as { name?: string } | null)?.name).toBe("Cobertura");
  });

  test("exclusão NÃO autorizada (BROKER) não é executada e não gera log", async () => {
    const cenario = await novoCenario();
    const tipo = await prisma.propertyTypeOption.create({
      data: { organizationId: cenario.organization.id, category: "RESIDENTIAL", name: "Studio" },
    });
    const broker = await membro(cenario, "Broker Teste", "BROKER");
    autenticarComo(cenario, broker, "BROKER");

    await removerTipoImovel(tipo.id);

    // Nem o registro, nem o log: a ação recusa antes de tocar no banco.
    const aindaExiste = await prisma.propertyTypeOption.findUnique({
      where: { id: tipo.id, organizationId: cenario.organization.id },
    });
    expect(aindaExiste).not.toBeNull();
    const log = await ultimoLog(cenario.organization.id);
    expect(log).toBeNull();
  });

  test("exclusão em um tenant nunca aparece no log de outro tenant", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    autenticarComo(orgB);
    const caracteristicaB = await prisma.featureOption.create({
      data: { organizationId: orgB.organization.id, category: "CONDO", name: "Piscina" },
    });

    await removerCaracteristica(caracteristicaB.id);

    const logA = await ultimoLog(orgA.organization.id);
    expect(logA).toBeNull();
    const logB = await ultimoLog(orgB.organization.id);
    expect(logB!.entity).toBe("FeatureOption");
  });

  test("tentativa de excluir característica de OUTRO tenant: recusada, sem log em nenhum dos dois", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const caracteristicaB = await prisma.featureOption.create({
      data: { organizationId: orgB.organization.id, category: "PROPERTY", name: "Varanda" },
    });
    autenticarComo(orgA);

    // id de B, sessão de A — featureOption.delete({ id, organizationId: A })
    // não casa nenhuma linha (where composto), lança P2025. A action não
    // trata esse erro — propaga, e é isso que garante que NADA é
    // considerado sucesso nem gera log falso.
    await expect(removerCaracteristica(caracteristicaB.id)).rejects.toThrow();

    const aindaExiste = await prisma.featureOption.findUnique({
      where: { id: caracteristicaB.id, organizationId: orgB.organization.id },
    });
    expect(aindaExiste).not.toBeNull();
    expect(await ultimoLog(orgA.organization.id)).toBeNull();
    expect(await ultimoLog(orgB.organization.id)).toBeNull();
  });

  test("empreendimento excluído continua consultável no histórico mesmo após o registro sumir", async () => {
    const cenario = await novoCenario();
    autenticarComo(cenario);
    const alpha = await prisma.development.create({
      data: { organizationId: cenario.organization.id, name: "Vai Sumir" },
    });

    await removerEmpreendimento(alpha.id, { success: false }, new FormData());

    expect(
      await prisma.development.findUnique({
        where: { id: alpha.id, organizationId: cenario.organization.id },
      })
    ).toBeNull();
    const log = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, entity: "Development", entityId: alpha.id },
    });
    expect(log).not.toBeNull();
    expect((log!.payload as { name?: string } | null)?.name).toBe("Vai Sumir");
  });
});

describe("atomicidade: falha real na gravação do log reverte a operação de negócio junto", () => {
  // `vi.spyOn(prisma.activityLog, "create")` NÃO intercepta `tx.activityLog.create`
  // — o client de transação é uma instância própria, derivada por
  // `$transaction`, não o mesmo objeto que `prisma.activityLog` (confirmado
  // empiricamente: a tentativa de usar spy aqui rodou sem erro nenhum,
  // provando que o mock nunca foi de fato chamado). Por isso o teste abaixo
  // provoca uma falha REAL e reproduzível — um `organizationId` que viola a
  // FK obrigatória de ActivityLog.organization — dentro do MESMO padrão
  // (exclusão + logActivity(tx) no mesmo prisma.$transaction) que as 3
  // Server Actions usam, sem precisar mockar nada.
  test("exclusão + log na mesma transação: se o log falhar (FK inválida), a exclusão TAMBÉM reverte", async () => {
    const cenario = await novoCenario();
    const caracteristica = await prisma.featureOption.create({
      data: { organizationId: cenario.organization.id, category: "PROPERTY", name: "Vai Sobreviver" },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.featureOption.delete({
          where: { id: caracteristica.id, organizationId: cenario.organization.id },
        });
        // organizationId inexistente -> viola activity_logs_organizationId_fkey
        // de verdade, dentro da MESMA transação da exclusão acima.
        await logActivity(
          {
            organizationId: "org-que-nao-existe-de-verdade",
            entity: "FeatureOption",
            entityId: caracteristica.id,
            action: "deleted",
          },
          tx
        );
      })
    ).rejects.toThrow();

    // A transação inteira reverteu: a exclusão nunca se confirmou.
    const aindaExiste = await prisma.featureOption.findUnique({
      where: { id: caracteristica.id, organizationId: cenario.organization.id },
    });
    expect(aindaExiste).not.toBeNull();
    expect(aindaExiste!.name).toBe("Vai Sobreviver");

    // E nenhum log foi gravado (nem o da org real, nem o da inexistente).
    const log = await prisma.activityLog.findFirst({
      where: { organizationId: cenario.organization.id, entityId: caracteristica.id },
    });
    expect(log).toBeNull();
  });

  test("sem `tx` (uso best-effort normal): falha no log NUNCA propaga, comportamento de sempre preservado", async () => {
    const cenario = await novoCenario();
    // Mesma garantia que já existia antes desta correção, para os 37+
    // call sites que nunca passam `tx` — continuam podendo falhar
    // silenciosamente (console), sem derrubar a operação de negócio.
    await expect(
      logActivity({
        organizationId: "org-que-nao-existe-de-verdade",
        entity: "Qualquer",
        action: "teste",
      })
    ).resolves.toBeUndefined();
    // Nenhum vazamento para a organização real por engano.
    expect(
      await prisma.activityLog.findFirst({ where: { organizationId: cenario.organization.id } })
    ).toBeNull();
  });
});
