import { test, expect } from "@playwright/test";
import { ORG_ANALYTICS, ORG_AGENDA, login } from "./helpers";

// Liquidação de comissão (Fase 13).
//
// MESMA ORDEM DELIBERADA das fases 9–12: as asserções de Analytics
// afirmam números ABSOLUTOS do seed, e a jornada cria e paga negócios
// novos — por isso as leituras vêm primeiro, e a jornada roda na
// Organização da Agenda, nunca na Org A (fechar negócio na Org A desloca
// `tempoMedioHistorico` e reclassifica a prioridade dos cards de
// pipeline.spec.ts; ver prisma/seed-e2e.ts).

const HOJE = new Date().toISOString().slice(0, 10);

test.describe("Analytics — liquidação", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
  });

  test("mostra o pago no período e declara a coorte por data de pagamento", async ({ page }) => {
    const bloco = page.getByRole("region", { name: "Liquidação de comissão" });
    await expect(bloco).toBeVisible();

    // Seed: R$ 25.000 atribuídos, R$ 10.000 pagos.
    const texto = (await bloco.innerText()).replace(/\u00a0/g, " ");
    expect(texto).toContain("R$ 10.000");
    await expect(bloco.getByRole("term").filter({ hasText: "Comissão paga" })).toBeVisible();

    // A coorte é declarada em texto, não deixada para o leitor supor.
    await expect(bloco).toContainText("data do pagamento");
    await expect(bloco).toContainText("não a data de fechamento");

    // Nomenclatura: pago, nunca receita/lucro; e sem ROI.
    await expect(bloco).toContainText("não é receita");
    await expect(bloco).not.toContainText("ROI");
    await expect(bloco).not.toContainText("Lucro");
  });

  test("os três blocos financeiros coexistem, cada um com sua pergunta", async ({ page }) => {
    await expect(page.getByRole("region", { name: "Performance por responsável" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Participação na comissão" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Liquidação de comissão" })).toBeVisible();

    // Atribuído (R$ 25.000) e pago (R$ 10.000) são números diferentes na
    // mesma tela — é exatamente isso que a fase precisa provar.
    const participacao = page.getByRole("region", { name: "Participação na comissão" });
    expect((await participacao.innerText()).replace(/\u00a0/g, " ")).toContain("R$ 25.000");
  });

  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: bloco de liquidação sem overflow`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/analytics");
      await expect(page.getByRole("region", { name: "Liquidação de comissão" })).toBeVisible();
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

test.describe("Liquidação — jornada do corretor", () => {
  test("paga em duas parcelas: Parcial vira Liquidado, e o excesso é recusado", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Liquidacao ${Date.now()}`;
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

    // Fecha como ganho com R$ 40.000 de comissão (máscara em centavos).
    await page.getByRole("button", { name: "Marcar como ganho" }).first().click();
    const fechamento = page.getByRole("dialog");
    await fechamento.getByLabel("Valor de fechamento").fill("80000000");
    await fechamento.getByLabel("Comissão do negócio (opcional)").fill("4000000");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      fechamento.getByRole("button", { name: "Confirmar ganho" }).click(),
    ]);
    await page.reload();

    // Atribui R$ 20.000 a um participante.
    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    let dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Adicionar participante").selectOption({ index: 1 });
    await dialogo.getByLabel("Valor da participação (opcional)").fill("2000000");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Adicionar", exact: true }).click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    dialogo = page.getByRole("dialog");
    // ATRIBUÍDO != PAGO: nasce pendente, com o valor inteiro em aberto.
    // innerText + normalização de NBSP: toContainText não converte o
    // espaço não-separável que toLocaleString emite depois de "R$".
    const inicial = (await dialogo.innerText()).replace(/\u00a0/g, " ");
    expect(inicial).toContain("Pendente");
    expect(inicial).toContain("Pago R$ 0");

    // Primeiro pagamento: R$ 15.000 -> Parcial.
    await dialogo.getByRole("button", { name: "Registrar pagamento" }).first().click();
    await dialogo.getByLabel("Valor pago").fill("1500000");
    await dialogo.getByLabel("Data do pagamento").fill(HOJE);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Registrar pagamento" }).last().click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    dialogo = page.getByRole("dialog");
    const parcialTexto = (await dialogo.innerText()).replace(/\u00a0/g, " ");
    expect(parcialTexto).toContain("Pago R$ 15.000");
    expect(parcialTexto).toContain("pendente R$ 5.000");
    expect(parcialTexto).toContain("Parcial");

    // Excesso: R$ 6.000 num saldo de R$ 5.000 é recusado, com erro visível.
    await dialogo.getByRole("button", { name: "Registrar pagamento" }).first().click();
    await dialogo.getByLabel("Valor pago").fill("600000");
    await dialogo.getByLabel("Data do pagamento").fill(HOJE);
    await dialogo.getByRole("button", { name: "Registrar pagamento" }).last().click();
    await expect(dialogo.getByRole("alert")).toContainText("não pode ultrapassar");

    // Segundo pagamento correto: R$ 5.000 -> Liquidado.
    await dialogo.getByLabel("Valor pago").fill("500000");
    await dialogo.getByLabel("Data do pagamento").fill(HOJE);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Registrar pagamento" }).last().click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    dialogo = page.getByRole("dialog");
    const finalTexto = (await dialogo.innerText()).replace(/\u00a0/g, " ");
    expect(finalTexto).toContain("Pago R$ 20.000");
    expect(finalTexto).toContain("Liquidado");
    // Histórico do ledger: duas linhas, ambas visíveis.
    expect(finalTexto).toContain("R$ 15.000");
    expect(finalTexto).toContain("R$ 5.000");
    // Liquidado: não sobra saldo, então a ação de pagar some.
    await expect(dialogo.getByRole("button", { name: "Registrar pagamento" })).toHaveCount(0);
  });

  test("cancelar devolve o saldo e mantém a linha no histórico", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Liquidacao Cancel ${Date.now()}`;
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
    await fechamento.getByLabel("Comissão do negócio (opcional)").fill("4000000");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      fechamento.getByRole("button", { name: "Confirmar ganho" }).click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    let dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Adicionar participante").selectOption({ index: 1 });
    await dialogo.getByLabel("Valor da participação (opcional)").fill("1000000");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Adicionar", exact: true }).click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Registrar pagamento" }).first().click();
    await dialogo.getByLabel("Valor pago").fill("1000000");
    await dialogo.getByLabel("Data do pagamento").fill(HOJE);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Registrar pagamento" }).last().click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Liquidado");

    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Cancelar", exact: true }).first().click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    dialogo = page.getByRole("dialog");
    const texto = (await dialogo.innerText()).replace(/\u00a0/g, " ");
    // Saldo devolvido...
    expect(texto).toContain("Pago R$ 0");
    expect(texto).toContain("Pendente");
    // ...mas a linha CONTINUA no histórico, marcada como cancelada.
    expect(texto).toContain("Cancelado");
  });

  test("participação sem valor não oferece pagamento", async ({ page }) => {
    await login(page, ORG_AGENDA);

    const nome = `Cliente Liquidacao Sem Valor ${Date.now()}`;
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

    // Negócio ainda ABERTO: participante entra sem valor, e sem valor não
    // existe teto para pagar contra.
    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Adicionar participante").selectOption({ index: 1 });
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      dialogo.getByRole("button", { name: "Adicionar", exact: true }).click(),
    ]);
    await page.reload();

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    const depois = page.getByRole("dialog");
    await expect(depois).toContainText("Participação sem valor definido");
    // "pendente —", nunca "Pendente R$ 0,00".
    await expect(depois).toContainText("pendente —");
    await expect(depois.getByRole("button", { name: "Registrar pagamento" })).toHaveCount(0);
  });
});
