import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";
import { construirRespostaFavicon } from "@/lib/branding/favicon-response";

// buscarBranding usa unstable_cache (next/cache), que exige o contexto de
// request do Next em runtime — indisponível rodando direto sob Vitest
// ("Invariant: incrementalCache missing"). Mock faz a MESMA leitura sem o
// wrapper de cache — não estamos testando o mecanismo de cache do Next
// aqui (isso é plumbing genérico, já usado em todo o app), só o
// comportamento de construirRespostaFavicon dado um faviconUrl.
vi.mock("@/lib/branding", async () => {
  const { prisma: prismaMock } = await import("@/lib/prisma");
  return {
    buscarBranding: async (organizationId: string) => {
      const branding = await prismaMock.organizationBranding.findUnique({
        where: { organizationId },
      });
      return {
        themeId: branding?.themeId ?? null,
        faviconUrl: branding?.faviconUrl ?? null,
      };
    },
  };
});

const R2_PUBLIC_URL_TESTE = "https://pub-test123.r2.dev";
const UUID_VALIDO = "11111111-2222-3333-4444-555555555555";

function urlValidaPara(organizationId: string) {
  return `${R2_PUBLIC_URL_TESTE}/${organizationId}/site/${UUID_VALIDO}.png`;
}

// construirRespostaFavicon é a lógica usada por [orgSlug]/icon.tsx (que só
// resolve a organização pelo slug e delega — ver comentário lá). Chamado
// direto aqui, com a organização já resolvida, pra não precisar simular o
// runtime do Next em teste. Superfície sensível: fetch(faviconUrl)
// (potencial SSRF/proxy aberto se a URL não for revalidada) e o
// Content-Type repassado ao navegador (potencial XSS se refletir
// texto/html do upstream). Estes testes cobrem exatamente essas duas
// superfícies, mais os casos de organização suspensa/inexistente.
describe("construirRespostaFavicon — favicon por organização", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;

  beforeEach(() => {
    vi.stubEnv("R2_PUBLIC_URL", R2_PUBLIC_URL_TESTE);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("favicon válido do próprio tenant é servido com Content-Type correto", async () => {
    cenario = await criarCenario();
    await prisma.organizationBranding.create({
      data: {
        organizationId: cenario.organization.id,
        themeId: "classic-blue",
        faviconUrl: urlValidaPara(cenario.organization.id),
      },
    });

    const bytesFake = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(bytesFake, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        })
      )
    );

    const resposta = await construirRespostaFavicon({
      id: cenario.organization.id,
      active: true,
    });
    expect(resposta.headers.get("content-type")).toBe("image/png");
    const corpo = new Uint8Array(await resposta.arrayBuffer());
    expect(Array.from(corpo)).toEqual(Array.from(bytesFake));
  });

  test("favicon apontando pra outra organização cai no padrão (defesa em profundidade)", async () => {
    cenario = await criarCenario();
    const outraOrg = await criarCenario();
    try {
      // Simula dado corrompido/legado: URL válida no formato, mas do
      // prefixo de OUTRA organização — nunca deveria acontecer via
      // salvarConfiguracaoContato (que já valida), mas icon.tsx não pode
      // confiar só nisso.
      await prisma.organizationBranding.create({
        data: {
          organizationId: cenario.organization.id,
          themeId: "classic-blue",
          faviconUrl: urlValidaPara(outraOrg.organization.id),
        },
      });

      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const resposta = await construirRespostaFavicon({ id: cenario.organization.id, active: true });
      expect(resposta.headers.get("content-type")).toBe("image/x-icon");
      // Nunca chega a tentar buscar — validarFaviconUrl barra antes do fetch.
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await outraOrg.destruir();
    }
  });

  test("URL externa arbitrária gravada no banco cai no padrão, sem SSRF", async () => {
    cenario = await criarCenario();
    await prisma.organizationBranding.create({
      data: {
        organizationId: cenario.organization.id,
        themeId: "classic-blue",
        faviconUrl: "http://169.254.169.254/latest/meta-data/",
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await construirRespostaFavicon({ id: cenario.organization.id, active: true });
    expect(resposta.headers.get("content-type")).toBe("image/x-icon");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("redirect do upstream não é seguido", async () => {
    cenario = await criarCenario();
    await prisma.organizationBranding.create({
      data: {
        organizationId: cenario.organization.id,
        themeId: "classic-blue",
        faviconUrl: urlValidaPara(cenario.organization.id),
      },
    });

    const fetchMock = vi.fn(async (_url: string, opcoes?: RequestInit) => {
      // Confirma que a rota realmente pede redirect manual — se não
      // pedisse, o teste em si não provaria nada.
      expect(opcoes?.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { Location: "http://169.254.169.254/latest/meta-data/" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await construirRespostaFavicon({ id: cenario.organization.id, active: true });
    expect(resposta.headers.get("content-type")).toBe("image/x-icon");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("Content-Type text/html do upstream é rejeitado (sem refletir HTML same-origin)", async () => {
    cenario = await criarCenario();
    await prisma.organizationBranding.create({
      data: {
        organizationId: cenario.organization.id,
        themeId: "classic-blue",
        faviconUrl: urlValidaPara(cenario.organization.id),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<script>alert(1)</script>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
      )
    );

    const resposta = await construirRespostaFavicon({ id: cenario.organization.id, active: true });
    expect(resposta.headers.get("content-type")).toBe("image/x-icon");
    const texto = await resposta.text();
    expect(texto).not.toContain("<script>");
  });

  test("Content-Type image/svg+xml é rejeitado", async () => {
    cenario = await criarCenario();
    await prisma.organizationBranding.create({
      data: {
        organizationId: cenario.organization.id,
        themeId: "classic-blue",
        faviconUrl: urlValidaPara(cenario.organization.id),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<svg onload=alert(1)></svg>", {
          status: 200,
          headers: { "Content-Type": "image/svg+xml" },
        })
      )
    );

    const resposta = await construirRespostaFavicon({ id: cenario.organization.id, active: true });
    expect(resposta.headers.get("content-type")).toBe("image/x-icon");
  });

  test("falha/timeout no fetch cai no favicon padrão sem propagar erro", async () => {
    cenario = await criarCenario();
    await prisma.organizationBranding.create({
      data: {
        organizationId: cenario.organization.id,
        themeId: "classic-blue",
        faviconUrl: urlValidaPara(cenario.organization.id),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "TimeoutError"))
    );

    const resposta = await construirRespostaFavicon({ id: cenario.organization.id, active: true });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("image/x-icon");
  });

  test("organização suspensa usa favicon padrão, nunca busca o customizado", async () => {
    cenario = await criarCenario();
    await prisma.organizationBranding.create({
      data: {
        organizationId: cenario.organization.id,
        themeId: "classic-blue",
        faviconUrl: urlValidaPara(cenario.organization.id),
      },
    });
    await prisma.organization.update({
      where: { id: cenario.organization.id },
      data: { active: false },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await construirRespostaFavicon({
      id: cenario.organization.id,
      active: false,
    });
    expect(resposta.headers.get("content-type")).toBe("image/x-icon");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("organização inexistente usa favicon padrão", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await construirRespostaFavicon(null);
    expect(resposta.headers.get("content-type")).toBe("image/x-icon");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("organização sem branding configurado usa favicon padrão", async () => {
    cenario = await criarCenario();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await construirRespostaFavicon({ id: cenario.organization.id, active: true });
    expect(resposta.headers.get("content-type")).toBe("image/x-icon");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
