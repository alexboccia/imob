import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// 9. navegação mobile básica
//
// O painel autenticado (src/app/app/layout.tsx) ainda não tem um menu
// hambúrguer/drawer dedicado pra mobile — é uma <aside> de largura fixa.
// Então o teste "básico" pragmático aqui é: em viewport mobile, a
// navegação continua visível, sem overflow horizontal quebrando o layout,
// e os links continuam clicáveis/funcionais.
test.use({ viewport: { width: 375, height: 667 } });

test("navegação principal funciona em viewport mobile", async ({ page }) => {
  await login(page, ORG_A);

  const nav = page.locator("nav");
  await expect(nav).toBeVisible();
  await expect(page.getByRole("link", { name: "Imóveis" })).toBeVisible();

  // Sem overflow horizontal (scrollWidth não deve passar do viewport).
  const semOverflowHorizontal = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(semOverflowHorizontal).toBe(true);

  await page.getByRole("link", { name: "Imóveis" }).click();
  await page.waitForURL("/app/imoveis");
  await expect(page.getByRole("heading", { name: "Imóveis" })).toBeVisible();
});
