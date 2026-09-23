import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E, ORG_NAVEGACAO } from "./helpers";

// =======================================================================
// Comparador de imóveis (Fase 59)
// =======================================================================
// Mesma organização e mesmos imóveis da central de favoritos: três
// publicados, um reservado. Favoritar é localStorage; selecionar para
// comparar é sessionStorage — duas chaves distintas, de propósito.

const BASE = `/${ORG_NAVEGACAO.slug}`;
const FAVORITOS = `${BASE}/favoritos`;
const COMPARAR = `${BASE}/favoritos/comparar`;
const chaveFavoritos = `easymob:favoritos:v1:${ORG_NAVEGACAO.slug}`;
const chaveSelecao = `easymob:comparar:v1:${ORG_NAVEGACAO.slug}`;

const RECENTE = IDS_E2E.imovelNavegacaoRecente;
const MEIO = IDS_E2E.imovelNavegacaoMeio;
const ANTIGO = IDS_E2E.imovelNavegacaoAntigo;
const RESERVADO = IDS_E2E.imovelNavegacaoReservado;
const TODOS = [RECENTE, MEIO, ANTIGO, RESERVADO];

const selecionar = (page: Page, id: string) => page.locator(`[data-selecionar-comparar='${id}']`);
const barra = (page: Page) => page.locator("[data-barra-comparacao]");
const colunas = (page: Page) => page.locator("[data-coluna-imovel]");
const linhas = (page: Page) => page.locator("[data-linha]");

async function comFavoritos(page: Page, ids: string[]) {
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k as string, v as string),
    [chaveFavoritos, JSON.stringify(ids)] as const
  );
}

async function comSelecao(page: Page, ids: string[]) {
  await page.addInitScript(
    ([k, v]) => sessionStorage.setItem(k as string, v as string),
    [chaveSelecao, JSON.stringify(ids)] as const
  );
}

async function lerSelecao(page: Page) {
  return page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) ?? "null"), chaveSelecao);
}

async function lerFavoritos(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), chaveFavoritos);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.sendBeacon = () => true;
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
});

// -----------------------------------------------------------------------
// Seleção na página de favoritos
// -----------------------------------------------------------------------
test.describe("selecionar nos favoritos", () => {
  test("sem seleção, a página é a de sempre — nenhuma barra", async ({ page }) => {
    await comFavoritos(page, [RECENTE, MEIO]);
    await page.goto(FAVORITOS);
    await expect(page.locator("[data-favorito]").first()).toBeVisible();
    await expect(barra(page)).toHaveCount(0);
  });

  test("um selecionado: diz que falta outro, e não oferece comparação", async ({ page }) => {
    await comFavoritos(page, [RECENTE, MEIO]);
    await page.goto(FAVORITOS);
    await selecionar(page, RECENTE).click();

    await expect(barra(page)).toBeVisible();
    await expect(page.locator("[data-total-selecionados]")).toHaveText("1 imóvel selecionado");
    await expect(barra(page)).toContainText("pelo menos 2");
    await expect(page.locator("[data-abrir-comparacao]")).toHaveCount(0);
  });

  test("dois selecionados: o botão aparece e conta certo", async ({ page }) => {
    await comFavoritos(page, [RECENTE, MEIO, ANTIGO]);
    await page.goto(FAVORITOS);
    await selecionar(page, RECENTE).click();
    await selecionar(page, MEIO).click();

    await expect(page.locator("[data-total-selecionados]")).toHaveText("2 imóveis selecionados");
    await expect(page.locator("[data-abrir-comparacao]")).toHaveText("Comparar 2 imóveis");
  });

  test("selecionar não é favoritar: as duas chaves são independentes", async ({ page }) => {
    await comFavoritos(page, [RECENTE, MEIO]);
    await page.goto(FAVORITOS);
    await selecionar(page, RECENTE).click();

    expect(await lerSelecao(page)).toEqual([RECENTE]);
    // O coração não foi tocado.
    expect(await lerFavoritos(page)).toEqual([RECENTE, MEIO]);
  });

  test("a seleção sobrevive ao recarregar", async ({ page }) => {
    await comFavoritos(page, [RECENTE, MEIO]);
    await page.goto(FAVORITOS);
    await selecionar(page, RECENTE).click();
    await page.reload();
    await expect(
      page.locator(`[data-selecionar-comparar='${RECENTE}'] input[type=checkbox]`)
    ).toBeChecked();
  });

  test("desfavoritar tira da seleção — a comparação não aponta para fora dos favoritos", async ({
    page,
  }) => {
    await comFavoritos(page, [RECENTE, MEIO]);
    await comSelecao(page, [RECENTE, MEIO]);
    await page.goto(FAVORITOS);
    await expect(page.locator("[data-total-selecionados]")).toHaveText("2 imóveis selecionados");

    await page
      .getByRole("button", { name: /Remover Imovel Navegacao Recente E2E dos favoritos/ })
      .click();

    await expect(page.locator("[data-total-selecionados]")).toHaveText("1 imóvel selecionado");
    expect(await lerSelecao(page)).toEqual([MEIO]);
  });

  test("limpar seleção não mexe nos favoritos", async ({ page }) => {
    await comFavoritos(page, [RECENTE, MEIO]);
    await comSelecao(page, [RECENTE, MEIO]);
    await page.goto(FAVORITOS);
    await page.locator("[data-limpar-selecao]").click();

    await expect(barra(page)).toHaveCount(0);
    expect(await lerFavoritos(page)).toEqual([RECENTE, MEIO]);
  });

  test("a seleção é alcançável por teclado", async ({ page }) => {
    await comFavoritos(page, [RECENTE, MEIO]);
    await page.goto(FAVORITOS);
    const caixa = page.locator(`[data-selecionar-comparar='${RECENTE}'] input[type=checkbox]`);
    await selecionar(page, RECENTE).locator("button, input").first().focus();
    await page.keyboard.press("Space");
    await expect(caixa).toBeChecked();
  });
});

// -----------------------------------------------------------------------
// A comparação
// -----------------------------------------------------------------------
test.describe("comparar", () => {
  test("abre pela barra e mostra uma coluna por imóvel", async ({ page }) => {
    await comFavoritos(page, TODOS);
    await comSelecao(page, [RECENTE, MEIO]);
    await page.goto(FAVORITOS);
    await page.locator("[data-abrir-comparacao]").click();
    await page.waitForURL(/\/favoritos\/comparar/);

    await expect(colunas(page)).toHaveCount(2);
    await expect(page.locator("[data-total-comparados]")).toHaveText("2 imóveis selecionados");
  });

  test("menos de dois: estado próprio, sem tabela quebrada", async ({ page }) => {
    await comFavoritos(page, TODOS);
    await comSelecao(page, [RECENTE]);
    await page.goto(COMPARAR);

    await expect(page.locator("[data-comparacao-insuficiente]")).toBeVisible();
    await expect(page.locator("[data-tabela-comparacao]")).toHaveCount(0);
    await expect(page.locator("[data-voltar-favoritos]")).toBeVisible();
  });

  test("sem seleção nenhuma: estado vazio, não erro", async ({ page }) => {
    await comFavoritos(page, TODOS);
    await page.goto(COMPARAR);
    await expect(page.locator("[data-comparacao-insuficiente]")).toBeVisible();
  });

  test("remover da comparação NÃO remove dos favoritos", async ({ page }) => {
    await comFavoritos(page, [RECENTE, MEIO, ANTIGO]);
    await comSelecao(page, [RECENTE, MEIO, ANTIGO]);
    await page.goto(COMPARAR);
    await expect(colunas(page)).toHaveCount(3);

    await page.locator(`[data-remover-comparacao='${RECENTE}']`).click();

    await expect(colunas(page)).toHaveCount(2);
    // A lista salva continua inteira.
    expect(await lerFavoritos(page)).toEqual([RECENTE, MEIO, ANTIGO]);
    expect(await lerSelecao(page)).toEqual([MEIO, ANTIGO]);
  });

  test("cada imóvel continua levando à própria ficha", async ({ page }) => {
    await comFavoritos(page, TODOS);
    await comSelecao(page, [RECENTE, MEIO]);
    await page.goto(COMPARAR);
    await expect(page.locator(`[data-ver-imovel='${RECENTE}']`)).toHaveAttribute(
      "href",
      `${BASE}/imoveis/${RECENTE}`
    );
  });

  test("imóvel sem ficha pública não entra, mesmo forçado na seleção", async ({ page }) => {
    // O rascunho do seed: o servidor é quem decide, não o navegador.
    await comFavoritos(page, [RECENTE, MEIO, IDS_E2E.imovelNavegacaoRascunho]);
    await comSelecao(page, [RECENTE, MEIO, IDS_E2E.imovelNavegacaoRascunho]);
    await page.goto(COMPARAR);

    await expect(colunas(page)).toHaveCount(2);
    await expect(
      page.locator(`[data-coluna-imovel='${IDS_E2E.imovelNavegacaoRascunho}']`)
    ).toHaveCount(0);
  });

  test("imóvel de outra organização não entra", async ({ page }) => {
    await comFavoritos(page, [RECENTE, MEIO]);
    await comSelecao(page, [RECENTE, MEIO, IDS_E2E.imovelComBadgesOrgA]);
    await page.goto(COMPARAR);
    await expect(colunas(page)).toHaveCount(2);
  });
});

// -----------------------------------------------------------------------
// Apenas diferenças
// -----------------------------------------------------------------------
test.describe("apenas diferenças", () => {
  test("esconde linhas iguais e mantém as que diferem", async ({ page }) => {
    await comFavoritos(page, TODOS);
    await comSelecao(page, [RECENTE, MEIO]);
    await page.goto(COMPARAR);
    // A tabela chega por fetch: contar antes dela existir compararia zero
    // com zero.
    await expect(colunas(page)).toHaveCount(2);

    const antes = await linhas(page).count();
    expect(antes).toBeGreaterThan(0);
    await page.locator("[data-so-diferencas]").click();
    const depois = await linhas(page).count();

    expect(depois).toBeLessThan(antes);
    // Nenhuma linha visível pode ter todas as células iguais.
    for (const linha of await linhas(page).all()) {
      const celulas = await linha.locator("td").allInnerTexts();
      const distintas = new Set(celulas.map((c) => c.trim()));
      const chave = (await linha.getAttribute("data-linha")) ?? "linha";
      expect(distintas.size, chave).toBeGreaterThan(1);
    }
  });

  test("volta a mostrar tudo ao desmarcar", async ({ page }) => {
    await comFavoritos(page, TODOS);
    await comSelecao(page, [RECENTE, MEIO]);
    await page.goto(COMPARAR);
    await expect(colunas(page)).toHaveCount(2);

    const tudo = await linhas(page).count();
    await page.locator("[data-so-diferencas]").click();
    await page.locator("[data-so-diferencas]").click();
    await expect(linhas(page)).toHaveCount(tudo);
  });
});

// -----------------------------------------------------------------------
// Janela deslizante
// -----------------------------------------------------------------------
test.describe("navegação entre os selecionados", () => {
  test("com 4 selecionados no desktop, 3 aparecem e a navegação troca o conjunto", async ({
    page,
  }) => {
    await comFavoritos(page, TODOS);
    await comSelecao(page, TODOS);
    await page.goto(COMPARAR);

    // Selecionados != visíveis: nenhum foi descartado.
    await expect(page.locator("[data-total-comparados]")).toHaveText("4 imóveis selecionados");
    await expect(colunas(page)).toHaveCount(3);
    await expect(page.locator("[data-intervalo-comparacao]")).toHaveText("1–3 de 4");

    const primeiros = await colunas(page).evaluateAll((e) =>
      e.map((x) => x.getAttribute("data-coluna-imovel"))
    );
    await expect(page.locator("[data-comparar-anteriores]")).toBeDisabled();

    await page.locator("[data-comparar-proximos]").click();
    const seguintes = await colunas(page).evaluateAll((e) =>
      e.map((x) => x.getAttribute("data-coluna-imovel"))
    );
    expect(seguintes).not.toEqual(primeiros);
    await expect(page.locator("[data-comparar-proximos]")).toBeDisabled();
    await expect(page.locator("[data-comparar-anteriores]")).toBeEnabled();

    // A seleção não mudou ao navegar.
    expect(await lerSelecao(page)).toEqual(TODOS);
  });

  test("sem excedente, não há controles de navegação", async ({ page }) => {
    await comFavoritos(page, TODOS);
    await comSelecao(page, [RECENTE, MEIO]);
    await page.goto(COMPARAR);
    await expect(page.locator("[data-comparar-proximos]")).toHaveCount(0);
  });

  test("a navegação funciona por teclado", async ({ page }) => {
    await comFavoritos(page, TODOS);
    await comSelecao(page, TODOS);
    await page.goto(COMPARAR);

    await page.locator("[data-comparar-proximos]").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-intervalo-comparacao]")).toHaveText("2–4 de 4");
  });
});

// -----------------------------------------------------------------------
// Responsividade e geometria
// -----------------------------------------------------------------------
test.describe("responsividade", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: sem estouro, com a coluna de critérios visível`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await comFavoritos(page, TODOS);
      await comSelecao(page, TODOS);
      await page.goto(COMPARAR);

      await expect(page.locator("[data-tabela-comparacao]")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
        `estouro @ ${largura}`
      ).toBe(true);

      // A coluna de critérios continua legível e dentro da tela.
      const criterio = await linhas(page).first().locator("th").boundingBox();
      expect(criterio!.x).toBeGreaterThanOrEqual(-0.5);
      expect(criterio!.x + criterio!.width).toBeLessThanOrEqual(largura + 0.5);
      expect(criterio!.width).toBeGreaterThan(40);
    });
  }

  test("no celular aparece uma coluna por vez, e as demais seguem selecionadas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await comFavoritos(page, TODOS);
    await comSelecao(page, TODOS);
    await page.goto(COMPARAR);

    await expect(colunas(page)).toHaveCount(1);
    await expect(page.locator("[data-total-comparados]")).toHaveText("4 imóveis selecionados");
    await expect(page.locator("[data-intervalo-comparacao]")).toHaveText("1–1 de 4");
  });

  test("as colunas não se sobrepõem", async ({ page }) => {
    await comFavoritos(page, TODOS);
    await comSelecao(page, [RECENTE, MEIO, ANTIGO]);
    await page.goto(COMPARAR);

    const caixas = await colunas(page).evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, direita: r.x + r.width };
      })
    );
    for (let i = 1; i < caixas.length; i++) {
      expect(caixas[i].x).toBeGreaterThanOrEqual(caixas[i - 1].direita - 0.5);
    }
  });
});
