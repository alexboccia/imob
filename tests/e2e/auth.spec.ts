import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// 1. login válido
test("login válido leva pro painel autenticado", async ({ page }) => {
  await login(page, ORG_A);
  await expect(page).toHaveURL("/app");
  // Nav responsiva: "Painel" aparece tanto na sidebar desktop quanto no
  // header mobile (ambos no DOM, só um visível por vez via CSS) — escopo
  // explícito na sidebar, que é a visível no viewport padrão (desktop) em
  // que este teste roda.
  await expect(page.locator("aside").getByText("Painel")).toBeVisible();
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
