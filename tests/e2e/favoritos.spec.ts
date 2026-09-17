import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E, ORG_NAVEGACAO } from "./helpers";

// =======================================================================
// Central de favoritos (Fase 49)
// =======================================================================
// Mesma lista do Salvar da ficha (localStorage, por organização): o
// header conta, a página resolve os imóveis no servidor e remove direto
// do card. Organização Y (seed): três imóveis publicados, um reservado,
// um rascunho, um inativo — e um logo largo, o que estourava o header em
// 320px.

const BASE = `/${ORG_NAVEGACAO.slug}`;
const FAVORITOS = `${BASE}/favoritos`;
const ficha = (id: string) => `${BASE}/imoveis/${id}`;
const chave = (slug: string) => `easymob:favoritos:v1:${slug}`;
const RECENTE = IDS_E2E.imovelNavegacaoRecente;
const MEIO = IDS_E2E.imovelNavegacaoMeio;
const ANTIGO = IDS_E2E.imovelNavegacaoAntigo;
const TITULO: Record<string, string> = {
  [RECENTE]: "Imovel Navegacao Recente E2E",
  [MEIO]: "Imovel Navegacao Meio E2E",
  [ANTIGO]: "Imovel Navegacao Antigo E2E",
  [IDS_E2E.imovelNavegacaoReservado]: "Imovel Navegacao Reservado E2E",
};

const botaoSalvar = (page: Page) => page.locator("[data-salvar-imovel]");
const cards = (page: Page) => page.locator("[data-favorito]");
const vazio = (page: Page) => page.locator("[data-favoritos-vazio]");
const remover = (page: Page, id: string) =>
  page.getByRole("button", { name: `Remover ${TITULO[id]} dos favoritos`, exact: true });
const contador = (page: Page) => page.locator("header [data-contador-favoritos]:visible");
const linkFavoritosDesktop = (page: Page) => page.locator("header nav").first().locator("[data-link-favoritos]");

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

async function gravarNoStorage(page: Page, slug: string, valor: string) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [chave(slug), valor]);
}

async function lerDoStorage(page: Page, slug: string) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), chave(slug));
}

async function idsNaPagina(page: Page) {
  return cards(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-favorito")));
}

function errosDoConsole(page: Page) {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

test.beforeEach(async ({ page }) => {
  // Nenhum evento de analytics sai dos testes desta fase.
  await page.addInitScript(() => {
    navigator.sendBeacon = () => true;
  });
});

// -----------------------------------------------------------------------
// Fluxo
// -----------------------------------------------------------------------
test.describe("fluxo", () => {
  test("salvar na ficha → header → página → ficha → remover no card → vazio → refresh", async ({ page }) => {
    const erros = errosDoConsole(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ficha(MEIO));
    await expect(contador(page)).toHaveCount(0);

    await expect(botaoSalvar(page)).toHaveText(/Salvar/);
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveText(/Salvo/);
    // O header soube na hora, sem refresh.
    await expect(contador(page)).toHaveText("1");

    await linkFavoritosDesktop(page).click();
    await expect(page).toHaveURL(new RegExp(`${FAVORITOS}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Favoritos" })).toBeVisible();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).getByRole("heading", { name: TITULO[MEIO] })).toBeVisible();

    // O card abre a ficha, que continua "Salvo" e com a navegação da Fase 48.
    await cards(page).getByRole("link", { name: new RegExp(TITULO[MEIO]) }).click();
    await expect(page).toHaveURL(new RegExp(`${ficha(MEIO)}$`));
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "Imóvel anterior", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Próximo imóvel", exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${FAVORITOS}$`));
    await remover(page, MEIO).click();
    await expect(cards(page)).toHaveCount(0);
    await expect(vazio(page)).toBeVisible();
    await expect(contador(page)).toHaveCount(0);
    expect(await lerDoStorage(page, ORG_NAVEGACAO.slug)).toEqual([]);

    await page.reload();
    await expect(vazio(page)).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    expect(erros).toEqual([]);
  });

  test("dois favoritos: mais recente primeiro; remover um não leva o outro", async ({ page }) => {
    await page.goto(ficha(ANTIGO));
    await botaoSalvar(page).click();
    await page.goto(ficha(RECENTE));
    await botaoSalvar(page).click();
    await expect(contador(page)).toHaveText("2");

    await page.goto(FAVORITOS);
    await expect(cards(page)).toHaveCount(2);
    expect(await idsNaPagina(page)).toEqual([RECENTE, ANTIGO]);

    await remover(page, RECENTE).click();
    await expect(cards(page)).toHaveCount(1);
    expect(await idsNaPagina(page)).toEqual([ANTIGO]);
    await expect(contador(page)).toHaveText("1");
    expect(await lerDoStorage(page, ORG_NAVEGACAO.slug)).toEqual([ANTIGO]);
  });

  test("o coração do card remove sem abrir a ficha; pelo teclado, o foco segue para o próximo", async ({ page }) => {
    await page.goto(FAVORITOS);
    await gravarNoStorage(page, ORG_NAVEGACAO.slug, JSON.stringify([ANTIGO, MEIO, RECENTE]));
    await page.reload();
    await expect(cards(page)).toHaveCount(3);

    // O botão NÃO está dentro do link do card.
    expect(await remover(page, RECENTE).evaluate((el) => el.closest("a") === null)).toBe(true);

    await remover(page, RECENTE).click();
    await expect(page).toHaveURL(new RegExp(`${FAVORITOS}$`));
    await expect(cards(page)).toHaveCount(2);
    await expect(remover(page, MEIO)).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(cards(page)).toHaveCount(1);
    await expect(remover(page, ANTIGO)).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "removido dos favoritos" })).toHaveText(
      `${TITULO[MEIO]} removido dos favoritos.`
    );

    await page.keyboard.press("Space");
    await expect(vazio(page)).toBeVisible();
    // Sem cards, o foco vai para a saída do estado vazio.
    await expect(page.getByRole("link", { name: "Explorar imóveis" })).toBeFocused();
  });

  test("outra aba: remover numa atualiza a lista e o contador da outra", async ({ page, context }) => {
    await page.goto(FAVORITOS);
    await gravarNoStorage(page, ORG_NAVEGACAO.slug, JSON.stringify([ANTIGO, RECENTE]));
    await page.reload();
    await expect(cards(page)).toHaveCount(2);
    await expect(contador(page)).toHaveText("2");

    const outra = await context.newPage();
    await outra.goto(FAVORITOS);
    await expect(cards(outra)).toHaveCount(2);
    await remover(outra, ANTIGO).click();
    await expect(cards(outra)).toHaveCount(1);

    await expect(cards(page)).toHaveCount(1);
    await expect(contador(page)).toHaveText("1");
    expect(await idsNaPagina(page)).toEqual([RECENTE]);

    // E salvar na ficha de uma aba traz o imóvel para a lista da outra.
    await outra.goto(ficha(MEIO));
    await botaoSalvar(outra).click();
    await expect(cards(page)).toHaveCount(2);
    expect(await idsNaPagina(page)).toEqual([MEIO, RECENTE]);
    await outra.close();
  });
});

// -----------------------------------------------------------------------
// Estados
// -----------------------------------------------------------------------
test.describe("estados", () => {
  test("vazio: título, texto e saída real para a listagem", async ({ page }) => {
    await page.goto(FAVORITOS);
    await expect(vazio(page).getByRole("heading", { level: 2, name: "Nenhum imóvel salvo ainda" })).toBeVisible();
    const cta = page.getByRole("link", { name: "Explorar imóveis" });
    await expect(cta).toHaveAttribute("href", `${BASE}/imoveis`);
    await cta.click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/imoveis$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("carregando: esqueleto com a forma do card, sem anunciar vazio antes da hora", async ({ page }) => {
    await page.goto(FAVORITOS);
    await gravarNoStorage(page, ORG_NAVEGACAO.slug, JSON.stringify([MEIO]));

    let liberar!: () => void;
    const liberado = new Promise<void>((r) => (liberar = r));
    await page.route("**/api/imoveis/favoritos", async (rota) => {
      await liberado;
      await rota.continue();
    });
    await page.reload();

    const regiao = page.getByRole("region", { name: "Imóveis salvos" });
    await expect(regiao).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("[data-esqueleto-card]")).toHaveCount(1);
    await expect(vazio(page)).toHaveCount(0);
    // O header não espera a consulta.
    await expect(contador(page)).toHaveText("1");

    liberar();
    await expect(cards(page)).toHaveCount(1);
    await expect(regiao).toHaveAttribute("aria-busy", "false");
    await expect(page.locator("[data-esqueleto-card]")).toHaveCount(0);
  });

  test("falha na consulta: mensagem com nova tentativa, e o storage fica intacto", async ({ page }) => {
    await page.goto(FAVORITOS);
    await gravarNoStorage(page, ORG_NAVEGACAO.slug, JSON.stringify([MEIO]));

    let falhar = true;
    await page.route("**/api/imoveis/favoritos", (rota) =>
      falhar ? rota.fulfill({ status: 500, body: "{}" }) : rota.continue()
    );
    await page.reload();
    const alerta = page.getByRole("alert").filter({ hasText: "Não foi possível carregar seus favoritos agora." });
    await expect(alerta).toBeVisible();
    await expect(vazio(page)).toHaveCount(0);
    expect(await lerDoStorage(page, ORG_NAVEGACAO.slug)).toEqual([MEIO]);

    falhar = false;
    await alerta.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(alerta).toHaveCount(0);
  });

  test("storage corrompido: vazio, sem erro, e outras chaves intactas", async ({ page }) => {
    const erros = errosDoConsole(page);
    await page.goto(FAVORITOS);
    await page.evaluate((k) => {
      localStorage.setItem(k, "{não é json");
      localStorage.setItem("outra-aplicacao", "preservar");
    }, chave(ORG_NAVEGACAO.slug));
    await page.reload();
    await expect(vazio(page)).toBeVisible();
    await expect(contador(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("outra-aplicacao"))).toBe("preservar");
    expect(erros).toEqual([]);
  });

  test("storage bloqueado: a página abre vazia e salvar vale durante a visita", async ({ page }) => {
    const erros = errosDoConsole(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("bloqueado", "SecurityError");
        },
      });
    });
    await page.goto(FAVORITOS);
    await expect(vazio(page)).toBeVisible();

    // Navegação no cliente mantém a memória da visita.
    await page.getByRole("link", { name: "Explorar imóveis" }).click();
    await page.locator(`a[href="${ficha(MEIO)}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${ficha(MEIO)}$`));
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    await expect(contador(page)).toHaveText("1");
    await linkFavoritosDesktop(page).click();
    await expect(cards(page)).toHaveCount(1);
    expect(erros).toEqual([]);
  });
});

// -----------------------------------------------------------------------
// Isolamento e visibilidade
// -----------------------------------------------------------------------
test.describe("isolamento e visibilidade", () => {
  test("tenant: favorito de Y não aparece em W, e continua em Y", async ({ page }) => {
    await page.goto(ficha(MEIO));
    await botaoSalvar(page).click();
    await expect(contador(page)).toHaveText("1");

    await page.goto("/e2e-org-recursos/favoritos");
    await expect(vazio(page)).toBeVisible();
    await expect(contador(page)).toHaveCount(0);
    // Mesmo com o id de Y gravado na chave de W, o servidor não o devolve.
    await gravarNoStorage(page, "e2e-org-recursos", JSON.stringify([MEIO]));
    await page.reload();
    await expect(contador(page)).toHaveText("1");
    await expect(vazio(page)).toBeVisible();
    await expect(page.getByText(TITULO[MEIO])).toHaveCount(0);

    await page.goto(FAVORITOS);
    await expect(cards(page)).toHaveCount(1);
    expect(await idsNaPagina(page)).toEqual([MEIO]);
  });

  test("ids inválidos, lixo e sem ficha pública somem; reservado aparece com a situação", async ({ page }) => {
    const erros = errosDoConsole(page);
    await page.goto(FAVORITOS);
    await gravarNoStorage(
      page,
      ORG_NAVEGACAO.slug,
      JSON.stringify([
        IDS_E2E.imovelNavegacaoRascunho,
        "nao-existe",
        "lixo com espaço",
        IDS_E2E.imovelNavegacaoInativo,
        IDS_E2E.imovelNavegacaoReservado,
        MEIO,
      ])
    );
    const corpos: unknown[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/imoveis/favoritos")) corpos.push(r.postDataJSON());
    });
    await page.reload();
    await expect(cards(page)).toHaveCount(2);
    expect(await idsNaPagina(page)).toEqual([MEIO, IDS_E2E.imovelNavegacaoReservado]);
    await expect(
      page.locator(`[data-favorito="${IDS_E2E.imovelNavegacaoReservado}"] [data-situacao-imovel]`)
    ).toHaveText("Reservado");
    await expect(page.locator(`[data-favorito="${MEIO}"] [data-situacao-imovel]`)).toHaveCount(0);
    // Nada do rascunho/inativo chega à página.
    await expect(page.getByText(/Rascunho E2E|Inativo E2E/)).toHaveCount(0);
    // O lixo nem sai do navegador.
    expect(JSON.stringify(corpos)).not.toContain("lixo com espaço");
    // O contador é o do navegador (válidos ou não): 6.
    await expect(contador(page)).toHaveText("6");
    expect(erros).toEqual([]);
  });
});

// -----------------------------------------------------------------------
// Endpoint
// -----------------------------------------------------------------------
test.describe("POST /api/imoveis/favoritos", () => {
  test("método, validação, limite, tenant e cache", async ({ request }) => {
    const url = "/api/imoveis/favoritos";
    expect((await request.get(url)).status()).toBe(405);

    const ok = await request.post(url, { data: { orgSlug: ORG_NAVEGACAO.slug, ids: [MEIO] } });
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toBe("no-store");
    const corpo = await ok.json();
    expect(corpo.imoveis.map((i: { id: string }) => i.id)).toEqual([MEIO]);
    expect(JSON.stringify(corpo)).not.toMatch(/organizationId|responsibleMember|status"|code"/);

    const deOutraOrg = await request.post(url, { data: { orgSlug: "e2e-org-recursos", ids: [MEIO] } });
    expect(await deOutraOrg.json()).toEqual({ imoveis: [] });

    const rascunho = await request.post(url, {
      data: { orgSlug: ORG_NAVEGACAO.slug, ids: [IDS_E2E.imovelNavegacaoRascunho] },
    });
    expect(await rascunho.json()).toEqual({ imoveis: [] });

    const muitos = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    for (const data of [
      { orgSlug: ORG_NAVEGACAO.slug, ids: muitos },
      { orgSlug: ORG_NAVEGACAO.slug, ids: "x" },
      "não é json",
    ]) {
      const r = await request.post(url, { data });
      expect(r.status()).toBe(400);
      expect(await r.text()).toBe('{"erro":"Pedido inválido."}');
    }
  });
});

// -----------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------
test.describe("header", () => {
  for (const largura of [1024, 1280, 1440]) {
    test(`${largura}px: "Favoritos" com texto, na mesma linha dos outros itens, à direita`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`${BASE}/imoveis`);
      const nav = page.locator("header nav").first();
      const link = linkFavoritosDesktop(page);
      await expect(link).toHaveAccessibleName("Favoritos");
      await expect(link).toHaveAttribute("href", FAVORITOS);
      await expect(link.getByText("Favoritos", { exact: true })).toBeVisible();
      await expect(link.locator("svg")).toHaveAttribute("aria-hidden", "true");

      const itens = await nav.getByRole("link").all();
      const caixas = await Promise.all(itens.map(caixa));
      const favoritos = await caixa(link);
      // Último item, mesma linha e mesma altura dos demais.
      expect(favoritos.x).toBeGreaterThanOrEqual(Math.max(...caixas.map((c) => c.x)) - 0.5);
      for (const c of caixas) {
        expect(Math.abs(c.y - favoritos.y)).toBeLessThan(1);
        expect(Math.abs(c.height - favoritos.height)).toBeLessThan(1);
      }
      // Termina na borda direita do conteúdo do header.
      const conteudo = await caixa(page.locator("header > div").first());
      expect(Math.abs(favoritos.x + favoritos.width - (conteudo.x + conteudo.width - 16))).toBeLessThan(1);
    });
  }

  test("768px: só o coração, com nome acessível, sem estourar", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(`${BASE}/imoveis`);
    const link = linkFavoritosDesktop(page);
    await expect(link).toBeVisible();
    await expect(link).toHaveAccessibleName("Favoritos");
    // O rótulo existe só para leitor de tela (sr-only: 1px, recortado).
    const rotulo = await caixa(link.getByText("Favoritos", { exact: true }));
    expect(rotulo.width).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const b = await caixa(link);
    expect(b.width).toBeGreaterThanOrEqual(40);
    // Mesma altura e mesma linha dos itens com texto.
    const comprar = await caixa(page.locator("header nav").first().getByRole("link", { name: "Comprar" }));
    expect(Math.abs(b.height - comprar.height)).toBeLessThan(1);
    expect(Math.abs(b.y - comprar.y)).toBeLessThan(1);
  });

  test("contador: some no zero, acompanha salvar e remover, e entra no nome acessível", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ficha(RECENTE));
    await expect(contador(page)).toHaveCount(0);
    await expect(linkFavoritosDesktop(page)).toHaveAccessibleName("Favoritos");
    await botaoSalvar(page).click();
    await expect(contador(page)).toHaveText("1");
    await expect(linkFavoritosDesktop(page)).toHaveAccessibleName(/^Favoritos\s*,\s*1 imóvel salvo$/);
    await botaoSalvar(page).click();
    await expect(contador(page)).toHaveCount(0);
  });

  test("estado ativo em /favoritos, como os demais itens", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FAVORITOS);
    const link = linkFavoritosDesktop(page);
    await expect(link).toHaveAttribute("aria-current", "page");
    const comprar = page.locator("header nav").first().getByRole("link", { name: "Comprar" });
    await expect(comprar).not.toHaveAttribute("aria-current", "page");
    const cor = (l: Locator) => l.evaluate((el) => getComputedStyle(el).borderColor);
    // Mesmo tratamento visual do item ativo de "Comprar" em /imoveis?finalidade=SALE.
    const corAtiva = await cor(link);
    await page.goto(`${BASE}/imoveis?finalidade=SALE`);
    expect(await cor(page.locator("header nav").first().getByRole("link", { name: "Comprar" }))).toBe(corAtiva);
    await expect(linkFavoritosDesktop(page)).not.toHaveAttribute("aria-current", "page");
  });

  test("menu do celular: Favoritos com contador, e leva à página", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(ficha(MEIO));
    await botaoSalvar(page).click();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    const item = page.locator("header").getByRole("link", { name: /^Favoritos/ });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("href", FAVORITOS);
    await expect(item.locator("[data-contador-favoritos]")).toHaveText("1");
    await item.click();
    await expect(page).toHaveURL(new RegExp(`${FAVORITOS}$`));
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
    await expect(cards(page)).toHaveCount(1);
  });

  test("organização principal (sem prefixo): o link é /favoritos", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/imoveis");
    await expect(linkFavoritosDesktop(page)).toHaveAttribute("href", "/favoritos");
    await linkFavoritosDesktop(page).click();
    await expect(page).toHaveURL(/\/favoritos$/);
    await expect(page.getByRole("heading", { level: 1, name: "Favoritos" })).toBeVisible();
    await expect(vazio(page)).toBeVisible();
  });

  test("SEO: noindex, follow; canônica própria; nenhum id na metadata", async ({ page }) => {
    await page.goto(ficha(MEIO));
    await botaoSalvar(page).click();
    await page.goto(FAVORITOS);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${FAVORITOS}$`));
    await expect(page).toHaveTitle(/^Favoritos \|/);
    expect(await page.locator("head").innerHTML()).not.toContain(MEIO);
  });
});

// -----------------------------------------------------------------------
// Largura (hotfix do header em 320px + responsividade)
// -----------------------------------------------------------------------
test.describe("largura", () => {
  const ROTAS = [
    ["home Y (logo largo)", BASE],
    ["imóveis Y", `${BASE}/imoveis`],
    ["favoritos Y", FAVORITOS],
    ["ficha Y", ficha(MEIO)],
    ["home principal", "/"],
    ["favoritos principal", "/favoritos"],
  ] as const;

  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: sem estouro horizontal; logo e menu inteiros, sem sobreposição`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      for (const [nome, rota] of ROTAS) {
        await page.goto(rota);
        const medidas = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(medidas.scroll, `${nome} @ ${largura}`).toBeLessThanOrEqual(medidas.client);

        const logo = await caixa(page.locator("header [data-logo-site]"));
        expect(logo.x, nome).toBeGreaterThanOrEqual(0);
        expect(logo.x + logo.width, nome).toBeLessThanOrEqual(largura);
        if (largura < 768) {
          const menu = page.getByRole("button", { name: "Abrir menu" });
          const m = await caixa(menu);
          expect(m.x + m.width, nome).toBeLessThanOrEqual(largura - 16 + 0.5);
          expect(m.x, nome).toBeGreaterThanOrEqual(logo.x + logo.width);
          // Alvo de toque inalterado (o botão do projeto é quadrado, 32px).
          expect(m.width, nome).toBeGreaterThanOrEqual(32);
          expect(Math.abs(m.width - m.height), nome).toBeLessThan(1);
        } else {
          const fav = await caixa(linkFavoritosDesktop(page));
          expect(fav.x, nome).toBeGreaterThanOrEqual(logo.x + logo.width);
          expect(fav.x + fav.width, nome).toBeLessThanOrEqual(largura - 16 + 0.5);
        }
      }
    });
  }

  test("320px com logo largo: o logo encolhe, não é cortado, e o menu abre com Favoritos inteiro", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(ficha(MEIO));
    const imagem = page.locator("header [data-logo-site] img");
    await expect(imagem).toBeVisible();
    // object-contain dentro da caixa: nada da arte fica fora dela.
    const ajuste = await imagem.evaluate((el) => getComputedStyle(el).objectFit);
    expect(ajuste).toBe("contain");
    const logo = await caixa(page.locator("header [data-logo-site]"));
    expect(logo.width).toBeLessThan(280);

    await page.getByRole("button", { name: "Abrir menu" }).click();
    const item = page.locator("header").getByRole("link", { name: /^Favoritos/ });
    const b = await caixa(item);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(320);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
  });

  test("grade igual à de /imoveis: mesma largura de card por coluna", async ({ page }) => {
    for (const largura of [390, 768, 1280]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`${BASE}/imoveis`);
      const naListagem = await caixa(page.locator(`main a[href="${ficha(MEIO)}"]`).first());
      await page.goto(FAVORITOS);
      await gravarNoStorage(page, ORG_NAVEGACAO.slug, JSON.stringify([MEIO, RECENTE]));
      await page.reload();
      await expect(cards(page)).toHaveCount(2);
      const noFavorito = await caixa(page.locator(`[data-favorito="${MEIO}"] a`).first());
      expect(Math.abs(noFavorito.width - naListagem.width), `${largura}`).toBeLessThan(1);
      await page.evaluate(() => localStorage.clear());
    }
  });
});
