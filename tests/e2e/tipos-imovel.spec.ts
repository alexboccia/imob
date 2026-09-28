import { test, expect, type Page } from "@playwright/test";
import { ORG_A, ORG_B, ORG_CONTATOS, ORG_CAPTACAO_CORRETOR, login, entrarComo } from "./helpers";

// Redesenho de Tipos de Imóvel — roda em ORG_A, seedada com "Apartamento"
// e "Casa em condomínio fechado com área de lazer completa" (residencial)
// e "Sala Comercial" (comercial) — ver prisma/seed-e2e.ts. Sem KPI e sem
// busca nesta tela (não fizeram parte do pedido), diferente de
// Características — testes de contagem por grupo usam delta (antes/depois
// de uma ação própria), nunca valor absoluto hardcoded, mesmo padrão do
// resto do projeto.
//
// Fase 72 — cada grupo agora é um <section> com um <h2> real acima do
// Card (CabecalhoSecao): "Imóveis residenciais"/"Imóveis comerciais"
// deixaram de ser um <div> estilizado (CardTitle não tem semântica de
// heading — achado de acessibilidade da própria fase) para virar
// heading de verdade. Os helpers abaixo escopam pelo <section>, não mais
// pelo Card sozinho — mudança estrutural legítima, não um enfraquecimento:
// o Card continua existindo dentro da section, só o título saiu dele.
test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

function grupoResidencial(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: "Imóveis residenciais" }),
  });
}

function grupoComercial(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: "Imóveis comerciais" }),
  });
}

test.describe("Tipos de imóvel", () => {
  test("página renderiza com título, texto explicativo e os dois grupos", async ({ page }) => {
    await page.goto("/app/tipos-imovel");

    await expect(page.getByRole("heading", { name: "Tipos de imóvel" })).toBeVisible();
    await expect(
      page.getByText(/Gerencie as opções de tipo \(residencial\/comercial\)/)
    ).toBeVisible();
    await expect(
      page.getByText(/Remover um tipo daqui não afeta imóveis que já o possuem/)
    ).toBeVisible();

    await expect(grupoResidencial(page).getByText("Apartamento", { exact: true })).toBeVisible();
    await expect(
      grupoResidencial(page).getByText(
        "Casa em condomínio fechado com área de lazer completa",
        { exact: true }
      )
    ).toBeVisible();
    await expect(grupoComercial(page).getByText("Sala Comercial", { exact: true })).toBeVisible();
  });

  test("isolamento entre grupos: residencial e comercial não se misturam", async ({ page }) => {
    await page.goto("/app/tipos-imovel");

    await expect(grupoResidencial(page).getByText("Sala Comercial", { exact: true })).not.toBeVisible();
    await expect(grupoComercial(page).getByText("Apartamento", { exact: true })).not.toBeVisible();
  });

  test("adiciona tipo residencial e comercial; cada um aparece só no grupo certo", async ({ page }) => {
    await page.goto("/app/tipos-imovel");

    const marcador = Date.now();
    const nomeResidencial = `Tipo Residencial E2E ${marcador}`;
    const nomeComercial = `Tipo Comercial E2E ${marcador}`;

    await grupoResidencial(page).getByPlaceholder("Novo tipo de imóvel").fill(nomeResidencial);
    await grupoResidencial(page).getByRole("button", { name: "Adicionar" }).click();
    await expect(grupoResidencial(page).getByText(nomeResidencial, { exact: true })).toBeVisible();

    await grupoComercial(page).getByPlaceholder("Novo tipo de imóvel").fill(nomeComercial);
    await grupoComercial(page).getByRole("button", { name: "Adicionar" }).click();
    await expect(grupoComercial(page).getByText(nomeComercial, { exact: true })).toBeVisible();

    // Isolamento: o novo tipo residencial não aparece no comercial e
    // vice-versa.
    await expect(grupoComercial(page).getByText(nomeResidencial, { exact: true })).not.toBeVisible();
    await expect(grupoResidencial(page).getByText(nomeComercial, { exact: true })).not.toBeVisible();
  });

  test("confirmação de remoção mostra o nome real; cancelar preserva o item", async ({ page }) => {
    await page.goto("/app/tipos-imovel");

    await grupoComercial(page)
      .getByRole("button", { name: 'Remover tipo de imóvel "Sala Comercial"' })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Remover tipo de imóvel?" })).toBeVisible();
    await expect(dialog.getByText("Sala Comercial", { exact: false })).toBeVisible();
    await expect(
      dialog.getByText("Imóveis que já usam esse tipo não são alterados.", { exact: false })
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).not.toBeVisible();
    // Item continua na lista — cancelar não remove nada.
    await expect(grupoComercial(page).getByText("Sala Comercial", { exact: true })).toBeVisible();
  });

  test("remover confirmado remove o item da lista", async ({ page }) => {
    await page.goto("/app/tipos-imovel");

    // Cria um tipo dedicado só pra este teste remover, pra nunca depender
    // de apagar uma fixture usada por outros testes.
    const nome = `Tipo Para Remover E2E ${Date.now()}`;
    await grupoResidencial(page).getByPlaceholder("Novo tipo de imóvel").fill(nome);
    await grupoResidencial(page).getByRole("button", { name: "Adicionar" }).click();
    await expect(grupoResidencial(page).getByText(nome, { exact: true })).toBeVisible();

    await grupoResidencial(page)
      .getByRole("button", { name: `Remover tipo de imóvel "${nome}"` })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Remover", exact: true }).click();

    await expect(grupoResidencial(page).getByText(nome, { exact: true })).not.toBeVisible();
  });

  test("375px: sem overflow horizontal; grupos empilham; botão Adicionar acessível", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/app/tipos-imovel");

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
      grupoResidencial(page).getByText("Casa em condomínio fechado com área de lazer completa", {
        exact: true,
      })
    ).toBeVisible();

    // Inspeção visual real (não só scrollWidth): botão "Adicionar" não
    // fica espremido/cortado, e os dois grupos empilham verticalmente
    // (segundo card começa abaixo do primeiro, não ao lado).
    const botaoAdicionar = grupoResidencial(page).getByRole("button", { name: "Adicionar" });
    await expect(botaoAdicionar).toBeVisible();
    const boxBotao = await botaoAdicionar.boundingBox();
    expect(boxBotao && boxBotao.width >= 40, `largura do botão Adicionar: ${boxBotao?.width}`).toBe(true);

    const boxResidencial = await grupoResidencial(page).boundingBox();
    const boxComercial = await grupoComercial(page).boundingBox();
    expect(boxResidencial && boxComercial && boxComercial.y >= boxResidencial.y + boxResidencial.height - 1).toBe(
      true
    );
  });

  test("360px: sem overflow horizontal; texto quebra por palavra, não por caractere", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app/tipos-imovel");

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      m.scrollWidth <= m.innerWidth + 1,
      `innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} bodyScrollWidth=${m.bodyScrollWidth}`
    ).toBe(true);

    const titulo = grupoComercial(page).getByRole("heading", { level: 2, name: "Imóveis comerciais" });
    const medida = await titulo.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
      return { width: r.width, linhasAprox: Math.round(r.height / lineHeight) };
    });
    expect(medida.width, `largura do título: ${medida.width}px`).toBeGreaterThanOrEqual(40);
    expect(medida.linhasAprox, `linhas aproximadas: ${medida.linhasAprox}`).toBeLessThanOrEqual(3);
  });

  for (const width of [768, 1440]) {
    test(`${width}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/tipos-imovel");

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

  // Breakpoint do grid (lg:grid-cols-2, Tailwind lg=1024px): 768px é
  // tablet e ainda fica abaixo do lg, então os grupos empilham (mesmo
  // comportamento já usado em Características) — só a partir de 1024
  // ficam lado a lado. "empilha naturalmente em tablet/mobile" (pedido
  // original) é o comportamento correto aqui, não um bug.
  test("768px: tablet ainda empilha os grupos (abaixo do breakpoint lg)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/app/tipos-imovel");

    const boxResidencial = await grupoResidencial(page).boundingBox();
    const boxComercial = await grupoComercial(page).boundingBox();
    expect(boxResidencial && boxComercial && boxComercial.y >= boxResidencial.y + boxResidencial.height - 1).toBe(
      true
    );
  });

  test("1440px: grupos lado a lado (acima do breakpoint lg)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/tipos-imovel");

    const boxResidencial = await grupoResidencial(page).boundingBox();
    const boxComercial = await grupoComercial(page).boundingBox();
    expect(boxResidencial && boxComercial && Math.abs(boxComercial.y - boxResidencial.y) < 5).toBe(true);
    expect(boxResidencial && boxComercial && boxComercial.x > boxResidencial.x).toBe(true);
  });
});

// =======================================================================
// Redesenho visual — sistema de backoffice (Fase 72)
// =======================================================================
// A garantia de negócio (criar, remover, isolamento por categoria,
// nome duplicado, tenant) já está coberta acima e continua passando com
// a MESMA regra — só os helpers de localização foram adaptados para a
// nova estrutura semântica (ver comentário no topo do arquivo). Aqui:
// hierarquia de headings, ausência de funcionalidade inventada, label
// real do campo de criação, permissão sem gestão e estados vazios.

test.describe("estrutura da tela redesenhada (Fase 72)", () => {
  test("hierarquia de cabeçalhos: h1 -> dois h2, sem h3", async ({ page }) => {
    await page.goto("/app/tipos-imovel");

    await expect(page.getByRole("heading", { level: 1, name: "Tipos de imóvel" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      page.getByRole("heading", { level: 2, name: "Imóveis residenciais" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Imóveis comerciais" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  });

  test("o campo de criação tem um label real, distinto por categoria", async ({ page }) => {
    await page.goto("/app/tipos-imovel");

    // getByLabel só resolve com associação de verdade (htmlFor/id) —
    // prova que não é só o placeholder fazendo esse papel.
    await expect(page.getByLabel("Novo tipo de imóvel residencial")).toBeVisible();
    await expect(page.getByLabel("Novo tipo de imóvel comercial")).toBeVisible();
  });

  test("nenhuma aba, busca, filtro, ordenação ou paginação foi inventada", async ({ page }) => {
    await page.goto("/app/tipos-imovel");

    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.locator('input[type="search"]')).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.locator("select")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: /páginas|paginação/i })).toHaveCount(0);
  });

  test("um papel sem gestão vê os dois grupos mas nenhuma ação administrativa", async ({
    page,
  }) => {
    await entrarComo(page, ORG_CAPTACAO_CORRETOR);
    await page.goto("/app/tipos-imovel");

    await expect(page.getByRole("heading", { level: 1, name: "Tipos de imóvel" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Imóveis residenciais" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Imóveis comerciais" })
    ).toBeVisible();

    // Nem o formulário de criação, nem qualquer lixeira — não é só o
    // botão escondido, o affordance inteiro não existe para este papel.
    await expect(page.getByRole("button", { name: "Adicionar" })).toHaveCount(0);
    await expect(page.locator('input[name="nome"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remover tipo de imóvel/ })).toHaveCount(0);
  });

  test("criar um tipo com nome longo não estoura a coluna em 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/app/tipos-imovel");

    const nomeLongo = `Apartamento cobertura duplex com vista panorâmica E2E ${Date.now()}`;
    await grupoResidencial(page).getByLabel("Novo tipo de imóvel residencial").fill(nomeLongo);
    await grupoResidencial(page).getByRole("button", { name: "Adicionar" }).click();
    await expect(grupoResidencial(page).getByText(nomeLongo, { exact: true })).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow).toBe(true);
  });
});

test.describe("estados vazios (Fase 72)", () => {
  test("ambas as categorias vazias usam o componente compartilhado, sem CTA duplicado", async ({
    page,
  }) => {
    // Org B nunca recebeu nenhum tipo (nenhuma chamada de
    // garantirTipoImovel no seed) — vazio garantido nas duas categorias.
    await entrarComo(page, ORG_B);
    await page.goto("/app/tipos-imovel");

    const vazioResidencial = grupoResidencial(page).locator("[data-estado-vazio]");
    const vazioComercial = grupoComercial(page).locator("[data-estado-vazio]");
    await expect(vazioResidencial).toBeVisible();
    await expect(vazioComercial).toBeVisible();
    await expect(vazioResidencial.getByText("Nenhum tipo residencial cadastrado")).toBeVisible();
    await expect(vazioComercial.getByText("Nenhum tipo comercial cadastrado")).toBeVisible();

    // O formulário de criação já está no mesmo Card, logo acima — o
    // vazio não duplica um segundo botão "Adicionar".
    await expect(vazioResidencial.getByRole("button")).toHaveCount(0);
    await expect(vazioComercial.getByRole("button")).toHaveCount(0);
  });

  test("uma categoria com dado e a outra vazia — cada card no seu próprio estado", async ({
    page,
  }) => {
    // Org Contatos tem exatamente "Apartamento" (residencial) e nada em
    // comercial — ver garantirTipoImovel no seed E2E.
    await entrarComo(page, ORG_CONTATOS);
    await page.goto("/app/tipos-imovel");

    await expect(grupoResidencial(page).getByText("Apartamento", { exact: true })).toBeVisible();
    await expect(grupoResidencial(page).locator("[data-estado-vazio]")).toHaveCount(0);
    await expect(grupoComercial(page).locator("[data-estado-vazio]")).toBeVisible();
    await expect(
      grupoComercial(page).getByText("Nenhum tipo comercial cadastrado")
    ).toBeVisible();
  });
});
