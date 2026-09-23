import { test, expect, type Page } from "@playwright/test";
import { ORG_NAVEGACAO, esperarJanelaAntiSpam } from "./helpers";

// =======================================================================
// Landing "Anuncie seu imóvel" (Fase 60)
// =======================================================================
// A página virou uma landing de conversão. O que ela NÃO pode ter feito:
// perder o formulário real, a proteção antiabuso, o header/rodapé do
// tenant, ou passar a afirmar dado institucional que a organização não
// configurou.

const ANUNCIE = "/anuncie";

const hero = (page: Page) => page.locator("[data-hero-anuncie]");
const faixa = (page: Page) => page.locator("[data-faixa-anuncie]");
const comoFunciona = (page: Page) => page.locator("[data-como-funciona]");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.sendBeacon = () => true;
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
});

test.describe("estrutura da página", () => {
  test("hero, faixa e etapas convivem com o header e o rodapé de sempre", async ({ page }) => {
    await page.goto(ANUNCIE);

    await expect(hero(page)).toBeVisible();
    await expect(comoFunciona(page)).toBeVisible();

    // Header e rodapé do site, únicos e intactos.
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.locator("footer")).toHaveCount(1);
    await expect(page.locator("[data-logo-site]")).toHaveCount(1);
    await expect(page.locator("header [data-link-favoritos]").first()).toBeVisible();
    // A navegação do tenant continua inteira — os quatro itens de
    // sempre, servidos pelo header do site e não por esta página.
    const nav = page.locator("header nav").first();
    for (const item of ["Comprar", "Alugar", "Lançamentos", "Anuncie seu imóvel"]) {
      await expect(nav.getByRole("link", { name: item })).toHaveCount(1);
    }
  });

  test("o item do menu continua ativo nesta rota", async ({ page }) => {
    await page.goto(ANUNCIE);
    const nav = page.locator("header nav").first();
    await expect(nav.locator('a[aria-current="page"]')).toHaveText("Anuncie seu imóvel");
  });

  test("a proposta de valor está escrita, não só na foto", async ({ page }) => {
    await page.goto(ANUNCIE);
    await expect(
      page.getByRole("heading", { level: 1, name: /Anuncie seu imóvel com quem entende de valor/ })
    ).toBeVisible();
    await expect(hero(page)).toContainText("Venda ou alugue");
    for (const beneficio of [
      "Avaliação especializada",
      "Divulgação profissional",
      "Atendimento personalizado",
    ]) {
      await expect(hero(page)).toContainText(beneficio);
    }
  });

  test("as três etapas aparecem, numeradas", async ({ page }) => {
    await page.goto(ANUNCIE);
    await expect(comoFunciona(page)).toContainText("É simples anunciar seu imóvel");
    await expect(comoFunciona(page).locator("ol > li")).toHaveCount(3);
    for (const etapa of ["Envie os dados", "Entramos em contato", "Avaliamos e divulgamos"]) {
      await expect(comoFunciona(page)).toContainText(etapa);
    }
  });

  test("a fotografia é servida pela própria aplicação, e é decorativa", async ({ page }) => {
    await page.goto(ANUNCIE);
    const img = hero(page).locator("img").first();
    const src = (await img.getAttribute("src")) ?? "";
    // Asset local: nada de URL externa nem base64.
    expect(src).not.toMatch(/^data:/);
    expect(src).not.toMatch(/^https?:\/\//);
    expect(decodeURIComponent(src)).toContain("/anuncie-hero.webp");
    // A foto não carrega informação: o texto ao lado já diz tudo.
    await expect(img).toHaveAttribute("alt", "");

    // E o arquivo existe de verdade.
    const resposta = await page.request.get("/anuncie-hero.webp");
    expect(resposta.status()).toBe(200);
  });
});

test.describe("o formulário real continua no lugar", () => {
  test("mantém os campos e a proteção antiabuso", async ({ page }) => {
    await page.goto(ANUNCIE);

    for (const campo of ["#nome", "#email", "#telefone", 'textarea[name="descricaoImovel"]']) {
      await expect(page.locator(campo)).toBeVisible();
    }
    // Honeypot e relógio anti-spam continuam dentro do form.
    await expect(page.locator('form input[name="website"]')).toHaveCount(1);
    await expect(page.locator('form input[name="renderizadoEm"]')).toHaveCount(1);
    // E a política é a rota real do tenant, não uma segunda página.
    await expect(page.locator("[data-link-politica]")).toHaveAttribute(
      "href",
      /\/politica-de-privacidade$/
    );
  });

  test("cada campo tem rótulo associado de verdade", async ({ page }) => {
    await page.goto(ANUNCIE);
    for (const [id, rotulo] of [
      ["nome", /Nome/],
      ["email", /E-mail/],
      ["telefone", /Telefone/],
      ["descricaoImovel", /Descrição do imóvel/],
    ] as const) {
      const campo = page.locator(`#${id}`);
      await expect(campo).toHaveCount(1);
      await expect(page.locator(`label[for='${id}']`)).toHaveText(rotulo);
    }
  });

  test("dá para preencher e enviar só pelo teclado", async ({ page }) => {
    await page.goto(ANUNCIE);
    await esperarJanelaAntiSpam(page);

    const marcador = `Teclado ${Date.now()}`;
    await page.locator("#nome").focus();
    await expect(page.locator("#nome")).toBeFocused();
    await page.keyboard.type(marcador);
    await page.keyboard.press("Tab");
    await page.keyboard.type("teclado@e2e.test");
    await page.keyboard.press("Tab");
    await page.keyboard.type(`119${String(Date.now()).slice(-8)}`);
    await page.keyboard.press("Tab");
    await page.keyboard.type("Casa para anunciar, enviada pelo teclado.");

    const enviar = page.getByRole("button", { name: /Quero anunciar meu imóvel/ });
    await enviar.focus();
    await expect(enviar).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Recebemos seus dados/)).toBeVisible();
  });

  test("envio válido continua sendo aceito", async ({ page }) => {
    await page.goto(ANUNCIE);
    await esperarJanelaAntiSpam(page);
    await page.locator("#nome").fill(`Proprietário ${Date.now()}`);
    await page.locator("#telefone").fill(`119${String(Date.now()).slice(-8)}`);
    await page.locator('textarea[name="descricaoImovel"]').fill("Apartamento de 2 quartos.");
    await page.getByRole("button", { name: /Quero anunciar meu imóvel/ }).click();
    await expect(page.getByText(/Recebemos seus dados/)).toBeVisible();
  });

  test("envio rápido demais continua sendo recusado", async ({ page }) => {
    await page.goto(ANUNCIE);
    // SEM esperar a janela anti-spam: é o caminho do bot.
    await page.locator("#nome").fill("Bot Apressado");
    await page.locator("#telefone").fill(`119${String(Date.now()).slice(-8)}`);
    await page.locator('textarea[name="descricaoImovel"]').fill("Envio instantâneo.");
    await page.getByRole("button", { name: /Quero anunciar meu imóvel/ }).click();

    // Escopado ao formulário: o Next mantém um `role="alert"` próprio
    // (o anunciador de rota) fora dele.
    await expect(page.locator("form").getByRole("alert")).toContainText(/rápido/i);
    await expect(page.getByText(/Recebemos seus dados/)).toHaveCount(0);
  });

  test("campos obrigatórios seguem barrando o envio vazio", async ({ page }) => {
    await page.goto(ANUNCIE);
    await page.getByRole("button", { name: /Quero anunciar meu imóvel/ }).click();
    await expect(page.locator("#nome")).toBeVisible();
    await expect(page.getByText(/Recebemos seus dados/)).toHaveCount(0);
  });
});

test.describe("dados institucionais vêm da organização", () => {
  test("a faixa mostra o que o tenant configurou, com links reais", async ({ page }) => {
    await page.goto(ANUNCIE);
    await expect(faixa(page)).toBeVisible();

    // A Org A tem telefone e WhatsApp no seed/configuração pública.
    const telefone = page.locator("[data-item-faixa='telefone'] a");
    if ((await telefone.count()) > 0) {
      await expect(telefone).toHaveAttribute("href", /^tel:\+\d{8,}$/);
    }
    const whats = page.locator("[data-item-faixa='whatsapp'] a");
    if ((await whats.count()) > 0) {
      await expect(whats).toHaveAttribute("href", /^https:\/\/wa\.me\//);
      await expect(whats).toHaveAttribute("rel", /noopener/);
    }
  });

  test("nada da Boccia está fixo no código", async ({ page }) => {
    // Esta organização do seed não é a Boccia: se algum dado dela
    // tivesse sido escrito na página, apareceria aqui.
    await page.goto(`/${ORG_NAVEGACAO.slug}/anuncie`);
    const texto = await page.locator("main").innerText();
    for (const valor of ["Boccia", "97606-9213"]) {
      expect(texto, `dado fixo encontrado: ${valor}`).not.toContain(valor);
    }
  });

  test("dado não configurado não vira placeholder", async ({ page }) => {
    await page.goto(`/${ORG_NAVEGACAO.slug}/anuncie`);
    // Seja qual for a configuração desta organização, a faixa nunca
    // inventa: ou o item existe com valor real, ou não existe.
    const itens = page.locator("[data-item-faixa]");
    for (const item of await itens.all()) {
      const t = (await item.innerText()).trim();
      expect(t.length).toBeGreaterThan(0);
      expect(t).not.toMatch(/exemplo|placeholder|xxx|lorem|—\s*$/i);
    }
  });
});

test.describe("responsividade", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: sem estouro, com formulário e CTA inteiros`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(ANUNCIE);

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
        `estouro @ ${largura}`
      ).toBe(true);

      // O formulário cabe inteiro na largura.
      const form = (await page.locator("form").first().boundingBox())!;
      expect(form.x).toBeGreaterThanOrEqual(-0.5);
      expect(form.x + form.width).toBeLessThanOrEqual(largura + 0.5);

      // O CTA está dentro da viewport horizontal.
      const cta = (await page
        .getByRole("button", { name: /Quero anunciar meu imóvel/ })
        .boundingBox())!;
      expect(cta.x).toBeGreaterThanOrEqual(-0.5);
      expect(cta.x + cta.width).toBeLessThanOrEqual(largura + 0.5);

      // Header e rodapé continuam inteiros.
      for (const sel of ["header", "footer"]) {
        const c = (await page.locator(sel).boundingBox())!;
        expect(c.x + c.width, `${sel} @ ${largura}`).toBeLessThanOrEqual(largura + 0.5);
      }
    });
  }

  test("no desktop o texto fica à esquerda e o formulário à direita", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(ANUNCIE);

    const titulo = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const form = (await page.locator("form").first().boundingBox())!;
    expect(titulo.x + titulo.width).toBeLessThanOrEqual(form.x + 1);
  });

  test("no celular vira uma coluna só, sem o texto invadir o formulário", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(ANUNCIE);

    const titulo = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const form = (await page.locator("form").first().boundingBox())!;
    // Empilhados: o formulário começa abaixo do título.
    expect(form.y).toBeGreaterThan(titulo.y + titulo.height - 1);
  });
});
