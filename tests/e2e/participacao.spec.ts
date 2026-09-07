import { test, expect } from "@playwright/test";
import { ORG_ANALYTICS, ORG_AGENDA, login } from "./helpers";

// Divisão da comissão (Fase 12).
//
// MESMA ORDEM DELIBERADA das fases 9/10/11: as asserções de Analytics
// afirmam números ABSOLUTOS do seed, e a jornada cria e fecha negócios
// novos — por isso as leituras vêm primeiro, e a jornada roda na
// Organização da Agenda, nunca na Org A (fechar negócio na Org A desloca
// `tempoMedioHistorico` e reclassifica a prioridade dos cards de
// pipeline.spec.ts; ver prisma/seed-e2e.ts).

test.describe("Analytics — participação na comissão", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
  });

  test("declara o atribuído e o não distribuído, sem inventar destino", async ({ page }) => {
    const bloco = page.getByRole("region", { name: "Participação na comissão" });
    await expect(bloco).toBeVisible();

    // Seed: comissão de R$ 42.500 com R$ 25.000 atribuídos ao dono da
    // organização — logo R$ 17.500 seguem sem destino declarado.
    const texto = (await bloco.innerText()).replace(/ /g, " ");
    expect(texto).toContain("R$ 25.000");
    expect(texto).toContain("R$ 17.500");
    // "Comissão atribuída" aparece como total (dt) E como cabeçalho da
    // tabela — os dois são legítimos, então cada asserção diz qual quer.
    await expect(bloco.getByRole("term").filter({ hasText: "Comissão atribuída" })).toBeVisible();
    await expect(bloco.getByRole("columnheader", { name: "Comissão atribuída" })).toBeVisible();
    await expect(bloco.getByRole("term").filter({ hasText: "Não distribuída" })).toBeVisible();

    // Nomenclatura: atribuída, nunca recebida/receita; e sem ROI.
    await expect(bloco).toContainText("não é valor recebido");
    await expect(bloco).not.toContainText("Receita");
    await expect(bloco).not.toContainText("ROI");
  });

  test("participação e responsável são blocos separados, ambos presentes", async ({ page }) => {
    // A Fase 11 não foi substituída: as duas dimensões coexistem.
    await expect(page.getByRole("region", { name: "Performance por responsável" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Participação na comissão" })).toBeVisible();
  });

  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: tabela de participação sem overflow`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/analytics");
      await expect(page.getByRole("region", { name: "Participação na comissão" })).toBeVisible();
      const scrollX = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(scrollX, `documento rolou ${scrollX}px em ${largura}px`).toBe(0);
    });
  }
});

test.describe("Divisão da comissão — jornada do corretor", () => {
  test("divide parcialmente, recusa excesso e declara o saldo", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Divisao ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();
    await page.locator("#propertyId").click();
    // Escopado ao listbox ABERTO: a ficha tem <select> nativos cujas
    // <option> ficam no DOM mesmo fechadas.
    await page.getByRole("listbox").getByRole("option").first().click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Relacionar imóvel" }).click(),
    ]);
    await page.reload();

    // Fecha como ganho com comissão de R$ 40.000 (máscara em centavos).
    await page.getByRole("button", { name: "Marcar como ganho" }).first().click();
    const fechamento = page.getByRole("dialog");
    await fechamento.getByLabel("Valor de fechamento").fill("80000000");
    await fechamento.getByLabel("Comissão do negócio (opcional)").fill("4000000");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      fechamento.getByRole("button", { name: "Confirmar ganho" }).click(),
    ]);
    await page.reload();

    // Antes de qualquer divisão: sem participantes, nada atribuído.
    const conteudo = async () => (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(await conteudo()).toContain("sem participantes");

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    // A lista nasce VAZIA mesmo havendo responsável e comissão.
    await expect(dialogo).toContainText("Nenhum participante ainda");
    await expect(dialogo).toContainText("nem o responsável pela negociação");

    // Atalho de %: 50% de R$ 40.000 = R$ 20.000, calculado e visível
    // antes de ser aplicado.
    await dialogo.getByLabel("Calcular por %").fill("50");
    await expect(dialogo.getByText("= R$ 20.000")).toBeVisible();
    await dialogo.getByRole("button", { name: "Aplicar" }).click();

    await dialogo.getByLabel("Adicionar participante").selectOption({ index: 1 });
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Adicionar", exact: true }).click(),
    ]);
    await page.reload();

    // Distribuição PARCIAL: metade atribuída, metade declarada como saldo.
    const depois = await conteudo();
    expect(depois).toContain("R$ 20.000 atribuídos");
    expect(depois).toContain("R$ 20.000 não distribuídos");
  });

  test("excesso sobre a comissão é recusado com erro visível", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Divisao Excesso ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();
    await page.locator("#propertyId").click();
    await page.getByRole("listbox").getByRole("option").first().click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Relacionar imóvel" }).click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Marcar como ganho" }).first().click();
    const fechamento = page.getByRole("dialog");
    await fechamento.getByLabel("Valor de fechamento").fill("80000000");
    await fechamento.getByLabel("Comissão do negócio (opcional)").fill("1000000"); // R$ 10.000
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      fechamento.getByRole("button", { name: "Confirmar ganho" }).click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Adicionar participante").selectOption({ index: 1 });
    // R$ 15.000 numa comissão de R$ 10.000.
    await dialogo.getByLabel("Valor da participação (opcional)").fill("1500000");
    await dialogo.getByRole("button", { name: "Adicionar", exact: true }).click();

    await expect(dialogo.getByRole("alert")).toContainText("não pode ultrapassar");
    // O diálogo continua aberto e nada foi gravado.
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText("Nenhum participante ainda");
  });

  test("sem comissão registrada, a divisão explica por que não aceita valores", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Divisao Sem Comissao ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();
    await page.locator("#propertyId").click();
    await page.getByRole("listbox").getByRole("option").first().click();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Relacionar imóvel" }).click(),
    ]);
    await page.reload();

    // Negócio ainda ABERTO: a divisão já existe como tela, e diz o que
    // falta em vez de mostrar "R$ 0 não distribuído".
    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Não registrada");
    await expect(dialogo).toContainText("ainda não foi registrada");
    // Saldo é "—", nunca R$ 0.
    await expect(dialogo).toContainText("—");
  });
});
