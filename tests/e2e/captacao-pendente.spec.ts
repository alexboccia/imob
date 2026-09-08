import { test, expect } from "@playwright/test";
import {
  entrarComo,
  esperarJanelaAntiSpam,
  ORG_CAPTACAO,
  ORG_CAPTACAO_CORRETOR,
  COLISAO_CAPTACAO,
} from "./helpers";

// =======================================================================
// Garantia de captura (Fase 24)
// =======================================================================
// A afirmação que estes testes protegem, ponta a ponta:
//
//   TODO LEAD PUBLICAMENTE ACEITO DEIXA UM REGISTRO RECUPERÁVEL.
//
// O caminho é o real: um visitante envia o formulário do site, recebe a
// confirmação, e o contato aparece no painel esperando identificação.

const BASE = `/${ORG_CAPTACAO.slug}`;

async function enviarContatoAmbiguo(page: import("@playwright/test").Page, nome: string) {
  await page.goto(`${BASE}/contato`);
  await esperarJanelaAntiSpam(page);
  await page.locator("#nome").fill(nome);
  await page.locator("#email").fill(COLISAO_CAPTACAO.email);
  await page.locator("#telefone").fill(COLISAO_CAPTACAO.telefone);
  await page.locator("#mensagem").fill("Tenho interesse e gostaria de mais detalhes.");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  // O visitante vê exatamente a mesma confirmação do caminho feliz — e a
  // partir desta fase ela é verdadeira mesmo sob conflito.
  await expect(page.getByText(/Mensagem enviada com sucesso/)).toBeVisible();
}

test.describe("Captação ambígua — nada se perde", () => {
  test("contato ambíguo é guardado, aparece na fila e é vinculado ao cliente escolhido", async ({
    page,
  }) => {
    const nome = `Visitante Ambiguo ${Date.now()}`;
    await enviarContatoAmbiguo(page, nome);

    await entrarComo(page, ORG_CAPTACAO);

    // A Home avisa: é trabalho atrasado por definição — o cliente já
    // escreveu e ninguém respondeu.
    const blocoHome = page
      .locator("h2")
      .filter({ hasText: "Contatos pendentes de identificação" });
    await expect(blocoHome).toBeVisible();
    await expect(page.getByRole("link", { name: "Contatos a identificar" })).toBeVisible();

    await page.goto("/app/captacoes");
    const item = page.locator("li").filter({ hasText: nome });
    await expect(item).toBeVisible();
    // Os DADOS ENVIADOS estão à vista: sem eles não há como decidir.
    await expect(item.getByText(COLISAO_CAPTACAO.email)).toBeVisible();
    await expect(item.getByText("Tenho interesse e gostaria de mais detalhes.")).toBeVisible();

    // Os dois candidatos, cada um com o motivo pelo qual apareceu.
    await expect(item.getByText("Cliente do E-mail")).toBeVisible();
    await expect(item.getByText("Cliente do Telefone")).toBeVisible();
    await expect(item.getByText("mesmo e-mail")).toBeVisible();
    await expect(item.getByText("mesmo telefone")).toBeVisible();

    await item.getByRole("radio").first().check();
    await item.getByRole("button", { name: "Vincular contato" }).click();
    // A confirmação é um toast justamente porque a linha resolvida sai da
    // fila — esperar por ela DENTRO do item esperaria por algo que já
    // deixou de existir.
    await expect(page.getByText("Contato identificado e adicionado ao histórico do cliente.")).toBeVisible();
    await expect(item).toHaveCount(0);

    // Resolvido significa FORA da fila — e dentro do histórico do cliente.
    await page.goto("/app/captacoes");
    // A asserção é sobre ESTA captação ter saído da fila — e não sobre a
    // fila estar vazia: outro teste deste arquivo deixa uma pendente de
    // propósito, e um retry isolado tornaria a versão global instável.
    await expect(page.getByText(nome)).toHaveCount(0);

    await page.goto("/app/clientes");
    await page.getByRole("link", { name: /Cliente do E-mail/ }).first().click();
    await page.waitForURL(/\/app\/clientes\/.+/);
    const historico = page
      .locator("h2")
      .filter({ hasText: "Histórico de interações" })
      .locator("xpath=..");
    await expect(
      historico.getByText("Tenho interesse e gostaria de mais detalhes.")
    ).toBeVisible();
  });

  test("a fila é gerencial: o corretor não vê o item de menu e não abre a tela", async ({
    page,
  }) => {
    const nome = `Visitante Do Corretor ${Date.now()}`;
    await enviarContatoAmbiguo(page, nome);

    await entrarComo(page, ORG_CAPTACAO_CORRETOR);
    await expect(page.getByRole("link", { name: "Contatos a identificar" })).toHaveCount(0);
    // Nem o bloco da Home: para o corretor a tela continua idêntica ao
    // que era antes desta fase.
    await expect(
      page.locator("h2").filter({ hasText: "Contatos pendentes de identificação" })
    ).toHaveCount(0);

    // Esconder o menu não é controle de acesso — o servidor recusa a URL
    // digitada à mão, e o dado de contato nunca é renderizado.
    await page.goto("/app/captacoes");
    await page.waitForURL(/\/app$/);
    await expect(page.getByText(nome)).toHaveCount(0);
  });

  test.describe("no celular", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("a fila é legível e resolvível numa viewport estreita", async ({ page }) => {
      const nome = `Visitante Mobile ${Date.now()}`;
      await enviarContatoAmbiguo(page, nome);
      await entrarComo(page, ORG_CAPTACAO);
      await page.goto("/app/captacoes");

      const item = page.locator("li").filter({ hasText: nome });
      await expect(item).toBeVisible();

      // Nada de rolagem horizontal: e-mail e mensagem quebram dentro da
      // coluna estreita em vez de empurrar a página inteira.
      const larguras = await page.evaluate(() => ({
        conteudo: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(larguras.conteudo).toBeLessThanOrEqual(larguras.viewport);

      // E é operável: o alvo de toque do rádio e o botão funcionam.
      await item.getByRole("radio").first().check();
      await item.getByRole("button", { name: "Vincular contato" }).click();
      await expect(page.getByText("Contato identificado e adicionado ao histórico do cliente.")).toBeVisible();
    });
  });
});
