import { test, expect } from "@playwright/test";
import { IDS_E2E } from "./helpers";

// =======================================================================
// Prévia rica ao compartilhar imóvel — Open Graph (MKT-005)
// =======================================================================
// A metadata (og:title/og:description/og:url/og:type/canonical) já
// existia e já estava correta — confirmado por fetch direto do HTML de
// produção antes de qualquer mudança. O defeito real era og:image
// apontar pro arquivo bruto (pode ser webp, formato que o crawler de
// preview do WhatsApp historicamente não renderiza); a correção troca
// só essa URL pela rota /api/og-image/[organizationId]/[propertyId],
// que serve a MESMA foto de capa convertida pra JPEG sob demanda.
//
// Fixtures: imovelGaleria1 (Org Recursos) tem 1 foto REAL em data: URL
// (mesmo padrão já usado por anuncio-imovel.spec.ts — resolve de
// verdade, sem depender de rede externa). imovelGaleria0 não tem foto
// nenhuma. imovelNavegacaoRascunho é DRAFT (sem ficha pública).

const BASE = "/e2e-org-recursos";
const ficha = (id: string) => `${BASE}/imoveis/${id}`;

async function metaContent(page: import("@playwright/test").Page, selector: string) {
  return page.locator(selector).first().getAttribute("content");
}

test.describe("Open Graph — imóvel com foto", () => {
  test("og:title/og:description/og:url/og:type/canonical corretos, e og:image aponta para a rota de conversão (nunca a URL bruta)", async ({
    page,
  }) => {
    await page.goto(ficha(IDS_E2E.imovelGaleria1));

    await expect(page).toHaveTitle(/Imovel Galeria 1 E2E/);
    expect(await metaContent(page, 'meta[property="og:title"]')).toContain("Imovel Galeria 1 E2E");
    expect(await metaContent(page, 'meta[property="og:type"]')).toBe("website");

    const ogUrl = await metaContent(page, 'meta[property="og:url"]');
    expect(ogUrl).toMatch(/\/e2e-org-recursos\/imoveis\/e2e-imovel-galeria-1$/);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    // A MESMA URL em og:url e em canonical — é o contrato que o botão
    // Compartilhar também usa (urlCanonicaDoImovel, reaproveitado sem
    // alteração nesta fase).
    expect(canonical).toBe(ogUrl);

    const ogImage = await metaContent(page, 'meta[property="og:image"]');
    expect(ogImage).not.toBeNull();
    expect(ogImage).toMatch(/^https?:\/\//); // absoluta
    expect(ogImage).toMatch(/\/api\/og-image\/[^/]+\/e2e-imovel-galeria-1$/);
    // Nunca a URL bruta de Media.url (R2/data:, nunca blob:).
    expect(ogImage).not.toMatch(/^data:|^blob:/);

    // Seção 20 — sem dimensão inventada: og:image:width/height ausentes.
    await expect(page.locator('meta[property="og:image:width"]')).toHaveCount(0);
    await expect(page.locator('meta[property="og:image:height"]')).toHaveCount(0);

    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe("summary_large_image");
    const twitterImage = await metaContent(page, 'meta[name="twitter:image"]');
    expect(twitterImage).toBe(ogImage);
  });

  test("a URL de og:image responde 200 com Content-Type de imagem, sem autenticação", async ({
    page,
    browser,
  }) => {
    await page.goto(ficha(IDS_E2E.imovelGaleria1));
    const ogImage = await metaContent(page, 'meta[property="og:image"]');
    expect(ogImage).not.toBeNull();
    const caminho = new URL(ogImage!).pathname;

    // Contexto NOVO, sem nenhum cookie de sessão — prova que um crawler
    // externo (sem login nenhum) consegue buscar a imagem (seção 24).
    // baseURL vem do próprio servidor que respondeu `page.goto` (o
    // endereço real do ambiente de teste), não de NEXT_PUBLIC_SITE_URL —
    // em ambiente de teste essa env var pode apontar para uma porta
    // diferente da que o Playwright realmente usa; og:image em si já foi
    // provado absoluto no teste anterior.
    const contextoAnonimo = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const paginaAnonima = await contextoAnonimo.newPage();
    const resposta = await paginaAnonima.request.get(caminho);
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toBe("image/jpeg");
    await contextoAnonimo.close();
  });
});

test.describe("Open Graph — imóvel sem foto", () => {
  test("og:image simplesmente não existe — nunca uma imagem institucional inventada", async ({
    page,
  }) => {
    await page.goto(ficha(IDS_E2E.imovelGaleria0));
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(0);
    // O resto da metadata continua presente mesmo sem foto.
    expect(await metaContent(page, 'meta[property="og:title"]')).not.toBeNull();
  });
});

test.describe("Open Graph — imóvel não público", () => {
  test("a rota de og:image recusa um imóvel DRAFT mesmo com id e organização corretos", async ({
    page,
  }) => {
    // Descobre o organizationId real pela URL de og:image de um imóvel
    // público da MESMA organização — nunca hardcoded.
    await page.goto(ficha(IDS_E2E.imovelGaleria1));
    const ogImagePublica = await metaContent(page, 'meta[property="og:image"]');
    const organizationId = ogImagePublica!.match(/\/api\/og-image\/([^/]+)\//)![1];

    const resposta = await page.request.get(
      `/api/og-image/${organizationId}/${IDS_E2E.imovelNavegacaoRascunho}`
    );
    expect(resposta.status()).toBe(404);
  });

  test("a página pública do imóvel DRAFT continua recusando com notFound (contrato preservado)", async ({
    page,
  }) => {
    const resposta = await page.goto(ficha(IDS_E2E.imovelNavegacaoRascunho));
    expect(resposta?.status()).toBe(404);
  });
});

test.describe("Open Graph — isolamento de tenant", () => {
  test("a rota de og:image recusa um propertyId de OUTRA organização servido sob o organizationId real da Org Recursos", async ({
    page,
  }) => {
    // organizationId REAL da Org Recursos, extraído da própria metadata
    // (nunca hardcoded) — combinado com o id de um imóvel que pertence
    // de verdade à Org A. A combinação não existe no banco (o id é de
    // A, o organizationId é de Recursos), então a query escopada pelos
    // dois precisa recusar — prova o isolamento sem depender de ter
    // outra foto pra extrair um segundo organizationId.
    await page.goto(ficha(IDS_E2E.imovelGaleria1));
    const ogImage = await metaContent(page, 'meta[property="og:image"]');
    const organizationIdRecursos = ogImage!.match(/\/api\/og-image\/([^/]+)\//)![1];

    const resposta = await page.request.get(
      `/api/og-image/${organizationIdRecursos}/${IDS_E2E.imovelComBadgesOrgA}`
    );
    expect(resposta.status()).toBe(404);
  });
});

test.describe("Open Graph — mobile", () => {
  test("390px: a ficha pública continua funcional (metadata não altera UI)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ficha(IDS_E2E.imovelGaleria1));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow).toBe(true);
  });
});
