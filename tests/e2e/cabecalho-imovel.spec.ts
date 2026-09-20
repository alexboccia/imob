import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E, ORG_NAVEGACAO } from "./helpers";

// =======================================================================
// Cabeçalho da ficha (Fase 52)
// =======================================================================
// O topo é identidade + ações, e só. O bloco comercial que ficava ao lado
// do título (preço + CTA, Fase 43) saiu: preço, WhatsApp, corretor,
// formulário e política vivem no card lateral (Fase 51).
//
// Ordem provada aqui: breadcrumb → título + toolbar → endereço/metadados
// → galeria.

const BASE_W = "/e2e-org-recursos";
const fichaW = (id: string) => `${BASE_W}/imoveis/${id}`;
const FICHA = fichaW(IDS_E2E.imovelGaleria5);
const FICHA_TITULO_LONGO = fichaW(IDS_E2E.imovelTituloLongo);
const FICHA_COM_WHATSAPP = `/e2e-org-tracking/imoveis/${IDS_E2E.imovelTopOrgTracking}`;
const fichaY = (id: string) => `/${ORG_NAVEGACAO.slug}/imoveis/${id}`;

const cabecalho = (page: Page) => page.locator("[data-cabecalho-imovel]");
const acoes = (page: Page) => page.locator("[data-acoes-imovel]");
const lateral = (page: Page) => page.locator("[data-card-contato]");
const compartilhar = (page: Page) =>
  acoes(page).getByRole("button", { name: "Compartilhar", exact: true });
const salvar = (page: Page) => page.locator("[data-salvar-imovel]");
const seta = (page: Page, direcao: "anterior" | "proximo") =>
  page.locator(`[data-seta-imovel="${direcao}"]`);

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

type Caixa = { x: number; y: number; width: number; height: number };
const colide = (a: Caixa, b: Caixa) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5;

async function semOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
}

/** O cabeçalho não pode conter nada comercial. */
async function cabecalhoSemComercial(page: Page) {
  await expect(cabecalho(page).locator("[data-preco]")).toHaveCount(0);
  await expect(cabecalho(page).locator("[data-valores-imovel]")).toHaveCount(0);
  await expect(cabecalho(page).locator('a[href*="wa.me"]')).toHaveCount(0);
  await expect(
    cabecalho(page).getByRole("link", { name: /Falar no WhatsApp|Tenho interesse/ })
  ).toHaveCount(0);
  expect(await cabecalho(page).innerText()).not.toMatch(/R\$/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.sendBeacon = () => true;
  });
});

// -----------------------------------------------------------------------
// Composição
// -----------------------------------------------------------------------
test.describe("composição", () => {
  for (const largura of [1024, 1280, 1440]) {
    test(`${largura}px: título à esquerda, as quatro ações juntas à direita, sem comercial no topo`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA);

      await cabecalhoSemComercial(page);

      const cab = await caixa(cabecalho(page));
      const titulo = await caixa(page.getByRole("heading", { level: 1 }));
      const grupo = [
        await caixa(compartilhar(page)),
        await caixa(salvar(page)),
        await caixa(seta(page, "anterior")),
        await caixa(seta(page, "proximo")),
      ];

      // Mesma linha: todos com o mesmo centro vertical.
      const centro = (b: Caixa) => b.y + b.height / 2;
      for (const b of grupo) expect(Math.abs(centro(b) - centro(grupo[0]))).toBeLessThan(1);
      // Ordem exata da esquerda para a direita.
      for (let i = 1; i < grupo.length; i++) {
        expect(grupo[i].x, `posição ${i}`).toBeGreaterThanOrEqual(grupo[i - 1].x + grupo[i - 1].width);
      }
      // Vãos iguais: um grupo só, não dois.
      const vaos = grupo.slice(1).map((b, i) => b.x - (grupo[i].x + grupo[i].width));
      for (const v of vaos) expect(Math.abs(v - vaos[0])).toBeLessThan(1);

      // À direita do título, alinhado ao topo dele, terminando na borda
      // do conteúdo.
      expect(grupo[0].x).toBeGreaterThanOrEqual(titulo.x + titulo.width);
      expect(Math.abs(grupo[0].y - titulo.y)).toBeLessThan(8);
      const ultima = grupo[3];
      expect(Math.abs(ultima.x + ultima.width - (cab.x + cab.width))).toBeLessThan(1);
      // Setas compactas e circulares; os quatro com a mesma altura.
      for (const b of grupo) expect(Math.abs(b.height - grupo[0].height)).toBeLessThan(1);
      for (const s of grupo.slice(2)) {
        expect(s.width).toBeGreaterThanOrEqual(40);
        expect(Math.abs(s.width - s.height)).toBeLessThan(1);
      }
      const raio = await seta(page, "proximo").evaluate((el) =>
        parseFloat(getComputedStyle(el).borderTopLeftRadius)
      );
      expect(raio).toBeGreaterThanOrEqual(ultima.height / 2 - 1);
    });
  }

  test("ordem vertical: breadcrumb, identidade, metadados e então a galeria", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FICHA);

    const contexto = await caixa(page.locator("[data-contexto-imovel]"));
    const titulo = await caixa(page.getByRole("heading", { level: 1 }));
    const endereco = await caixa(page.locator("[data-identidade-imovel] p").first());
    const galeria = await caixa(page.locator("[data-galeria-hero]"));

    expect(titulo.y).toBeGreaterThan(contexto.y);
    expect(endereco.y).toBeGreaterThan(titulo.y);
    expect(galeria.y).toBeGreaterThan(endereco.y);
    // A galeria começa logo depois do cabeçalho — sem coluna nem altura
    // reservada pelo bloco que saiu.
    const cab = await caixa(cabecalho(page));
    expect(galeria.y - (cab.y + cab.height)).toBeLessThan(80);
    // E a maior parte dela está na primeira tela.
    expect(900 - galeria.y).toBeGreaterThanOrEqual(500);
  });

  test("título longo: quebra em várias linhas sem colidir com as ações nem sair do container", async ({
    page,
  }) => {
    for (const largura of [1024, 1280, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA_TITULO_LONGO);
      const cab = await caixa(cabecalho(page));
      const h1 = page.getByRole("heading", { level: 1 });
      const titulo = await caixa(h1);
      const grupo = await caixa(acoes(page));

      await expect(h1).toHaveText(/no coração de Santana$/);
      expect(titulo.height, `${largura}`).toBeGreaterThan(40);
      expect(colide(titulo, grupo), `${largura}`).toBe(false);
      expect(grupo.x + grupo.width).toBeLessThanOrEqual(cab.x + cab.width + 0.5);
      expect(await semOverflow(page)).toBe(true);
      // Nada de truncar o título para caber a toolbar.
      expect(await h1.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");
    }
  });
});

// -----------------------------------------------------------------------
// O comercial continua no card lateral
// -----------------------------------------------------------------------
test.describe("card lateral (Fase 51) intacto", () => {
  test("preço, WhatsApp, corretor, formulário e política seguem abaixo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FICHA_COM_WHATSAPP);

    await cabecalhoSemComercial(page);

    const card = lateral(page);
    await expect(card.locator("[data-valores-imovel]")).toHaveCount(1);
    await expect(card.locator("[data-preco]").first()).toBeVisible();
    // Fase 54 — o CTA grande de WhatsApp saiu do card comercial; o que
    // fica abaixo do valor é a observação do anunciante, quando houver.
    await expect(card.getByRole("link", { name: "Falar no WhatsApp" })).toHaveCount(0);
    await expect(card.getByRole("heading", { name: "Receba mais informações" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Enviar mensagem" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Política de Privacidade" })).toBeVisible();

    // E o card fica depois do cabeçalho (esta ficha não tem foto).
    const cab = await caixa(cabecalho(page));
    const box = await caixa(card);
    expect(box.y).toBeGreaterThan(cab.y + cab.height);
  });
});

// -----------------------------------------------------------------------
// Funcional (Fases 47–50 preservadas)
// -----------------------------------------------------------------------
test.describe("ações continuam funcionando", () => {
  test("Compartilhar abre o menu; Salvar alterna sem navegar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => {
      delete (window.navigator as unknown as { share?: unknown }).share;
    });
    await page.goto(FICHA);
    const url = page.url();

    await compartilhar(page).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /WhatsApp/ })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(salvar(page)).toHaveAttribute("aria-pressed", "false");
    await salvar(page).click();
    await expect(salvar(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("header [data-contador-favoritos]:visible")).toHaveText("1");
    expect(page.url()).toBe(url);
  });

  test("Próximo navega, Anterior volta e a canônica acompanha", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const recente = fichaY(IDS_E2E.imovelNavegacaoRecente);
    const meio = fichaY(IDS_E2E.imovelNavegacaoMeio);
    await page.goto(recente);
    await expect(page.getByRole("button", { name: "Imóvel anterior", exact: true })).toBeDisabled();

    await page.getByRole("link", { name: "Próximo imóvel", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${meio}$`));
    await expect
      .poll(() =>
        page
          .locator('link[rel="canonical"]')
          .evaluateAll((els) => els.map((e) => e.getAttribute("href")))
      )
      .toEqual([expect.stringMatching(new RegExp(`${meio}$`))]);

    await page.getByRole("link", { name: "Imóvel anterior", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${recente}$`));
  });
});

// -----------------------------------------------------------------------
// Geometria
// -----------------------------------------------------------------------
test.describe("geometria", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: toolbar dentro do container, sem sobreposição nem estouro`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA);

      expect(await semOverflow(page), `estouro @ ${largura}`).toBe(true);
      await cabecalhoSemComercial(page);

      const cab = await caixa(cabecalho(page));
      const botoes = [
        await caixa(compartilhar(page)),
        await caixa(salvar(page)),
        await caixa(seta(page, "anterior")),
        await caixa(seta(page, "proximo")),
      ];
      const titulo = await caixa(page.getByRole("heading", { level: 1 }));

      for (const b of botoes) {
        expect(b.x).toBeGreaterThanOrEqual(cab.x - 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(cab.x + cab.width + 0.5);
        expect(colide(b, titulo), `colide com o título @ ${largura}`).toBe(false);
        expect(b.height).toBeGreaterThanOrEqual(40);
      }
      for (let i = 0; i < botoes.length; i++) {
        for (let j = i + 1; j < botoes.length; j++) {
          expect(colide(botoes[i], botoes[j]), `sobreposição @ ${largura}`).toBe(false);
        }
      }
      // A galeria também cabe no container.
      // A grade (desktop) ou o carrossel (mobile) — o que estiver visível.
      const galeria = await caixa(
        page.locator("[data-galeria-hero]:visible, [data-galeria-carrossel]:visible").first()
      );
      expect(galeria.x).toBeGreaterThanOrEqual(0);
      expect(galeria.x + galeria.width).toBeLessThanOrEqual(largura + 0.5);

      const centro = (b: Caixa) => b.y + b.height / 2;
      if (largura >= 1024) {
        // Desktop: os quatro na mesma linha.
        for (const b of botoes) expect(Math.abs(centro(b) - centro(botoes[0]))).toBeLessThan(1);
      } else {
        // Abaixo de lg: depois do endereço, e as setas nunca acima de
        // Compartilhar/Salvar.
        const endereco = await caixa(page.locator("[data-identidade-imovel] p").first());
        expect(botoes[0].y).toBeGreaterThanOrEqual(endereco.y + endereco.height - 1);
        expect(botoes[2].y).toBeGreaterThanOrEqual(botoes[0].y - 3);
      }
    });
  }
});
