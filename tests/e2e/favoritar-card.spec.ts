import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  IDS_E2E,
  ORG_NAVEGACAO,
  ORG_PORTFOLIO,
  despublicarPerfisNoBanco,
  publicarPerfisNoBanco,
} from "./helpers";

// =======================================================================
// Favoritar direto no card (Fase 50)
// =======================================================================
// O coração no canto superior direito da foto usa o MESMO store da ficha,
// do header e de /favoritos. Organização Y (seed): três imóveis
// publicados, sem rótulos, com coordenadas (a ficha mostra distância nos
// "Imóveis próximos"). Organização A: o imóvel com os três rótulos.
// Organização W: fotos múltiplas (carrossel) e um imóvel sem foto.

const BASE = `/${ORG_NAVEGACAO.slug}`;
const LISTA = `${BASE}/imoveis`;
const FAVORITOS = `${BASE}/favoritos`;
const ficha = (id: string) => `${BASE}/imoveis/${id}`;
const chave = (slug: string) => `easymob:favoritos:v1:${slug}`;
const MEIO = IDS_E2E.imovelNavegacaoMeio;
const RECENTE = IDS_E2E.imovelNavegacaoRecente;
const TITULO_MEIO = "Imovel Navegacao Meio E2E";
const IMOVEL_COM_BADGES = "Apartamento com 2 quartos à venda, 58m² – Santo Amaro";

const coracao = (page: Page, id: string) => page.locator(`[data-favorito-imovel="${id}"]`);
const cardLink = (page: Page, id: string) =>
  page.locator(`main a[href$="/imoveis/${id}"]`).filter({ has: page.locator("[data-foto-card]") });
const contador = (page: Page) => page.locator("header [data-contador-favoritos]:visible");
const botaoSalvar = (page: Page) => page.locator("[data-salvar-imovel]");

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

type Caixa = { x: number; y: number; width: number; height: number };
const dentro = (a: Caixa, b: Caixa) =>
  a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;

/** Requisições que um clique no coração NÃO pode fazer. */
function vigiarRequisicoes(page: Page) {
  const feitas: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/imoveis/favoritos" || r.method() !== "GET") {
      feitas.push(`${r.method()} ${url.pathname}`);
    }
  });
  return feitas;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.sendBeacon = () => true;
  });
});

test.describe("fluxo", () => {
  test("favoritar no card → header → ficha → volta → /favoritos → desfavoritar → some", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(LISTA);
    await page.waitForLoadState("networkidle");
    const botao = coracao(page, MEIO);

    await expect(botao).toHaveAttribute("aria-pressed", "false");
    await expect(botao).toHaveAccessibleName(`Adicionar ${TITULO_MEIO} aos favoritos`);
    await expect(contador(page)).toHaveCount(0);

    const requisicoes = vigiarRequisicoes(page);
    const urlAntes = page.url();
    await botao.click();
    await expect(botao).toHaveAttribute("aria-pressed", "true");
    await expect(botao).toHaveAccessibleName(`Remover ${TITULO_MEIO} dos favoritos`);
    await expect(botao.locator("svg")).toHaveAttribute("fill", "currentColor");
    await expect(contador(page)).toHaveText("1");
    // Não navegou e não pediu nada ao servidor.
    expect(page.url()).toBe(urlAntes);
    expect(requisicoes).toEqual([]);

    // O resto do card continua abrindo a ficha.
    await cardLink(page, MEIO).getByRole("heading", { name: TITULO_MEIO }).click();
    await expect(page).toHaveURL(new RegExp(`${ficha(MEIO)}$`));
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    await expect(botaoSalvar(page)).toHaveText(/Salvo/);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${LISTA}$`));
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "true");

    await page.goto(FAVORITOS);
    await expect(page.locator(`[data-favorito="${MEIO}"]`)).toBeVisible();

    await page.goto(LISTA);
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "true");
    await expect(contador(page)).toHaveText("1");
    await coracao(page, MEIO).click();
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "false");
    await expect(coracao(page, MEIO).locator("svg")).toHaveAttribute("fill", "none");
    await expect(contador(page)).toHaveCount(0);

    await page.goto(FAVORITOS);
    await expect(page.locator("[data-favoritos-vazio]")).toBeVisible();
    await expect(page.locator(`[data-favorito="${MEIO}"]`)).toHaveCount(0);

    await page.goto(ficha(MEIO));
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("salvo na ficha aparece salvo no card, e o refresh preserva", async ({ page }) => {
    await page.goto(ficha(RECENTE));
    await botaoSalvar(page).click();
    await page.goto(LISTA);
    await expect(coracao(page, RECENTE)).toHaveAttribute("aria-pressed", "true");
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(coracao(page, RECENTE)).toHaveAttribute("aria-pressed", "true");
  });

  test("teclado: Enter favorita, Espaço desfavorita, Tab vai para o link e Enter abre a ficha", async ({ page }) => {
    await page.goto(LISTA);
    await page.waitForLoadState("networkidle");
    const botao = coracao(page, MEIO);
    await botao.focus();
    await expect(botao).toBeFocused();
    const urlAntes = page.url();

    await page.keyboard.press("Enter");
    await expect(botao).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(botao).toHaveAttribute("aria-pressed", "false");
    expect(page.url()).toBe(urlAntes);
    await expect(botao).toBeFocused();
    // Anel de foco visível.
    expect(await botao.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");

    await page.keyboard.press("Tab");
    await expect(cardLink(page, MEIO)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${ficha(MEIO)}$`));
  });

  test("vários controles do mesmo imóvel na mesma árvore concordam (card, header, ficha)", async ({ page }) => {
    // Nenhuma página pública repete o mesmo imóvel em duas vitrines hoje;
    // o que existe na mesma árvore são o card de "Imóveis próximos", o
    // contador do header e — depois da navegação no cliente — o Salvar
    // da ficha. Nenhum deles tem estado próprio: todos leem o store.
    await page.goto(ficha(RECENTE));
    await page.waitForLoadState("networkidle");
    const proximo = coracao(page, MEIO);
    await proximo.click();
    await expect(proximo).toHaveAttribute("aria-pressed", "true");
    await expect(contador(page)).toHaveText("1");

    await cardLink(page, MEIO).getByRole("heading", { name: TITULO_MEIO }).click();
    await expect(page).toHaveURL(new RegExp(`${ficha(MEIO)}$`));
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    // Desfavoritar pelo Salvar desmarca o coração do mesmo imóvel na
    // listagem aberta depois, sem refresh entre as ações.
    await botaoSalvar(page).click();
    await expect(contador(page)).toHaveCount(0);
    await page.goBack();
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("sincronização e isolamento", () => {
  test("outra aba: favoritar na listagem atualiza /favoritos e a ficha abertos", async ({ page, context }) => {
    await page.goto(LISTA);
    const favoritos = await context.newPage();
    await favoritos.goto(FAVORITOS);
    await expect(favoritos.locator("[data-favoritos-vazio]")).toBeVisible();
    const fichaAberta = await context.newPage();
    await fichaAberta.goto(ficha(MEIO));
    await expect(botaoSalvar(fichaAberta)).toHaveAttribute("aria-pressed", "false");

    await coracao(page, MEIO).click();
    await expect(favoritos.locator(`[data-favorito="${MEIO}"]`)).toBeVisible();
    await expect(botaoSalvar(fichaAberta)).toHaveAttribute("aria-pressed", "true");
    await expect(contador(fichaAberta)).toHaveText("1");

    await botaoSalvar(fichaAberta).click();
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "false");
    await expect(favoritos.locator("[data-favoritos-vazio]")).toBeVisible();
    await favoritos.close();
    await fichaAberta.close();
  });

  test("tenant: salvo em Y não aparece salvo em W, e continua em Y", async ({ page }) => {
    await page.goto(LISTA);
    await coracao(page, MEIO).click();
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "true");

    await page.goto("/e2e-org-recursos/imoveis");
    const corações = page.locator("[data-favorito-imovel]");
    await expect(corações.first()).toBeVisible();
    await expect(page.locator('[data-favorito-imovel][aria-pressed="true"]')).toHaveCount(0);
    await expect(contador(page)).toHaveCount(0);
    // Salvar em W grava só na chave de W.
    const idW = await corações.first().getAttribute("data-favorito-imovel");
    await corações.first().click();
    const chaves = await page.evaluate(
      ([y, w]) => [JSON.parse(localStorage.getItem(y)!), JSON.parse(localStorage.getItem(w)!)],
      [chave(ORG_NAVEGACAO.slug), chave("e2e-org-recursos")]
    );
    expect(chaves).toEqual([[MEIO], [idW]]);

    await page.goto(LISTA);
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "true");
    await expect(contador(page)).toHaveText("1");
  });

  test("storage bloqueado: o coração funciona durante a visita", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("bloqueado", "SecurityError");
        },
      });
    });
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.goto(LISTA);
    await coracao(page, MEIO).click();
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "true");
    await expect(contador(page)).toHaveText("1");
    expect(erros).toEqual([]);
  });

  test("storage corrompido: cards inteiros, nada salvo, outras chaves intactas", async ({ page }) => {
    await page.goto(LISTA);
    await page.evaluate((k) => {
      localStorage.setItem(k, "[[[não é json");
      localStorage.setItem("outra-aplicacao", "preservar");
    }, chave(ORG_NAVEGACAO.slug));
    await page.reload();
    await expect(page.locator("[data-favorito-imovel]")).toHaveCount(3);
    await expect(page.locator('[data-favorito-imovel][aria-pressed="true"]')).toHaveCount(0);
    await coracao(page, MEIO).click();
    await expect(coracao(page, MEIO)).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("outra-aplicacao"))).toBe("preservar");
  });
});

test.describe("contextos", () => {
  test("listagem: todo card tem coração; /vendidos não tem", async ({ page }) => {
    await page.goto(LISTA);
    const cards = page.locator("main [data-foto-card]");
    await expect(cards).toHaveCount(3);
    await expect(page.locator("main [data-favorito-imovel]")).toHaveCount(3);

    await page.goto(`${BASE}/vendidos`);
    await expect(page.locator("[data-favorito-imovel]")).toHaveCount(0);
  });

  test("Home, corretor e ficha: vitrines com coração; o da ficha fica fora do título", async ({ page }) => {
    await page.goto("/");
    const home = page.locator("main [data-foto-card]");
    await expect(home.first()).toBeVisible();
    expect(await page.locator("main [data-favorito-imovel]").count()).toBe(await home.count());

    // Ficha: "Imóveis próximos" tem coração em cada card; a ficha em si
    // continua com o Salvar da Fase 47.
    await page.goto(ficha(RECENTE));
    const secao = page.locator("section").filter({ has: page.getByRole("heading", { name: "Imóveis próximos que você pode gostar" }) });
    await expect(secao.locator("[data-foto-card]").first()).toBeVisible();
    expect(await secao.locator("[data-favorito-imovel]").count()).toBe(
      await secao.locator("[data-foto-card]").count()
    );
    await expect(botaoSalvar(page)).toBeVisible();
  });

  test("portfólio público do corretor: cards com coração", async ({ page }) => {
    // O perfil só é público publicado — o estado de partida do seed é
    // despublicado, e é para ele que se volta no fim.
    publicarPerfisNoBanco(IDS_E2E.membroPortfolioPaula);
    try {
      await page.goto(`/${ORG_PORTFOLIO.slug}/corretores/${IDS_E2E.membroPortfolioPaula}`);
      const cards = page.locator("main [data-foto-card]");
      await expect(cards.first()).toBeVisible();
      expect(await page.locator("main [data-favorito-imovel]").count()).toBe(await cards.count());
    } finally {
      despublicarPerfisNoBanco(ORG_PORTFOLIO.slug);
    }
  });
});

test.describe("layout", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: coração dentro da foto, à direita dos rótulos, sem mudar o card`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });

      // Rótulos à esquerda (Org A).
      await page.goto("/imoveis");
      const link = page
        .locator("main a")
        .filter({ has: page.getByRole("heading", { name: IMOVEL_COM_BADGES, exact: true }) })
        .first();
      const foto = await caixa(link.locator("[data-foto-card]"));
      const wrapper = link.locator("xpath=..");
      const botao = wrapper.locator("[data-favorito-imovel]");
      const b = await caixa(botao);
      expect(dentro(b, foto)).toBe(true);
      // Canto superior direito.
      expect(foto.x + foto.width - (b.x + b.width)).toBeLessThan(12);
      expect(b.y - foto.y).toBeLessThan(12);
      // Alvo de toque.
      expect(b.width).toBeGreaterThanOrEqual(40);
      expect(b.height).toBeGreaterThanOrEqual(40);
      // Rótulos à esquerda, com folga positiva até o coração.
      const rotulos = link.locator("[data-foto-card] [data-slot='badge']");
      expect(await rotulos.count()).toBeGreaterThanOrEqual(3);
      for (const r of await rotulos.all()) {
        const rb = await caixa(r);
        expect(rb.x + rb.width).toBeLessThan(b.x);
      }
      // O coração não muda o card: o invólucro tem exatamente a caixa do link.
      const w = await caixa(wrapper);
      const l = await caixa(link);
      expect(Math.abs(w.height - l.height)).toBeLessThan(1);
      expect(Math.abs(w.width - l.width)).toBeLessThan(1);

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
      ).toBe(true);
    });
  }

  test("distância e coração dividem o canto sem colidir (Imóveis próximos)", async ({ page }) => {
    for (const largura of [320, 768, 1280]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(ficha(RECENTE));
      const card = page.locator(`[data-favorito-imovel="${MEIO}"]`).locator("xpath=../..");
      const distancia = card.getByText(/km|m$/).first();
      await expect(distancia).toBeVisible();
      const d = await caixa(distancia);
      const b = await caixa(card.locator("[data-favorito-imovel]"));
      expect(d.x + d.width, `${largura}`).toBeLessThan(b.x);
      expect(Math.abs(d.y + d.height / 2 - (b.y + b.height / 2)), `${largura}`).toBeLessThan(12);
    }
  });

  test("carrossel: o coração não troca a foto, e as setas seguem trocando", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/e2e-org-recursos/imoveis");
    await page.waitForLoadState("networkidle");
    const card = page.locator(`[data-favorito-imovel="${IDS_E2E.imovelGaleria5}"]`).locator("xpath=../..");
    const bolinhas = card.locator("[data-foto-card] > div.absolute.bottom-2 span");
    await expect(bolinhas).toHaveCount(5);
    const ativa = () =>
      bolinhas.evaluateAll((els) => els.findIndex((e) => e.classList.contains("bg-white")));
    expect(await ativa()).toBe(0);

    const urlAntes = page.url();
    await card.locator("[data-favorito-imovel]").click();
    await expect(card.locator("[data-favorito-imovel]")).toHaveAttribute("aria-pressed", "true");
    expect(await ativa()).toBe(0);
    expect(page.url()).toBe(urlAntes);

    await card.locator("[data-foto-card]").hover();
    await card.getByRole("button", { name: "Próxima foto" }).click();
    await expect.poll(ativa).toBe(1);
    expect(page.url()).toBe(urlAntes);
    // Setas e bolinhas não ficam sob o coração.
    const b = await caixa(card.locator("[data-favorito-imovel]"));
    for (const alvo of [card.getByRole("button", { name: "Próxima foto" }), bolinhas.last()]) {
      const a = await caixa(alvo);
      const sobrepoe = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(sobrepoe).toBe(false);
    }
  });

  test("sem foto: o coração continua visível e funciona", async ({ page }) => {
    // Busca pelo título: a listagem da Org W tem mais de uma página.
    await page.goto("/e2e-org-recursos/imoveis?busca=Imovel%20Galeria%200");
    const botao = page.locator(`[data-favorito-imovel="${IDS_E2E.imovelGaleria0}"]`);
    const card = botao.locator("xpath=../..");
    await expect(card.getByText("Sem foto")).toBeVisible();
    await expect(botao).toBeVisible();
    await botao.click();
    await expect(botao).toHaveAttribute("aria-pressed", "true");
  });

  test("320px: sem estouro em /, /imoveis, /favoritos e ficha", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    for (const rota of [BASE, LISTA, FAVORITOS, ficha(MEIO), "/", "/imoveis"]) {
      await page.goto(rota);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        rota
      ).toBe(true);
    }
  });
});
