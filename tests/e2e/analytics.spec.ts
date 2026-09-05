import { test, expect, type Page } from "@playwright/test";
import { ORG_ANALYTICS, ORG_AGENDA, ORG_B, login } from "./helpers";

// Analytics comercial (Fase 5) — três cenários agrupados, nenhum write
// pelo navegador. Todo o estado vem do seed determinístico
// (prisma/seed-e2e.ts, seção "Organização D"), e o browser é usado só
// para o que ele é bom: provar a EXPERIÊNCIA (números na tela, gráfico
// montado, filtro de período, estados vazios, responsividade).
//
// Números esperados, todos derivados do seed e de mais lugar nenhum:
//   contatos comerciais (30d) ....... 7   (4 IMOVEL + 2 ANUNCIE + 1 CONTATO)
//   pessoas distintas ............... 3   (uma delas com 4 contatos)
//   imóveis com contato ............. 2   (de 3 imóveis seedados)
//   proprietários querendo anunciar . 1   (com 2 pedidos)
//   período anterior ................ 2   -> +250%
//   interações sem origem ........... 1   -> só na nota de método

// Lê o valor de um card de KPI pelo título — o número é o <p> irmão
// dentro do mesmo card, nunca um texto solto da página.
function valorKpi(page: Page, titulo: string) {
  return page
    .locator("main .grid > div", { hasText: titulo })
    .first()
    .locator("p.text-2xl");
}

test.describe("Analytics comercial — tenant com dados", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
  });

  test("KPIs refletem os eventos reais e separam contatos de pessoas", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Analytics comercial", level: 1 })).toBeVisible();

    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("7");
    // A asserção central da fase: 7 contatos NÃO são 7 pessoas.
    await expect(valorKpi(page, "Pessoas que procuraram")).toHaveText("3");
    await expect(valorKpi(page, "Imóveis com contato")).toHaveText("2");
    await expect(valorKpi(page, "Querem anunciar")).toHaveText("1");

    // Comparação com o período anterior (2 -> 7), calculada e não
    // decorativa.
    await expect(page.getByText("+250% vs. período anterior")).toBeVisible();
  });

  test("origem dos contatos usa os rótulos do catálogo, com número e percentual", async ({ page }) => {
    await expect(page.getByText("Página do imóvel", { exact: true })).toBeVisible();
    await expect(page.getByText("Página de contato", { exact: true })).toBeVisible();
    await expect(page.getByText("Anuncie seu imóvel", { exact: true })).toBeVisible();

    // 4 de 7 = 57%; 2 de 7 = 29%; 1 de 7 = 14%. Percentual inteiro, sem
    // casa decimal falsa.
    await expect(page.getByText("(57%)")).toBeVisible();
    await expect(page.getByText("(29%)")).toBeVisible();
    await expect(page.getByText("(14%)")).toBeVisible();
  });

  test("top imóveis ranqueia por volume e omite imóvel sem contato", async ({ page }) => {
    const tabela = page.locator("table", {
      has: page.getByRole("columnheader", { name: "Imóvel" }),
    });
    const linhas = tabela.locator("tbody tr");
    await expect(linhas).toHaveCount(2);

    await expect(linhas.nth(0)).toContainText("Cobertura Analytics mais procurada");
    await expect(linhas.nth(0)).toContainText("3");
    await expect(linhas.nth(1)).toContainText("Studio Analytics segundo colocado");

    // O imóvel sem nenhum contato nunca vira uma linha em zero.
    await expect(page.getByText("Sobrado Analytics sem nenhum contato")).toHaveCount(0);

    // Linka pro imóvel no painel (sem expor PII de quem procurou).
    await expect(
      tabela.getByRole("link", { name: "Cobertura Analytics mais procurada" })
    ).toHaveAttribute("href", "/app/imoveis/e2e-imovel-analytics-top");
  });

  test("gráfico monta e a mesma série existe como tabela acessível", async ({ page }) => {
    await expect(page.getByText("Evolução dos contatos")).toBeVisible();
    // recharts renderiza um <svg> — confirma que o gráfico montou, sem
    // inspecionar a implementação interna da lib.
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    // O dado principal é legível sem depender do desenho.
    await expect(page.getByText(/7 contatos no total/)).toBeVisible();

    const botao = page.getByRole("button", { name: "Ver dados da série" });
    await expect(botao).toHaveAttribute("aria-expanded", "false");
    await botao.click();
    await expect(page.getByRole("button", { name: "Ocultar dados da série" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    const tabelaSerie = page.locator("#analytics-serie-tabela table");
    await expect(tabelaSerie).toBeVisible();
    // 30 dias -> 30 linhas, incluindo os dias em zero (buckets vazios
    // nunca somem da série).
    await expect(tabelaSerie.locator("tbody tr")).toHaveCount(30);
  });

  test("nota de método declara o que é contado e divulga o que ficou de fora", async ({ page }) => {
    const nota = page.getByRole("region", { name: "Como estes números são calculados" });
    await expect(nota).toContainText("apenas contatos recebidos pelos formulários do site");
    await expect(nota).toContainText("não entram");
    // A única interação origin=null do período é divulgada, nunca somada
    // nem atribuída a uma origem inventada.
    await expect(nota).toContainText("1 interação deste período não tem origem registrada");
  });

  test("filtro de período é URL-driven, sobrevive ao refresh e muda a granularidade", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Últimos 30 dias" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await page.getByRole("link", { name: "Últimos 7 dias" }).click();
    await expect(page).toHaveURL(/periodo=7d/);
    // Os 7 contatos do seed estão todos nos últimos 5 dias — a janela de
    // 7 dias contém todos eles, e nenhum dos 2 antigos.
    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("7");

    await page.getByRole("link", { name: "Últimas 13 semanas" }).click();
    await expect(page).toHaveURL(/periodo=13s/);
    await expect(page.getByText("um ponto por semana")).toBeVisible();
    // 9 contatos comerciais no total do seed (7 recentes + 2 antigos).
    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("9");

    await page.reload();
    await expect(page.getByRole("link", { name: "Últimas 13 semanas" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    // Período inválido cai no padrão seguro de 30 dias, nunca quebra.
    await page.goto("/app/analytics?periodo=90d");
    await expect(page.getByRole("link", { name: "Últimos 30 dias" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("7");
  });

  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: sem overflow horizontal do documento`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/analytics");
      await expect(valorKpi(page, "Contatos recebidos")).toBeVisible();
      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow horizontal em ${largura}px`).toBe(true);
    });
  }
});

test.describe("Analytics comercial — tenant sem contatos", () => {
  // ORG_AGENDA tem CRM habilitado mas NENHUM contato comercial por
  // construção: nenhum formulário público aponta pra ela (PUBLIC_ORG_SLUG
  // é a Org A), e as interações que agenda.spec.ts cria são visitas
  // internas (origin=null), que por definição não são captação. É o
  // cenário de tenant novo, sem precisar de uma organização a mais só
  // pra isso.
  test("estados vazios explicam a ausência de dados, sem NaN nem gráfico quebrado", async ({ page }) => {
    await login(page, ORG_AGENDA);
    await page.goto("/app/analytics");

    await expect(valorKpi(page, "Contatos recebidos")).toHaveText("0");
    await expect(valorKpi(page, "Pessoas que procuraram")).toHaveText("0");
    await expect(page.getByText("Sem variação vs. período anterior")).toBeVisible();

    await expect(
      page.getByText("Ainda não há contatos neste período.", { exact: false }).first()
    ).toBeVisible();
    await expect(
      page.getByText("Ainda não há contatos neste período para distribuir por origem.")
    ).toBeVisible();
    await expect(page.getByText("Nenhum imóvel recebeu contato neste período.")).toBeVisible();

    // Nenhum artefato de cálculo vazando pra tela.
    const corpo = (await page.locator("main").textContent()) ?? "";
    expect(corpo).not.toMatch(/NaN|undefined|Infinity|∞/);
  });
});

test.describe("Analytics comercial — isolamento e autorização", () => {
  test("dados de outro tenant não aparecem aqui", async ({ page }) => {
    await login(page, ORG_AGENDA);
    await page.goto("/app/analytics");

    // Nada da Organização de Analytics pode atravessar.
    await expect(page.getByText("Cobertura Analytics mais procurada")).toHaveCount(0);
    await expect(page.getByText("Studio Analytics segundo colocado")).toHaveCount(0);
    await expect(valorKpi(page, "Imóveis com contato")).toHaveText("0");
    await expect(valorKpi(page, "Querem anunciar")).toHaveText("0");
  });

  test("organização sem o módulo CRM não acessa o Analytics", async ({ page }) => {
    await login(page, ORG_B);
    await page.goto("/app/analytics");
    await expect(page.getByText("CRM não incluído no seu plano")).toBeVisible();
    await expect(page.getByText("Contatos recebidos")).toHaveCount(0);
  });
});
