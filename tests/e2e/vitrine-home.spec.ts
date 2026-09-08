import { test, expect, type Page } from "@playwright/test";
import { login, ORG_A, IDS_E2E } from "./helpers";

// Um imóvel da Org A que NÃO está na vitrine — serve para tentar ocupar
// uma vaga já usada. O helper o expõe sob outro nome (é o mesmo
// e2e-imovel-comercial-a do seed).
const IMOVEL_FORA_DA_VITRINE = IDS_E2E.imovelLancamentoMinimoOrgA;

// =======================================================================
// Vitrine editorial da Home — "Imóveis em destaque"
// =======================================================================
// A afirmação que estes testes protegem:
//
//   A HOME MOSTRA O QUE A IMOBILIÁRIA ESCOLHEU, NA ORDEM QUE ELA
//   ESCOLHEU — E NADA ALÉM DISSO.
//
// O seed da Organização A deixa duas posições ocupadas (1 e 2), então a
// Home é observável sem que nenhum teste precise configurar antes.

const IMOVEL_POSICAO_1 = "Apartamento com 2 quartos à venda, 58m² – Santo Amaro";
const IMOVEL_POSICAO_2 = "Apartamento para alugar, 45m² – Cambuí";

function vitrine(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: "Imóveis em destaque" }),
  });
}

// Devolve a vitrine ao estado do seed. Sem isto, um teste que mexe na
// seleção deixaria a Home diferente para os seguintes.
async function definirPosicao(page: Page, imovelId: string, posicao: string) {
  await page.goto(`/app/imoveis/${imovelId}`);
  await page.locator("#posicaoDestaqueHome").selectOption(posicao);
  await page.getByRole("button", { name: /Salvar/ }).first().click();
  // ?salvo=1 é o sinal de que a action concluiu — esperar só pela URL
  // de imóveis casaria de imediato com a página onde já estamos, e o
  // teste seguiria com a gravação ainda em voo.
  await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
}

test.describe("a Home mostra a seleção", () => {
  test("exibe os escolhidos, na ordem das posições, e o card abre o imóvel", async ({
    page,
  }) => {
    await page.goto("/");

    const secao = vitrine(page);
    await expect(secao).toBeVisible();

    // Exatamente os dois selecionados — nunca preenchida até quatro com
    // imóveis aleatórios.
    await expect(secao.getByText(IMOVEL_POSICAO_1, { exact: true })).toBeVisible();
    await expect(secao.getByText(IMOVEL_POSICAO_2, { exact: true })).toBeVisible();

    // ORDEM: a posição 1 vem antes da 2 no DOM.
    const titulos = await secao.locator("h3, h2 ~ div h3").allTextContents();
    const indice1 = titulos.findIndex((t) => t.includes("Santo Amaro"));
    const indice2 = titulos.findIndex((t) => t.includes("Cambuí"));
    expect(indice1).toBeGreaterThanOrEqual(0);
    expect(indice2).toBeGreaterThan(indice1);

    // O card leva à ficha real do imóvel.
    await secao.getByText(IMOVEL_POSICAO_1, { exact: true }).click();
    await page.waitForURL(new RegExp(`/imoveis/${IDS_E2E.imovelComBadgesOrgA}`));
    await expect(
      page.getByRole("heading", { name: IMOVEL_POSICAO_1 }).first()
    ).toBeVisible();
  });

  test("'Ver todos' leva à listagem da própria imobiliária", async ({ page }) => {
    await page.goto("/");
    await vitrine(page).getByRole("button", { name: "Ver todos" }).click();
    await page.waitForURL(/\/imoveis$/);
    // Sem filtro por rótulo, a listagem se chama "Resultados da busca" —
    // é a listagem completa, que é justamente o destino certo para uma
    // vitrine que não é recorte de rótulo nenhum.
    await expect(
      page.getByRole("heading", { level: 1, name: /Resultados da busca/ })
    ).toBeVisible();
  });
});

test.describe("configuração pela ficha do imóvel", () => {
  test("remover tira da Home; devolver traz de volta", async ({ page }) => {
    await login(page, ORG_A);

    try {
      await definirPosicao(page, IDS_E2E.imovelAluguelOrgA, "");

      await page.goto("/");
      const secao = vitrine(page);
      // A seção continua existindo com o que sobrou — mostra 1, não
      // completa até 2.
      await expect(secao.getByText(IMOVEL_POSICAO_1, { exact: true })).toBeVisible();
      await expect(secao.getByText(IMOVEL_POSICAO_2, { exact: true })).toHaveCount(0);
    } finally {
      // Devolve o estado do seed para os demais testes.
      await definirPosicao(page, IDS_E2E.imovelAluguelOrgA, "2");
    }

    await page.goto("/");
    await expect(vitrine(page).getByText(IMOVEL_POSICAO_2, { exact: true })).toBeVisible();
  });

  test("a posição ocupada é dita, e o imóvel de outra pessoa não é derrubado em silêncio", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await page.goto(`/app/imoveis/${IMOVEL_FORA_DA_VITRINE}`);

    // O seletor DIZ quem ocupa cada vaga — quem escolhe enxerga o que
    // está prestes a substituir.
    const seletor = page.locator("#posicaoDestaqueHome");
    await expect(seletor).toBeVisible();
    await expect(seletor.locator("option", { hasText: "1ª posição" })).toContainText(
      "ocupada por"
    );

    // Pedir uma vaga ocupada é recusado com mensagem factual.
    await seletor.selectOption("1");
    await page.getByRole("button", { name: /Salvar/ }).first().click();
    await expect(page.getByText(/já é do imóvel/)).toBeVisible();

    // E a Home continua com o ocupante original.
    await page.goto("/");
    await expect(
      vitrine(page).getByText(IMOVEL_POSICAO_1, { exact: true })
    ).toBeVisible();
  });
});

test.describe("responsivo", () => {
  for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
    test(`${largura}px: vitrine sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/");

      await expect(vitrine(page)).toBeVisible();
      const rolagem = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolagem, `a página rolou ${rolagem}px em ${largura}px`).toBe(0);
    });
  }
});
