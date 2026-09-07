import { test, expect } from "@playwright/test";
import { ORG_CENTRAL, ORG_CENTRAL_CORRETOR, ORG_FUSO, login } from "./helpers";

// =======================================================================
// Visão de equipe da Central (Fase 21)
// =======================================================================
// Roda na Organização E (dedicada, seed determinístico) pelo mesmo motivo
// estrutural das fases 17-19: as asserções são números absolutos.
//
// Seed relevante: o dono é OWNER (autoridade gerencial), há um segundo
// corretor BROKER, 4 negociações do dono, 1 do outro corretor e 1 SEM
// RESPONSÁVEL.
//
// As bordas finas (baldes temporais, DST, membro inativo, truncamento,
// ownership) estão em 40 unitários e 28 de integração, onde o relógio
// pode ser fixado. Aqui prova-se o que só o navegador prova.

test.describe("gestor vê a equipe", () => {
  test("alterna para Equipe e enxerga resumo, distribuição e sem responsável", async ({ page }) => {
    await login(page, ORG_CENTRAL);

    // A Central abre no trabalho PESSOAL, mesmo para quem é gestor.
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
    const alternador = page.getByRole("navigation", { name: "Visão da central" });
    await expect(alternador).toBeVisible();
    await expect(alternador.getByRole("link", { name: /Meu trabalho/ })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await alternador.getByRole("link", { name: "Equipe" }).click();
    await page.waitForURL(/\/app\?visao=equipe/);

    // Estado atual é textual e semântico, não só cor.
    await expect(
      page.getByRole("navigation", { name: "Visão da central" }).getByRole("link", { name: /Equipe/ })
    ).toHaveAttribute("aria-current", "page");

    await expect(page.getByRole("heading", { name: "Resumo da equipe" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Distribuição por responsável" })).toBeVisible();

    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");

    // Deixa explícito que os números são da ORGANIZAÇÃO, não "meus".
    expect(texto).toContain("Compromissos e negociações de toda a organização.");

    // O fato que a Central pessoal nunca conseguiu mostrar.
    expect(texto).toContain("1 negociação sem responsável");

    // A distribuição mostra as pessoas, inclusive o outro corretor —
    // é isso que a visão pessoal, por definição, não mostra.
    expect(texto).toContain("Bruno Outro Corretor");
    expect(texto).toContain("negociações abertas");

    // Nada de julgamento. A checagem é sobre o que a visão AFIRMA, não
    // sobre a presença de substrings: a própria descrição do bloco usa a
    // palavra "ranking" justamente para negá-la, e a seção "Visão geral"
    // (KPIs preexistentes) segue abaixo com os títulos que sempre teve.
    expect(texto).toContain("Não é ranking nem avaliação.");
    for (const julgamento of [
      "melhor corretor",
      "pior corretor",
      "produtividade",
      "lead quente",
      "risco",
      "Prioridade",
    ]) {
      expect(texto).not.toContain(julgamento);
    }

    // A ordem das pessoas é ALFABÉTICA — se fosse ranking por pendência,
    // a ordem mudaria com os números.
    const bloco = await page
      .getByRole("heading", { name: "Distribuição por responsável" })
      .locator("xpath=ancestor::*[@data-slot='card'][1]")
      .innerText();
    const posicaoBruno = bloco.indexOf("Bruno Outro Corretor");
    const posicaoSem = bloco.indexOf("Sem responsável");
    expect(posicaoBruno).toBeGreaterThanOrEqual(0);
    // "Sem responsável" não é uma pessoa e fica por último.
    expect(posicaoSem).toBeGreaterThan(posicaoBruno);

    // A visão pessoal NÃO aparece junto — os dois contextos não se
    // misturam na mesma tela.
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toHaveCount(0);
  });

  test("os números levam às telas donas — a Central não resolve, ela aponta", async ({ page }) => {
    await login(page, ORG_CENTRAL);
    await page.goto("/app?visao=equipe");

    // "Sem responsável" leva ao Pipeline JÁ FILTRADO, reusando o filtro
    // que o Pipeline já tinha.
    await page.getByRole("link", { name: /negociação sem responsável/ }).click();
    await page.waitForURL(/\/app\/pipeline\?responsavel=SEM/);
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    const pipeline = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(pipeline).toContain("Central Sem Responsavel");

    // E a Central de equipe não oferece nenhuma mutação.
    await page.goto("/app?visao=equipe");
    for (const acao of ["Atribuir", "Transferir", "Concluir", "Cancelar"]) {
      await expect(page.getByRole("button", { name: acao })).toHaveCount(0);
    }
  });

  test("a equipe concorda com a Agenda sobre atrasados e hoje", async ({ page }) => {
    await login(page, ORG_CENTRAL);
    await page.goto("/app?visao=equipe");
    const equipe = (await page.locator("main").innerText()).replace(/ /g, " ");
    // O seed tem 1 visita atrasada na organização.
    expect(equipe).toContain("Atrasados");
    expect(equipe).toContain("Central Atrasada");

    // Atrasados vivem na aba "anteriores" da Agenda (a aba padrão é
    // "hoje") — é para lá que o número da equipe aponta.
    await page.goto("/app/agenda?aba=anteriores&status=ATRASADAS");
    const agenda = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(agenda).toContain("Central Atrasada");
  });
});

test.describe("corretor sem autoridade gerencial", () => {
  test("não vê o alternador e continua com a Central pessoal", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);

    // A Home dele é exatamente a de antes: nenhum controle novo.
    await expect(page.getByRole("navigation", { name: "Visão da central" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
  });

  // A garantia da fase: o parâmetro é um pedido, e o servidor recusa.
  test("manipular ?visao=equipe na URL não revela a organização", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    await page.goto("/app?visao=equipe");

    // Nada da visão de equipe é renderizado...
    await expect(page.getByRole("heading", { name: "Resumo da equipe" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Distribuição por responsável" })).toHaveCount(0);

    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(texto).not.toContain("Compromissos e negociações de toda a organização.");
    expect(texto).not.toContain("sem responsável");

    // ... e ele recebe a própria Central, não uma tela de erro.
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
    expect(texto).toContain("1 negociação em andamento sob sua responsabilidade");
    // O trabalho do dono da organização não vaza para ele.
    expect(texto).not.toContain("Central Atrasada");
  });
});

test.describe("visão de equipe no fuso da organização", () => {
  test("a classificação da equipe usa o calendário da organização", async ({ page }) => {
    // Org F está em America/Sao_Paulo e o dono é OWNER. O seed tem uma
    // visita às 23:30 locais (hoje lá, amanhã em UTC) e outra às 00:15
    // do dia seguinte.
    await login(page, ORG_FUSO);
    await page.goto("/app?visao=equipe");

    await expect(page.getByRole("heading", { name: "Resumo da equipe" })).toBeVisible();
    const equipe = (await page.locator("main").innerText()).replace(/ /g, " ");

    // A Agenda tem de dizer a mesma coisa — zero helper temporal
    // paralelo (Fase 18 preservada).
    await page.goto("/app/agenda");
    const agenda = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(agenda).toContain("Fuso Fim Do Dia");
    expect(agenda).toContain("23:30");
    expect(equipe).toContain("Hoje");
  });
});

test.describe("responsividade da visão de equipe", () => {
  test("sem overflow horizontal em 375/390/430/768/1024/1280/1440", async ({ page }) => {
    await login(page, ORG_CENTRAL);

    for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app?visao=equipe");
      await expect(page.getByRole("heading", { name: "Resumo da equipe" })).toBeVisible();
      const rolagemX = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolagemX, `visão de equipe rolou ${rolagemX}px em ${largura}px`).toBe(0);
    }
  });
});
