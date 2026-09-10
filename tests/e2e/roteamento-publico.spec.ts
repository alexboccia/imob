import { test, expect } from "@playwright/test";
import { IDS_E2E, ORG_B } from "./helpers";

// =======================================================================
// Roteamento público — o que o rewrite pode e o que ele NUNCA pode
// =======================================================================
// A organização principal é servida na raiz por rewrites gerados a partir
// de src/app/[orgSlug]/ (ver rotas-publicas.ts). O que estes testes
// protegem não é a geração — isso é unitário — e sim as fronteiras: rota
// privada, API e assets internos não podem ser absorvidos, e o
// multi-tenant por caminho tem de continuar de pé.

test.describe("rotas públicas na organização principal", () => {
  for (const caminho of ["/", "/imoveis", "/contato", "/anuncie", "/vendidos"]) {
    test(`${caminho} responde na raiz`, async ({ request }) => {
      const resposta = await request.get(caminho);
      expect(resposta.status()).toBe(200);
    });
  }

  test("detalhe de imóvel responde na raiz", async ({ request }) => {
    const resposta = await request.get(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    expect(resposta.status()).toBe(200);
  });

  test("querystring sobrevive ao rewrite", async ({ request }) => {
    const resposta = await request.get("/imoveis?finalidade=RENT");
    expect(resposta.status()).toBe(200);
    // A página lê o filtro: se a query tivesse sido perdida, o resultado
    // seria a listagem inteira.
    const corpo = await resposta.text();
    expect(corpo).toContain("Cambuí");
  });

  test("rota pública inexistente continua 404", async ({ request }) => {
    const resposta = await request.get("/pagina-que-nao-existe");
    expect(resposta.status()).toBe(404);
  });

  test("corretor inexistente é 404, não a home da organização", async ({ request }) => {
    const resposta = await request.get("/corretores/cmzzzzzzzzzzzzzzzzzzzzzzz");
    expect(resposta.status()).toBe(404);
  });

  test("imóvel inexistente é 404", async ({ request }) => {
    const resposta = await request.get("/imoveis/nao-existe-mesmo");
    expect(resposta.status()).toBe(404);
  });
});

test.describe("fronteiras que o rewrite não pode cruzar", () => {
  test("/app/login continua sendo a tela de login, não uma página de tenant", async ({
    request,
  }) => {
    const resposta = await request.get("/app/login");
    expect(resposta.status()).toBe(200);
    expect(await resposta.text()).toContain("Entrar");
  });

  test("/app protegido continua redirecionando para o login", async ({ request }) => {
    const resposta = await request.get("/app/imoveis", { maxRedirects: 0 });
    expect([302, 307]).toContain(resposta.status());
    expect(resposta.headers()["location"]).toContain("/app/login");
  });

  test("/api/health continua respondendo JSON de API", async ({ request }) => {
    const resposta = await request.get("/api/health");
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toContain("application/json");
    expect(await resposta.json()).toHaveProperty("status");
  });

  test("/api inexistente é 404 de API, nunca uma página de organização", async ({
    request,
  }) => {
    const resposta = await request.get("/api/rota-inexistente");
    expect(resposta.status()).toBe(404);
    // Se o rewrite tivesse capturado, viria HTML da organização.
    expect(await resposta.text()).not.toContain("Organização E2E A");
  });

  test("/_next não é capturado", async ({ request }) => {
    const resposta = await request.get("/_next/static/nao-existe.js");
    expect(resposta.status()).toBe(404);
    expect(await resposta.text()).not.toContain("Organização E2E A");
  });

  test("arquivo estático público não é capturado", async ({ request }) => {
    const resposta = await request.get("/robots.txt");
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toContain("text");
    expect(await resposta.text()).not.toContain("<html");
  });

  test("sitemap.xml continua XML e lista as URLs públicas", async ({ request }) => {
    const resposta = await request.get("/sitemap.xml");
    expect(resposta.status()).toBe(200);
    const corpo = await resposta.text();
    expect(corpo).toContain("<urlset");
    expect(corpo).toContain("/imoveis/");
  });
});

test.describe("multi-tenant por caminho continua intacto", () => {
  test("outra organização responde pelo caminho explícito", async ({ request }) => {
    const resposta = await request.get(`/${ORG_B.slug}/imoveis`);
    expect(resposta.status()).toBe(200);
    const corpo = await resposta.text();
    expect(corpo).toContain("Organização E2E B");
    // O rewrite da organização principal não pode ter sequestrado o
    // caminho: se tivesse, aqui viria o conteúdo da Org A.
    expect(corpo).not.toContain("Organização E2E A");
  });

  test("detalhe de imóvel de outra organização pelo caminho explícito", async ({
    request,
  }) => {
    const resposta = await request.get(`/${ORG_B.slug}/imoveis/${IDS_E2E.imovelOrgB}`);
    expect(resposta.status()).toBe(200);
  });

  test("imóvel de outro tenant continua isolado sob a organização principal", async ({
    request,
  }) => {
    const resposta = await request.get(`/imoveis/${IDS_E2E.imovelOrgB}`);
    expect(resposta.status()).toBe(404);
  });

  test("organização inexistente no caminho é 404", async ({ request }) => {
    const resposta = await request.get("/org-que-nao-existe/imoveis");
    expect(resposta.status()).toBe(404);
  });

  test("canonical da organização principal não ganha o slug", async ({ request }) => {
    const corpo = await (await request.get(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`)).text();
    const canonical = corpo.match(/rel="canonical"[^>]*href="([^"]+)"/)?.[1];
    expect(canonical).toBeTruthy();
    expect(canonical).toContain(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    expect(canonical).not.toContain("/e2e-org-a/");
  });
});
