import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";
import { THEME_ID_CUSTOMIZADO } from "@/lib/branding/temas";
import { campoCorDaChave, CHAVES_COR_EDITAVEIS } from "@/lib/branding/paleta-editavel";

// Mesma limitação de resolução de módulo já documentada nos outros
// testes de integração desta pasta (next-auth → next/server não resolve
// sob Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

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

const PALETA_HEX: Record<string, string> = {
  primary: "#0E2555",
  primaryHover: "#081936",
  primaryLight: "#E3E9F5",
  secondary: "#F2F5FA",
  border: "#D6DEEC",
  onPrimary: "#FFFFFF",
};

function formulario(campos: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("themeId", "classic-blue");
  fd.set("footerAparencia", "AUTO");
  fd.set("timezone", "America/Sao_Paulo");
  fd.set("visibilidadeComercial", "COLLABORATIVE");
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

function comPaleta(extra: Record<string, string> = {}): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const chave of CHAVES_COR_EDITAVEIS) {
    campos[campoCorDaChave(chave)] = PALETA_HEX[chave];
  }
  return { ...campos, ...extra };
}

// Fase 62 — a paleta personalizada deixou de ter botão próprio de
// persistência ("Aplicar paleta") e passou a viajar no formulário único.
// O que estes testes fixam é que a MUDANÇA DE CAMINHO não afrouxou nada:
// continua exigindo um salvamento explícito, continua validando a cor, e
// continua sem apagar a paleta de quem trocou de tema.
describe("salvarConfiguracaoContato — paleta personalizada pelo formulário", () => {
  let cenario: Cenario | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("themeId=custom + as seis cores: persiste customTheme em oklch", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formulario(comPaleta({ themeId: THEME_ID_CUSTOMIZADO }))
    );
    expect(resultado.success).toBe(true);

    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenario.organization.id },
    });
    expect(branding?.themeId).toBe(THEME_ID_CUSTOMIZADO);

    const tokens = branding?.customTheme as Record<string, string> | null;
    expect(tokens).toBeTruthy();
    // Grava em oklch, nunca o hex cru — é o formato que o site consome.
    for (const chave of CHAVES_COR_EDITAVEIS) {
      expect(tokens![chave], `token ${chave}`).toMatch(/^oklch\(/);
    }
    // `link` não é editável na tela: acompanha `primary`.
    expect(tokens!.link).toBe(tokens!.primary);
  });

  test("uma cor inválida não grava paleta pela metade", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formulario(comPaleta({ themeId: THEME_ID_CUSTOMIZADO, cor_border: "nao-e-cor" }))
    );
    // A submissão do resto da tela continua valendo...
    expect(resultado.success).toBe(true);
    // ...mas nenhuma paleta parcial foi gravada.
    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenario.organization.id },
    });
    expect(branding?.customTheme).toBeNull();
  });

  test("tema do catálogo escolhido: as cores enviadas são ignoradas", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    const resultado = await salvarConfiguracaoContato(
      { success: false },
      formulario(comPaleta({ themeId: "forest" }))
    );
    expect(resultado.success).toBe(true);

    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenario.organization.id },
    });
    expect(branding?.themeId).toBe("forest");
    // Mandar cores junto de um tema pronto não pode criar uma paleta.
    expect(branding?.customTheme).toBeNull();
  });

  test("trocar para um tema do catálogo NÃO apaga a paleta já salva", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    // 1. Salva a paleta.
    await salvarConfiguracaoContato(
      { success: false },
      formulario(comPaleta({ themeId: THEME_ID_CUSTOMIZADO }))
    );
    const salva = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenario.organization.id },
    });
    expect(salva?.customTheme).toBeTruthy();

    // 2. Escolhe um tema pronto, sem mandar cor nenhuma.
    await salvarConfiguracaoContato({ success: false }, formulario({ themeId: "wine" }));

    const depois = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenario.organization.id },
    });
    expect(depois?.themeId).toBe("wine");
    // Voltar a "Personalizado" tem de reencontrar a paleta de antes.
    expect(depois?.customTheme).toEqual(salva?.customTheme);
  });

  test("paleta incompleta (falta uma cor) não grava nada", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    const campos = comPaleta({ themeId: THEME_ID_CUSTOMIZADO });
    delete campos[campoCorDaChave("secondary")];

    const resultado = await salvarConfiguracaoContato({ success: false }, formulario(campos));
    expect(resultado.success).toBe(true);

    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenario.organization.id },
    });
    expect(branding?.customTheme).toBeNull();
  });

  test("a paleta de uma organização nunca alcança outra", async () => {
    cenario = await criarCenario();
    const outra = await criarCenario();
    try {
      autenticarComo(cenario);
      await salvarConfiguracaoContato(
        { success: false },
        formulario(comPaleta({ themeId: THEME_ID_CUSTOMIZADO }))
      );

      const brandingOutra = await prisma.organizationBranding.findUnique({
        where: { organizationId: outra.organization.id },
      });
      // A outra organização não ganhou paleta nem trocou de tema.
      expect(brandingOutra?.customTheme ?? null).toBeNull();
      expect(brandingOutra?.themeId ?? null).not.toBe(THEME_ID_CUSTOMIZADO);
    } finally {
      await outra.destruir();
    }
  });
});
