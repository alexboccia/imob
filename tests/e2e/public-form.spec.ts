import { test, expect } from "@playwright/test";
import { esperarJanelaAntiSpam } from "./helpers";

// 8. formulário público cria lead
test("formulário público de contato cria um lead", async ({ page }) => {
  await page.goto("/contato");

  // CamposAntiSpam bloqueia envios muito rápidos (< 1.5s desde o render) —
  // espera passar essa janela antes de preencher/enviar.
  await esperarJanelaAntiSpam(page);

  await page.locator("#nome").fill("Lead via Playwright");
  await page.locator("#email").fill("lead-e2e@example.com");
  await page.locator("#mensagem").fill("Tenho interesse neste imóvel, podem me ligar?");

  await page.getByRole("button", { name: "Enviar mensagem" }).click();

  await expect(
    page.getByText("Mensagem enviada com sucesso! Em breve entraremos em contato.")
  ).toBeVisible();
});
