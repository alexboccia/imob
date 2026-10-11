import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarPlatformOperator, destruirPlatformOperator } from "@/test/fixtures";

// Mesmo padrão de tests/integration/platform-plans.test.ts: requirePlatformOperator
// mora no mesmo módulo que `auth` em @/lib/platform/auth — reimplementa a
// MESMA lógica real no mock (nunca um atalho que mascare bug de autorização).
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform/auth", () => ({
  auth: mockAuth,
  requirePlatformOperator: async () => {
    const { redirect } = await import("next/navigation");
    const { prisma } = await import("@/lib/prisma");
    const session = await mockAuth();
    if (!session?.user?.platformOperatorId) {
      redirect("/platform/login");
      throw new Error("NEXT_REDIRECT (mock): sem sessão/operador válido");
    }
    const operador = await prisma.platformOperator.findUnique({
      where: { id: session.user.platformOperatorId },
      select: { id: true, role: true, active: true },
    });
    if (!operador || !operador.active) {
      redirect("/platform/login");
      throw new Error("NEXT_REDIRECT (mock): sem sessão/operador válido");
    }
    return { id: operador.id, role: operador.role };
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/platform/auth";
import { redirect } from "next/navigation";
import { salvarConfiguracaoSuporte } from "@/app/platform/configuracoes/actions";
import { normalizarTelefoneSuporte, linkWhatsAppSuporte } from "@/lib/plataforma-suporte";
import { buscarConfiguracaoSuporte } from "@/lib/plataforma-suporte-dados";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

async function autenticarComoOperador(role: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "PLATFORM_SUPPORT" = "SUPER_ADMIN") {
  const operador = await criarPlatformOperator({ role });
  vi.mocked(auth).mockResolvedValue({
    user: { platformOperatorId: operador.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return operador;
}

function semSessao() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(auth).mockResolvedValue(null as any);
}

describe("Fase 112 — SUP-001: configuração de suporte oficial do SaaS", () => {
  const operadoresCriados: string[] = [];

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    vi.mocked(redirect).mockClear();
    await prisma.platformSettings.deleteMany({ where: { id: "global" } });
    while (operadoresCriados.length) {
      await destruirPlatformOperator(operadoresCriados.pop()!);
    }
  });

  test("normalizarTelefoneSuporte aceita com e sem DDI, rejeita o resto", () => {
    expect(normalizarTelefoneSuporte("11976069213")).toBe("5511976069213");
    expect(normalizarTelefoneSuporte("5511976069213")).toBe("5511976069213");
    expect(normalizarTelefoneSuporte("+55 11 97606-9213")).toBe("5511976069213");
    expect(normalizarTelefoneSuporte("123")).toBeNull();
    expect(normalizarTelefoneSuporte("abcdefghij")).toBeNull();
    expect(normalizarTelefoneSuporte("1234567890123456")).toBeNull();
  });

  test("linkWhatsAppSuporte constrói o link a partir dos dígitos normalizados, nunca de uma URL arbitrária", () => {
    expect(linkWhatsAppSuporte("5511976069213")).toBe("https://wa.me/5511976069213");
    expect(linkWhatsAppSuporte(null)).toBeNull();
  });

  test("SUPER_ADMIN consegue salvar o telefone e o horário, e eles persistem", async () => {
    const operador = await autenticarComoOperador("SUPER_ADMIN");
    operadoresCriados.push(operador.id);

    const resultado = await salvarConfiguracaoSuporte(
      ESTADO_INICIAL_ACAO,
      formData({ telefone: "11976069213", horario: "Segunda a sexta, 9h às 18h" })
    );
    expect(resultado.success).toBe(true);

    const config = await buscarConfiguracaoSuporte();
    expect(config.telefoneDigitos).toBe("5511976069213");
    expect(config.horarioAtendimento).toBe("Segunda a sexta, 9h às 18h");

    const linha = await prisma.platformSettings.findUniqueOrThrow({ where: { id: "global" } });
    expect(linha.updatedByOperatorId).toBe(operador.id);
  });

  test("telefone inválido é rejeitado, nada é persistido", async () => {
    const operador = await autenticarComoOperador("SUPER_ADMIN");
    operadoresCriados.push(operador.id);

    const resultado = await salvarConfiguracaoSuporte(
      ESTADO_INICIAL_ACAO,
      formData({ telefone: "123" })
    );
    expect(resultado.success).toBe(false);
    expect(resultado.fieldErrors?.telefone).toBeDefined();

    const config = await buscarConfiguracaoSuporte();
    expect(config.telefoneDigitos).toBeNull();
  });

  test("um PlatformOperator sem PAPEIS_PLATAFORMA_TUDO (PLATFORM_SUPPORT) não consegue editar", async () => {
    const operador = await autenticarComoOperador("PLATFORM_SUPPORT");
    operadoresCriados.push(operador.id);

    const resultado = await salvarConfiguracaoSuporte(
      ESTADO_INICIAL_ACAO,
      formData({ telefone: "11976069213" })
    );
    expect(resultado.success).toBe(false);

    const config = await buscarConfiguracaoSuporte();
    expect(config.telefoneDigitos).toBeNull();
  });

  test("sem sessão de plataforma (ex: usuário de uma organização comum), a action redireciona e não grava nada", async () => {
    semSessao();

    await expect(
      salvarConfiguracaoSuporte(ESTADO_INICIAL_ACAO, formData({ telefone: "11976069213" }))
    ).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith("/platform/login");

    const config = await buscarConfiguracaoSuporte();
    expect(config.telefoneDigitos).toBeNull();
  });

  test("uma segunda gravação (SET real) nunca cria uma segunda linha — singleton", async () => {
    const operador = await autenticarComoOperador("SUPER_ADMIN");
    operadoresCriados.push(operador.id);

    await salvarConfiguracaoSuporte(
      ESTADO_INICIAL_ACAO,
      formData({ telefone: "11976069213", horario: "Primeiro valor" })
    );
    await salvarConfiguracaoSuporte(
      ESTADO_INICIAL_ACAO,
      formData({ telefone: "21988887777", horario: "Segundo valor" })
    );

    const total = await prisma.platformSettings.count();
    expect(total).toBe(1);
    const config = await buscarConfiguracaoSuporte();
    expect(config.telefoneDigitos).toBe("5521988887777");
    expect(config.horarioAtendimento).toBe("Segundo valor");
  });
});
