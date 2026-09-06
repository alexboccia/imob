import { test, expect } from "@playwright/test";
import { ORG_ANALYTICS, ORG_A, login } from "./helpers";

// Valor de fechamento (Fase 9).
//
// ORDEM DOS BLOCOS É DELIBERADA: as asserções de Analytics afirmam
// números ABSOLUTOS do seed (R$ 850.000 fechados, 1 ganho sem valor), e a
// jornada do corretor fecha um negócio novo. Por isso as leituras vêm
// primeiro — e a jornada roda na Org A, cujos números financeiros nenhuma
// spec afirma, justamente para não contaminar nada.

test.describe("Analytics — resultado financeiro", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
  });

  test("mostra valor fechado e ticket médio, e distingue ganho sem valor", async ({ page }) => {
    const resultado = page.getByRole("region", { name: "Resultado comercial" });
    await expect(resultado).toBeVisible();

    // Seed: 2 ganhos — um de R$ 850.000 e um LEGADO sem valor.
    await expect(resultado.getByText("Valor fechado", { exact: true })).toBeVisible();
    await expect(resultado.getByText("Ticket médio", { exact: true })).toBeVisible();

    // Ticket médio divide pelos ganhos COM valor (1), não por todos (2):
    // por isso é igual ao total, e não metade dele.
    const textoResultado = (await resultado.innerText()).replace(/ /g, " ");
    expect(textoResultado).toContain("R$ 850.000");

    // A distinção central da fase, escrita na tela.
    await expect(resultado).toContainText("não tem valor registrado");
    await expect(resultado).toContainText("Nenhum valor foi estimado");

    // Nomenclatura honesta: valor do negócio, nunca receita/comissão.
    await expect(resultado).toContainText("nenhum dos dois é receita da imobiliária");
    await expect(resultado).not.toContainText("Receita total");
    // A Fase 10 passou a registrar COMISSÃO de verdade — o card contém
    // "Comissão registrada". O que continua recusado é chamá-la de
    // receita (falta o split que diria quanto fica com a operação) e
    // qualquer ROI (faltaria o custo da campanha).
    await expect(resultado).not.toContainText("ROI");
  });

  test("canal e campanha recebem o valor fechado da interação de origem", async ({ page }) => {
    const aquisicao = page.getByRole("region", { name: "Canal de aquisição" });
    await expect(aquisicao).toBeVisible();
    await expect(aquisicao.getByRole("columnheader", { name: "Valor fechado" })).toHaveCount(2);

    // O ganho de R$ 850.000 nasceu de um contato com utm google/cpc.
    const anuncios = aquisicao.locator("tbody tr", { hasText: "Anúncios pagos" });
    await expect(anuncios).toContainText("850.000");

    // A campanha do mesmo contato carrega o mesmo valor.
    const campanha = aquisicao.locator("tbody tr", { hasText: "verao-2026" });
    await expect(campanha).toContainText("850.000");

    // O ganho legado (sem valor e sem origem) não vira R$ 0 num canal:
    // fica em "Sem atribuição" com travessão.
    const sem = aquisicao.locator("tbody tr", { hasText: "Sem atribuição" });
    await expect(sem).toContainText("—");
  });

  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: valores monetários sem overflow`, async ({ page }) => {
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

test.describe("Fechamento — jornada do corretor", () => {
  test("marcar como ganho exige valor e o registra na negociação", async ({ page }) => {
    await login(page, ORG_A);

    // Cliente novo pelo fluxo real do painel.
    const nome = `Cliente Fechamento ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();

    // Relaciona um imóvel: cria a oportunidade pelo fluxo manual de sempre.
    // #propertyId é o trigger do Select de RelacionarImovelForm — a
    // página tem outros selects (estágio do funil), então nada de
    // getByRole("combobox").first().
    await page.locator("#propertyId").click();
    await page.getByRole("option").first().click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Relacionar imóvel" }).click(),
    ]);
    await page.reload();

    // O diálogo de fechamento existe e pede o valor.
    await page.getByRole("button", { name: "Marcar como ganho" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText("Valor de fechamento")).toBeVisible();
    // Deixa explícito que não é receita da imobiliária.
    await expect(dialogo).toContainText("Não é comissão nem receita");

    // Confirmar SEM valor é recusado — e o diálogo continua aberto com o
    // erro, sem fechar a negociação.
    await dialogo.getByRole("button", { name: "Confirmar ganho" }).click();
    await expect(dialogo.getByRole("alert")).toBeVisible();
    await expect(dialogo).toBeVisible();

    // CampoMoeda mascara CENTAVOS dígito a dígito: "85000000" vira
    // R$ 850.000,00 (não R$ 85 milhões).
    await dialogo.getByLabel("Valor de fechamento").fill("85000000");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Confirmar ganho" }).click(),
    ]);

    // Estado durável: ganho, com o valor exibido em pt-BR.
    await page.reload();
    await expect(page.getByText("Ganho", { exact: false }).first()).toBeVisible();
    const conteudo = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(conteudo).toContain("R$ 850.000");
    // Nunca "R$ 0" nem "Valor não registrado" para um ganho recém-fechado.
    expect(conteudo).not.toContain("Valor não registrado");
  });
});
