import { test, expect } from "@playwright/test";

// Redesign do site público (Proposta 2) — roda no host padrão (sem
// prefixo de slug: PUBLIC_ORG_SLUG=e2e-org-a em .env.test), já seedado
// com 2 imóveis AVAILABLE: "Apartamento com 2 quartos à venda, 58m² –
// Santo Amaro" (isLaunch/isFeatured/isOpportunity = true, aparece nas 3
// seções da Home) e "Apartamento E2E para edição" (sem badges, só
// aparece na listagem geral/busca). Ver prisma/seed-e2e.ts.
const IMOVEL_COM_BADGES = "Apartamento com 2 quartos à venda, 58m² – Santo Amaro";

async function semOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

test.describe("Site público — Home (Proposta 2)", () => {
  test("renderiza header, hero e painel de busca", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Encontre o imóvel ideal para você" })).toBeVisible();
    await expect(page.getByText("Apartamentos, casas e imóveis comerciais selecionados para você.")).toBeVisible();

    // Comprar/Alugar + campos reais do painel de busca.
    await expect(page.getByRole("button", { name: "Comprar", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Alugar", exact: true })).toBeVisible();
    await expect(page.getByLabel("Bairro")).toBeVisible();
    await expect(page.getByLabel("Tipo de imóvel")).toBeVisible();
    await expect(page.getByLabel("Valor mínimo")).toBeVisible();
    await expect(page.getByLabel("Valor máximo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Buscar imóveis" })).toBeVisible();
  });

  test("menu principal tem as rotas reais (Comprar/Alugar/Lançamentos)", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("header nav");
    await expect(nav.getByRole("link", { name: "Comprar" })).toHaveAttribute("href", /finalidade=SALE/);
    await expect(nav.getByRole("link", { name: "Alugar" })).toHaveAttribute("href", /finalidade=RENT/);
    await expect(nav.getByRole("link", { name: "Lançamentos" })).toHaveAttribute("href", /lancamento=1/);
  });

  test("Lançamentos, Destaques e Oportunidades mostram o imóvel com os 3 badges; 'Ver tudo' aponta pro filtro certo", async ({
    page,
  }) => {
    await page.goto("/");

    for (const { titulo, hrefParte } of [
      { titulo: "Lançamentos", hrefParte: "lancamento=1" },
      { titulo: "Destaques", hrefParte: "destaque=1" },
      { titulo: "Oportunidades", hrefParte: "oportunidade=1" },
    ]) {
      const secao = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: titulo }) });
      await expect(secao.getByText(IMOVEL_COM_BADGES, { exact: true })).toBeVisible();
      // role="button" (não "link"): Button com render={<Link/>} preserva
      // role="button" mesmo composto sobre uma <a> de verdade — mesmo
      // achado documentado em imoveis.spec.ts pro botão "+ Novo imóvel".
      await expect(secao.getByRole("button", { name: "Ver tudo" })).toHaveAttribute("href", new RegExp(hrefParte));
    }
  });

  test("Comprar leva pra listagem filtrada por venda", async ({ page }) => {
    await page.goto("/");
    await page.locator("header nav").getByRole("link", { name: "Comprar" }).click();
    await page.waitForURL(/finalidade=SALE/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Resultados da busca");
  });

  test("painel de busca da Home executa a busca real (Comprar/Alugar + bairro + tipo + valor)", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Alugar", exact: true }).click();
    await page.getByLabel("Bairro").selectOption("Centro");
    await page.getByLabel("Tipo de imóvel").selectOption("Apartamento");
    await page.getByLabel("Valor mínimo").fill("1000");
    await page.getByRole("button", { name: "Buscar imóveis" }).click();

    await page.waitForURL(/\/imoveis\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("finalidade")).toBe("RENT");
    expect(url.searchParams.get("bairro")).toBe("Centro");
    expect(url.searchParams.get("tipo")).toBe("Apartamento");
    expect(url.searchParams.get("precoMin")).toBe("1000");
  });

  test("card de imóvel leva pro detalhe", async ({ page }) => {
    await page.goto("/");
    await page.getByText(IMOVEL_COM_BADGES, { exact: true }).first().click();
    await page.waitForURL(/\/imoveis\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name: IMOVEL_COM_BADGES })).toBeVisible();
  });
});

test.describe("Site público — navegação mobile", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("hamburger abre o menu, navega e fecha", async ({ page }) => {
    await page.goto("/");
    const hamburguer = page.getByRole("button", { name: "Abrir menu" });
    await expect(hamburguer).toBeVisible();
    await hamburguer.click();

    const menu = page.locator("header nav").last();
    await expect(menu.getByRole("link", { name: "Alugar" })).toBeVisible();
    await menu.getByRole("link", { name: "Alugar" }).click();
    await page.waitForURL(/finalidade=RENT/);
  });
});

test.describe("Site público — listagem e detalhe", () => {
  // Só verifica o imóvel com badges por título exato — a outra fixture
  // fixa (imovelParaEditarOrgA) é renomeada por imoveis.spec.ts ("edita
  // um imóvel existente") ao rodar a suíte completa, e outros specs
  // (ex: "cria um imóvel") deixam imóveis novos publicados sem limpeza
  // própria — depender de um título ou de uma contagem exata aqui seria
  // frágil entre specs. ">= 2" ainda prova que a listagem pública reflete
  // dados reais (nunca zerada), sem acoplar a este teste a fixtures de
  // outras telas.
  test("listagem mostra os imóveis reais, com contagem coerente", async ({ page }) => {
    await page.goto("/imoveis");
    await expect(page.getByText(IMOVEL_COM_BADGES, { exact: true })).toBeVisible();
    const contador = await page.getByText(/imóve(l|is) encontrado/).textContent();
    const total = Number(contador?.match(/\d+/)?.[0] ?? 0);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  test("detalhe do imóvel mostra título, preço e formulário de contato", async ({ page }) => {
    await page.goto("/imoveis");
    await page.getByText(IMOVEL_COM_BADGES, { exact: true }).first().click();
    await page.waitForURL(/\/imoveis\/[^/]+$/);

    await expect(page.getByRole("heading", { level: 1, name: IMOVEL_COM_BADGES })).toBeVisible();
    await expect(page.getByText("R$ 500.000", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Falar no WhatsApp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeVisible();
  });
});

test.describe("Site público — responsividade (360/375/768/1024/1440)", () => {
  const BREAKPOINTS = [360, 375, 768, 1024, 1440];

  for (const width of BREAKPOINTS) {
    test(`Home ${width}px: sem overflow horizontal, hero e painel de busca legíveis`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      expect(await semOverflow(page), `Home @ ${width}px`).toBe(true);
      await expect(page.getByRole("heading", { level: 1, name: "Encontre o imóvel ideal para você" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Buscar imóveis" })).toBeVisible();

      if (width < 640) {
        await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
      } else {
        await expect(page.locator("header nav").first().getByRole("link", { name: "Comprar" })).toBeVisible();
      }
    });

    test(`Listagem ${width}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/imoveis");
      expect(await semOverflow(page), `Listagem @ ${width}px`).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });

    test(`Detalhe ${width}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/imoveis");
      await page.getByText(IMOVEL_COM_BADGES, { exact: true }).first().click();
      await page.waitForURL(/\/imoveis\/[^/]+$/);
      await page.setViewportSize({ width, height: 900 });
      expect(await semOverflow(page), `Detalhe @ ${width}px`).toBe(true);
      await expect(page.getByRole("heading", { level: 1, name: IMOVEL_COM_BADGES })).toBeVisible();
    });
  }
});
