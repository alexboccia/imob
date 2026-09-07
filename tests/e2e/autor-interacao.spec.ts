import { test, expect } from "@playwright/test";
import { ORG_AGENDA, login } from "./helpers";

// Autoria da interação (Fase 15).
//
// Roda na Organização da Agenda, nunca na Org A, pelo mesmo motivo
// estrutural das fases anteriores (ver prisma/seed-e2e.ts).
//
// ESCOPO DELIBERADO: o E2E prova a AUTORIA VISÍVEL de uma interação
// registrada pela equipe — que é a superfície nova desta fase. A
// semântica da captação PÚBLICA (memberId null, sem rótulo de autor)
// fica coberta por 4 testes de integração e pela função pura de rótulo
// nos unitários: chegar até a ficha de um cliente do seed exigiria
// atravessar lista -> drawer -> "Ver tudo", um caminho frágil que
// testaria a navegação e não a autoria.

async function clienteComOportunidade(page: import("@playwright/test").Page, nome: string) {
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

test.describe("Autoria na timeline do cliente", () => {
  test("interação registrada pela equipe mostra o autor, sem mexer no responsável", async ({
    page,
  }) => {
    await login(page, ORG_AGENDA);
    const nome = `Cliente Autor ${Date.now()}`;
    await clienteComOportunidade(page, nome);

    // Antes de qualquer interação da equipe, nenhuma autoria na tela.
    const antes = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(antes).toContain("Nenhuma interação registrada");

    // O tipo já vem com o padrão do formulário — o que esta fase precisa
    // provar é a AUTORIA, não a escolha do tipo.
    await page.getByPlaceholder("Notas").fill("Liguei para o cliente");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Registrar" }).click(),
    ]);
    await page.reload();

    const depois = (await page.locator("main").innerText()).replace(/ /g, " ");
    // Autoria em TEXTO, na timeline que já existia — nunca só avatar/cor.
    expect(depois).toContain("Liguei para o cliente");
    expect(depois).toContain("por ");
    // Interação da equipe tem autor conhecido: nada de "não registrado".
    expect(depois).not.toContain("Autor não registrado");
    // E o responsável pela negociação continua sendo uma coisa separada,
    // exibida com o seu próprio rótulo.
    expect(depois).toContain("Responsável:");
  });

  test("autoria legível e sem overflow em 375/768/1024/1280/1440", async ({ page }) => {
    await login(page, ORG_AGENDA);

    // Preparo no viewport padrão de propósito: abaixo de `sm` a lista de
    // clientes vira cards e o nome deixa de ser um link — medir
    // responsividade não deveria depender de atravessar a lista. A ficha
    // é alcançada uma vez, e só a MEDIÇÃO muda de largura.
    const nome = `Cliente Autor Resp ${Date.now()}`;
    await clienteComOportunidade(page, nome);
    await page.getByPlaceholder("Notas").fill("Contato registrado pela equipe");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Registrar" }).click(),
    ]);
    const urlFicha = page.url();

    for (const largura of [375, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(urlFicha, { waitUntil: "networkidle" });
      // A autoria continua legível em qualquer largura.
      await expect(page.locator("main")).toContainText("por ");
      const scrollX = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(scrollX, `documento rolou ${scrollX}px em ${largura}px`).toBe(0);
    }
  });
});
