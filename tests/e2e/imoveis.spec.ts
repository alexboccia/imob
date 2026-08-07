import { test, expect } from "@playwright/test";
import { ORG_A, IDS_E2E, login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

// 3. criar imóvel
test("cria um imóvel com os campos mínimos obrigatórios", async ({ page }) => {
  await page.goto("/app/imoveis/novo");

  await page.locator("#titulo").fill("Apartamento E2E Novo");
  await page.locator('input[name="bairro"]').fill("Bairro Teste");
  await page.locator('input[name="cidade"]').fill("São Paulo");
  await page.locator('select[name="estado"]').selectOption("SP");

  await page.getByRole("button", { name: "Salvar imóvel" }).click();

  await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
});

// 4. erro de validação no imóvel
test("mostra erro de validação quando o título é curto demais", async ({ page }) => {
  await page.goto("/app/imoveis/novo");

  // Passa pela validação HTML5 "required" (não está vazio) mas falha no
  // schema Zod (imovelSchema.titulo exige min(3)) — dispara o erro
  // server-side, não o nativo do navegador.
  await page.locator("#titulo").fill("ab");
  await page.locator('input[name="bairro"]').fill("Bairro Teste");
  await page.locator('input[name="cidade"]').fill("São Paulo");
  await page.locator('select[name="estado"]').selectOption("SP");

  await page.getByRole("button", { name: "Salvar imóvel" }).click();

  await expect(
    page.getByText("Informe um título com ao menos 3 caracteres.")
  ).toBeVisible();
  await expect(page).toHaveURL("/app/imoveis/novo");
});

// 5. editar imóvel
test("edita um imóvel existente", async ({ page }) => {
  await page.goto(`/app/imoveis/${IDS_E2E.imovelParaEditarOrgA}`);
  await expect(page.locator("#titulo")).toHaveValue("Apartamento E2E para edição");

  await page.locator("#titulo").fill("Apartamento E2E editado com sucesso");
  await page.getByRole("button", { name: "Salvar imóvel" }).click();

  await page.waitForURL(`/app/imoveis/${IDS_E2E.imovelParaEditarOrgA}?salvo=1`);
  await expect(page.locator("#titulo")).toHaveValue("Apartamento E2E editado com sucesso");
});
