import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  IDS_E2E,
  ORG_PORTFOLIO,
  despublicarPerfisNoBanco,
  esperarJanelaAntiSpam,
  publicarPerfisNoBanco,
} from "./helpers";

// =======================================================================
// Lateral da ficha + Política de Privacidade (Fase 51)
// =======================================================================
// A ordem da lateral é: preço e CTAs → corretor responsável → "Receba
// mais informações" → formulário → política de privacidade.
//
// Organização Portfólio (seed): o imóvel da Sônia tem responsável com
// perfil completo (foto, CRECI, bio e os três contatos públicos), e
// existe um imóvel SEM responsável para o caminho sem corretor.

const BASE = `/${ORG_PORTFOLIO.slug}`;
const SONIA = IDS_E2E.membroPortfolioSonia;
const FICHA_COM_CORRETOR = `${BASE}/imoveis/${IDS_E2E.imovelPortfolioSonia}`;
const FICHA_SEM_CORRETOR = `${BASE}/imoveis/e2e-imovel-portfolio-sem-responsavel`;
const POLITICA = `${BASE}/politica-de-privacidade`;

const lateral = (page: Page) => page.locator("[data-card-contato]");
const corretor = (page: Page) => page.locator("[data-card-corretor]");
const formulario = (page: Page) => lateral(page).locator("form");
const linkPolitica = (page: Page) =>
  lateral(page).getByRole("link", { name: "Política de Privacidade" });

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

/** O topo de cada peça da lateral, na ordem em que aparecem na tela. */
async function ordemDaLateral(page: Page, comCorretor: boolean) {
  const alvos: [string, Locator][] = [
    ["preço", lateral(page).locator("[data-preco]").first()],
    ...(comCorretor
      ? ([["corretor", corretor(page)]] as [string, Locator][])
      : []),
    ["título do formulário", lateral(page).getByRole("heading", { name: "Receba mais informações" })],
    ["campo nome", formulario(page).getByLabel("Nome")],
    ["botão enviar", formulario(page).getByRole("button", { name: "Enviar mensagem" })],
    ["política", linkPolitica(page)],
  ];
  const medidos: { nome: string; y: number }[] = [];
  for (const [nome, alvo] of alvos) medidos.push({ nome, y: (await caixa(alvo)).y });
  return medidos;
}

function errosDoConsole(page: Page) {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

test.beforeAll(() => publicarPerfisNoBanco(SONIA));
test.afterAll(() => despublicarPerfisNoBanco(ORG_PORTFOLIO.slug));

// -----------------------------------------------------------------------
// Composição
// -----------------------------------------------------------------------
test.describe("composição da lateral", () => {
  for (const largura of [1024, 1280, 1440]) {
    test(`${largura}px: preço → corretor → Receba mais informações → formulário → política`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA_COM_CORRETOR);

      const ordem = await ordemDaLateral(page, true);
      for (let i = 1; i < ordem.length; i++) {
        expect(ordem[i].y, `${ordem[i].nome} depois de ${ordem[i - 1].nome}`).toBeGreaterThan(
          ordem[i - 1].y
        );
      }
      // Tudo dentro do card lateral, que é uma coluna só.
      const card = await caixa(lateral(page));
      for (const alvo of [corretor(page), linkPolitica(page)]) {
        const b = await caixa(alvo);
        expect(b.x).toBeGreaterThanOrEqual(card.x - 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
      }
      // O corretor não aparece duas vezes na página.
      await expect(corretor(page)).toHaveCount(1);
      // E o formulário continua sendo o da ficha, com o imóvel no corpo.
      await expect(lateral(page).locator('input[name="imovelId"]')).toHaveCount(1);
    });
  }

  test("sem corretor responsável, a ordem continua correta e nenhum card vazio aparece", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FICHA_SEM_CORRETOR);
    await expect(corretor(page)).toHaveCount(0);
    await expect(page.getByText("Corretor(a) responsável")).toHaveCount(0);

    const ordem = await ordemDaLateral(page, false);
    for (let i = 1; i < ordem.length; i++) {
      expect(ordem[i].y, ordem[i].nome).toBeGreaterThan(ordem[i - 1].y);
    }
  });

  test("corretor completo: foto, nome, CRECI, bio, perfil e os três contatos publicados", async ({
    page,
  }) => {
    await page.goto(FICHA_COM_CORRETOR);
    const card = corretor(page);
    await expect(card.getByRole("heading", { name: "Corretor(a) responsável" })).toBeVisible();
    await expect(card.getByText("Sônia Portfolio")).toBeVisible();
    await expect(card.getByText("CRECI-SP 111.222-J")).toBeVisible();
    await expect(card.getByText(/Atende Centro e Jardins/)).toBeVisible();

    const foto = card.locator("img");
    await expect(foto).toHaveAttribute("alt", "Foto de Sônia Portfolio");
    expect(await foto.evaluate((el) => getComputedStyle(el).objectFit)).toBe("cover");

    await expect(card.getByRole("link", { name: "Ver perfil completo" })).toHaveAttribute(
      "href",
      `${BASE}/corretores/${SONIA}`
    );
    await expect(card.getByRole("link", { name: /Ligar para/ })).toHaveAttribute(
      "href",
      "tel:1133224455"
    );
    await expect(card.getByRole("link", { name: /Enviar e-mail para/ })).toHaveAttribute(
      "href",
      "mailto:sonia.publico@e2e.test"
    );
    const whatsapp = card.getByRole("link", { name: /Falar no WhatsApp com/ });
    expect(await whatsapp.getAttribute("href")).toContain("wa.me/11955550000");
    // Nada interno vaza para a página.
    expect(await page.content()).not.toContain("sonia-portfolio@e2e.test");
  });

  test("o formulário da lateral continua enviando", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FICHA_COM_CORRETOR);
    // CamposAntiSpam recusa envio em menos de 1,5s desde o render.
    await esperarJanelaAntiSpam(page);
    const form = formulario(page);
    await form.getByLabel("Nome").fill(`Visitante Fase 51 ${Date.now()}`);
    await form.getByLabel("Telefone").fill("11999990000");
    await form.getByLabel("E-mail").fill(`fase51-${Date.now()}@e2e.test`);
    await form.getByLabel("Mensagem").fill("Tenho interesse neste imóvel.");
    await form.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(lateral(page).getByText("Mensagem enviada com sucesso!")).toBeVisible();
  });
});

// -----------------------------------------------------------------------
// Política de privacidade
// -----------------------------------------------------------------------
test.describe("política de privacidade", () => {
  test("o link da ficha abre a página, com header, rodapé e sem erros", async ({ page }) => {
    const erros = errosDoConsole(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FICHA_COM_CORRETOR);

    const link = linkPolitica(page);
    await expect(link).toHaveAttribute("href", POLITICA);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${POLITICA}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeVisible();
    await expect(page.locator("header [data-logo-site]")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.getByText(/Última atualização:/)).toBeVisible();
    expect(erros).toEqual([]);
  });

  test("conteúdo: uma h1, seções em ordem, sem contato inventado", async ({ page }) => {
    await page.goto(POLITICA);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const titulos = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    expect(titulos.map((t) => t.split(".")[0])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    expect(titulos[0]).toContain("Sobre esta política");
    expect(titulos.at(-1)).toContain("Como entrar em contato");

    const texto = await page.locator("main").innerText();
    // Nenhum canal fabricado: só os que a organização publicou.
    for (const inventado of ["dpo@", "privacidade@", "encarregado@", "lorem", "exemplo.com"]) {
      expect(texto.toLowerCase()).not.toContain(inventado);
    }
    // Nenhuma promessa absoluta de segurança ou de não compartilhamento.
    expect(texto).not.toMatch(/totalmente segur|100% segur|nunca compartilh/i);
    // O link de contato da própria organização existe e é real.
    await expect(page.getByRole("link", { name: "página de contato" })).toHaveAttribute(
      "href",
      `${BASE}/contato`
    );
  });

  test("tenant: a página fala em nome da organização da rota", async ({ page }) => {
    await page.goto(POLITICA);
    const daPortfolio = await page.locator("main").innerText();
    expect(daPortfolio).toContain("Organização E2E Portfólio");

    await page.goto("/e2e-org-navegacao/politica-de-privacidade");
    const daNavegacao = await page.locator("main").innerText();
    expect(daNavegacao).toContain("Organização E2E Navegação");
    expect(daNavegacao).not.toContain("Organização E2E Portfólio");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/e2e-org-navegacao\/politica-de-privacidade$/
    );
    await expect(page).toHaveTitle(/^Política de Privacidade \| Organização E2E Navegação$/);
  });

  test("rodapé: o link existe nas páginas públicas e leva à política", async ({ page }) => {
    for (const rota of [BASE, `${BASE}/imoveis`, FICHA_COM_CORRETOR]) {
      await page.goto(rota);
      const link = page.locator("footer").getByRole("link", { name: "Política de Privacidade" });
      await expect(link).toHaveAttribute("href", POLITICA);
    }
    await page.locator("footer").getByRole("link", { name: "Política de Privacidade" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeVisible();
  });

  test("organização principal: a política responde sem prefixo", async ({ page }) => {
    await page.goto("/politica-de-privacidade");
    await expect(page.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeVisible();
    await expect(page.locator("footer").getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute(
      "href",
      "/politica-de-privacidade"
    );
  });
});

// -----------------------------------------------------------------------
// Largura
// -----------------------------------------------------------------------
test.describe("largura", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: ficha e política sem estouro, com o link alcançável`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });

      await page.goto(FICHA_COM_CORRETOR);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        `ficha @ ${largura}`
      ).toBe(true);
      // Corretor e formulário inteiros dentro do card, em qualquer largura.
      const card = await caixa(lateral(page));
      for (const alvo of [corretor(page), formulario(page).getByLabel("Nome"), linkPolitica(page)]) {
        const b = await caixa(alvo);
        expect(b.x + b.width, `${largura}`).toBeLessThanOrEqual(card.x + card.width + 1);
        expect(b.width).toBeGreaterThan(0);
      }
      // Alvo de toque das ações do corretor.
      for (const acao of await corretor(page).getByRole("link").all()) {
        expect((await caixa(acao)).height).toBeGreaterThanOrEqual(36);
      }

      await page.goto(POLITICA);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        `política @ ${largura}`
      ).toBe(true);
      // Linha de leitura confortável, medida em CARACTERES da própria
      // fonte da página — pixels dependeriam da fonte da máquina (a do
      // CI é mais larga que a daqui).
      const caracteresPorLinha = await page.locator("main p").nth(1).evaluate((el) => {
        const regua = document.createElement("span");
        regua.textContent = "0".repeat(100);
        regua.style.font = getComputedStyle(el).font;
        regua.style.position = "absolute";
        regua.style.whiteSpace = "pre";
        el.after(regua);
        const larguraDoCaractere = regua.getBoundingClientRect().width / 100;
        regua.remove();
        return el.getBoundingClientRect().width / larguraDoCaractere;
      });
      expect(caracteresPorLinha, `caracteres por linha @ ${largura}`).toBeLessThanOrEqual(90);
      // E o texto não acompanha a largura da tela nas telas largas.
      const paragrafo = await caixa(page.locator("main p").nth(1));
      if (largura >= 1024) expect(paragrafo.width).toBeLessThan(largura - 200);
      // Título e conteúdo dentro da viewport.
      const h1 = await caixa(page.getByRole("heading", { level: 1 }));
      expect(h1.x).toBeGreaterThanOrEqual(0);
      expect(h1.x + h1.width).toBeLessThanOrEqual(largura);
    });
  }
});
