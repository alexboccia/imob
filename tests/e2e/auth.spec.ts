import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// 1. login válido
test("login válido leva pro painel autenticado", async ({ page }) => {
  await login(page, ORG_A);
  await expect(page).toHaveURL("/app");
  // Fase 26 — a sidebar deixou de dizer "Painel" e passou a dizer QUAL
  // imobiliária. Com multi-org isso deixou de ser detalhe estético: é a
  // resposta para "em qual tenant eu estou?".
  //
  // Nav responsiva: o nome aparece tanto na sidebar desktop quanto no
  // header mobile (ambos no DOM, só um visível por vez via CSS) — escopo
  // explícito na sidebar, que é a visível no viewport padrão (desktop) em
  // que este teste roda.
  // getByTitle, e não getByText: o dono da Org A no seed se chama como a
  // própria organização, então o nome aparece duas vezes na sidebar (o
  // tenant no topo, a identidade no rodapé) e um getByText solto casaria
  // com as duas.
  await expect(page.locator("aside").getByTitle("Organização E2E A")).toBeVisible();
});

// 2. login inválido
test("login inválido mostra erro e não entra no painel", async ({ page }) => {
  await page.goto("/app/login");
  await page.locator("#email").fill(ORG_A.email);
  await page.locator("#senha").fill("senha-errada-de-proposito");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  await expect(page).toHaveURL("/app/login");
});
