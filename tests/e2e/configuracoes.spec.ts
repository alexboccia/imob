import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Redesenho de Configurações — comportamento (Server Action, upload,
// validação, autorização, tenant isolation) permanece o mesmo já
// existente; cobertura aqui é proporcional ao risco (mudança
// essencialmente visual) — foco em: a tela renderiza com os 4 cards,
// salvar continua funcionando de ponta a ponta (persiste e reaparece após
// reload), tema continua selecionável, controles de upload permanecem
// presentes, e responsividade real (overflow + legibilidade, não só CSS).
test.describe("Configurações", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app/configuracoes");
  });

  test("página renderiza com os cards esperados e a ação de salvar", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]', { hasText: "Identidade visual" })).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]', { hasText: "Contato" })).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]', { hasText: "Redes sociais" })).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]', { hasText: "Código do imóvel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeVisible();
  });

  test("controles de upload de logo e favicon permanecem presentes", async ({ page }) => {
    await expect(page.getByText("Logotipo", { exact: true })).toBeVisible();
    await expect(page.getByText("Favicon", { exact: true })).toBeVisible();
    // Três inputs de arquivo reais (logo cabeçalho + favicon + logo
    // rodapé), sem alterar a lógica dos dois já existentes.
    await expect(page.locator('input[type="file"]')).toHaveCount(3);
  });

  test("rodapé do site: upload dedicado e as 3 opções de aparência aparecem, AUTO é o padrão", async ({ page }) => {
    await expect(page.getByText("Rodapé do site", { exact: true })).toBeVisible();
    await expect(page.getByText("Logotipo do rodapé", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Use uma versão do logotipo adequada ao fundo do rodapé.")
    ).toBeVisible();

    await expect(page.getByRole("radio", { name: /Automático pelo tema/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Cor principal do tema/i })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: /Fundo claro/i })).not.toBeChecked();
    await expect(page.getByText("Usa a cor principal do tema como fundo.")).toBeVisible();
    await expect(page.getByText("Usa uma superfície clara e texto escuro.")).toBeVisible();
  });

  test("aparência do rodapé persiste após salvar e recarregar", async ({ page }) => {
    await page.getByRole("radio", { name: /Fundo claro/i }).check({ force: true });
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();

    await page.reload();
    await expect(page.getByRole("radio", { name: /Fundo claro/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Automático pelo tema/i })).not.toBeChecked();

    // Devolve ao padrão pra não vazar estado pros outros testes deste
    // describe (mesma organização/sessão reaproveitada entre testes).
    await page.getByRole("radio", { name: /Automático pelo tema/i }).check({ force: true });
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();
  });

  test("salvar persiste os campos preenchidos, tema selecionável, e reaparece após reload", async ({ page }) => {
    const marcador = Date.now();
    const prefixo = `T${marcador}`.slice(0, 10);

    await page.locator("#telefone").fill("+55 (11) 99999-0000");
    await page.locator("#codigoImovelPrefixo").fill(prefixo);
    await page.getByRole("radio", { name: /Vinho/i }).check({ force: true });

    await page.getByRole("button", { name: "Salvar alterações" }).click();
    // A action retorna sucesso, mas o formulário (comportamento
    // pré-existente, não alterado neste redesenho) só exibe feedback
    // visível em caso de ERRO (Alert destructive) — não há toast/mensagem
    // de sucesso hoje. A prova real de que salvar funcionou é o reload
    // abaixo mostrando os valores persistidos.
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeHidden();

    await page.reload();
    await expect(page.locator("#telefone")).toHaveValue("+55 (11) 99999-0000");
    await expect(page.locator("#codigoImovelPrefixo")).toHaveValue(prefixo.toUpperCase());
    await expect(page.getByRole("radio", { name: /Vinho/i })).toBeChecked();
    await expect(page.getByText(`Ficará assim: ${prefixo.toUpperCase()}-100001`)).toBeVisible();
  });

  test("375px: sem overflow horizontal e sem quebra caractere-a-caractere", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/app/configuracoes");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      m.scrollWidth <= m.innerWidth + 1,
      `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
    ).toBe(true);

    // Legibilidade: um rótulo de tema não deve quebrar em 1 caractere por
    // linha (mesma classe de bug já encontrada em Manutenção) — medindo a
    // largura real do texto do rótulo "Grafite".
    const rotuloTema = page.getByText("Grafite", { exact: true });
    await expect(rotuloTema).toBeVisible();
    const largura = await rotuloTema.evaluate((el) => el.getBoundingClientRect().width);
    expect(largura, `largura do rótulo 'Grafite': ${largura}px`).toBeGreaterThan(20);
  });

  test("360px: sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app/configuracoes");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      m.scrollWidth <= m.innerWidth + 1,
      `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
    ).toBe(true);

    await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeVisible();
  });

  test("768px: sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/app/configuracoes");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(m.scrollWidth <= m.innerWidth + 1, `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth}`).toBe(true);
  });

  test("1440px: usa layout full-width, sem overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/configuracoes");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(m.scrollWidth <= m.innerWidth + 1, `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth}`).toBe(true);

    const identidade = await page
      .locator('[data-slot="card"]')
      .filter({ has: page.locator('[data-slot="card-title"]', { hasText: "Identidade visual" }) })
      .boundingBox();
    // Full-width: o card principal deve usar bem mais que a antiga
    // metade (~672px) da área disponível em desktop largo.
    expect(identidade && identidade.width > 800, `largura do card: ${identidade?.width}`).toBe(true);
  });
});
