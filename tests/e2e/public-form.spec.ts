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

// ---------------------------------------------------------------------
// Contexto de captação (Fase 4). Cada contato do site precisa chegar ao
// CRM dizendo de onde veio. A verificação é feita no painel, que é onde
// o corretor de fato lê essa informação — e não direto no banco.
//
// Um teste só por cenário de negócio, com login feito uma vez: enviar
// formulário público e navegar até o cliente no painel é caro, e repetir
// esse setup por asserção foi o que degradou o E2E na Fase 3.
// ---------------------------------------------------------------------

import { IDS_E2E, ORG_A, login } from "./helpers";

async function abrirHistoricoDoCliente(
  page: import("@playwright/test").Page,
  nome: string
) {
  await page.goto("/app/clientes");
  await page.getByRole("link", { name: new RegExp(nome) }).first().click();
  await page.waitForURL(/\/app\/clientes\/.+/);
  return page
    .locator("h2")
    .filter({ hasText: "Histórico de interações" })
    .locator("xpath=..");
}

test.describe("Captação — contexto do lead no CRM", () => {
  test("contato da página do imóvel chega com origem e com o imóvel vinculado", async ({
    page,
  }) => {
    const marcador = Date.now();
    const nome = `Lead Imovel ${marcador}`;

    await page.goto(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    await esperarJanelaAntiSpam(page);
    await page.locator("#aside-nome").fill(nome);
    await page.locator("#aside-telefone").fill("11933330001");
    await page.locator("#aside-email").fill(`imovel${marcador}@e2e.test`);
    await page.locator("#aside-mensagem").fill("Tenho interesse neste imóvel.");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(page.getByText(/Mensagem enviada com sucesso/)).toBeVisible();

    await login(page, ORG_A);
    const historico = await abrirHistoricoDoCliente(page, nome);
    await expect(historico.getByText("Página do imóvel")).toBeVisible();
    // O imóvel que gerou o interesse, não só a mensagem solta.
    await expect(historico.getByText(/Imóvel:/)).toBeVisible();
  });

  test("contato da página /contato chega como contato geral, sem imóvel", async ({
    page,
  }) => {
    const marcador = Date.now();
    const nome = `Lead Contato ${marcador}`;

    await page.goto("/contato");
    await esperarJanelaAntiSpam(page);
    await page.locator("#nome").fill(nome);
    await page.locator("#telefone").fill("11933330002");
    await page.locator("#email").fill(`contato${marcador}@e2e.test`);
    await page.locator("#mensagem").fill("Dúvida geral sobre a região.");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(page.getByText(/Mensagem enviada com sucesso/)).toBeVisible();

    await login(page, ORG_A);
    const historico = await abrirHistoricoDoCliente(page, nome);
    await expect(historico.getByText("Página de contato")).toBeVisible();
    await expect(historico.getByText(/Imóvel:/)).toHaveCount(0);
  });

  // O caso que se perdia: a descrição do imóvel a anunciar ia apenas nas
  // notas de CRIAÇÃO da Person. Um proprietário que já tinha contatado a
  // imobiliária antes enviava o formulário, recebia "sucesso", e nada
  // chegava ao corretor — nem interação, nem nota, nem e-mail.
  test("proprietário que JÁ existe: a descrição do anúncio não se perde", async ({
    page,
  }) => {
    const marcador = Date.now();
    const nome = `Proprietario ${marcador}`;
    const email = `prop${marcador}@e2e.test`;
    const telefone = "11933330003";

    // 1º contato: cria a Person pela página de contato.
    await page.goto("/contato");
    await esperarJanelaAntiSpam(page);
    await page.locator("#nome").fill(nome);
    await page.locator("#telefone").fill(telefone);
    await page.locator("#email").fill(email);
    await page.locator("#mensagem").fill("Primeiro contato.");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(page.getByText(/Mensagem enviada com sucesso/)).toBeVisible();

    // 2º contato: a MESMA pessoa agora quer anunciar um imóvel.
    const descricao = `Casa que quero vender ${marcador}`;
    await page.goto("/anuncie");
    await esperarJanelaAntiSpam(page);
    await page.locator("#nome").fill(nome);
    await page.locator("#telefone").fill(telefone);
    await page.locator("#email").fill(email);
    await page.locator('textarea[name="descricaoImovel"]').fill(descricao);
    await page.getByRole("button", { name: /Enviar/ }).click();
    await expect(page.getByText(/enviad[ao] com sucesso|Recebemos/i)).toBeVisible();

    await login(page, ORG_A);
    const historico = await abrirHistoricoDoCliente(page, nome);
    // As duas interações, cada uma com a sua origem — e a descrição do
    // anúncio preservada.
    await expect(historico.getByText("Anuncie seu imóvel")).toBeVisible();
    await expect(historico.getByText("Página de contato")).toBeVisible();
    await expect(historico.getByText(descricao)).toBeVisible();

    // Deduplicação preservada: uma pessoa só, não duas.
    await page.goto("/app/clientes");
    await expect(page.getByRole("link", { name: new RegExp(nome) })).toHaveCount(1);
  });
});
