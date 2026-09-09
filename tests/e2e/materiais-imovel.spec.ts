import { test, expect } from "@playwright/test";
import { IDS_E2E, ORG_A, esperarJanelaAntiSpam, login } from "./helpers";

// =======================================================================
// Materiais de apresentação do imóvel
// =======================================================================
// O imóvel de badges (LANÇAMENTO) tem três materiais no seed: dois ativos
// e um desativado de propósito. O de aluguel não tem nenhum — é ele que
// prova que o bloco não aparece sem material.

const URL_COM_MATERIAIS = `/imoveis/${IDS_E2E.imovelComBadgesOrgA}`;
const URL_SEM_MATERIAIS = `/imoveis/${IDS_E2E.imovelAluguelOrgA}`;

// Contato novo a cada execução: o pipeline deduplica por e-mail dentro da
// organização, e um endereço fixo faria a segunda rodada exercitar o
// caminho de Person reutilizada sem querer.
function emailUnico() {
  return `materiais-${Date.now()}-${Math.floor(Math.random() * 1000)}@e2e.test`;
}

async function semOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
}

test.describe("Materiais de apresentação — ficha pública", () => {
  test("o bloco lista os materiais REAIS e ativos, com o título de empreendimento", async ({
    page,
  }) => {
    await page.goto(URL_COM_MATERIAIS);
    const bloco = page.locator("[data-materiais-imovel]");

    // O imóvel é lançamento — o título fala de empreendimento.
    await expect(
      bloco.getByRole("heading", {
        name: "Quer receber os materiais deste empreendimento?",
      })
    ).toBeVisible();

    // Os itens são os do cadastro, na ordem cadastrada — nada decorativo.
    await expect(bloco.locator("li")).toHaveText([
      "Book do empreendimento",
      "Plantas e metragens",
    ]);
    // O material desativado não aparece.
    await expect(bloco.getByText("Tabela de precos")).toHaveCount(0);
    await expect(bloco.getByRole("button", { name: "Receber materiais" })).toBeVisible();
  });

  test("nenhum arquivo vaza para o HTML antes da captação", async ({ page }) => {
    await page.goto(URL_COM_MATERIAIS);
    // Nem link de PDF, nem a URL do bucket em lugar nenhum da página: a
    // URL só sai do servidor na resposta da action, depois do lead.
    expect(await page.locator('a[href$=".pdf"]').count()).toBe(0);
    expect(await page.content()).not.toContain("cdn-e2e.local");
  });

  test("captação: informa contato, o lead é registrado e os materiais ficam disponíveis", async ({
    page,
  }) => {
    await page.goto(URL_COM_MATERIAIS);
    const bloco = page.locator("[data-materiais-imovel]");

    await bloco.getByRole("button", { name: "Receber materiais" }).click();
    await bloco.getByLabel("Nome").fill("Visitante E2E");
    await bloco.getByLabel("E-mail").fill(emailUnico());
    // Guarda anti-bot real do produto: envio em menos de 1,5s após o
    // formulário aparecer é recusado. O Playwright preenche mais rápido
    // que qualquer humano — mesmo helper usado por todos os specs de
    // formulário público.
    await esperarJanelaAntiSpam(page);
    await bloco.getByRole("button", { name: "Receber materiais" }).click();

    // Depois da captação, e só então, os arquivos aparecem para download.
    const links = bloco.locator('a[href$=".pdf"]');
    await expect(links).toHaveCount(2);
    await expect(links.first()).toHaveText("Book do empreendimento");
    await expect(links.first()).toHaveAttribute("href", /\/materiais\/[0-9a-f-]+\.pdf$/);
    // O desativado continua fora, inclusive na entrega.
    await expect(bloco.getByText("Tabela de precos")).toHaveCount(0);
  });

  test("sem e-mail e sem telefone o pedido é recusado com erro visível", async ({ page }) => {
    await page.goto(URL_COM_MATERIAIS);
    const bloco = page.locator("[data-materiais-imovel]");

    await bloco.getByRole("button", { name: "Receber materiais" }).click();
    await bloco.getByLabel("Nome").fill("Sem contato");
    await esperarJanelaAntiSpam(page);
    await bloco.getByRole("button", { name: "Receber materiais" }).click();

    await expect(bloco.getByText("Preencha nome e e-mail ou telefone.")).toBeVisible();
    await expect(bloco.locator('a[href$=".pdf"]')).toHaveCount(0);
  });

  test("imóvel sem material não mostra o bloco — nem o CTA", async ({ page }) => {
    await page.goto(URL_SEM_MATERIAIS);
    await expect(page.locator("[data-materiais-imovel]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Receber materiais" })).toHaveCount(0);
  });

  for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
    test(`${largura}px: o bloco cabe na tela, sem overflow`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(URL_COM_MATERIAIS);
      const bloco = page.locator("[data-materiais-imovel]");
      await expect(bloco).toBeVisible();
      await expect(
        bloco.getByRole("button", { name: "Receber materiais" })
      ).toBeVisible();
      expect(await semOverflow(page), `materiais @ ${largura}px`).toBe(true);
    });
  }
});

test.describe("Materiais de apresentação — painel", () => {
  test("a edição do imóvel mostra os materiais cadastrados, inclusive o desativado", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);

    await expect(
      page.getByRole("heading", { name: "Materiais de apresentação" })
    ).toBeVisible();
    const itens = page.locator("[data-material-item]");
    await expect(itens).toHaveCount(3);
    await expect(itens.nth(0).getByRole("textbox")).toHaveValue("Book do empreendimento");
    // O desativado continua no cadastro, com a caixa desmarcada — some do
    // site, não do painel.
    await expect(itens.nth(2).locator("input[type=checkbox]")).not.toBeChecked();
  });
});
