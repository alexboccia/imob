import { test, expect, type Page } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// =======================================================================
// Imóveis relacionados — a curadoria (Fase 78)
// =======================================================================
// Investigação confirmou que PropertyInterest JÁ é a entidade que
// representa "este cliente está sendo trabalhado para este imóvel"
// (Fase D do CRM): criada por "Relacionar" (aqui, em Imóveis recomendados
// e na ficha do imóvel), reaparece idêntica no Pipeline (Fase P.4,
// projeção operacional de PropertyInterest) e na ficha do imóvel
// ("Clientes interessados"). Duplicidade e concorrência já são
// exaustivamente cobertas em tests/integration/property-interest.test.ts
// (~90 testes: unique constraint, corrida, tenant, ActivityLog) — não
// reprovadas aqui.
//
// O que faltava era só a apresentação (h2 real, sem card dentro de card,
// como o resto da ficha desde a Fase 65) e a prova E2E de que uma
// recomendação relacionada se reflete corretamente nos dois lugares onde
// aparece, sem se tornar uma ação "morta" depois de usada uma vez.

function nomeUnico(prefixo: string) {
  return `${prefixo} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function criarCliente(page: Page, nome: string) {
  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nome);
  await page.waitForURL(/search=/);
  await page.getByRole("link", { name: nome }).click();
  await page.waitForURL(/\/app\/clientes\/[^/?]+$/);
  return page.url();
}

// "São Paulo" — cidade real do seed da Org A, não uma string inventada:
// achado da Fase 77 (buscarSugestoesLocalizacao lê Property.city DISTINCT
// da organização inteira; uma cidade nova vazaria pra outros specs que
// assumem o conjunto fechado de cidades da Org A).
async function criarImovelDisponivel(page: Page, titulo: string) {
  await page.goto("/app/imoveis/novo");
  await page.locator("#titulo").fill(titulo);
  await page.locator('input[name="bairro"]').fill("Bairro E2E Relacionar");
  await page.locator('input[name="cidade"]').fill("São Paulo");
  await page.locator('select[name="estado"]').selectOption("SP");
  // CampoMoeda mascara centavos: dígitos x 100.
  await page.locator("#preco").fill(String(500_000 * 100));
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Disponível" }).click();
  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
  return page.url().split("?")[0];
}

test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

test.describe("estrutura", () => {
  test("h2 real, e sem card dentro de card", async ({ page }) => {
    const nome = nomeUnico("Cliente Estrutura Relacionados");
    await criarCliente(page, nome);

    const heading = page.getByRole("heading", { level: 2, name: "Imóveis relacionados" });
    await expect(heading).toBeVisible();

    // Mesma prova estrutural da Fase 76/77: dentro do card que contém
    // este texto (o card do formulário "Relacionar imóvel", único card
    // direto da seção quando vazia), nenhum outro card aninhado.
    const secao = page.locator("section", { has: heading });
    const cards = secao.locator('[data-slot="card"]');
    await expect(cards).toHaveCount(1); // só o card do formulário "Relacionar imóvel"
    await expect(cards.locator('[data-slot="card"]')).toHaveCount(0);
  });

  test("estado vazio: 'Nenhum imóvel relacionado ainda', diferente de qualquer outro estado da ficha", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Vazio Relacionados");
    await criarCliente(page, nome);

    const heading = page.getByRole("heading", { level: 2, name: "Imóveis relacionados" });
    const secao = page.locator("section", { has: heading });
    await expect(secao.getByText("Nenhum imóvel relacionado ainda.")).toBeVisible();
  });
});

test.describe("de recomendação a relacionamento", () => {
  test("'Relacionar' numa recomendação cria o mesmo PropertyInterest, aparece em Imóveis relacionados, e a recomendação para de oferecer a ação", async ({
    page,
  }) => {
    const tituloImovel = `Imóvel Relacionar E2E ${Date.now()}`;
    const urlImovel = await criarImovelDisponivel(page, tituloImovel);

    const nome = nomeUnico("Cliente Relaciona Recomendacao");
    await criarCliente(page, nome);

    // Perfil compatível com o imóvel criado acima.
    await page.getByRole("button", { name: "Adicionar preferências" }).click();
    await page.getByRole("combobox", { name: "Finalidade" }).click();
    await page.getByRole("option", { name: "Comprar" }).click();
    await page.getByLabel("Cidades", { exact: true }).fill("São Paulo");
    await page.keyboard.press("Enter");
    await page.locator("#minPrice").fill(String(400_000 * 100));
    await page.locator("#maxPrice").fill(String(600_000 * 100));
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Salvar preferências" }).click(),
    ]);
    await page.reload();

    const secaoRecomendados = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Imóveis recomendados" }),
    });
    const cardRecomendacao = secaoRecomendados
      .locator('[data-slot="card"]')
      .filter({ hasText: tituloImovel });
    await expect(cardRecomendacao).toBeVisible();
    await expect(cardRecomendacao.getByRole("button", { name: "Relacionar" })).toBeVisible();

    // A ação real: cria o PropertyInterest.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      cardRecomendacao.getByRole("button", { name: "Relacionar" }).click(),
    ]);
    await page.reload();

    // A MESMA recomendação não oferece mais "Relacionar" — o estado
    // reflete a realidade (Fase 78, §16): já existe uma negociação.
    const cardRecomendacaoDepois = secaoRecomendados
      .locator('[data-slot="card"]')
      .filter({ hasText: tituloImovel });
    await expect(cardRecomendacaoDepois.getByRole("button", { name: "Relacionar" })).toHaveCount(0);
    await expect(cardRecomendacaoDepois.getByText(/Já relacionado/)).toBeVisible();
    // O match em si não desaparece nem muda: continua sendo uma
    // recomendação válida, só com o estado atualizado.
    await expect(cardRecomendacaoDepois.getByText(/compatível/)).toBeVisible();

    // E aparece em Imóveis relacionados — mesmo registro, mesma ficha.
    const secaoRelacionados = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Imóveis relacionados" }),
    });
    const cardRelacionado = secaoRelacionados
      .locator('[data-slot="card"]')
      .filter({ hasText: tituloImovel });
    await expect(cardRelacionado).toBeVisible();
    await expect(cardRelacionado.getByText("Interessado")).toBeVisible();
    // Fase 92 — "Criada em" é a única pergunta de evolução da negociação
    // que antes não tinha resposta em lugar nenhum da tela.
    await expect(cardRelacionado.getByText(/Criada em/)).toBeVisible();

    // Só UM PropertyInterest — nenhuma duplicidade visível na lista.
    await expect(
      secaoRelacionados.locator('[data-slot="card"]').filter({ hasText: tituloImovel })
    ).toHaveCount(1);

    // Navega pro imóvel a partir do card relacionado — mesma ficha real.
    await cardRelacionado.getByRole("link", { name: "Ver imóvel" }).click();
    await page.waitForURL(/\/app\/imoveis\/[^/?]+$/);
    expect(page.url()).toBe(urlImovel);
  });
});

test.describe("responsivo", () => {
  for (const largura of [1920, 1440, 1366, 1024, 768, 390]) {
    test(`${largura}px: Imóveis relacionados com uma negociação real, sem overflow`, async ({
      page,
    }) => {
      const tituloImovel = `Imóvel Responsivo E2E ${Date.now()}`;
      await criarImovelDisponivel(page, tituloImovel);

      const nome = nomeUnico(`Cliente Responsivo ${largura}px`);
      const url = await criarCliente(page, nome);

      // Relaciona pelo formulário manual — mesmo mecanismo, caminho mais
      // curto do que passar por preferência/match pra este teste, que só
      // quer um InteresseImovelItem real renderizado na largura alvo.
      await page.getByLabel("Imóvel").click();
      await page.getByRole("option", { name: tituloImovel }).click();
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
        page.getByRole("button", { name: "Relacionar imóvel" }).click(),
      ]);

      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(url);
      await expect(page.getByText(tituloImovel).first()).toBeVisible();

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});
