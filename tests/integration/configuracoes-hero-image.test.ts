import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";

// Mesma limitação de resolução de módulo já documentada nos outros
// testes de integração desta sessão (next-auth → next/server não
// resolve sob Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

import { auth } from "@/lib/auth";
import { salvarConfiguracaoContato } from "@/app/app/configuracoes/actions";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const R2_PUBLIC_URL_TESTE = "https://pub-teste.r2.dev";
const UUID_VALIDO_A = "11111111-2222-3333-4444-555555555555";
const UUID_VALIDO_B = "66666666-7777-8888-9999-000000000000";

function urlHeroValida(organizationId: string, uuid = UUID_VALIDO_A): string {
  return `${R2_PUBLIC_URL_TESTE}/${organizationId}/hero/${uuid}.webp`;
}

function autenticarComo(cenario: Cenario, role: "OWNER" | "ADMIN" | "BROKER" | "MANAGER" = "OWNER") {
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

// Formulário mínimo válido — themeId e footerAparencia são obrigatórios
// no schema (configuracaoSchema), o resto é opcional. `heroImage` é
// sobrescrito por cada teste conforme o cenário.
function formularioMinimo(campos: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("themeId", "classic-blue");
  fd.set("footerAparencia", "AUTO");
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

describe("salvarConfiguracaoContato — imagem do Hero (heroImage)", () => {
  let cenarioA: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  beforeEach(() => {
    vi.stubEnv("R2_PUBLIC_URL", R2_PUBLIC_URL_TESTE);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.mocked(auth).mockReset();
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("sem heroImage no formulário: fica null (fallback do Hero decide o resto)", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA);

    const resultado = await salvarConfiguracaoContato({ success: false }, formularioMinimo());
    expect(resultado.success).toBe(true);

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(settings?.heroImageUrl).toBeNull();
  });

  test("heroImage válido (URL do próprio tenant, pasta hero) persiste corretamente", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA);
    const url = urlHeroValida(cenarioA.organization.id);

    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ heroImage: url })
    );
    expect(resultado.success).toBe(true);

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(settings?.heroImageUrl).toBe(url);
  });

  test("URL externa arbitrária (tentativa de SSRF/URL livre) é recusada, nunca persiste", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA);

    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ heroImage: "https://attacker.com/qualquer-imagem.jpg" })
    );
    expect(resultado.success).toBe(false);

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(settings?.heroImageUrl ?? null).toBeNull();
  });

  test("URL de outra pasta (ex: 'site', válida pra logo mas não pra hero) é recusada", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA);
    const urlDeOutraPasta = `${R2_PUBLIC_URL_TESTE}/${cenarioA.organization.id}/site/${UUID_VALIDO_A}.webp`;

    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ heroImage: urlDeOutraPasta })
    );
    expect(resultado.success).toBe(false);
  });

  test("URL do objeto de OUTRA organização é recusada (isolamento de tenant)", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    autenticarComo(cenarioA);
    const urlDeB = urlHeroValida(cenarioB.organization.id);

    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ heroImage: urlDeB })
    );
    expect(resultado.success).toBe(false);

    const settingsA = await prisma.organizationSettings.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(settingsA?.heroImageUrl ?? null).toBeNull();
  });

  test("trocar imagem: salvar de novo com outra URL válida substitui a anterior", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA);
    const urlAntiga = urlHeroValida(cenarioA.organization.id, UUID_VALIDO_A);
    const urlNova = urlHeroValida(cenarioA.organization.id, UUID_VALIDO_B);

    await salvarConfiguracaoContato({ success: false }, formularioMinimo({ heroImage: urlAntiga }));
    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ heroImage: urlNova })
    );
    expect(resultado.success).toBe(true);

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(settings?.heroImageUrl).toBe(urlNova);
  });

  test("'Restaurar imagem padrão': salvar com heroImage vazio depois de já ter uma volta a null", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA);
    const url = urlHeroValida(cenarioA.organization.id);

    await salvarConfiguracaoContato({ success: false }, formularioMinimo({ heroImage: url }));
    const restaurado = await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ heroImage: "" })
    );
    expect(restaurado.success).toBe(true);

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(settings?.heroImageUrl).toBeNull();
  });

  test("papel sem permissão (BROKER) é recusado, nunca persiste", async () => {
    cenarioA = await criarCenario({ role: "BROKER" });
    autenticarComo(cenarioA, "BROKER");
    const url = urlHeroValida(cenarioA.organization.id);

    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ heroImage: url })
    );
    expect(resultado.success).toBe(false);

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(settings).toBeNull();
  });
});
