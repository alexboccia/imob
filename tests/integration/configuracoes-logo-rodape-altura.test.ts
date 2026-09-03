import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";
import {
  LOGO_RODAPE_ALTURA_MIN,
  LOGO_RODAPE_ALTURA_MAX,
  LOGO_RODAPE_ALTURA_PADRAO,
} from "@/lib/logo";

// Mesma limitação de resolução de módulo já documentada nos outros
// testes de integração (next-auth → next/server não resolve sob Vitest
// puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

import { auth } from "@/lib/auth";
import { salvarConfiguracaoContato } from "@/app/app/configuracoes/actions";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

function autenticarComo(cenario: Cenario) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function formularioMinimo(campos: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("themeId", "classic-blue");
  fd.set("footerAparencia", "AUTO");
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

async function alturaSalva(organizationId: string) {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  return settings?.footerLogoHeight;
}

// O clamp da altura do rodapé só é alcançável por aqui: pela UI o próprio
// <input type="number" min/max> bloqueia o submit antes de chegar na
// action. Este teste cobre justamente o caminho que NÃO passa pelo
// browser (request forjado, integração externa), que é onde o
// saneamento do servidor precisa segurar.
describe("salvarConfiguracaoContato — altura do logotipo do rodapé", () => {
  let cenario: Cenario | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("sem o campo no formulário: grava a altura padrão do rodapé", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    const resultado = await salvarConfiguracaoContato({ success: false }, formularioMinimo());
    expect(resultado.success).toBe(true);
    expect(await alturaSalva(cenario.organization.id)).toBe(LOGO_RODAPE_ALTURA_PADRAO);
  });

  test("valor dentro da faixa persiste exatamente como enviado", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ logoRodapeAltura: "72" })
    );
    expect(resultado.success).toBe(true);
    expect(await alturaSalva(cenario.organization.id)).toBe(72);
  });

  test("valor acima do máximo é limitado, nunca gravado cru", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ logoRodapeAltura: "5000" })
    );
    expect(await alturaSalva(cenario.organization.id)).toBe(LOGO_RODAPE_ALTURA_MAX);
  });

  test("valor abaixo do mínimo é elevado ao mínimo", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ logoRodapeAltura: "1" })
    );
    expect(await alturaSalva(cenario.organization.id)).toBe(LOGO_RODAPE_ALTURA_MIN);
  });

  test("lixo não numérico é rejeitado na validação, sem gravar NaN", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    // Number("abc") é NaN e z.number() recusa NaN: a action falha a
    // validação do formulário inteiro em vez de persistir lixo — mesmo
    // comportamento do campo equivalente do cabeçalho (logoAltura).
    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ logoRodapeAltura: "abc" })
    );
    expect(resultado.success).toBe(false);
    expect(await alturaSalva(cenario.organization.id)).toBeUndefined();
  });

  test("altura do rodapé é independente da altura do cabeçalho", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    await salvarConfiguracaoContato(
      { success: false },
      formularioMinimo({ logoAltura: "30", logoRodapeAltura: "80" })
    );

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: cenario.organization.id },
    });
    expect(settings?.logoHeight).toBe(30);
    expect(settings?.footerLogoHeight).toBe(80);
  });
});
