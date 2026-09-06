import { test, expect } from "@playwright/test";
import { ORG_ANALYTICS, ORG_AGENDA, login } from "./helpers";

// Responsável pela negociação (Fase 11).
//
// MESMA ORDEM DELIBERADA das fases 9/10: as asserções de Analytics
// afirmam números ABSOLUTOS do seed, e a jornada do corretor cria e
// fecha negociações novas — por isso as leituras vêm primeiro, e a
// jornada roda na Organização da Agenda, nunca na Org A (fechar negócio
// na Org A desloca `tempoMedioHistorico` e reclassifica a prioridade dos
// cards de pipeline.spec.ts, achado real documentado em prisma/seed-e2e.ts).

test.describe("Analytics — performance por responsável", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
  });

  test("separa a linha do responsável da linha 'Sem responsável'", async ({ page }) => {
    const bloco = page.getByRole("region", { name: "Performance por responsável" });
    await expect(bloco).toBeVisible();

    // Seed: um ganho de R$ 850.000 / R$ 42.500 COM responsável (o dono da
    // organização) e um ganho legado SEM responsável e sem valores.
    const texto = (await bloco.innerText()).replace(/ /g, " ");
    expect(texto).toContain("Sem responsável");
    expect(texto).toContain("R$ 850.000");
    expect(texto).toContain("R$ 42.500");

    // A linha do legado não inventa dinheiro: valor e comissão em "—".
    const semResponsavel = bloco.locator("tbody tr", { hasText: "Sem responsável" });
    await expect(semResponsavel).toContainText("—");

    // Nomenclatura: ownership NÃO vira receita nem comissão "do corretor".
    await expect(bloco).toContainText("não necessariamente quem recebe");
    await expect(bloco).not.toContainText("Receita");
    await expect(bloco).not.toContainText("ROI");
  });

  test("declara a coorte de cada coluna em vez de deixar a taxa ambígua", async ({ page }) => {
    const bloco = page.getByRole("region", { name: "Performance por responsável" });
    await expect(bloco.getByRole("columnheader", { name: "Taxa de ganho" })).toBeVisible();
    // A nota precisa dizer que a taxa NÃO divide pelas oportunidades criadas.
    await expect(bloco).toContainText("nunca pelas oportunidades criadas");
  });

  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: tabela de responsáveis sem overflow`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/analytics");
      await expect(page.getByRole("region", { name: "Performance por responsável" })).toBeVisible();
      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow em ${largura}px`).toBe(true);
    });
  }
});

test.describe("Pipeline — ownership visível, filtrável e transferível", () => {
  test("cria com responsável, filtra por ele, transfere e o card acompanha", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Responsavel ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();

    // O seletor nasce preenchido com o membro logado — a auto-atribuição
    // é VISÍVEL, não silenciosa.
    const seletor = page.locator("#responsavelId");
    await expect(seletor).toBeVisible();
    await expect(seletor).not.toHaveValue("");

    await page.locator("#propertyId").click();
    // Escopado ao listbox ABERTO: a ficha do cliente também tem um
    // <select> nativo (responsável), cujas <option> ficam no DOM mesmo
    // fechadas e casariam um getByRole("option") solto.
    await page.getByRole("listbox").getByRole("option").first().click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Relacionar imóvel" }).click(),
    ]);
    await page.reload();

    // Ficha do cliente mostra o responsável em TEXTO.
    const ficha = page.locator("main");
    await expect(ficha).toContainText("Responsável:");
    await expect(ficha).not.toContainText("Responsável: Sem responsável");

    // Kanban: "Meus negócios" encontra o card recém-criado.
    await page.goto("/app/pipeline");
    await page.locator("#pipeline-responsavel").selectOption({ label: "Meus negócios" });
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(nome).first()).toBeVisible();

    // E "Sem responsável" NÃO o encontra — o filtro discrimina de verdade.
    await page.locator("#pipeline-responsavel").selectOption("SEM");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(nome)).toHaveCount(0);

    // Transferência a partir do card, com o filtro "Meus negócios" ainda
    // ativo. O card é localizado pelo container do Card (data-slot), não
    // por um div genérico: `.last()` num filter de <div> pega o div mais
    // interno que contém o nome, que não é quem tem o botão.
    await page.locator("#pipeline-responsavel").selectOption({ label: "Meus negócios" });
    await page.getByRole("button", { name: "Filtrar" }).click();
    const card = page.locator('[data-slot="card"]').filter({ hasText: nome });
    await card.getByRole("button", { name: "Trocar" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText("Não altera o responsável pelo imóvel");
    await dialogo.locator("select").selectOption("");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/pipeline")),
      dialogo.getByRole("button", { name: "Salvar responsável" }).click(),
    ]);
    await page.reload();

    // Agora ele aparece sob "Sem responsável".
    await page.locator("#pipeline-responsavel").selectOption("SEM");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(nome).first()).toBeVisible();
  });

  test("negociação encerrada não oferece troca de responsável", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Responsavel Fechado ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();
    await page.locator("#propertyId").click();
    // Escopado ao listbox ABERTO: a ficha do cliente também tem um
    // <select> nativo (responsável), cujas <option> ficam no DOM mesmo
    // fechadas e casariam um getByRole("option") solto.
    await page.getByRole("listbox").getByRole("option").first().click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Relacionar imóvel" }).click(),
    ]);
    await page.reload();

    await expect(page.getByRole("button", { name: "Trocar" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Marcar como ganho" }).first().click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Valor de fechamento").fill("50000000");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Confirmar ganho" }).click(),
    ]);
    await page.reload();

    // O responsável continua exibido — ownership não some ao fechar.
    await expect(page.locator("main")).toContainText("Responsável:");
    // Mas a troca deixa de ser oferecida: o resultado do período não é
    // reescrito depois do fechamento.
    await expect(page.getByRole("button", { name: "Trocar" })).toHaveCount(0);
  });
});
