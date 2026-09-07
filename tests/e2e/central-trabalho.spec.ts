import { test, expect } from "@playwright/test";
import { ORG_CENTRAL, ORG_B, login } from "./helpers";

// Central de trabalho (Fase 17).
//
// Roda na Organização E, dedicada, porque as asserções são números
// ABSOLUTOS e PESSOAIS — mesmo motivo estrutural de ORG_AGENDA e
// ORG_ANALYTICS (ver prisma/seed-e2e.ts).
//
// Seed determinístico: 1 visita atrasada, 1 hoje, 1 próxima, 3
// negociações do dono e 1 de outro corretor.

test.describe("Central de trabalho", () => {
  test("mostra atraso, hoje, próximos e só as minhas negociações", async ({ page }) => {
    await login(page, ORG_CENTRAL);

    const main = page.locator("main");
    const texto = (await main.innerText()).replace(/ /g, " ");

    // ATRASADAS — bloco só existe quando há atraso, e o número é exato.
    await expect(page.getByRole("heading", { name: "Atrasadas" })).toBeVisible();
    expect(texto).toContain("1 visita em aberto");
    expect(texto).toContain("Central Atrasada");

    // HOJE
    await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
    expect(texto).toContain("1 visita agendada");
    expect(texto).toContain("Central Hoje");

    // PRÓXIMOS
    await expect(page.getByRole("heading", { name: "Próximos compromissos" })).toBeVisible();
    expect(texto).toContain("Central Proxima");

    // MINHAS NEGOCIAÇÕES — três do dono, e a do outro corretor NUNCA.
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
    expect(texto).toContain("3 negociações em andamento sob sua responsabilidade");
    expect(texto).not.toContain("Central De Outro Corretor");

    // Fato derivado, não julgamento: a negociação sem agenda futura é
    // declarada como tal, e a que tem visita marcada não.
    expect(texto).toContain("Sem próximo compromisso");
    expect(texto).toContain("Com visita agendada");
    // E nenhuma linguagem de score/prioridade inventada.
    expect(texto).not.toContain("Prioridade");
    expect(texto).not.toContain("lead quente");
  });

  test("os itens levam à superfície correta", async ({ page }) => {
    await login(page, ORG_CENTRAL);

    // Clicar no cliente de um compromisso abre a ficha dele.
    await page.getByRole("link", { name: "Central Hoje" }).first().click();
    await page.waitForURL(/\/app\/clientes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Central Hoje" })).toBeVisible();
  });

  test("organização sem CRM não vê a Central, e a Home continua de pé", async ({ page }) => {
    // Org B não tem o módulo CRM: os blocos operacionais somem inteiros,
    // em vez de aparecerem vazios ou quebrarem.
    await login(page, ORG_B);
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Próximos compromissos" })).toHaveCount(0);
    // A visão geral (que não depende de CRM) continua renderizando.
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  });

  for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
    test(`${largura}px: a Home não rola horizontalmente`, async ({ page }) => {
      await login(page, ORG_CENTRAL);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app");
      // A Central continua legível — horário e nome do cliente.
      await expect(page.locator("main")).toContainText("Central Hoje");
      const scrollX = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(scrollX, `documento rolou ${scrollX}px em ${largura}px`).toBe(0);
    });
  }
});
