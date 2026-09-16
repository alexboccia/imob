import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E } from "./helpers";

// =======================================================================
// Barra de recursos do imóvel (Fase 39)
// =======================================================================
// Tour 360° · Planta · Vídeo, logo abaixo da galeria — e SÓ o que o
// imóvel realmente tem. A promessa que esta spec protege: nenhum botão
// aparece sem conteúdo por trás.
//
// Organização W (dedicada), um imóvel por combinação. Ver o cenário em
// prisma/seed-e2e.ts, "Fase 39".

const BASE = "/e2e-org-recursos";
const ficha = (id: string) => `${BASE}/imoveis/${id}`;

const BARRA = "[data-recursos-imovel]";

function barra(page: Page) {
  return page.locator(BARRA);
}

// -----------------------------------------------------------------------
// Elegibilidade
// -----------------------------------------------------------------------
test("sem nenhum recurso, a barra não existe", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelSemRecursos));
  // A galeria continua lá; o que não existe é a barra.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(barra(page)).toHaveCount(0);
});

test("só planta: apenas o botão de planta", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelSoPlanta));
  await expect(barra(page)).toBeVisible();
  await expect(barra(page).getByRole("link")).toHaveCount(1);
  await expect(barra(page).getByRole("link", { name: /Planta/ })).toBeVisible();
  await expect(barra(page).getByRole("link", { name: /Tour|Vídeo/ })).toHaveCount(0);
});

test("só vídeo: apenas o botão de vídeo", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelSoVideo));
  await expect(barra(page).getByRole("link")).toHaveCount(1);
  await expect(barra(page).getByRole("link", { name: /Vídeo/ })).toBeVisible();
});

test("só tour: apenas o botão de tour, abrindo fora do site", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelSoTour));
  const link = barra(page).getByRole("link");
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("href", "https://tour.exemplo-e2e.com/360/abc");
  await expect(link).toHaveAttribute("target", "_blank");
  // rel completo: noopener fecha o window.opener, noreferrer não entrega
  // o endereço desta ficha ao destino.
  const rel = await link.getAttribute("rel");
  expect(rel).toContain("noopener");
  expect(rel).toContain("noreferrer");
});

test("os três: a ordem é sempre Tour, Planta, Vídeo", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelTresRecursos));
  const rotulos = await barra(page).getByRole("link").allInnerTexts();
  expect(rotulos.map((t) => t.trim().split("\n")[0])).toEqual([
    "Tour 360°",
    "Planta",
    "Vídeo",
  ]);
});

// -----------------------------------------------------------------------
// Segurança
// -----------------------------------------------------------------------
test("tour com endereço inseguro NÃO vira botão", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelTourInseguro));
  // O dado existe no banco (gravado direto, fora do formulário); a
  // leitura pública o descarta em vez de renderizar um href perigoso.
  await expect(barra(page)).toHaveCount(0);
  expect(await page.content()).not.toContain("javascript:alert");
});

// -----------------------------------------------------------------------
// Os atalhos levam ao conteúdo certo
// -----------------------------------------------------------------------
test("planta e vídeo são atalhos para as seções da própria página", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelTresRecursos));

  await expect(barra(page).getByRole("link", { name: /Planta/ })).toHaveAttribute(
    "href",
    "#plantas"
  );
  await expect(barra(page).getByRole("link", { name: /Vídeo/ })).toHaveAttribute(
    "href",
    "#videos"
  );

  // E os destinos EXISTEM — um atalho para uma âncora inexistente seria
  // exatamente o botão que não leva a lugar nenhum.
  await expect(page.locator("#plantas")).toHaveCount(1);
  await expect(page.locator("#videos")).toHaveCount(1);

  // Clicar leva até lá de verdade.
  await barra(page).getByRole("link", { name: /Planta/ }).click();
  await expect(page).toHaveURL(/#plantas$/);
  await expect(page.locator("#plantas")).toBeInViewport();
});

test("refresh preserva o comportamento", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelTresRecursos));
  await expect(barra(page).getByRole("link")).toHaveCount(3);
  await page.reload();
  await expect(barra(page).getByRole("link")).toHaveCount(3);
});

// -----------------------------------------------------------------------
// A barra fica abaixo da galeria — e não a quebra
// -----------------------------------------------------------------------
test("a barra vem depois da galeria e antes do resto do conteúdo", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelTresRecursos));

  // A galeria monta variantes ocultas (grade/lightbox) além da imagem
  // visível — `visible=true` pega a que o visitante realmente vê.
  const galeria = await page.locator("main img >> visible=true").first().boundingBox();
  const barraBox = await barra(page).boundingBox();
  const descricao = page.getByRole("heading", { name: "Descrição" });

  expect(galeria).not.toBeNull();
  expect(barraBox).not.toBeNull();
  // Abaixo da galeria...
  expect(barraBox!.y).toBeGreaterThan(galeria!.y);
  // ...e acima do conteúdo seguinte, quando ele existe.
  if ((await descricao.count()) > 0) {
    const caixaDescricao = await descricao.boundingBox();
    expect(barraBox!.y).toBeLessThan(caixaDescricao!.y);
  }
});

test("regressão: a galeria continua íntegra com a barra presente", async ({ page }) => {
  await page.goto(ficha(IDS_E2E.imovelTresRecursos));

  // Imagem principal renderizada, com alt e dimensão real.
  const principal = page.locator("main img >> visible=true").first();
  await expect(principal).toBeVisible();
  await expect(principal).toHaveAttribute("alt", /.+/);
  const caixa = await principal.boundingBox();
  expect(caixa!.width).toBeGreaterThan(0);
  expect(caixa!.height).toBeGreaterThan(0);

  // E o vídeo embutido continua sendo renderizado na sua seção.
  await expect(page.locator("#videos iframe")).toHaveCount(1);
});

// -----------------------------------------------------------------------
// Responsivo
// -----------------------------------------------------------------------
test.describe("responsivo", () => {
  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: os três botões cabem, sem overflow nem corte`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(ficha(IDS_E2E.imovelTresRecursos));

      const links = barra(page).getByRole("link");
      await expect(links).toHaveCount(3);

      // Cada botão inteiro dentro da viewport (wrap natural, sem
      // carrossel) e com alvo de toque confortável.
      for (const link of await links.all()) {
        const caixa = await link.boundingBox();
        expect(caixa, `sem bounding box @ ${largura}px`).not.toBeNull();
        expect(caixa!.x + caixa!.width, `botão cortado @ ${largura}px`).toBeLessThanOrEqual(
          largura + 1
        );
        expect(caixa!.height, `alvo de toque pequeno @ ${largura}px`).toBeGreaterThanOrEqual(40);
      }

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});
