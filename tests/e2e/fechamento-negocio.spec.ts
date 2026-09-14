import { test, expect } from "@playwright/test";
import { IDS_E2E, ORG_INBOX, login } from "./helpers";

// =======================================================================
// Fechamento coerente do negócio
// =======================================================================
// Ganhar não pode ser só mudar uma linha do funil. Depois do fechamento,
// três coisas têm de ser verdade juntas: a negociação terminou, o valor
// ficou registrado e o imóvel está no estado comercial correto — o que
// inclui sair do catálogo público e aparecer em /vendidos.
//
// Fixtures dedicadas (Organização Q): ganhar muda o status do imóvel, e
// isso não pode contaminar as asserções de preço dos outros specs. O
// seed devolve tudo ao estado inicial a cada rodada.

const FICHA_GANHO = `/app/clientes/${IDS_E2E.pessoaFechamentoGanho}`;
const FICHA_PERDA = `/app/clientes/${IDS_E2E.pessoaFechamentoPerda}`;
const BASE_PUBLICA = "/e2e-org-inbox";
// Negociação que nenhum teste fecha — os que só abrem o diálogo usam
// esta, para não dependerem da ordem de execução.
const FICHA_DIALOGO = `/app/clientes/${IDS_E2E.pessoaFechamentoDialogo}`;

test.describe("ganho", () => {
  test("fechar o negócio tira o imóvel do ar e o leva para vendidos", async ({ page }) => {
    await login(page, ORG_INBOX);

    // Antes: o imóvel está no catálogo público.
    await page.goto(`${BASE_PUBLICA}/imoveis`);
    await expect(page.getByText("Casa do Fechamento Ganho").first()).toBeVisible();

    // Fecha usando o diálogo de ganho.
    await page.goto(FICHA_GANHO);
    await page.getByRole("button", { name: "Marcar como ganho" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    // Imóvel só de VENDA: o sistema sabe o desfecho e não pergunta.
    await expect(dialogo.getByText("O que aconteceu com o imóvel?")).toHaveCount(0);
    // CampoMoeda é máscara de centavos: R$ 680.000,00 = "68000000".
    await dialogo.getByLabel("Valor de fechamento").fill("68000000");
    await dialogo.getByRole("button", { name: /Confirmar|Marcar como ganho|Salvar/ }).last().click();

    // 1) negociação terminou · 2) valor preservado
    await expect(page.getByText("Ganho").first()).toBeVisible();
    await expect(page.getByText("R$ 680.000").first()).toBeVisible();

    // 3) imóvel fora do catálogo…
    await page.goto(`${BASE_PUBLICA}/imoveis`);
    await expect(page.getByText("Casa do Fechamento Ganho")).toHaveCount(0);

    // …e em /vendidos, sem lógica duplicada: a página já consome SOLD.
    await page.goto(`${BASE_PUBLICA}/vendidos`);
    await expect(page.getByText("Casa do Fechamento Ganho").first()).toBeVisible();

    // Persistência real.
    await page.goto(FICHA_GANHO);
    await expect(page.getByText("Ganho").first()).toBeVisible();
  });
});

test.describe("perda", () => {
  test("perder registra o motivo e o imóvel CONTINUA disponível", async ({ page }) => {
    await login(page, ORG_INBOX);
    await page.goto(FICHA_PERDA);

    await page.getByRole("button", { name: "Marcar como perdido" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText(/imóvel continua disponível/i)).toBeVisible();
    await dialogo.getByLabel("Motivo (opcional)").selectOption("PRICE");
    await dialogo.getByRole("button", { name: "Marcar como perdido" }).click();

    // O desfecho aparece em TEXTO, com o motivo.
    await expect(page.getByText("Perdido").first()).toBeVisible();
    await expect(page.getByText("Não fecharam no valor").first()).toBeVisible();

    // O imóvel continua no catálogo — perder não tira imóvel do ar.
    await page.goto(`${BASE_PUBLICA}/imoveis`);
    await expect(page.getByText("Casa do Fechamento Perda").first()).toBeVisible();

    await page.goto(FICHA_PERDA);
    await expect(page.getByText("Não fecharam no valor").first()).toBeVisible();
  });
});

test.describe("acessibilidade e mobile", () => {
  test("o diálogo de perda é operável por teclado", async ({ page }) => {
    await login(page, ORG_INBOX);
    await page.goto(FICHA_DIALOGO);
    const abrir = page.getByRole("button", { name: "Marcar como perdido" }).first();
    await abrir.focus();
    await expect(abrir).toBeFocused();
    await abrir.press("Enter");
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByLabel("Motivo (opcional)")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
    await expect(abrir).toBeFocused();
  });

  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: diálogo de fechamento sem overflow e com CTA alcançável`, async ({
      page,
    }) => {
      await login(page, ORG_INBOX);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA_DIALOGO);
      await page.getByRole("button", { name: "Marcar como perdido" }).first().click();

      const dialogo = page.getByRole("dialog");
      await expect(dialogo.getByRole("button", { name: "Marcar como perdido" })).toBeVisible();
      const medida = await dialogo.evaluate((d) => ({
        semOverflow: d.scrollWidth <= d.clientWidth + 1,
        dentroDaTela: d.getBoundingClientRect().right <= window.innerWidth + 1,
      }));
      expect(medida.semOverflow, `overflow @ ${largura}px`).toBe(true);
      expect(medida.dentroDaTela, `fora da tela @ ${largura}px`).toBe(true);
      await page.keyboard.press("Escape");
    });
  }
});
