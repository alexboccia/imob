import { test, expect } from "@playwright/test";
import { ORG_AGENDA, login } from "./helpers";

// Ator da transição de etapa (Fase 14).
//
// Roda na Organização da Agenda, nunca na Org A, pelo mesmo motivo
// estrutural das fases anteriores: mover e fechar negócios desloca
// `tempoMedioHistorico` e reclassifica a prioridade dos cards de
// pipeline.spec.ts (ver prisma/seed-e2e.ts).
//
// Não cria dezenas de negociações: uma jornada prova o encadeamento
// aberto→movido→fechado, e um caso separado prova o legado.

async function novaNegociacao(page: import("@playwright/test").Page, nome: string) {
  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  await page.getByRole("link", { name: nome }).first().click();
  await page.locator("#propertyId").click();
  // Escopado ao listbox ABERTO: a ficha tem <select> nativos cujas
  // <option> ficam no DOM mesmo fechadas.
  await page.getByRole("listbox").getByRole("option").first().click();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
    page.getByRole("button", { name: "Relacionar imóvel" }).click(),
  ]);
  await page.reload();
}

test.describe("Accountability do funil", () => {
  test("o drawer mostra quem moveu a etapa, e o fechamento mostra quem fechou", async ({
    page,
  }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Ator ${Date.now()}`;
    await novaNegociacao(page, nome);

    // Move a etapa pelo card do Kanban — mesma interação já provada em
    // pipeline.spec.ts (MoverEstagioPipeline é um Select do Base UI, não
    // um <select> nativo).
    await page.goto("/app/pipeline");
    const cardParaMover = page
      .locator('[data-slot="card"]')
      .filter({ hasText: nome })
      .filter({ has: page.getByRole("button", { name: "Mover" }) });
    await cardParaMover.getByRole("combobox", { name: "Mover para outra etapa" }).click();
    // Nome explícito: a barra de filtros tem <select> nativos cujas
    // <option> ficam no DOM, mas nenhuma se chama "Visitado".
    await page.getByRole("option", { name: "Visitado" }).click();
    await cardParaMover.getByRole("button", { name: "Mover" }).click();
    await expect(page.getByText("Movendo...")).not.toBeVisible();

    // O Kanban abre a negociação e o drawer mostra a última transição
    // com o ator — superfície que já existia ("Na etapa há ..."), sem
    // nenhuma timeline nova.
    await page.goto("/app/pipeline");
    const card = page.locator('[data-slot="card"]').filter({ hasText: nome });
    await card.getByRole("button", { name: "Abrir negociação" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    // Texto legível, não avatar nem cor.
    await expect(drawer).toContainText("por ");
    await expect(drawer).not.toContainText("Ator não registrado");
    await page.keyboard.press("Escape");

    // Fecha como ganho e confere o ator do FECHAMENTO na ficha.
    await page.goto("/app/clientes");
    await page.getByRole("link", { name: nome }).first().click();
    await page.getByRole("button", { name: "Marcar como ganho" }).first().click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Valor de fechamento").fill("50000000");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Confirmar ganho" }).click(),
    ]);
    await page.reload();

    const ficha = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(ficha).toContain("Fechado em");
    expect(ficha).toContain("· por ");
    expect(ficha).not.toContain("Ator não registrado");
  });

  test("ator e responsável são exibidos como coisas diferentes", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Ator vs Responsavel ${Date.now()}`;
    await novaNegociacao(page, nome);

    // A negociação nasce com responsável (Fase 11) e com ator na
    // transição de criação (Fase 14). São dois rótulos distintos na
    // mesma tela, e nenhum é derivado do outro.
    const ficha = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(ficha).toContain("Responsável:");

    await page.goto("/app/pipeline");
    const card = page.locator('[data-slot="card"]').filter({ hasText: nome });
    // O card mostra o RESPONSÁVEL...
    await expect(card).toContainText("Responsável:");
    // ...e o ator da transição fica no detalhe, sem poluir o card.
    await expect(card).not.toContainText("Ator não registrado");

    await card.getByRole("button", { name: "Abrir negociação" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toContainText("Na etapa");
    await expect(drawer).toContainText("por ");
  });

  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: pipeline com ator não rola horizontalmente`, async ({ page }) => {
      await login(page, ORG_AGENDA);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/pipeline");
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
