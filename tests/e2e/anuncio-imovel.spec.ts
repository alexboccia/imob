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

test.describe("Carrossel (MKT-002) — jornada completa", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
  });

  test("seleciona fotos, reordena, gera, navega entre slides e baixa um deles", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria5}`);
    await page.getByRole("button", { name: "Criar anúncio" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Carrossel" }).click();

    // Seleciona 3 das 5 fotos reais, na ordem 1, 2, 3.
    const fotos = dialogo.getByRole("button", { name: /^Foto \d(,|$)/ });
    await expect(fotos).toHaveCount(5);
    await fotos.nth(0).click();
    await fotos.nth(1).click();
    await fotos.nth(2).click();

    const ordem = dialogo.locator("ol > li");
    await expect(ordem).toHaveCount(3);
    await expect(ordem.nth(0)).toContainText("Capa");
    await expect(ordem.nth(2)).toContainText("CTA final");

    // A 3ª foto escolhida (índice 2 na grade) começa na posição 3.
    await expect(
      dialogo.getByRole("button", { name: "Foto 3, selecionada, posição 3" })
    ).toBeVisible();

    // Sobe a 3ª foto pro topo: duas trocas, posição 3 -> 2 -> 1.
    await ordem.nth(2).getByRole("button", { name: /Subir foto 3/ }).click();
    await ordem.nth(1).getByRole("button", { name: /Subir foto 2/ }).click();

    // A mesma foto (índice 2 na grade) agora está na posição 1 — prova
    // que a troca moveu a IDENTIDADE da foto, não só o texto da lista.
    await expect(
      dialogo.getByRole("button", { name: "Foto 3, selecionada, posição 1" })
    ).toBeVisible();
    const ordemDepois = dialogo.locator("ol > li");
    await expect(ordemDepois.nth(0)).toContainText("Capa");

    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?") && r.request().method() === "GET"),
      dialogo.getByRole("button", { name: "Gerar carrossel" }).click(),
    ]);
    expect(resposta.status()).toBe(200);

    await expect(dialogo.getByText("1/3")).toBeVisible();
    await expect(dialogo.getByRole("img", { name: /slide 1 de 3/ })).toBeVisible();

    await dialogo.getByRole("button", { name: "Próximo slide" }).click();
    await expect(dialogo.getByText("2/3")).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Slide anterior" })).toBeEnabled();

    await dialogo.getByRole("button", { name: "Próximo slide" }).click();
    await expect(dialogo.getByText("3/3")).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Próximo slide" })).toBeDisabled();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialogo.getByRole("button", { name: "Baixar este slide" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^imovel-galeria-5-e2e-sao-paulo-carrossel-03\.png$/i
    );
  });

  test("imóvel com apenas uma foto não oferece a opção Carrossel", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria1}`);
    await page.getByRole("button", { name: "Criar anúncio" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByRole("button", { name: "Carrossel" })).toBeDisabled();
  });
});

test.describe("Carrossel — SALE_AND_RENT nunca decide sozinho", () => {
  test("'Gerar carrossel' fica bloqueado até a finalidade ser escolhida explicitamente", async ({
    page,
  }) => {
    await login(page, ORG_RECURSOS);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelCarrosselAmbos}`);
    await page.getByRole("button", { name: "Criar anúncio" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Carrossel" }).click();

    const fotos = dialogo.getByRole("button", { name: /^Foto \d(,|$)/ });
    await fotos.nth(0).click();
    await fotos.nth(1).click();

    await expect(dialogo.getByText(/aceita venda e aluguel/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Gerar carrossel" })).toBeDisabled();

    await dialogo.getByRole("button", { name: "À venda" }).click();
    await expect(dialogo.getByRole("button", { name: "Gerar carrossel" })).toBeEnabled();
  });
});

test.describe("Carrossel — falha parcial e isolamento de tenant", () => {
  test("a API recusa um mediaId de outro imóvel mesmo dentro do fluxo de carrossel", async ({
    page,
  }) => {
    await login(page, ORG_RECURSOS);
    const resposta = await page.request.get(
      `/api/admin/imoveis/${IDS_E2E.imovelGaleria5}/anuncio?mediaId=${IDS_E2E.imovelOrgB}&formato=feed&papel=foto`
    );
    expect(resposta.status()).toBe(400);
  });
});

test.describe("Carrossel — responsivo", () => {
  test("390px: seleção, ordem e navegação entre slides cabem na tela", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria3}`);
    await page.getByRole("button", { name: "Criar anúncio" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Carrossel" }).click();

    const fotos = dialogo.getByRole("button", { name: /^Foto \d(,|$)/ });
    await fotos.nth(0).click();
    await fotos.nth(1).click();

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?")),
      dialogo.getByRole("button", { name: "Gerar carrossel" }).click(),
    ]);
    await expect(dialogo.getByText("1/2")).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow).toBe(true);
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
