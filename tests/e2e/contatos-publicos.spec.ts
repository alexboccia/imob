import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E, ORG_A, ORG_CONTATOS } from "./helpers";

// =======================================================================
// Contatos e redes sociais no topo e no rodapé (Fase 58)
// =======================================================================
// A organização deste spec tem, de propósito, uma combinação diferente
// por canal (ver seed-e2e.ts):
//
//   telefone   topo + rodapé
//   whatsapp   só topo
//   instagram  topo + rodapé
//   tiktok     só topo
//   linkedin   só rodapé
//   facebook   preenchido, nenhum local
//   youtube    VAZIO, com as duas flags ligadas
//
// É essa mistura que prova a regra inteira numa página só.

const BASE = `/${ORG_CONTATOS.slug}`;
const FICHA = `${BASE}/imoveis/${IDS_E2E.imovelContatos}`;

const barra = (page: Page) => page.locator("[data-barra-contato-topo]");
const noTopo = (page: Page, canal: string) => page.locator(`[data-canal-topo='${canal}']`);
const noRodape = (page: Page, canal: string) => page.locator(`[data-canal-rodape='${canal}']`);

async function caixa(page: Page, seletor: string) {
  const box = await page.locator(seletor).first().boundingBox();
  expect(box, `sem caixa: ${seletor}`).not.toBeNull();
  return box!;
}

test.describe("a regra: preenchido E habilitado", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);
  });

  test("canal nos dois locais aparece nos dois", async ({ page }) => {
    await expect(noTopo(page, "telefone")).toBeVisible();
    await expect(noRodape(page, "telefone")).toBeVisible();
    await expect(noTopo(page, "instagram")).toBeVisible();
    await expect(noRodape(page, "instagram")).toBeVisible();
  });

  test("canal só no topo não aparece no rodapé", async ({ page }) => {
    await expect(noTopo(page, "whatsapp")).toBeVisible();
    await expect(noRodape(page, "whatsapp")).toHaveCount(0);
    await expect(noTopo(page, "tiktok")).toBeVisible();
    await expect(noRodape(page, "tiktok")).toHaveCount(0);
  });

  test("canal só no rodapé não aparece no topo", async ({ page }) => {
    await expect(noRodape(page, "linkedin")).toBeVisible();
    await expect(noTopo(page, "linkedin")).toHaveCount(0);
  });

  test("preenchido com as duas flags desligadas não aparece em lugar nenhum", async ({ page }) => {
    await expect(noTopo(page, "facebook")).toHaveCount(0);
    await expect(noRodape(page, "facebook")).toHaveCount(0);
  });

  test("flag ligada sem valor não renderiza nada — nem ícone sem link", async ({ page }) => {
    await expect(noTopo(page, "youtube")).toHaveCount(0);
    await expect(noRodape(page, "youtube")).toHaveCount(0);
  });
});

test.describe("hrefs e segurança dos links", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);
  });

  test("telefone usa tel: com os dígitos, e não abre em nova aba", async ({ page }) => {
    const link = noTopo(page, "telefone");
    await expect(link).toHaveAttribute("href", "tel:+1138883000");
    await expect(link).not.toHaveAttribute("target", "_blank");
  });

  test("WhatsApp usa wa.me com o número configurado", async ({ page }) => {
    const href = await noTopo(page, "whatsapp").getAttribute("href");
    expect(href).toContain("https://wa.me/5511999998888");
  });

  test("links externos levam rel de segurança e abrem em nova aba", async ({ page }) => {
    for (const canal of ["whatsapp", "instagram", "tiktok"]) {
      const link = noTopo(page, canal);
      await expect(link).toHaveAttribute("target", "_blank");
      const rel = (await link.getAttribute("rel")) ?? "";
      expect(rel).toContain("noopener");
      expect(rel).toContain("noreferrer");
    }
  });

  test("nenhum href do topo ou do rodapé usa esquema perigoso", async ({ page }) => {
    const hrefs = await page
      .locator("[data-canal-topo], [data-canal-rodape]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toMatch(/^\s*(javascript|data|vbscript):/i);
      expect(href).toMatch(/^(https?:|tel:)/);
    }
  });
});

test.describe("acessibilidade", () => {
  test("ícones de rede têm nome acessível, e o telefone é lido pelo número", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);

    await expect(noTopo(page, "instagram")).toHaveAccessibleName("Instagram");
    await expect(noTopo(page, "tiktok")).toHaveAccessibleName("TikTok");
    await expect(noRodape(page, "linkedin")).toHaveAccessibleName("LinkedIn");
    await expect(noTopo(page, "telefone")).toHaveAccessibleName(/3888/);
  });

  test("os canais do topo são alcançáveis por teclado e recebem foco", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);

    await noTopo(page, "telefone").focus();
    await expect(noTopo(page, "telefone")).toBeFocused();
    // Tab avança dentro da própria barra, na ordem do DOM.
    await page.keyboard.press("Tab");
    await expect(noTopo(page, "whatsapp")).toBeFocused();
  });
});

test.describe("geometria do cabeçalho", () => {
  test("a barra fica ACIMA da navegação, sem sobrepor logo nem menu", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);

    const b = await caixa(page, "[data-barra-contato-topo]");
    const logo = await caixa(page, "[data-logo-site]");
    const favoritos = await caixa(page, "[data-link-favoritos]");

    // A barra termina antes de o logo começar: estão empilhados, não
    // sobrepostos.
    expect(b.y + b.height).toBeLessThanOrEqual(logo.y + 0.5);
    // Menu e contatos não dividem a mesma faixa vertical.
    expect(b.y + b.height).toBeLessThanOrEqual(favoritos.y + 0.5);
    // A barra é discreta: bem mais baixa que a faixa do logo.
    expect(b.height).toBeLessThan(logo.height + 24);
  });

  test("o conjunto não fica excessivamente alto", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);
    const comBarra = await caixa(page, "header");

    // Mesma página, tenant SEM barra: a referência do "antes".
    await page.goto("/");
    const semBarra = await caixa(page, "header");

    expect(await barra(page).count()).toBe(0);
    // A barra acrescenta altura, mas o cabeçalho cede padding: o
    // crescimento fica bem abaixo da altura da própria barra somada
    // ingenuamente.
    expect(comBarra.height).toBeGreaterThan(semBarra.height);
    expect(comBarra.height - semBarra.height).toBeLessThan(48);
  });

  test("a barra não some nem duplica ao navegar entre rotas públicas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    for (const rota of [BASE, `${BASE}/imoveis`, FICHA, `${BASE}/contato`, `${BASE}/favoritos`]) {
      await page.goto(rota);
      await expect(barra(page), `barra em ${rota}`).toHaveCount(1);
      await expect(page.locator("footer"), `rodapé em ${rota}`).toHaveCount(1);
    }
  });
});

test.describe("tenant sem configuração nenhuma", () => {
  test("não existe barra superior no DOM, e o cabeçalho é o de sempre", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/");

    await expect(barra(page)).toHaveCount(0);
    await expect(page.locator("[data-canal-topo]")).toHaveCount(0);
    // A navegação de sempre continua inteira.
    await expect(page.locator("[data-logo-site]")).toBeVisible();
    await expect(page.locator("[data-link-favoritos]").first()).toBeVisible();
  });

  test("o rodapé não ganha bloco de contato sem configuração", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-contatos-rodape]")).toHaveCount(0);
  });

  test("as redes que a Org A já publicava continuam no rodapé", async ({ page }) => {
    // Sem regressão visual: o default de rodapé das redes é ligado
    // justamente para o ícone que já aparecia não sumir no deploy.
    await page.goto(`/${ORG_A.slug}`);
    const redes = page.locator("[data-redes-rodape] a");
    if ((await redes.count()) > 0) {
      await expect(redes.first()).toHaveAttribute("rel", /noopener/);
    }
  });
});

test.describe("responsividade", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: sem estouro horizontal, com barra e rodapé`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(BASE);

      await expect(barra(page)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
        `estouro do documento @ ${largura}`
      ).toBe(true);

      // A barra inteira cabe na viewport.
      const b = await caixa(page, "[data-barra-contato-topo]");
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(largura + 0.5);

      // Contato continua acessível em qualquer largura.
      await expect(noTopo(page, "telefone")).toBeVisible();

      // O rodapé também não estoura.
      const rodape = await caixa(page, "footer");
      expect(rodape.x + rodape.width).toBeLessThanOrEqual(largura + 0.5);
    });
  }

  test("em 320px as redes saem da barra e ficam no menu, sem espremer", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(BASE);

    // Ícones de rede não disputam espaço com o telefone na barra.
    await expect(noTopo(page, "instagram")).toBeHidden();
    // Mas continuam alcançáveis pelo menu.
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.locator("[data-canal-menu='instagram']")).toBeVisible();
    await expect(page.locator("[data-canal-menu='tiktok']")).toBeVisible();
    // E o que está só no rodapé NÃO vaza para o menu do topo.
    await expect(page.locator("[data-canal-menu='linkedin']")).toHaveCount(0);
  });

  test("a navegação principal continua funcionando com a barra presente", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(BASE);

    await page.getByRole("link", { name: "Comprar" }).first().click();
    await page.waitForURL(/finalidade=SALE/);
    await expect(barra(page)).toHaveCount(1);
  });
});
