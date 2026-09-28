import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E, ORG_COMISSOES, ORG_COMISSOES_BRUNO, ORG_FUSO, login } from "./helpers";

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

// Fase 69 — o resumo deixou de ser UM card com o título "Resumo": agora
// é uma <section> (CabecalhoSecao "Resumo das comissões" + a grade de
// CartaoEstatistica). Esta função escopa a essa seção, não a um card
// específico dentro dela.
function secaoResumo(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Resumo das comissões" }) });
}

// Lê o valor de um KPI pelo rótulo — mesma âncora estrutural usada nos
// testes de Dashboard/Pipeline/Imóveis/Analytics (data-kpi-rotulo/
// data-kpi-valor), em vez de procurar texto dentro de um card genérico.
function valorKpi(page: Page, rotulo: string) {
  return secaoResumo(page)
    .locator('[data-slot="card"]')
    .filter({ has: page.locator("[data-kpi-rotulo]", { hasText: rotulo }) })
    .locator("[data-kpi-valor]");
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
    // A seção também é um heading de verdade — h2, abaixo do h1 da página.
    const tituloResumo = page.getByRole("heading", { level: 2, name: "Resumo das comissões" });
    await expect(tituloResumo).toBeVisible();

    await expect(valorKpi(page, "A receber")).toHaveText("R$ 18.000,00");
    await expect(valorKpi(page, "Minha participação")).toHaveText("R$ 23.000,00");
    await expect(valorKpi(page, "Já recebido")).toHaveText("R$ 5.000,00");

    // 23.000 − 5.000 = 18.000. A conta fecha na tela, não só no servidor.
    const resumo = (await secaoResumo(page).innerText()).replace(/ /g, " ");
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
    const resumo = (await secaoResumo(page).innerText()).replace(/ /g, " ");
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

    const resumo = (await secaoResumo(page).innerText()).replace(/ /g, " ");
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
  // Fase 69 — larguras alinhadas ao conjunto canônico já usado em
  // Dashboard/Pipeline/Imóveis/Analytics, em vez do conjunto próprio que
  // esta spec tinha antes do redesenho.
  for (const largura of [1920, 1440, 1366, 1024, 768, 390]) {
    test(`${largura}px: sem overflow e com o saldo legível`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await login(page, ORG_COMISSOES_BRUNO);
      await page.goto(CARTEIRA);

      await expect(page.getByRole("heading", { level: 1, name: "Minhas comissões" })).toBeVisible();
      // "A receber" é a pergunta que traz o corretor até aqui: no celular
      // ela precisa estar visível sem rolar.
      await expect(valorKpi(page, "A receber")).toHaveText("R$ 18.000,00");
      await expect(valorKpi(page, "A receber")).toBeInViewport();

      // Rótulo não colapsado nem valor monetário cortado — mesma medição
      // usada nas demais páginas do backoffice para pegar o bug real
      // (scrollWidth > clientWidth), não só a ausência de overflow do
      // documento.
      const medidas = await secaoResumo(page)
        .locator("[data-kpi-rotulo], [data-kpi-valor]")
        .evaluateAll((els) =>
          els.map((el) => ({
            texto: (el.textContent ?? "").trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          }))
        );
      expect(medidas.length).toBe(6); // 3 rótulos + 3 valores
      for (const m of medidas) {
        expect(
          m.scrollWidth,
          `"${m.texto}" cortado em ${largura}px`
        ).toBeLessThanOrEqual(m.clientWidth + 1);
      }

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------
// Estrutura, acessibilidade e ausência do que não deveria existir
// -----------------------------------------------------------------------
// Fase 69 — cobertura do REDESENHO, não do cálculo (que já está provado
// acima e nos testes unitários de src/lib/comissao-a-receber.test.ts).
test.describe("estrutura da tela redesenhada", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_COMISSOES_BRUNO);
    await page.goto(CARTEIRA);
  });

  test("hierarquia de cabeçalhos sem salto: h1 -> h2, nunca h1 -> h3", async ({ page }) => {
    const niveis = await page
      .locator("main h1, main h2, main h3")
      .evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
    expect(niveis[0]).toBe(1);
    for (let i = 1; i < niveis.length; i += 1) {
      expect(
        niveis[i] - niveis[i - 1],
        `salto de h${niveis[i - 1]} para h${niveis[i]}`
      ).toBeLessThanOrEqual(1);
    }
    // As duas seções são h2 reais — não o <div> que CardTitle renderiza.
    await expect(page.getByRole("heading", { level: 2, name: "Resumo das comissões" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Negócios" })).toBeVisible();
  });

  test("os três KPIs não são links — não prometem navegação que não existe", async ({ page }) => {
    const grade = secaoResumo(page).locator("[data-slot=card]").filter({
      has: page.locator("[data-kpi-rotulo]"),
    });
    await expect(grade).toHaveCount(3);
    await expect(grade.locator("a")).toHaveCount(0);
  });

  test("não existem abas: Resumo e Negócios são seções na mesma página, não domínios navegáveis", async ({
    page,
  }) => {
    // A regra do backoffice (ver ui/README.md): abas só quando houver
    // contextos distintos que justifiquem navegação — não é o caso aqui.
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(0);
    // As duas seções continuam visíveis SIMULTANEAMENTE, sem clique.
    await expect(page.getByRole("heading", { name: "Resumo das comissões" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Negócios" })).toBeVisible();
  });

  test("nenhum CTA inventado: sem botões de ação além do que já existia (nenhum)", async ({
    page,
  }) => {
    // A tela é de leitura (ver também "a tela é de leitura" acima). Nomes
    // proibidos explicitamente pela fase — nenhum deles tem destino real.
    for (const rotulo of [
      "Adicionar comissão",
      "Solicitar comissão",
      "Configurar participação",
      "Ver oportunidades",
    ]) {
      await expect(page.getByRole("button", { name: rotulo })).toHaveCount(0);
      await expect(page.getByRole("link", { name: rotulo })).toHaveCount(0);
    }
  });

  test("nenhum período/filtro foi inventado", async ({ page }) => {
    // A lib documenta explicitamente por que não há janela temporal
    // (é ESTOQUE, não FLUXO) — a tela não pode contradizer isso.
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    for (const rotulo of ["Período", "Este mês", "Últimos 30 dias", "Status"]) {
      await expect(page.getByText(rotulo, { exact: true })).toHaveCount(0);
    }
  });
});

// -----------------------------------------------------------------------
// Zero real vs. ausência — o outro extremo do mesmo cuidado
// -----------------------------------------------------------------------
// Org F (fuso) nunca recebeu nenhuma participação de comissão: nenhuma
// outra spec cria PropertyInterestParticipant nela (confirmado lendo o
// seed). É um zero ESTRUTURAL, não uma corrida contra outra spec — ao
// contrário de orgs como ORG_AGENDA, que hospedam jornadas de fechamento
// de propósito.
test.describe("carteira genuinamente vazia (zero real, nunca '—')", () => {
  test("R$ 0,00 nos três KPIs — zero é um valor real, não indisponibilidade", async ({ page }) => {
    await login(page, ORG_FUSO);
    await page.goto(CARTEIRA);

    await expect(valorKpi(page, "A receber")).toHaveText("R$ 0,00");
    await expect(valorKpi(page, "Minha participação")).toHaveText("R$ 0,00");
    await expect(valorKpi(page, "Já recebido")).toHaveText("R$ 0,00");

    // "R$ 0,00" nunca é "—": ausência (participação não definida) e zero
    // (zero negócios ganhos) são fatos diferentes, e aqui o fato é zero.
    const resumo = (await secaoResumo(page).innerText()).replace(/ /g, " ");
    expect(resumo).not.toContain("—");
  });

  test("o estado vazio usa o componente compartilhado, com o texto preservado e sem CTA", async ({
    page,
  }) => {
    await login(page, ORG_FUSO);
    await page.goto(CARTEIRA);

    const vazio = page.locator("[data-estado-vazio]");
    await expect(vazio).toBeVisible();
    await expect(vazio.getByText("Nenhuma comissão atribuída")).toBeVisible();
    await expect(vazio).toContainText(
      "Você ainda não é beneficiário da comissão de nenhum negócio ganho."
    );
    // A regra de negócio some no texto secundário, palavra por palavra.
    await expect(vazio).toContainText(
      "A divisão da comissão é declarada na ficha do cliente, negócio a negócio."
    );
    // Nenhuma ação — nem dentro do estado vazio, nem fora dele.
    await expect(vazio.getByRole("button")).toHaveCount(0);
    await expect(vazio.getByRole("link")).toHaveCount(0);
  });
});
