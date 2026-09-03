import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";

// Mesma limitação de resolução de módulo já documentada nos outros testes
// de integração desta sessão (next-auth → next/server não resolve sob
// Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
// Único ponto de I/O real (fetch do logo + decodificação com sharp) —
// mockado aqui de propósito (ver seção 14 do pedido: "não faça upload
// real para R2 apenas para provar o teste"). O que este arquivo testa é
// autorização/isolamento de tenant/persistência da Server Action, não a
// extração de cor em si (já coberta exaustivamente, sem rede nem imagem
// real nenhuma, em gerar-paleta.test.ts).
vi.mock("@/lib/branding/extrair-paleta-logo", () => ({ gerarPaletaDoLogo: vi.fn() }));

import { auth } from "@/lib/auth";
import { gerarPaletaDoLogo } from "@/lib/branding/extrair-paleta-logo";
import {
  gerarPreviaPaletaLogotipo,
  aplicarPaletaGerada,
} from "@/app/app/configuracoes/actions";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

const R2_PUBLIC_URL_TESTE = "https://pub-teste.r2.dev";
const UUID_VALIDO = "11111111-2222-3333-4444-555555555555";

const TOKENS_FALSOS = {
  primary: "oklch(0.5 0.2 40)",
  primaryHover: "oklch(0.42 0.2 40)",
  primaryLight: "oklch(0.93 0.04 40)",
  onPrimary: "oklch(1 0 0)",
  secondary: "oklch(0.96 0.02 40)",
  border: "oklch(0.875 0.03 40)",
  link: "oklch(0.5 0.2 40)",
};

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

// Único formato de URL que validarUrlMidiaOrganizacao aceita: dentro do
// bucket R2 oficial (stubado abaixo), no prefixo desta organização — ver
// favicon-url.test.ts pros mesmos casos negativos, já cobertos lá.
function urlLogoValida(organizationId: string): string {
  return `${R2_PUBLIC_URL_TESTE}/${organizationId}/site/${UUID_VALIDO}.png`;
}

async function configurarLogo(organizationId: string, logoUrl: string) {
  await prisma.organizationSettings.upsert({
    where: { organizationId },
    update: { logoUrl },
    create: { organizationId, logoUrl },
  });
}

describe("gerarPreviaPaletaLogotipo / aplicarPaletaGerada — autorização, isolamento de tenant e persistência", () => {
  let cenarioA: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  beforeEach(() => {
    vi.stubEnv("R2_PUBLIC_URL", R2_PUBLIC_URL_TESTE);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.mocked(auth).mockReset();
    vi.mocked(gerarPaletaDoLogo).mockReset();
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("sem logo configurado: gerar retorna erro amigável, nunca escreve no banco", async () => {
    cenarioA = await criarCenario();
    autenticarComo(cenarioA);

    const resultado = await gerarPreviaPaletaLogotipo();
    expect(resultado.ok).toBe(false);
    expect(gerarPaletaDoLogo).not.toHaveBeenCalled();

    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(branding).toBeNull();
  });

  test("logo configurado mas fora do bucket/prefixo oficial: recusado como SSRF, nunca busca a URL", async () => {
    cenarioA = await criarCenario();
    await configurarLogo(cenarioA.organization.id, "https://attacker.com/qualquer-coisa.png");
    autenticarComo(cenarioA);

    const resultado = await gerarPreviaPaletaLogotipo();
    expect(resultado.ok).toBe(false);
    expect(gerarPaletaDoLogo).not.toHaveBeenCalled();
  });

  test("papel sem permissão (BROKER) é recusado, sem chamar a extração", async () => {
    cenarioA = await criarCenario({ role: "BROKER" });
    await configurarLogo(cenarioA.organization.id, urlLogoValida(cenarioA.organization.id));
    autenticarComo(cenarioA, "BROKER");

    const resultado = await gerarPreviaPaletaLogotipo();
    expect(resultado.ok).toBe(false);
    expect(gerarPaletaDoLogo).not.toHaveBeenCalled();

    const aplicar = await aplicarPaletaGerada();
    expect(aplicar.success).toBe(false);
  });

  test("gerar (prévia) NUNCA persiste — mesmo com extração bem-sucedida", async () => {
    cenarioA = await criarCenario();
    await configurarLogo(cenarioA.organization.id, urlLogoValida(cenarioA.organization.id));
    autenticarComo(cenarioA);
    vi.mocked(gerarPaletaDoLogo).mockResolvedValue({
      ok: true,
      tokens: TOKENS_FALSOS,
      corMarca: { l: 0.5, c: 0.2, h: 40 },
    });

    const resultado = await gerarPreviaPaletaLogotipo();
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.tokens).toEqual(TOKENS_FALSOS);

    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(branding).toBeNull();
  });

  test("aplicar persiste themeId=custom e customTheme só na organização autenticada", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    await configurarLogo(cenarioA.organization.id, urlLogoValida(cenarioA.organization.id));
    autenticarComo(cenarioA);
    vi.mocked(gerarPaletaDoLogo).mockResolvedValue({
      ok: true,
      tokens: TOKENS_FALSOS,
      corMarca: { l: 0.5, c: 0.2, h: 40 },
    });

    const resultado = await aplicarPaletaGerada();
    expect(resultado.success).toBe(true);

    const brandingA = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(brandingA?.themeId).toBe("custom");
    expect(brandingA?.customTheme).toEqual(TOKENS_FALSOS);

    // B nunca foi autenticado nem chamou nada — isolamento garantido pela
    // própria ausência de linha, não só por um campo diferente.
    const brandingB = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenarioB.organization.id },
    });
    expect(brandingB).toBeNull();
  });

  // A paleta sugerida virou editável (conta-gotas por cor, ver
  // GeradorTemaLogotipo.tsx). Estes casos travam o contrato que isso
  // exige da action: aplicar precisa gravar o que está NA TELA, não uma
  // re-geração do logotipo — senão a cor escolhida pelo usuário some
  // silenciosamente no momento de aplicar.
  test("aplicar com cores editadas persiste EXATAMENTE o que veio da prévia", async () => {
    cenarioA = await criarCenario();
    await configurarLogo(cenarioA.organization.id, urlLogoValida(cenarioA.organization.id));
    autenticarComo(cenarioA);
    vi.mocked(gerarPaletaDoLogo).mockResolvedValue({
      ok: true,
      tokens: TOKENS_FALSOS,
      corMarca: { l: 0.5, c: 0.2, h: 40 },
    });

    // Só "primary" foi trocada no conta-gotas; o resto veio da geração.
    const editados = { ...TOKENS_FALSOS, primary: "oklch(0.319 0.072 251)" };
    const resultado = await aplicarPaletaGerada(editados);
    expect(resultado.success).toBe(true);

    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(branding?.customTheme).toEqual(editados);
    // Prova que não caiu de volta na paleta re-gerada do logotipo.
    expect(branding?.customTheme).not.toEqual(TOKENS_FALSOS);
  });

  test("aplicar sem tokens continua re-gerando do logotipo (comportamento anterior preservado)", async () => {
    cenarioA = await criarCenario();
    await configurarLogo(cenarioA.organization.id, urlLogoValida(cenarioA.organization.id));
    autenticarComo(cenarioA);
    vi.mocked(gerarPaletaDoLogo).mockResolvedValue({
      ok: true,
      tokens: TOKENS_FALSOS,
      corMarca: { l: 0.5, c: 0.2, h: 40 },
    });

    expect((await aplicarPaletaGerada()).success).toBe(true);
    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(branding?.customTheme).toEqual(TOKENS_FALSOS);
  });

  // O que impede CSS arbitrário não é a origem do valor, e sim o
  // tokensTemaSchema — que continua sendo aplicado sobre o que vem do
  // client. Sem isto, aceitar tokens do client seria de fato um buraco.
  test("tokens inválidos vindos do client são recusados, sem gravar nada", async () => {
    cenarioA = await criarCenario();
    await configurarLogo(cenarioA.organization.id, urlLogoValida(cenarioA.organization.id));
    autenticarComo(cenarioA);

    for (const invalido of [
      { ...TOKENS_FALSOS, primary: "red; background: url(x)" },
      { ...TOKENS_FALSOS, primary: "#ff0000" },
      { ...TOKENS_FALSOS, primary: "oklch(5 0.2 40)" },
      { ...TOKENS_FALSOS, extra: "oklch(0.5 0.2 40)" },
      { primary: "oklch(0.5 0.2 40)" },
    ]) {
      const resultado = await aplicarPaletaGerada(invalido);
      expect(resultado.success).toBe(false);
    }

    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    expect(branding).toBeNull();
  });

  test("falha na extração (ex: logo sem cor dominante) não altera o branding existente", async () => {
    cenarioA = await criarCenario();
    await configurarLogo(cenarioA.organization.id, urlLogoValida(cenarioA.organization.id));
    await prisma.organizationBranding.create({
      data: { organizationId: cenarioA.organization.id, themeId: "forest" },
    });
    autenticarComo(cenarioA);
    vi.mocked(gerarPaletaDoLogo).mockResolvedValue({ ok: false, motivo: "sem_cor_dominante" });

    const resultado = await aplicarPaletaGerada();
    expect(resultado.success).toBe(false);

    const branding = await prisma.organizationBranding.findUnique({
      where: { organizationId: cenarioA.organization.id },
    });
    // Continua com o tema que já estava, nunca é sobrescrito por uma
    // tentativa de aplicar que falhou.
    expect(branding?.themeId).toBe("forest");
    expect(branding?.customTheme).toBeNull();
  });

  test("gerarPaletaDoLogo é chamado com a URL do logo já validada (prefixo da própria organização)", async () => {
    cenarioA = await criarCenario();
    const logoValido = urlLogoValida(cenarioA.organization.id);
    await configurarLogo(cenarioA.organization.id, logoValido);
    autenticarComo(cenarioA);
    vi.mocked(gerarPaletaDoLogo).mockResolvedValue({
      ok: true,
      tokens: TOKENS_FALSOS,
      corMarca: { l: 0.5, c: 0.2, h: 40 },
    });

    await gerarPreviaPaletaLogotipo();
    expect(gerarPaletaDoLogo).toHaveBeenCalledWith(logoValido);
  });

  test("logo da organização B nunca é usado ao gerar prévia pra organização A (isolamento na leitura)", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    await configurarLogo(cenarioA.organization.id, urlLogoValida(cenarioA.organization.id));
    await configurarLogo(cenarioB.organization.id, urlLogoValida(cenarioB.organization.id));
    autenticarComo(cenarioA);
    vi.mocked(gerarPaletaDoLogo).mockResolvedValue({
      ok: true,
      tokens: TOKENS_FALSOS,
      corMarca: { l: 0.5, c: 0.2, h: 40 },
    });

    await gerarPreviaPaletaLogotipo();
    expect(gerarPaletaDoLogo).toHaveBeenCalledWith(urlLogoValida(cenarioA.organization.id));
    expect(gerarPaletaDoLogo).not.toHaveBeenCalledWith(urlLogoValida(cenarioB.organization.id));
  });
});
