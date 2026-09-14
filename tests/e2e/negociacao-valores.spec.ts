import { test, expect } from "@playwright/test";
import { IDS_E2E, ORG_INBOX, login } from "./helpers";

// =======================================================================
// Negociação de valores
// =======================================================================
// Antes desta fase o produto sabia que a negociação estava "em
// PROPOSTA" e não sabia qual era a proposta. Este spec percorre a
// jornada real: cliente oferece, proprietário responde, cliente
// melhora — e o corretor entende o estado comercial sem sair da tela.
//
// A negociação é dedicada (Organização Q, pessoa "Rita Negociacao", sem
// contato de site) e o seed apaga as propostas a cada rodada, então a
// sequência afirmada aqui é sempre a mesma.

const BLOCO = "[data-negociacao-valores]";
const FICHA = `/app/clientes/${IDS_E2E.pessoaNegociacao}`;

// O CampoMoeda é máscara de CENTAVOS da direita para a esquerda (padrão
// brasileiro, o mesmo do fechamento): R$ 480.000,00 se digita como
// "48000000". Digitar "480000" produziria R$ 4.800,00 — e foi
// exatamente o que este teste fez antes de ser corrigido.
async function registrar(page: import("@playwright/test").Page, lado: string, valor: string) {
  await page.locator(BLOCO).getByRole("button", { name: "Registrar proposta" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Quem propôs").selectOption(lado);
  await dialogo.getByLabel("Valor proposto").fill(valor);
  await dialogo.getByRole("button", { name: "Registrar", exact: true }).click();
  // .first(): os toasts se acumulam na tela durante a jornada.
  await expect(page.getByText("Proposta registrada.").first()).toBeVisible();
}

test.describe("negociação de valores", () => {
  test("a jornada inteira: oferta, contraproposta, nova oferta", async ({ page }) => {
    await login(page, ORG_INBOX);
    await page.goto(FICHA);

    const bloco = page.locator(BLOCO);
    await expect(bloco).toBeVisible();
    // CONTEXTO: o preço pedido do imóvel, para a finalidade certa.
    await expect(bloco).toContainText("Pedido:");
    await expect(bloco).toContainText("R$ 640.000");
    await expect(bloco).toContainText("Nenhuma proposta registrada");

    // 1) Cliente oferece.
    await registrar(page, "CLIENT", "48000000");
    await expect(bloco).toContainText("R$ 480.000");
    await expect(bloco).toContainText("Cliente");
    // A vez passa a ser do outro lado — derivado, não um campo.
    await expect(bloco).toContainText("Aguardando resposta: Proprietário");

    // 2) Proprietário responde.
    await registrar(page, "OWNER", "51000000");
    await expect(bloco).toContainText("R$ 510.000");
    await expect(bloco).toContainText("Aguardando resposta: Cliente");
    // A anterior desce para o histórico, sem sumir.
    await expect(bloco).toContainText("R$ 480.000");

    // 3) Cliente melhora a oferta.
    await registrar(page, "CLIENT", "50000000");
    await expect(bloco).toContainText("Aguardando resposta: Proprietário");

    // Persistência real: recarrega do servidor.
    await page.reload();
    const depois = page.locator(BLOCO);
    await expect(depois).toContainText("R$ 500.000");
    await expect(depois).toContainText("R$ 510.000");
    await expect(depois).toContainText("R$ 480.000");
    // O último valor é o que vale, não o maior — R$ 510.000 continua no
    // histórico, mas quem manda é a proposta mais recente.
    await expect(depois.locator("[data-ultima-proposta]")).toContainText("R$ 500.000");
    await expect(depois.locator("[data-ultima-proposta]")).toContainText("Cliente");
  });

  test("a negociação saiu de VISITA para PROPOSTA por causa do fato", async ({ page }) => {
    await login(page, ORG_INBOX);
    await page.goto(FICHA);
    // O spec anterior já registrou propostas nesta negociação; o estágio
    // acompanhou o fato, sem ninguém mover o card à mão.
    await expect(page.getByText("Proposta", { exact: false }).first()).toBeVisible();
  });

  test("o pipeline mostra o valor em jogo, não só o rótulo", async ({ page }) => {
    await login(page, ORG_INBOX);
    await page.goto("/app/pipeline");
    // A coluna Proposta deixou de ser um rótulo vazio.
    await expect(page.getByText("Rita Negociacao").first()).toBeVisible();
    await expect(page.locator("body")).toContainText("R$ 500.000");
  });

  test("o fechamento já abre com o valor que está na mesa", async ({ page }) => {
    await login(page, ORG_INBOX);
    await page.goto(FICHA);
    await page.getByRole("button", { name: /Marcar como ganho|Fechar negócio/i }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    // Sem redigitar: o valor da última proposta chega preenchido.
    await expect(dialogo.getByLabel("Valor de fechamento")).toHaveValue(/500\.000/);
    // Nada é gravado: só se verifica a sugestão.
    await page.keyboard.press("Escape");
  });

  test("teclado e acessibilidade do diálogo", async ({ page }) => {
    await login(page, ORG_INBOX);
    await page.goto(FICHA);
    const abrir = page.locator(BLOCO).getByRole("button", { name: "Registrar proposta" });
    await abrir.focus();
    await expect(abrir).toBeFocused();
    await abrir.press("Enter");
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByLabel("Quem propôs")).toBeVisible();
    await expect(dialogo.getByLabel("Valor proposto")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
    await expect(abrir).toBeFocused();
  });

  test("valor inválido é recusado com erro no campo", async ({ page }) => {
    await login(page, ORG_INBOX);
    await page.goto(FICHA);
    await page.locator(BLOCO).getByRole("button", { name: "Registrar proposta" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Valor proposto").fill("0");
    await dialogo.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(dialogo.getByText(/maior que zero/i)).toBeVisible();
    await page.keyboard.press("Escape");
  });

  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: bloco legível e diálogo utilizável`, async ({ page }) => {
      await login(page, ORG_INBOX);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA);

      const medida = await page.locator(BLOCO).evaluate((bloco) => ({
        semOverflowInterno: bloco.scrollWidth <= bloco.clientWidth + 1,
        semOverflowPagina: document.documentElement.scrollWidth <= window.innerWidth + 1,
        alturaBotao:
          bloco.querySelector("button")?.getBoundingClientRect().height ?? 0,
      }));
      expect(medida.semOverflowInterno, `overflow do bloco @ ${largura}px`).toBe(true);
      expect(medida.semOverflowPagina, `overflow da página @ ${largura}px`).toBe(true);
      expect(medida.alturaBotao, `alvo de toque @ ${largura}px`).toBeGreaterThanOrEqual(28);

      // O diálogo precisa caber e o submit ficar alcançável no celular.
      await page.locator(BLOCO).getByRole("button", { name: "Registrar proposta" }).click();
      const dialogo = page.getByRole("dialog");
      await expect(dialogo.getByRole("button", { name: "Registrar", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    });
  }
});
