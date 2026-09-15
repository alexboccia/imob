import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E, ORG_COMISSOES, ORG_COMISSOES_BRUNO, login } from "./helpers";

// =======================================================================
// Comissão a receber — a carteira financeira do corretor (Fase 35)
// =======================================================================
// A pergunta: "da comissão que é minha, quanto já recebi e quanto ainda
// tenho para receber — e de quais negócios vem esse valor?"
//
// Organização R (dedicada), com dois papéis que nunca se cruzam:
//   BRUNO (BROKER)  carteira de LEITURA. Ele não pode registrar nem
//                   cancelar pagamento, então nenhum teste consegue
//                   deslocar os valores dele nem por engano.
//   DONA  (OWNER)   conduz a jornada de pagamento, num negócio só dela.
//
// Carteira do Bruno, pelo seed:
//   Apartamento Jardins  15.000 atribuídos ·  5.000 pagos · 10.000 a receber
//   Casa Moema            8.000 atribuídos ·      0 pagos ·  8.000 a receber
//   Loja Perdida          negócio perdido            · fora da carteira
//   Sala Sem Valor        parcela não definida       · declarada à parte
//   TOTAL                23.000 · 5.000 · 18.000

const CARTEIRA = "/app/minhas-comissoes";
const HOJE = new Date().toISOString().slice(0, 10);

// toContainText não normaliza o espaço não-separável que toLocaleString
// emite depois de "R$" — mesma precaução de liquidacao.spec.ts.
async function texto(page: Page, seletor: string) {
  return (await page.locator(seletor).innerText()).replace(/ /g, " ");
}

function cardDe(page: Page, titulo: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(titulo, { exact: true }) })
    .first();
}

function negocio(page: Page, imovel: string) {
  return page.locator("li").filter({ hasText: imovel }).first();
}

// -----------------------------------------------------------------------
// Leitura: o saldo e a sua composição
// -----------------------------------------------------------------------
test.describe("carteira do corretor", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_COMISSOES_BRUNO);
    await page.goto(CARTEIRA);
  });

  test("responde as três perguntas de uma vez, com os rótulos em texto", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Minhas comissões" })).toBeVisible();

    const resumo = await texto(page, '[data-slot="card"]:has-text("Resumo")');
    expect(resumo).toContain("A receber");
    expect(resumo).toContain("R$ 18.000,00");
    expect(resumo).toContain("Minha participação");
    expect(resumo).toContain("R$ 23.000,00");
    expect(resumo).toContain("Já recebido");
    expect(resumo).toContain("R$ 5.000,00");

    // 23.000 − 5.000 = 18.000. A conta fecha na tela, não só no servidor.
    expect(resumo).toContain("em 3 negócios ganhos");
  });

  test("a composição mostra de quais negócios vem o saldo", async ({ page }) => {
    const jardins = await negocio(page, "Apartamento Jardins E2E").innerText();
    const limpo = jardins.replace(/ /g, " ");
    expect(limpo).toContain("R$ 15.000,00");
    expect(limpo).toContain("R$ 5.000,00");
    expect(limpo).toContain("R$ 10.000,00");
    expect(limpo).toContain("Parcialmente recebido");

    const moema = (await negocio(page, "Casa Moema E2E").innerText()).replace(/ /g, " ");
    expect(moema).toContain("R$ 8.000,00");
    expect(moema).toContain("A receber");

    // O imóvel e o cliente são links reais: o saldo leva ao negócio.
    await expect(
      negocio(page, "Apartamento Jardins E2E").getByRole("link", {
        name: "Apartamento Jardins E2E",
      })
    ).toHaveAttribute("href", `/app/imoveis/${IDS_E2E.imovelComissaoParcial}`);
  });

  test("MINHA participação nunca é a comissão do negócio", async ({ page }) => {
    // Comissão total de R$ 30.000 dividida com a dona: a carteira do
    // Bruno mostra 15.000 como parte dele e declara os 30.000 como
    // contexto — jamais soma os 30.000 ao total.
    const jardins = (await negocio(page, "Apartamento Jardins E2E").innerText()).replace(
      / /g,
      " "
    );
    expect(jardins).toContain("Comissão do negócio R$ 30.000");
    const resumo = await texto(page, '[data-slot="card"]:has-text("Resumo")');
    expect(resumo).not.toContain("R$ 30.000");
  });

  test("negócio perdido fica fora; parcela sem valor é declarada, nunca vira R$ 0", async ({
    page,
  }) => {
    // Participação de R$ 9.000 num negócio perdido não é crédito.
    await expect(page.getByText("Loja Perdida E2E")).toHaveCount(0);

    const linha = negocio(page, "Sala Sem Valor E2E");
    await expect(linha).toContainText("Participação sem valor definido");

    // O QUE NINGUÉM DECLAROU aparece como "Não definido", nunca como
    // R$ 0,00 — e são exatamente as duas grandezas que dependem da
    // parcela ausente: a participação e o saldo.
    //
    // "Recebido R$ 0,00" continua correto e fica: nenhum pagamento
    // existe, e isso é um fato conhecido. A distinção é o ponto —
    // ausência e zero não são a mesma coisa em dinheiro.
    await expect(linha.getByText("Não definido")).toHaveCount(2);
    await expect(linha).toContainText("Recebido");

    const resumo = await texto(page, '[data-slot="card"]:has-text("Resumo")');
    expect(resumo).toContain("1 participação sua ainda não tem valor definido");
  });

  test("o saldo bate com o mesmo negócio aberto na ficha do cliente", async ({ page }) => {
    // Critério da fase: os mesmos fatos produzem os mesmos números em
    // qualquer superfície. A ficha usa outro componente e a mesma função.
    await negocio(page, "Apartamento Jardins E2E")
      .getByRole("link", { name: "Cliente Comissao Parcial" })
      .click();
    await page.waitForURL(/\/app\/clientes\/[^/]+$/);

    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    const dialogo = page.getByRole("dialog");
    const divisao = (await dialogo.innerText()).replace(/ /g, " ");
    expect(divisao).toContain("R$ 15.000,00");
    expect(divisao).toContain("Pago R$ 5.000,00");
    expect(divisao).toContain("pendente R$ 10.000,00");
  });

  test("um corretor vê só o próprio dinheiro", async ({ page }) => {
    // A dona participa do MESMO negócio com R$ 10.000 e já recebeu
    // R$ 9.000. Nada disso aparece na carteira do Bruno, e o total
    // continua sendo o dele.
    const pagina = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(pagina).toContain("R$ 18.000,00");
    expect(pagina).not.toContain("Cobertura Jornada E2E");
    expect(pagina).not.toContain("R$ 9.000,00");
  });

  test("a tela é de leitura: nenhuma ação financeira mora aqui", async ({ page }) => {
    // Registrar e cancelar pagamento continuam sendo de OWNER/ADMIN/
    // MANAGER, na ficha do cliente. Esta fase não moveu essa permissão.
    await expect(page.getByRole("button", { name: "Registrar pagamento" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Cancelar/ })).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// Jornada: pagar, completar, cancelar — e o saldo seguindo os fatos
// -----------------------------------------------------------------------
test.describe("o saldo segue o que realmente aconteceu", () => {
  // Abre a divisão de comissão do negócio da jornada, na ficha do cliente.
  async function abrirDivisaoDaJornada(page: Page) {
    await page.goto(CARTEIRA);
    await negocio(page, "Cobertura Jornada E2E")
      .getByRole("link", { name: "Cliente Comissao Jornada" })
      .click();
    await page.waitForURL(/\/app\/clientes\/[^/]+$/);
    await page.getByRole("button", { name: "Dividir comissão" }).first().click();
    return page.getByRole("dialog");
  }

  async function pagar(page: Page, digitosCentavos: string) {
    const dialogo = await abrirDivisaoDaJornada(page);
    await dialogo.getByRole("button", { name: "Registrar pagamento" }).first().click();
    await dialogo.getByLabel("Valor pago").fill(digitosCentavos);
    await dialogo.getByLabel("Data do pagamento").fill(HOJE);
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")
      ),
      dialogo.getByRole("button", { name: "Registrar pagamento" }).last().click(),
    ]);
  }

  async function saldoDaJornada(page: Page) {
    await page.goto(CARTEIRA);
    return (await negocio(page, "Cobertura Jornada E2E").innerText()).replace(/ /g, " ");
  }

  test("pagamento parcial, liquidação e cancelamento movem o saldo nos dois sentidos", async ({
    page,
  }) => {
    await login(page, ORG_COMISSOES);

    // Estado inicial: R$ 10.000 atribuídos, nada pago.
    let linha = await saldoDaJornada(page);
    expect(linha).toContain("R$ 10.000,00");
    expect(linha).toContain("A receber");

    // --- pagamento PARCIAL de R$ 4.000 (máscara em centavos) ---
    await pagar(page, "400000");
    linha = await saldoDaJornada(page);
    expect(linha).toContain("R$ 6.000,00");
    expect(linha).toContain("Parcialmente recebido");

    // Recarregar não muda nada: o número vem dos fatos, não da sessão.
    await page.reload();
    expect((await negocio(page, "Cobertura Jornada E2E").innerText()).replace(/ /g, " ")).toContain(
      "R$ 6.000,00"
    );

    // --- completa o pagamento: R$ 6.000 -> saldo zero ---
    await pagar(page, "600000");
    linha = await saldoDaJornada(page);
    expect(linha).toContain("R$ 0,00");
    expect(linha).toContain("Recebido");

    // --- cancelar o último pagamento devolve o saldo ---
    const dialogo = await abrirDivisaoDaJornada(page);
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")
      ),
      dialogo.getByRole("button", { name: "Cancelar", exact: true }).first().click(),
    ]);

    linha = await saldoDaJornada(page);
    // O saldo volta porque o cancelado deixou de ser pagamento válido —
    // a prova de que a tela deriva do ledger e não guarda um total.
    expect(linha).toContain("R$ 6.000,00");
    expect(linha).toContain("Parcialmente recebido");
  });
});

// -----------------------------------------------------------------------
// Responsivo
// -----------------------------------------------------------------------
test.describe("responsivo", () => {
  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: sem overflow e com o saldo legível`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await login(page, ORG_COMISSOES_BRUNO);
      await page.goto(CARTEIRA);

      await expect(page.getByRole("heading", { level: 1, name: "Minhas comissões" })).toBeVisible();
      // "A receber" é a pergunta que traz o corretor até aqui: no celular
      // ela precisa estar visível sem rolar.
      await expect(cardDe(page, "Resumo").getByText("R$ 18.000,00")).toBeInViewport();

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});
