import { test, expect } from "@playwright/test";
import { ORG_RECURSOS, ORG_A, IDS_E2E, login } from "./helpers";

// =======================================================================
// Gerador de criativos de marketing — "Criar anúncio" (MKT-001)
// =======================================================================
// Fixtures reaproveitadas do seed (nenhuma nova): imovelGaleria2 (Org
// Recursos) tem 2 fotos REAIS em data: URL — únicas fotos do seed que
// resolvem de verdade sem depender de rede externa nem do R2 (o resto do
// seed usa um URL de R2 fixo que não existe de verdade, só serve pra
// testes que nunca precisam baixar o byte). imovelDobraAmbos é o único
// fixture SALE_AND_RENT com os dois preços preenchidos. imovelDobraSemPreco
// prova ausência de preço. imovelComBadgesOrgA (Org A) não tem foto
// nenhuma — prova o estado vazio.

test.describe("Criar anúncio — jornada completa", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
  });

  test("escolhe foto, troca de foto, escolhe formato, gera prévia e baixa", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria2}`);
    await page.getByRole("button", { name: "Criar anúncio" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText("Criar anúncio")).toBeVisible();

    // Duas fotos reais — a primeira (capa) já vem selecionada.
    const fotos = dialogo.getByRole("button", { name: /^Foto \d$/ });
    await expect(fotos).toHaveCount(2);
    await expect(fotos.first()).toHaveAttribute("aria-pressed", "true");

    // Troca para a segunda foto.
    await fotos.nth(1).click();
    await expect(fotos.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(fotos.first()).toHaveAttribute("aria-pressed", "false");

    // Formato: Story em vez do padrão (Feed).
    await dialogo.getByRole("button", { name: "Instagram Story" }).click();
    await expect(dialogo.getByRole("button", { name: "Instagram Story" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Dado real do fixture (price: 700000, sem purpose explícito = SALE).
    await expect(dialogo.getByText(/R\$\s*700\.000/)).toBeVisible();

    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?") && r.request().method() === "GET"),
      dialogo.getByRole("button", { name: "Gerar prévia" }).click(),
    ]);
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toBe("image/png");

    await expect(dialogo.getByRole("img", { name: /Prévia do anúncio/ })).toBeVisible();

    const botaoBaixar = dialogo.getByRole("button", { name: "Baixar" });
    await expect(botaoBaixar).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent("download"), botaoBaixar.click()]);
    expect(download.suggestedFilename()).toMatch(/^imovel-galeria-2-e2e-sao-paulo-story\.png$/i);
  });

});

test.describe("imóvel sem fotos", () => {
  test("mostra estado vazio, sem quebrar a tela", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    await page.getByRole("button", { name: "Criar anúncio" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(/ainda não tem fotos cadastradas/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Gerar prévia" })).toBeDisabled();
  });
});

test.describe("SALE_AND_RENT nunca decide a finalidade sozinho", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelDobraAmbos}`);
    await page.getByRole("button", { name: "Criar anúncio" }).click();
  });

  test("o seletor de finalidade aparece e 'Gerar prévia' fica bloqueado até uma escolha explícita", async ({
    page,
  }) => {
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(/aceita venda e aluguel/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Gerar prévia" })).toBeDisabled();

    await dialogo.getByRole("button", { name: "À venda" }).click();
    await expect(dialogo.getByRole("button", { name: "Gerar prévia" })).toBeEnabled();
    // price: 900000 no fixture.
    await expect(dialogo.getByText(/R\$\s*900\.000/)).toBeVisible();

    await dialogo.getByRole("button", { name: "Para alugar" }).click();
    // rentPrice: 5000 no fixture — nunca mistura com o valor de venda.
    await expect(dialogo.getByText(/R\$\s*5\.000/)).toBeVisible();
    await expect(dialogo.getByText(/R\$\s*900\.000/)).toHaveCount(0);
  });
});

test.describe("ausência de preço nunca vira zero", () => {
  test("imóvel sem preço mostra aviso explícito, nunca 'R$ 0'", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelDobraSemPreco}`);
    await page.getByRole("button", { name: "Criar anúncio" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText("sem preço informado")).toBeVisible();
    await expect(dialogo.getByText(/R\$\s*0\b/)).toHaveCount(0);
  });
});

test.describe("isolamento de tenant", () => {
  test("a API do anúncio recusa um imóvel de outra organização", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    const resposta = await page.request.get(
      `/api/admin/imoveis/${IDS_E2E.imovelOrgB}/anuncio?mediaId=qualquer&formato=feed`
    );
    expect(resposta.status()).toBe(404);
  });

  test("sem sessão, a API recusa com 401", async ({ browser }) => {
    const contexto = await browser.newContext();
    const pagina = await contexto.newPage();
    const resposta = await pagina.request.get(
      `/api/admin/imoveis/${IDS_E2E.imovelGaleria2}/anuncio?mediaId=qualquer&formato=feed`
    );
    expect(resposta.status()).toBe(401);
    await contexto.close();
  });
});

test.describe("responsivo", () => {
  test("390px: o diálogo cabe na tela e o botão continua alcançável", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria2}`);
    await page.getByRole("button", { name: "Criar anúncio" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Gerar prévia" })).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow).toBe(true);
  });
});
