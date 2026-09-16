import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E, ORG_EMPREENDIMENTO, login } from "./helpers";

// =======================================================================
// Outras unidades neste empreendimento (Fase 38)
// =======================================================================
// O título afirma PERTENCIMENTO, e só pode ser dito porque o domínio
// ganhou identidade estrutural (Property.developmentId). Antes disso o
// produto só sabia que dois imóveis eram parecidos.
//
// Organização V (dedicada), com um cenário em que cada exclusão tem um
// caso real que a prova. Ver prisma/seed-e2e.ts, "Fase 38".

const BASE = "/e2e-org-empreendimento";
const FICHA_ALPHA1 = `${BASE}/imoveis/${IDS_E2E.imovelAlpha1}`;
const FICHA_AVULSO = `${BASE}/imoveis/${IDS_E2E.imovelAvulso}`;
const FICHA_SOLO = `${BASE}/imoveis/${IDS_E2E.imovelSoloAlpha}`;

const TITULO = "Outras unidades neste empreendimento";

function secao(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: TITULO }) });
}

// -----------------------------------------------------------------------
// O que a seção mostra — e o que ela NUNCA mostra
// -----------------------------------------------------------------------
test.describe("a seção só mostra unidades do mesmo empreendimento", () => {
  test("aparece com o título correto e os cards das outras unidades", async ({ page }) => {
    await page.goto(FICHA_ALPHA1);

    const bloco = secao(page);
    await expect(bloco).toBeVisible();
    await expect(page.getByRole("heading", { name: TITULO })).toBeVisible();

    // As outras unidades do Alpha, até o limite de 4.
    await expect(bloco.getByRole("link", { name: /Alpha Unidade 2 E2E/ })).toBeVisible();
    await expect(bloco.getByRole("link", { name: /Alpha Unidade 3 E2E/ })).toBeVisible();
    await expect(bloco.getByRole("link", { name: /Alpha Unidade 4 E2E/ })).toBeVisible();
  });

  test("NUNCA a própria unidade, outro empreendimento, avulsa ou não publicável", async ({
    page,
  }) => {
    await page.goto(FICHA_ALPHA1);
    const texto = (await secao(page).innerText()).replace(/ /g, " ");

    // A unidade que o visitante já está vendo.
    expect(texto).not.toContain("Alpha Unidade 1 E2E");
    // Outro empreendimento da MESMA organização.
    expect(texto).not.toContain("Beta Unidade 1 E2E");
    // Imóvel sem empreendimento nenhum.
    expect(texto).not.toContain("Avulso Sem Empreendimento E2E");
    // Política pública: vendida não é unidade que se possa comprar.
    expect(texto).not.toContain("Alpha Unidade Vendida E2E");
  });

  test("o limite é 4 — a quinta unidade não é renderizada", async ({ page }) => {
    await page.goto(FICHA_ALPHA1);
    // São 5 outras unidades públicas no empreendimento; a ficha mostra 4.
    await expect(secao(page).getByRole("link", { name: /Alpha Unidade/ })).toHaveCount(4);
  });

  test("outro tenant nunca alcança este empreendimento", async ({ page }) => {
    // A Org A tem o seu próprio catálogo e nenhum imóvel Alpha; a ficha
    // do Alpha 1 não existe sob o slug dela.
    const resposta = await page.goto(`/e2e-org-a/imoveis/${IDS_E2E.imovelAlpha1}`);
    expect(resposta?.status()).toBe(404);
  });
});

// -----------------------------------------------------------------------
// Quando a seção NÃO deve existir
// -----------------------------------------------------------------------
test.describe("ausência da seção", () => {
  test("imóvel sem empreendimento não ganha bloco vazio", async ({ page }) => {
    await page.goto(FICHA_AVULSO);
    await expect(page.getByRole("heading", { name: TITULO })).toHaveCount(0);
  });

  test("empreendimento com uma única unidade também não", async ({ page }) => {
    // Pertence a um empreendimento, mas não há OUTRAS unidades — e um
    // "nenhuma outra unidade" seria ruído numa página de conversão.
    await page.goto(FICHA_SOLO);
    await expect(page.getByRole("heading", { name: TITULO })).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// Navegação
// -----------------------------------------------------------------------
test("o card leva à ficha daquela unidade, no mesmo tenant", async ({ page }) => {
  await page.goto(FICHA_ALPHA1);
  const card = secao(page).getByRole("link", { name: /Alpha Unidade 2 E2E/ }).first();
  await expect(card).toHaveAttribute("href", `${BASE}/imoveis/${IDS_E2E.imovelAlpha2}`);

  await card.click();
  await page.waitForURL(`${BASE}/imoveis/${IDS_E2E.imovelAlpha2}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alpha Unidade 2 E2E");

  // E a ficha da unidade 2 mostra as outras — inclusive a 1, que agora
  // deixou de ser "a atual".
  await expect(
    secao(page).getByRole("link", { name: /Alpha Unidade 1 E2E/ })
  ).toBeVisible();
  await expect(secao(page).getByRole("link", { name: /Alpha Unidade 2 E2E/ })).toHaveCount(0);
});

// -----------------------------------------------------------------------
// A invariante semântica continua valendo
// -----------------------------------------------------------------------
test("proximidade geográfica continua NÃO sendo unidade do empreendimento", async ({
  page,
}) => {
  await page.goto(FICHA_ALPHA1);
  // As duas seções coexistem e nunca se confundem: uma responde "o que
  // mais tem neste empreendimento", a outra "o que mais tem por perto".
  const proximos = page.getByRole("heading", { name: "Imóveis próximos que você pode gostar" });
  if ((await proximos.count()) > 0) {
    const blocoProximos = page
      .locator("section")
      .filter({ has: proximos });
    expect((await blocoProximos.innerText()).toLowerCase()).not.toContain("unidades neste");
  }
});

// -----------------------------------------------------------------------
// Responsivo
// -----------------------------------------------------------------------
test.describe("responsivo", () => {
  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: a seção não estoura nem corta os cards`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA_ALPHA1);

      const bloco = secao(page);
      await expect(bloco).toBeVisible();
      await expect(bloco.getByRole("link", { name: /Alpha Unidade 2 E2E/ })).toBeVisible();

      const caixa = await bloco.boundingBox();
      expect(caixa, `sem bounding box @ ${largura}px`).not.toBeNull();
      expect(caixa!.x + caixa!.width, `bloco cortado @ ${largura}px`).toBeLessThanOrEqual(
        largura + 1
      );

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------
// CRM — o caminho que declara a relação
// -----------------------------------------------------------------------
test.describe("gestão de empreendimentos", () => {
  test("o gestor cria, vê a contagem de unidades e não consegue excluir o que está em uso", async ({
    page,
  }) => {
    await login(page, ORG_EMPREENDIMENTO);
    await page.goto("/app/empreendimentos");

    await expect(page.getByRole("heading", { level: 1, name: "Empreendimentos" })).toBeVisible();
    const alpha = page.locator("li").filter({ hasText: "Residencial Alpha E2E" });
    await expect(alpha).toHaveCount(1);
    // 6 unidades vinculadas (5 públicas + a vendida) — a contagem é de
    // gestão, então inclui o que não está no site.
    await expect(alpha).toContainText("6 unidades");

    // Excluir é RECUSADO enquanto houver unidade: excluir empreendimento
    // jamais mexe em imóvel.
    await alpha.getByRole("button", { name: "Excluir" }).click();
    await expect(alpha.getByText(/Desvincule/)).toBeVisible();
    await page.reload();
    await expect(
      page.locator("li").filter({ hasText: "Residencial Alpha E2E" })
    ).toHaveCount(1);

    // Criar um novo funciona, e nome repetido é recusado.
    const nome = `Novo Empreendimento ${Date.now()}`;
    await page.getByLabel("Novo empreendimento").fill(nome);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Empreendimento criado.")).toBeVisible();

    await page.getByLabel("Novo empreendimento").fill("Residencial Alpha E2E");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Já existe um empreendimento com esse nome.")).toBeVisible();
  });

  test("o formulário do imóvel oferece o empreendimento como seletor, nunca texto livre", async ({
    page,
  }) => {
    await login(page, ORG_EMPREENDIMENTO);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelAlpha1}`);

    const seletor = page.locator("#empreendimentoId");
    await expect(seletor).toBeVisible();
    // Abre no vínculo REAL da unidade.
    await expect(seletor).toContainText("Residencial Alpha E2E");
    // E o campo não é um input de texto — identidade é ID, não string.
    await expect(page.locator('input[name="empreendimentoId"][type="text"]')).toHaveCount(0);
  });
});
