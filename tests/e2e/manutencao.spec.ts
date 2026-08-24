import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Redesenho de Manutenção — ambiente de teste (.env.test) não configura
// credenciais reais de Cloudflare R2 (de propósito: nunca deve existir
// acesso real a R2 a partir de teste automatizado, nem produção nem um
// bucket de teste). Por isso, ao confirmar a limpeza aqui, a Server
// Action real é executada e cai no seu próprio caminho de erro
// ("Configuração do Cloudflare R2 ausente...") — o que dá, de forma
// honesta e sem mock de rede, cobertura real do caminho de ERRO
// (mensagem genérica ao usuário, sem stack técnico). A regra das 24h e a
// proteção de fotos vinculadas têm prova determinística e completa em
// tests/integration/manutencao-limpar-midias.test.ts (S3 mockado,
// LastModified controlado) — impossível de reproduzir com fidelidade
// aqui, já que não dá pra forjar a idade de um objeto num PutObject real.
test.describe("Manutenção", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/manutencao");
  });

  test("página renderiza com as proteções reais e a ação principal", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Manutenção" })).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]', { hasText: "Fotos não utilizadas" })).toBeVisible();
    await expect(page.getByText("Proteção automática")).toBeVisible();
    await expect(page.getByText("Somente fotos sem vínculo com imóveis")).toBeVisible();
    await expect(page.getByText("Período de segurança")).toBeVisible();
    await expect(page.getByText("Apenas arquivos enviados há mais de 24 horas")).toBeVisible();
    await expect(page.getByText("Como funciona")).toBeVisible();
    await expect(page.getByRole("button", { name: "Limpar fotos não utilizadas" })).toBeVisible();
  });

  test("ação não ocorre antes da confirmação: abrir o diálogo não dispara a limpeza", async ({ page }) => {
    let chamadaAction = false;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/app/manutencao")) chamadaAction = true;
    });

    await page.getByRole("button", { name: "Limpar fotos não utilizadas" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Limpar fotos não utilizadas?" })).toBeVisible();
    expect(chamadaAction).toBe(false);
  });

  test("cancelar fecha o diálogo sem executar a limpeza", async ({ page }) => {
    await page.getByRole("button", { name: "Limpar fotos não utilizadas" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).not.toBeVisible();

    // Nem sucesso nem erro apareceram — nada foi executado.
    await expect(page.getByText("A limpeza não pôde ser concluída.")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Limpar fotos não utilizadas" })).toBeVisible();
  });

  test("confirmar dispara a ação, protege contra duplo clique (pending) e trata o erro sem detalhe técnico", async ({ page }) => {
    await page.getByRole("button", { name: "Limpar fotos não utilizadas" }).click();
    const dialog = page.getByRole("dialog");
    const botaoConfirmar = dialog.getByRole("button", { name: "Confirmar limpeza" });
    await expect(botaoConfirmar).toBeVisible();

    await botaoConfirmar.click();

    // Proteção de duplo submit: o próprio botão de confirmação fica
    // desabilitado/rotulado como pendente assim que o clique dispara a
    // transição — não é possível confirmar duas vezes.
    await expect(dialog.getByRole("button", { name: "Limpando..." })).toBeDisabled();

    // Erro real (R2 não configurado neste ambiente de teste) tratado com
    // mensagem genérica ao usuário — sem stack/mensagem técnica do Prisma
    // ou do SDK do R2 exposta na tela.
    await expect(page.getByText("A limpeza não pôde ser concluída.")).toBeVisible();
    await expect(page.getByText(/Configuração do Cloudflare R2/)).not.toBeVisible();
  });

  test("375px: sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/app/manutencao");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      m.scrollWidth <= m.innerWidth + 1,
      `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
    ).toBe(true);

    await page.getByRole("button", { name: "Limpar fotos não utilizadas" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox && dialogBox.width <= 375 + 1, `dialog width=${dialogBox?.width}`).toBe(true);
  });

  test("360px: sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app/manutencao");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      m.scrollWidth <= m.innerWidth + 1,
      `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
    ).toBe(true);
  });

  for (const width of [768, 1440]) {
    test(`${width}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/manutencao");

      const m = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(
        m.scrollWidth <= m.innerWidth + 1,
        `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
      ).toBe(true);
    });
  }
});
