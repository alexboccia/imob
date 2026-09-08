import { test, expect } from "@playwright/test";
import { login, entrarComo, ORG_TRIAL, ORG_VENCIDA, ORG_ACESSO_CORRETOR } from "./helpers";

// =======================================================================
// Assinatura (Fase 27)
// =======================================================================
// O produto ainda NÃO cobra — não há provedor de pagamento, e escolher
// um é decisão comercial que o repositório não contém. O que estes
// testes protegem é o que já precisa ser verdade antes de qualquer
// cobrança existir:
//
//   a imobiliária enxerga o próprio contrato;
//   o trial vencido NÃO é um beco sem saída;
//   quem não responde pelo contrato não chega até ele.

test.describe("contrato visível", () => {
  test("o dono vê plano, prazo do trial e limites reais", async ({ page }) => {
    await login(page, ORG_TRIAL);

    await expect(page.getByRole("link", { name: "Assinatura" })).toBeVisible();
    await page.goto("/app/assinatura");

    await expect(page.getByRole("heading", { name: "Assinatura" })).toBeVisible();
    await expect(page.getByText("Período de avaliação").first()).toBeVisible();
    // Prazo e limites vêm do banco, não de texto fixo.
    await expect(page.getByText(/Período de avaliação até/)).toBeVisible();
    await expect(page.getByText(/Imóveis ativos:/)).toBeVisible();
    await expect(page.getByText(/Usuários ativos:/)).toBeVisible();
    // Mensalidade do catálogo — o plano de entrada é gratuito.
    await expect(page.getByText(/Mensalidade:/)).toBeVisible();
  });

  test("a tela não finge que existe contratação dentro do produto", async ({ page }) => {
    await login(page, ORG_TRIAL);
    await page.goto("/app/assinatura");

    // Um botão "Assinar" que não cobra nada seria pior que a ausência
    // dele: prometeria um caminho que não existe.
    await expect(page.getByRole("button", { name: /Assinar|Pagar|Contratar/ })).toHaveCount(0);
    await expect(page.getByText(/definição comercial que ainda não está no produto/)).toBeVisible();
  });
});

test.describe("trial vencido não prende a imobiliária", () => {
  test("a operação para, mas a assinatura continua alcançável", async ({ page }) => {
    await login(page, ORG_VENCIDA);

    // A operação normal está bloqueada.
    await page.goto("/app/imoveis");
    await page.waitForURL(/\/app\/trial-expirado/);
    await expect(page.getByRole("heading", { name: /período de avaliação terminou/i })).toBeVisible();

    // E existe uma saída — antes desta fase a tela só oferecia "Sair".
    await page.getByRole("link", { name: "Ver minha assinatura" }).click();
    await page.waitForURL(/\/app\/assinatura/);

    await expect(page.getByRole("heading", { name: "Assinatura" })).toBeVisible();
    // A tela diz a verdade sobre o bloqueio, com a data real.
    await expect(page.getByText(/Seu período de avaliação terminou em/)).toBeVisible();
  });

  test("mesmo bloqueada, a organização vê plano e limites", async ({ page }) => {
    await login(page, ORG_VENCIDA);
    await page.goto("/app/assinatura");

    await expect(page.getByText(/Imóveis ativos:/)).toBeVisible();
    await expect(page.getByText(/Mensalidade:/)).toBeVisible();
  });
});

test.describe("autorização financeira", () => {
  test("um corretor não vê nem alcança a assinatura", async ({ page }) => {
    await entrarComo(page, ORG_ACESSO_CORRETOR);

    // Gerir carteira não dá autoridade sobre o contrato.
    await expect(page.getByRole("link", { name: "Assinatura" })).toHaveCount(0);

    await page.goto("/app/assinatura");
    await page.waitForURL(/\/app$/);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("a assinatura cabe numa viewport estreita", async ({ page }) => {
    await login(page, ORG_TRIAL);
    await page.goto("/app/assinatura");

    await expect(page.getByRole("heading", { name: "Assinatura" })).toBeVisible();
    const larguras = await page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(larguras.conteudo).toBeLessThanOrEqual(larguras.viewport);
  });
});
