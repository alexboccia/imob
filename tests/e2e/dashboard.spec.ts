import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Redesenho do Dashboard — roda em ORG_A (CRM habilitado, já seedada com
// pelo menos 1 imóvel AVAILABLE). Números absolutos dependem de quantos
// leads/negócios outras specs já criaram nesta mesma organização
// compartilhada (o seed nunca limpa entre specs) — por isso os testes
// que provam "número coerente com fixture" comparam ANTES/DEPOIS de uma
// ação própria (delta), nunca um valor absoluto hardcoded.
test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
  });

  test("KPIs renderizam com números não-negativos", async ({ page }) => {
    await page.goto("/app");
    // Escopado a <p> (não <span>): "Negócios fechados" também aparece na
    // legenda do recharts (<span class="recharts-legend-item-text">) na
    // mesma página — sem isso, getByText bate nos dois e o teste falha
    // por ambiguidade, não por um problema real do produto.
    for (const titulo of ["Imóveis disponíveis", "Novos leads", "Negócios fechados", "Imóveis parados"]) {
      await expect(page.locator("main p.text-sm.text-muted-foreground", { hasText: titulo }).first()).toBeVisible();
    }
    const valores = await page.locator("main p.text-2xl").allTextContents();
    expect(valores).toHaveLength(4);
    for (const v of valores) {
      expect(Number(v), `valor "${v}" deveria ser um número >= 0`).toBeGreaterThanOrEqual(0);
    }
  });

  test("criar um lead incrementa 'Novos leads' em exatamente 1 (número coerente com fixture)", async ({ page }) => {
    await page.goto("/app");
    const valorAntes = Number(await page.getByText("Novos leads", { exact: true }).locator("..").locator("p.text-2xl").textContent());

    const nomeUnico = `Lead Dashboard E2E ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.goto("/app");
    const valorDepois = Number(await page.getByText("Novos leads", { exact: true }).locator("..").locator("p.text-2xl").textContent());
    expect(valorDepois).toBe(valorAntes + 1);
  });

  test("gráfico de desempenho comercial renderiza com totais do período", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("Desempenho comercial", { exact: true })).toBeVisible();
    await expect(page.getByText("Últimos 6 meses", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Leads:/)).toBeVisible();
    await expect(page.getByText(/^Negócios fechados:/)).toBeVisible();
    // recharts renderiza um <svg> com as linhas — confirma que o gráfico
    // montou de verdade, sem inspecionar a implementação interna da lib.
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
  });

  test("composição do portfólio: alterna Status/Tipo/Bairro, estado ativo correto", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("Composição do portfólio", { exact: true })).toBeVisible();

    const pillStatus = page.getByRole("button", { name: "Status", exact: true });
    const pillTipo = page.getByRole("button", { name: "Tipo", exact: true });
    const pillBairro = page.getByRole("button", { name: "Bairro", exact: true });

    // Status é o padrão inicial.
    await expect(pillStatus).toHaveAttribute("aria-pressed", "true");
    await expect(pillTipo).toHaveAttribute("aria-pressed", "false");

    await pillTipo.click();
    await expect(pillTipo).toHaveAttribute("aria-pressed", "true");
    await expect(pillStatus).toHaveAttribute("aria-pressed", "false");

    await pillBairro.click();
    await expect(pillBairro).toHaveAttribute("aria-pressed", "true");
    await expect(pillTipo).toHaveAttribute("aria-pressed", "false");
    // "Centro" é o bairro do imóvel seedado (e2e-imovel-editar-a) —
    // garantido presente independente de quantos outros imóveis outras
    // specs já criaram.
    await expect(page.getByText("Centro", { exact: true }).first()).toBeVisible();
  });

  test("375px: sem overflow horizontal do documento", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/app");
    const semOverflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflowHorizontal).toBe(true);
  });

  // 360px separado de 375px: achado real durante o redesenho — a
  // palavra "Dashboard" sozinha (sem espaço pra quebrar) tem largura
  // natural maior que a coluna real disponível em 360px, e sem
  // break-words vazava do próprio h1 pro scrollWidth do documento
  // (373 vs 360 medido). 375px já tinha espaço suficiente e nunca
  // pegou esse bug sozinho — por isso os dois viewports ficam cobertos
  // separadamente.
  test("360px: sem overflow horizontal do documento", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app");
    const semOverflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflowHorizontal).toBe(true);
  });

  // Correção do Finding MEDIUM (auditoria pré-commit) — ausência de
  // overflow de documento (teste acima) NÃO prova legibilidade: o bug
  // real (título do KPI quebrando caractere a caractere) nunca violava
  // scrollWidth, só a largura/altura do próprio <p>. Título mais longo
  // ("Imóveis disponíveis") escolhido de propósito — é o que mais sofria
  // (16px de largura real, texto virando 1-2 caracteres por linha, antes
  // da correção). Duas asserções estruturais, não pixel-perfect:
  // (1) largura mínima útil — o bug antigo media 16px a 360px; qualquer
  // regressão de volta a esse patamar (< 40px) falha aqui; (2) contagem
  // aproximada de linhas — quebra por palavra real produz no máximo 3
  // linhas pra esse título nesta largura; quebra caractere a caractere
  // produziria bem mais que isso (o texto tem 20 caracteres).
  test("360px: título do KPI mais longo é legível (quebra por palavra, não por caractere)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app");

    const titulo = page.locator("main .grid p.text-sm.text-muted-foreground", {
      hasText: "Imóveis disponíveis",
    });
    await expect(titulo).toBeVisible();

    const medida = await titulo.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
      return { width: r.width, height: r.height, linhasAprox: Math.round(r.height / lineHeight) };
    });

    expect(medida.width, `largura do título: ${medida.width}px`).toBeGreaterThanOrEqual(40);
    expect(medida.linhasAprox, `linhas aproximadas: ${medida.linhasAprox}`).toBeLessThanOrEqual(4);
  });
});
