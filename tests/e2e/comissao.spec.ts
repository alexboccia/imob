import { test, expect } from "@playwright/test";
import { ORG_ANALYTICS, ORG_AGENDA, login } from "./helpers";

// Comissão do negócio (Fase 10).
//
// ORDEM DOS BLOCOS DELIBERADA, mesmo racional das fases anteriores: as
// asserções de Analytics afirmam números ABSOLUTOS do seed (R$ 42.500 de
// comissão, 1 ganho sem comissão), e a jornada do corretor fecha um
// negócio novo — por isso as leituras vêm primeiro.
//
// A JORNADA RODA NA ORGANIZAÇÃO DA AGENDA, não na Org A, por um motivo
// estrutural já documentado em prisma/seed-e2e.ts: fechar uma negociação
// grava PropertyInterestStageHistory, e buscarAnalyticsHistoricoPipeline
// agrega TODO o histórico da organização, sem filtro de tempo, para
// calcular `tempoMedioHistorico` — que por sua vez classifica a
// PRIORIDADE dos cards. Como esta spec roda ANTES de pipeline.spec.ts na
// ordem alfabética, fechar negócios na Org A mudava a média histórica e
// reclassificava a negociação recém-criada de NORMAL para ALTA, quebrando
// pipeline.spec.ts (achado real, reproduzido na suíte completa e não
// isoladamente). A Organização C existe exatamente para isolar isso.

test.describe("Analytics — comissão registrada", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
  });

  test("mostra comissão total, média e efetiva, e declara os ganhos sem comissão", async ({
    page,
  }) => {
    const resultado = page.getByRole("region", { name: "Resultado comercial" });
    await expect(resultado).toBeVisible();

    await expect(resultado.getByText("Comissão registrada", { exact: true })).toBeVisible();
    await expect(resultado.getByText("Comissão média", { exact: true })).toBeVisible();
    await expect(resultado.getByText("Comissão efetiva", { exact: true })).toBeVisible();

    const texto = (await resultado.innerText()).replace(/\u00a0/g, " ");
    // Seed: um ganho de R$ 850.000 com R$ 42.500 de comissão.
    expect(texto).toContain("R$ 42.500");
    // 42.500 / 850.000 = 5%.
    expect(texto).toContain("5%");

    // O ganho legado não vira R$ 0 — é declarado.
    await expect(resultado).toContainText("não tem comissão registrada");

    // Nomenclatura honesta: comissão, nunca receita; e sem ROI.
    await expect(resultado).toContainText("nenhum dos dois é receita da imobiliária");
    await expect(resultado).not.toContainText("Receita total");
    await expect(resultado).not.toContainText("ROI");
  });

  test("canal e campanha recebem a comissão da interação de origem", async ({ page }) => {
    const aquisicao = page.getByRole("region", { name: "Canal de aquisição" });
    await expect(aquisicao).toBeVisible();
    await expect(aquisicao.getByRole("columnheader", { name: "Comissão" })).toHaveCount(2);

    const anuncios = aquisicao.locator("tbody tr", { hasText: "Anúncios pagos" });
    await expect(anuncios).toContainText("42.500");

    const campanha = aquisicao.locator("tbody tr", { hasText: "verao-2026" });
    await expect(campanha).toContainText("42.500");

    // Sem atribuição tem o ganho legado, sem valor e sem comissão: "—".
    await expect(aquisicao.locator("tbody tr", { hasText: "Sem atribuição" })).toContainText("—");
  });

  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: valores de comissão sem overflow`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/analytics");
      await expect(page.getByRole("region", { name: "Resultado comercial" })).toBeVisible();
      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow em ${largura}px`).toBe(true);
    });
  }
});

test.describe("Fechamento — comissão e correção", () => {
  test("fecha sem comissão, registra depois pela correção, e a trilha aparece", async ({
    page,
  }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Comissao ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();
    await page.locator("#propertyId").click();
    // Escopado ao listbox ABERTO: a ficha do cliente também tem um
    // <select> nativo (responsável), cujas <option> ficam no DOM mesmo
    // fechadas e casariam um getByRole("option") solto.
    await page.getByRole("listbox").getByRole("option").first().click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Relacionar imóvel" }).click(),
    ]);
    await page.reload();

    // Fecha como ganho SEM comissão — ela é opcional e não pode bloquear
    // o registro de um negócio real.
    await page.getByRole("button", { name: "Marcar como ganho" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText("Comissão do negócio (opcional)")).toBeVisible();
    // CampoMoeda mascara centavos: "80000000" = R$ 800.000,00.
    await dialogo.getByLabel("Valor de fechamento").fill("80000000");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Confirmar ganho" }).click(),
    ]);
    await page.reload();

    const conteudo = () => page.locator("main").innerText();
    expect((await conteudo()).replace(/\u00a0/g, " ")).toContain("Comissão não registrada");

    // Agora registra a comissão pela correção — sem reabrir o pipeline.
    await page.getByRole("button", { name: "Corrigir valores" }).first().click();
    const correcao = page.getByRole("dialog");
    await expect(correcao).toBeVisible();
    await expect(correcao).toContainText("continua marcada como ganha");

    // O atalho de % calcula a comissão a partir do valor fechado.
    await correcao.getByLabel("Calcular por %").fill("5");
    await expect(correcao.getByText("= R$ 40.000")).toBeVisible();
    await correcao.getByRole("button", { name: "Aplicar" }).click();

    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      correcao.getByRole("button", { name: "Salvar valores" }).click(),
    ]);
    await page.reload();

    const final = (await conteudo()).replace(/\u00a0/g, " ");
    expect(final).toContain("R$ 800.000");
    expect(final).toContain("Comissão R$ 40.000");
    expect(final).not.toContain("Comissão não registrada");
    // Continua ganho — a correção nunca reabre a negociação.
    expect(final).toContain("Ganho");
  });

  test("comissão maior que o valor de fechamento é recusada com erro visível", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Comissao Invalida ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();
    await page.locator("#propertyId").click();
    // Escopado ao listbox ABERTO: a ficha do cliente também tem um
    // <select> nativo (responsável), cujas <option> ficam no DOM mesmo
    // fechadas e casariam um getByRole("option") solto.
    await page.getByRole("listbox").getByRole("option").first().click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Relacionar imóvel" }).click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Marcar como ganho" }).first().click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Valor de fechamento").fill("10000000"); // R$ 100.000
    await dialogo.getByLabel("Comissão do negócio (opcional)").fill("15000000"); // R$ 150.000
    await dialogo.getByRole("button", { name: "Confirmar ganho" }).click();

    await expect(dialogo.getByRole("alert")).toContainText("não pode ser maior que o valor");
    // O diálogo continua aberto e o negócio segue sem fechar.
    await expect(dialogo).toBeVisible();
  });
});
