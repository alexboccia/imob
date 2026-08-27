import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Responsividade do painel administrativo — a sidebar fixa (w-56, sempre
// visível) foi substituída abaixo de md (768px) por AdminMobileNav: header
// compacto com botão de menu + Sheet lateral (ver src/app/app/layout.tsx e
// src/components/admin/AdminMobileNav.tsx). Este spec cobre a navegação
// mobile em si (abre/fecha/navega/ativo/logout) — a ausência de overflow
// horizontal por rota é validada nos specs de responsividade por rota
// (tests/e2e/admin-responsivo.spec.ts).
test.use({ viewport: { width: 375, height: 667 } });

test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

test("abre o menu, mostra os links e fecha", async ({ page }) => {
  const hamburguer = page.getByRole("button", { name: "Abrir menu" });
  await expect(hamburguer).toBeVisible();

  // Sidebar desktop não ocupa espaço da viewport mobile (ausente do fluxo,
  // não só escondida por cima de outro conteúdo).
  await expect(page.locator("aside")).toBeHidden();

  await hamburguer.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const label of [
    "Dashboard",
    "Imóveis",
    "Clientes",
    "Pipeline",
    "Agenda",
    "Características",
    "Tipos de imóvel",
    "Usuários",
    "Configurações",
    "Manutenção",
  ]) {
    await expect(dialog.getByRole("link", { name: label })).toBeVisible();
  }

  // Escape fecha o Sheet.
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("item ativo fica marcado (aria-current) e navegar fecha o menu sozinho", async ({ page }) => {
  await page.goto("/app/imoveis");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  const dialog = page.getByRole("dialog");

  await expect(dialog.getByRole("link", { name: "Imóveis" })).toHaveAttribute("aria-current", "page");
  await expect(dialog.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");

  await dialog.getByRole("link", { name: "Clientes" }).click();
  await page.waitForURL("**/app/clientes");
  await expect(dialog).not.toBeVisible();
});

test("logout continua acessível pelo menu mobile", async ({ page }) => {
  await page.getByRole("button", { name: "Abrir menu" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Sair" })).toBeVisible();
});

test("desktop (>=768px) continua com a sidebar de sempre, sem o botão de menu", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/app");

  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator("aside").getByRole("link", { name: "Imóveis" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir menu" })).toBeHidden();
});
