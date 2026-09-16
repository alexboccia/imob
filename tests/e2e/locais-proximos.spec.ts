import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E, ORG_RECURSOS, login } from "./helpers";

// =======================================================================
// O que tem por perto (Fase 42)
// =======================================================================
// Admin: a seção nova é gêmea estrutural do card de Características, e o
// corretor cadastra, edita, limpa a distância, reordena e remove locais
// sem sair do formulário. Público: a lista aparece na ordem salva, depois
// da Localização, e nunca mostra placeholder de distância.

const BASE = "/e2e-org-recursos";
const ficha = (id: string) => `${BASE}/imoveis/${id}`;
const edicao = (id: string) => `/app/imoveis/${id}`;
const LARGURAS = [320, 390, 768, 1280, 1440];

const TITULO = "O que tem por perto";
const DESCRICAO =
  "Cadastre os principais serviços, comércios e pontos de interesse próximos ao imóvel.";

function secaoPublica(page: Page) {
  return page.locator("[data-locais-proximos]");
}

function cardPorTitulo(page: Page, titulo: string): Locator {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${titulo}$`) }),
  });
}

async function semOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

// -----------------------------------------------------------------------
// Ficha pública
// -----------------------------------------------------------------------
test("a ficha lista os locais na ordem salva, sem placeholder de distância", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelComLocais));

  const secao = secaoPublica(page);
  await expect(secao).toHaveCount(1);
  await expect(secao.getByRole("heading", { name: TITULO })).toBeVisible();

  const itens = secao.getByRole("listitem");
  await expect(itens).toHaveCount(3);
  await expect(itens.nth(0)).toContainText("Mercado Central E2E");
  await expect(itens.nth(0)).toContainText("Mercado · 350 m");
  await expect(itens.nth(1)).toContainText("Estacao Paraiso E2E");
  await expect(itens.nth(1)).toContainText("Metrô · 1,2 km");
  await expect(itens.nth(2)).toContainText("Praca das Arvores E2E");

  // Sem distância, a linha diz só a categoria — nada depois dela.
  const semDistancia = (await itens.nth(2).innerText()).trim();
  expect(semDistancia).toMatch(/Parque$/);
  expect(await secao.innerText()).not.toMatch(/—|não informad|sem distância|\bnull\b/i);

  // Ícones decorativos, um por local.
  await expect(secao.locator("svg[aria-hidden='true']")).toHaveCount(3);
});

test("a seção vem logo depois da Localização", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelComLocais));
  const localizacao = await page.getByRole("heading", { name: "Localização" }).boundingBox();
  const secao = await secaoPublica(page).boundingBox();
  expect(localizacao).not.toBeNull();
  expect(secao).not.toBeNull();
  expect(secao!.y).toBeGreaterThan(localizacao!.y);
});

test("imóvel sem locais não ganha seção nem título vazio", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelSemRecursos));
  await expect(page.getByRole("heading", { name: "Localização" })).toBeVisible();
  await expect(secaoPublica(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: TITULO })).toHaveCount(0);
});

test.describe("ficha pública — responsivo", () => {
  for (const largura of LARGURAS) {
    test(`${largura}px: a lista cabe na tela`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(ficha(IDS_E2E.imovelComLocais));
      const caixa = await secaoPublica(page).boundingBox();
      expect(caixa, `sem seção @ ${largura}px`).not.toBeNull();
      expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(largura + 1);
      expect(await semOverflow(page), `overflow @ ${largura}px`).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------
// Admin — paridade estrutural com "Características"
// -----------------------------------------------------------------------
test.describe("admin — mesma anatomia do card de Características", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
  });

  test("título, descrição, largura e classes idênticas; sem card aninhado", async ({ page }) => {
    await page.goto(edicao(IDS_E2E.imovelComLocais));

    const referencia = cardPorTitulo(page, "Características");
    const novo = cardPorTitulo(page, TITULO);
    await expect(referencia).toHaveCount(1);
    await expect(novo).toHaveCount(1);

    await expect(novo.locator('[data-slot="card-description"]')).toHaveText(DESCRICAO);

    // Mesma árvore de slots, com as MESMAS classes em cada nível.
    const anatomia = (card: Locator) =>
      card.evaluate((el) => {
        const cls = (sel: string) => el.querySelector(`:scope > ${sel}`)?.getAttribute("class");
        const header = el.querySelector(':scope > [data-slot="card-header"]');
        return {
          card: el.getAttribute("class"),
          header: cls('[data-slot="card-header"]'),
          titulo: header?.querySelector('[data-slot="card-title"]')?.getAttribute("class"),
          descricao: header?.querySelector('[data-slot="card-description"]')?.getAttribute("class"),
          conteudo: cls('[data-slot="card-content"]'),
          filhos: Array.from(el.children).map((c) => c.getAttribute("data-slot")),
        };
      });
    expect(await anatomia(novo)).toEqual(await anatomia(referencia));

    // Nenhum card dentro do card.
    await expect(novo.locator('[data-slot="card"]')).toHaveCount(0);

    // Mesma coluna: mesmo x e mesma largura.
    const a = await referencia.boundingBox();
    const b = await novo.boundingBox();
    expect(b!.x).toBeCloseTo(a!.x, 0);
    expect(b!.width).toBeCloseTo(a!.width, 0);
  });

  for (const largura of LARGURAS) {
    test(`${largura}px: sem overflow, e campos em linha só quando cabem`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(edicao(IDS_E2E.imovelComLocais));
      const card = cardPorTitulo(page, TITULO);
      await card.scrollIntoViewIfNeeded();

      const categoria = await card.getByLabel("Categoria").first().boundingBox();
      const nome = await card.getByLabel("Nome do local").first().boundingBox();
      const distancia = await card.getByLabel("Distância (opcional)").first().boundingBox();
      const unidade = await card.getByLabel("Unidade da distância").first().boundingBox();
      for (const caixa of [categoria, nome, distancia, unidade]) {
        expect(caixa).not.toBeNull();
        expect(caixa!.x + caixa!.width, `campo cortado @ ${largura}px`).toBeLessThanOrEqual(
          largura + 1
        );
      }
      // Valor e unidade sempre lado a lado.
      expect(Math.abs(unidade!.y - distancia!.y)).toBeLessThan(2);
      expect(unidade!.x).toBeGreaterThan(distancia!.x);

      if (largura >= 1280) {
        // Categoria | Nome | Distância | Unidade numa linha.
        expect(Math.abs(nome!.y - categoria!.y)).toBeLessThan(2);
        expect(Math.abs(distancia!.y - categoria!.y)).toBeLessThan(2);
        expect(nome!.x).toBeGreaterThan(categoria!.x);
        expect(distancia!.x).toBeGreaterThan(nome!.x);
      } else if (largura < 768) {
        // Empilhado no celular.
        expect(nome!.y).toBeGreaterThan(categoria!.y);
        expect(distancia!.y).toBeGreaterThan(nome!.y);
      }

      await expect(card.getByTestId("local-proximo")).toHaveCount(3);
      expect(await semOverflow(page), `overflow @ ${largura}px`).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------
// Admin — fluxo completo
// -----------------------------------------------------------------------
test("o corretor cadastra, edita, limpa a distância, reordena e remove", async ({ page }) => {
  await login(page, ORG_RECURSOS);
  await page.goto(edicao(IDS_E2E.imovelLocaisAdmin));
  const card = cardPorTitulo(page, TITULO);
  const linhas = card.getByTestId("local-proximo");

  // Retry do CI pode encontrar a lista de uma tentativa anterior: esvaziar
  // pela própria UI deixa o ponto de partida determinístico.
  while ((await linhas.count()) > 0) {
    await linhas.first().getByRole("button", { name: /^Remover local/ }).click();
  }
  await expect(card.getByText("Nenhum local cadastrado.", { exact: false })).toBeVisible();

  const categoria = card.getByLabel("Categoria").first();
  const nome = card.getByLabel("Nome do local").first();
  const distancia = card.getByLabel("Distância (opcional)").first();
  const unidade = card.getByLabel("Unidade da distância").first();
  const adicionar = card.getByRole("button", { name: "Adicionar local" });

  // Validação inline: sem categoria nem nome, nada entra na lista.
  await adicionar.click();
  await expect(card.getByText("Escolha a categoria.")).toBeVisible();
  await expect(card.getByText("Informe o nome do local.")).toBeVisible();
  await expect(linhas).toHaveCount(0);

  // Metros fracionados são recusados antes de chegar ao servidor.
  await categoria.selectOption({ label: "Farmácia" });
  await nome.fill("Drogaria Admin E2E");
  await distancia.fill("1,5");
  await adicionar.click();
  await expect(card.getByText(/Em metros, use um número inteiro/)).toBeVisible();
  await expect(linhas).toHaveCount(0);

  await distancia.fill("200");
  await adicionar.click();
  await expect(linhas).toHaveCount(1);
  // O formulário de adição volta ao estado inicial.
  await expect(nome).toHaveValue("");
  await expect(distancia).toHaveValue("");

  await categoria.selectOption({ label: "Metrô" });
  await nome.fill("Estacao Admin E2E");
  await distancia.fill("1,5");
  await unidade.selectOption({ label: "km" });
  await adicionar.click();

  // Enter no nome adiciona o local — não envia o formulário do imóvel.
  await categoria.selectOption({ label: "Escola" });
  await nome.fill("Escola Admin E2E");
  await nome.press("Enter");
  await expect(linhas).toHaveCount(3);
  await expect(page).not.toHaveURL(/salvo=1/);

  await expect(linhas.nth(0)).toContainText("Farmácia · 200 m");
  await expect(linhas.nth(1)).toContainText("Metrô · 1,5 km");
  await expect(linhas.nth(2)).toContainText("Escola");
  expect((await linhas.nth(2).locator("p").nth(1).innerText()).trim()).toBe("Escola");

  // Salvar e recarregar: persistiu na ordem.
  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\?salvo=1/);
  await page.reload();
  await expect(linhas).toHaveCount(3);
  await expect(linhas.nth(0)).toContainText("Drogaria Admin E2E");
  await expect(linhas.nth(1)).toContainText("Estacao Admin E2E");
  await expect(linhas.nth(2)).toContainText("Escola Admin E2E");

  // Editar inline: renomear e LIMPAR só a distância do metrô.
  await linhas.nth(1).getByRole("button", { name: "Editar local Estacao Admin E2E" }).click();
  const emEdicao = linhas.nth(1);
  await expect(emEdicao.getByLabel("Distância (opcional)")).toHaveValue("1,5");
  await expect(emEdicao.getByLabel("Unidade da distância")).toHaveValue("KILOMETERS");
  await emEdicao.getByLabel("Nome do local").fill("Estacao Renomeada E2E");
  await emEdicao.getByLabel("Distância (opcional)").fill("");
  await emEdicao.getByRole("button", { name: "Salvar local" }).click();
  await expect(linhas).toHaveCount(3);
  await expect(linhas.nth(1)).toContainText("Estacao Renomeada E2E");
  expect((await linhas.nth(1).locator("p").nth(1).innerText()).trim()).toBe("Metrô");

  // Cancelar não altera nada.
  await linhas.nth(0).getByRole("button", { name: /^Editar local/ }).click();
  await linhas.nth(0).getByLabel("Nome do local").fill("Nao Deveria Ficar");
  await linhas.nth(0).getByRole("button", { name: "Cancelar" }).click();
  await expect(linhas.nth(0)).toContainText("Drogaria Admin E2E");

  // Reordenar: a escola sobe para o topo.
  const subirEscola = page.getByRole("button", { name: "Mover Escola Admin E2E para cima" });
  await subirEscola.click();
  await subirEscola.click();
  await expect(subirEscola).toBeDisabled();
  await expect(linhas.nth(0)).toContainText("Escola Admin E2E");
  await expect(
    page.getByRole("button", { name: "Mover Estacao Renomeada E2E para baixo" })
  ).toBeDisabled();

  // Remover a farmácia (agora a segunda).
  await page.getByRole("button", { name: "Remover local Drogaria Admin E2E" }).click();
  await expect(linhas).toHaveCount(2);

  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\?salvo=1/);
  await page.reload();
  await expect(linhas).toHaveCount(2);
  await expect(linhas.nth(0)).toContainText("Escola Admin E2E");
  await expect(linhas.nth(1)).toContainText("Estacao Renomeada E2E");

  // A ficha pública reflete a mesma lista, na mesma ordem.
  await page.goto(ficha(IDS_E2E.imovelLocaisAdmin));
  const itens = secaoPublica(page).getByRole("listitem");
  await expect(itens).toHaveCount(2);
  await expect(itens.nth(0)).toContainText("Escola Admin E2E");
  await expect(itens.nth(1)).toContainText("Estacao Renomeada E2E");
  expect(await secaoPublica(page).innerText()).not.toContain("Drogaria Admin E2E");
  expect(await secaoPublica(page).innerText()).not.toMatch(/—|não informad/i);

  // Esvaziar: a seção some da ficha.
  await page.goto(edicao(IDS_E2E.imovelLocaisAdmin));
  while ((await linhas.count()) > 0) {
    await linhas.first().getByRole("button", { name: /^Remover local/ }).click();
  }
  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\?salvo=1/);
  await page.goto(ficha(IDS_E2E.imovelLocaisAdmin));
  await expect(secaoPublica(page)).toHaveCount(0);
});
