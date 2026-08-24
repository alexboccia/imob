import { test, expect, type Page } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Redesenho de Características — roda em ORG_A, já seedada com 3
// características do imóvel (Aceita pet, Piscina, e uma de nome longo:
// "Vista panorâmica para o mar com terraço gourmet completo e
// churrasqueira integrada") e 2 do condomínio (Portaria 24 horas, Salão
// de festas) — ver prisma/seed-e2e.ts. Números absolutos dependem de
// quantas outras características outras execuções já criaram nesta
// mesma organização compartilhada (upsert nunca duplica, mas os testes
// "adicionar" usam nomes únicos por execução) — por isso os testes de
// KPI/contagem comparam ANTES/DEPOIS de uma ação própria (delta), nunca
// um valor absoluto hardcoded, mesmo padrão já usado em Dashboard/
// Imóveis.
test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

function grupoImovel(page: Page) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: "Características do imóvel" }),
  });
}

function grupoCondominio(page: Page) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: "Características do condomínio" }),
  });
}

async function valorKpi(page: Page, titulo: string) {
  const texto = await page
    .locator("main p.text-sm.text-muted-foreground", { hasText: titulo })
    .first()
    .locator("..")
    .locator("p.text-2xl")
    .textContent();
  return Number(texto);
}

test.describe("Características", () => {
  test("KPIs renderizam com números reais; nome longo aparece íntegro", async ({ page }) => {
    await page.goto("/app/caracteristicas");

    for (const titulo of ["Total", "Do imóvel", "Do condomínio"]) {
      await expect(page.locator("main p.text-sm.text-muted-foreground", { hasText: titulo }).first()).toBeVisible();
    }
    const total = await valorKpi(page, "Total");
    const doImovel = await valorKpi(page, "Do imóvel");
    const doCondominio = await valorKpi(page, "Do condomínio");
    expect(total).toBeGreaterThanOrEqual(5);
    expect(doImovel).toBeGreaterThanOrEqual(3);
    expect(doCondominio).toBeGreaterThanOrEqual(2);
    // Total é a soma real das duas categorias, não um número solto.
    expect(total).toBe(doImovel + doCondominio);

    // Nome longo íntegro, sem corte/ellipsis, dentro do grupo certo.
    await expect(
      grupoImovel(page).getByText(
        "Vista panorâmica para o mar com terraço gourmet completo e churrasqueira integrada",
        { exact: true }
      )
    ).toBeVisible();
  });

  test("busca filtra cada grupo de forma independente, sem afetar o outro", async ({ page }) => {
    await page.goto("/app/caracteristicas");

    await grupoImovel(page).getByPlaceholder("Buscar característica...").fill("pet");
    await expect(grupoImovel(page).getByText("Aceita pet", { exact: true })).toBeVisible();
    await expect(grupoImovel(page).getByText("Piscina", { exact: true })).not.toBeVisible();
    // Busca em um grupo não filtra o outro.
    await expect(grupoCondominio(page).getByText("Portaria 24 horas", { exact: true })).toBeVisible();
    await expect(grupoCondominio(page).getByText("Salão de festas", { exact: true })).toBeVisible();

    // Accent/case-insensitive (normalizarTexto): "PISCINA" sem acento
    // encontra "Piscina".
    await grupoImovel(page).getByPlaceholder("Buscar característica...").fill("PISCINA");
    await expect(grupoImovel(page).getByText("Piscina", { exact: true })).toBeVisible();
    await expect(grupoImovel(page).getByText("Aceita pet", { exact: true })).not.toBeVisible();

    // Busca no condomínio, independente do imóvel.
    await grupoCondominio(page).getByPlaceholder("Buscar característica...").fill("salão");
    await expect(grupoCondominio(page).getByText("Salão de festas", { exact: true })).toBeVisible();
    await expect(grupoCondominio(page).getByText("Portaria 24 horas", { exact: true })).not.toBeVisible();
    // O grupo do imóvel continua com seu próprio filtro intacto.
    await expect(grupoImovel(page).getByText("Piscina", { exact: true })).toBeVisible();
  });

  test("estado vazio: busca sem resultado mostra mensagem neutra em cada grupo", async ({ page }) => {
    await page.goto("/app/caracteristicas");

    await grupoImovel(page).getByPlaceholder("Buscar característica...").fill("Zzz Característica Que Nunca Existe");
    await expect(grupoImovel(page).getByText("Nenhuma característica encontrada.")).toBeVisible();
    // Grupo do condomínio continua mostrando sua lista normal.
    await expect(grupoCondominio(page).getByText("Portaria 24 horas", { exact: true })).toBeVisible();
  });

  test("adiciona característica do imóvel e do condomínio; KPIs atualizam por delta", async ({ page }) => {
    await page.goto("/app/caracteristicas");

    const marcador = Date.now();
    const nomeImovel = `Característica Imóvel E2E ${marcador}`;
    const nomeCondominio = `Característica Condomínio E2E ${marcador}`;

    const totalAntes = await valorKpi(page, "Total");
    const doImovelAntes = await valorKpi(page, "Do imóvel");

    await grupoImovel(page).getByPlaceholder("Nova característica").fill(nomeImovel);
    await grupoImovel(page).getByRole("button", { name: "Adicionar" }).click();
    await expect(grupoImovel(page).getByText(nomeImovel, { exact: true })).toBeVisible();
    await expect.poll(() => valorKpi(page, "Do imóvel")).toBe(doImovelAntes + 1);
    await expect.poll(() => valorKpi(page, "Total")).toBe(totalAntes + 1);

    const doCondominioAntes = await valorKpi(page, "Do condomínio");
    await grupoCondominio(page).getByPlaceholder("Nova característica").fill(nomeCondominio);
    await grupoCondominio(page).getByRole("button", { name: "Adicionar" }).click();
    await expect(grupoCondominio(page).getByText(nomeCondominio, { exact: true })).toBeVisible();
    await expect.poll(() => valorKpi(page, "Do condomínio")).toBe(doCondominioAntes + 1);
    await expect.poll(() => valorKpi(page, "Total")).toBe(totalAntes + 2);

    // Isolamento: a característica nova do imóvel não aparece no
    // condomínio e vice-versa.
    await expect(grupoCondominio(page).getByText(nomeImovel, { exact: true })).not.toBeVisible();
    await expect(grupoImovel(page).getByText(nomeCondominio, { exact: true })).not.toBeVisible();
  });

  test("confirmação de remoção mostra o nome real; cancelar preserva o item", async ({ page }) => {
    await page.goto("/app/caracteristicas");

    await grupoImovel(page)
      .getByRole("button", { name: 'Remover característica "Piscina"' })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Remover característica?" })).toBeVisible();
    await expect(dialog.getByText("Piscina", { exact: false })).toBeVisible();
    await expect(
      dialog.getByText("Imóveis que já possuem essa característica não serão alterados.", { exact: false })
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).not.toBeVisible();
    // Item continua na lista — cancelar não remove nada.
    await expect(grupoImovel(page).getByText("Piscina", { exact: true })).toBeVisible();
  });

  test("remover confirmado remove o item e atualiza o KPI da categoria e o total", async ({ page }) => {
    await page.goto("/app/caracteristicas");

    // Cria uma característica dedicada só pra este teste remover, pra
    // nunca depender de apagar uma fixture usada por outros testes.
    const nome = `Característica Para Remover E2E ${Date.now()}`;
    await grupoCondominio(page).getByPlaceholder("Nova característica").fill(nome);
    await grupoCondominio(page).getByRole("button", { name: "Adicionar" }).click();
    await expect(grupoCondominio(page).getByText(nome, { exact: true })).toBeVisible();

    const totalAntes = await valorKpi(page, "Total");
    const doCondominioAntes = await valorKpi(page, "Do condomínio");

    await grupoCondominio(page)
      .getByRole("button", { name: `Remover característica "${nome}"` })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Remover", exact: true }).click();

    await expect(grupoCondominio(page).getByText(nome, { exact: true })).not.toBeVisible();
    await expect.poll(() => valorKpi(page, "Do condomínio")).toBe(doCondominioAntes - 1);
    await expect.poll(() => valorKpi(page, "Total")).toBe(totalAntes - 1);
  });

  // Finding histórico de overflow (Imóveis, mesma causa estrutural em
  // potencial: sidebar fixa reduz a área útil em mobile) — mensagem de
  // falha carrega os números reais desde o início nesta tela, sem
  // precisar de um incidente prévio pra descobrir isso.
  test("375px: sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/app/caracteristicas");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      m.scrollWidth <= m.innerWidth + 1,
      `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
    ).toBe(true);

    // Nome longo continua íntegro, sem overflow, em viewport estreito.
    await expect(
      page.getByText("Vista panorâmica para o mar com terraço gourmet completo e churrasqueira integrada", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("360px: sem overflow horizontal; KPIs legíveis (quebra por palavra, não por caractere)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app/caracteristicas");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      m.scrollWidth <= m.innerWidth + 1,
      `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
    ).toBe(true);

    // Mesma correção estrutural do Finding MEDIUM do Dashboard: título do
    // KPI mais longo ("Do condomínio") não pode quebrar caractere a
    // caractere.
    const titulo = page.locator("main p.text-sm.text-muted-foreground", { hasText: "Do condomínio" }).first();
    await expect(titulo).toBeVisible();
    const medida = await titulo.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
      return { width: r.width, linhasAprox: Math.round(r.height / lineHeight) };
    });
    expect(medida.width, `largura do título: ${medida.width}px`).toBeGreaterThanOrEqual(40);
    expect(medida.linhasAprox, `linhas aproximadas: ${medida.linhasAprox}`).toBeLessThanOrEqual(4);

    // Botão "Adicionar" continua acessível/contido, sem overflow.
    await expect(grupoImovel(page).getByRole("button", { name: "Adicionar" })).toBeVisible();
  });
});
