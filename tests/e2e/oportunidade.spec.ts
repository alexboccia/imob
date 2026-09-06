import { test, expect } from "@playwright/test";
import { ORG_ANALYTICS, ORG_AGENDA, ORG_A, login } from "./helpers";

// Resultado comercial (Fase 8) — a jornada do CORRETOR, que é o que só o
// browser prova: ele recebe um contato do site, converte em oportunidade
// com um clique, e a origem daquele contato sobrevive até o Analytics.
//
// Os números do dashboard são verificados contra o seed determinístico da
// organização de Analytics; a jornada de conversão roda na Org A, cujos
// números nenhuma spec afirma em valor absoluto.

// ORDEM DOS BLOCOS IMPORTA e é deliberada: as asserções de Analytics
// afirmam números ABSOLUTOS do seed (2 oportunidades, 1 com origem, 1
// ganha), e a jornada do corretor CRIA uma oportunidade nova na mesma
// organização. Por isso as leituras vêm primeiro e a jornada por último —
// dentro de um arquivo, o Playwright executa na ordem do código.

test.describe("Resultado comercial — Analytics", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/analytics");
  });

  test("mostra oportunidades, ganhos e as duas taxas, sem nenhum valor em dinheiro", async ({
    page,
  }) => {
    const resultado = page.getByRole("region", { name: "Resultado comercial" });
    await expect(resultado).toBeVisible();

    // Seed: 2 oportunidades criadas (1 com origem, 1 manual), 1 ganha.
    await expect(resultado.getByText("Oportunidades criadas", { exact: true })).toBeVisible();
    await expect(resultado.getByText("1 a partir de um contato do site")).toBeVisible();
    await expect(resultado.getByText("Negociações ganhas", { exact: true })).toBeVisible();

    await expect(resultado.getByText("Contato vira oportunidade", { exact: true })).toBeVisible();
    await expect(resultado.getByText("Oportunidade vira ganho", { exact: true })).toBeVisible();

    // A recusa explícita da fase: nenhuma métrica de dinheiro.
    await expect(resultado).toContainText("não registra valor fechado nem comissão");
    await expect(resultado).not.toContainText("Receita");
    await expect(resultado).not.toContainText("R$");
  });

  test("canal de aquisição atribui oportunidade e ganho ao canal de origem", async ({ page }) => {
    const aquisicao = page.getByRole("region", { name: "Canal de aquisição" });
    await expect(aquisicao).toBeVisible();

    // Colunas novas da Fase 8.
    await expect(aquisicao.getByRole("columnheader", { name: "Oport." })).toBeVisible();
    await expect(aquisicao.getByRole("columnheader", { name: "Ganhos" })).toBeVisible();

    // A oportunidade ganha do seed veio de um contato com utm google/cpc,
    // então tem que aparecer em Anúncios pagos — e NÃO em Sem atribuição.
    const anuncios = aquisicao.locator("tbody tr", { hasText: "Anúncios pagos" });
    await expect(anuncios).toContainText("1");

    // A oportunidade manual não tem origem: fica em Sem atribuição.
    const semAtribuicao = aquisicao.locator("tbody tr", { hasText: "Sem atribuição" });
    await expect(semAtribuicao).toBeVisible();

    // Como existe vínculo nesta organização, as colunas mostram números
    // reais — não o travessão de "não medido".
    await expect(aquisicao).not.toContainText("Ainda não medido");
  });

  test("distingue ZERO de NÃO MEDIDO num tenant sem vínculo de origem", async ({ page }) => {
    // Org da Agenda: tem CRM, não tem nenhuma oportunidade com origem.
    // clearCookies antes: o beforeEach já autenticou na org de Analytics,
    // e /app/login redireciona pra /app quando há sessão.
    await page.context().clearCookies();
    await login(page, ORG_AGENDA);
    await page.goto("/app/analytics");

    const resultado = page.getByRole("region", { name: "Resultado comercial" });
    // A explicação honesta: a coluna está vazia porque o vínculo passou a
    // existir agora, não porque nenhum canal converteu.
    await expect(resultado).toContainText("Nenhuma oportunidade tem contato de origem registrado");
  });

  for (const largura of [375, 768, 1024, 1280, 1440]) {
    test(`${largura}px: resultado comercial sem overflow`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/analytics");
      await expect(page.getByRole("region", { name: "Resultado comercial" })).toBeVisible();
      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow em ${largura}px`).toBe(true);
    });
  }
});

test.describe("Oportunidade — jornada do corretor", () => {
  test("contato do site vira oportunidade com um clique, e o botão some depois", async ({
    page,
  }) => {
    await login(page, ORG_A);

    // Cria um cliente e um contato de página de imóvel pelo fluxo real do
    // painel — nada de escrever direto no banco pelo browser.
    const nome = `Lead Oportunidade ${Date.now()}`;
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByRole("link", { name: nome }).first().click();
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();

    // Uma interação registrada à MÃO não é elegível: não é captação.
    await expect(page.getByRole("button", { name: "Criar oportunidade" })).toHaveCount(0);
  });

  test("só o contato de página de imóvel oferece conversão, e converter esconde o botão", async ({
    page,
  }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/clientes");
    await page.getByRole("link", { name: "Lead Analytics Ocasional" }).first().click();
    await expect(page.locator("h2", { hasText: "Histórico de interações" })).toBeVisible();

    // Esta pessoa tem exatamente UM contato de página de imóvel, e ele
    // ainda não virou oportunidade.
    const botao = page.getByRole("button", { name: "Criar oportunidade" });
    await expect(botao).toHaveCount(1);

    // Espera a resposta da Server Action antes de recarregar: sem isso o
    // reload dispara enquanto o POST ainda está em voo e a página volta a
    // renderizar o estado anterior — corrida do TESTE, não do produto.
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")
      ),
      botao.click(),
    ]);

    // Asserção sobre o estado DURÁVEL, depois de recarregar: a
    // oportunidade existe e a ação não é mais oferecida. Deliberadamente
    // não se afirma nada sobre o instante seguinte ao clique — quando o
    // Next reconcilia o revalidatePath na rota atual é detalhe do
    // framework, não garantia do produto.
    await page.reload();

    // A oportunidade passa a existir na ficha do cliente.
    await expect(
      page.getByText("Studio Analytics segundo colocado", { exact: false }).first()
    ).toBeVisible();

    // E o par (pessoa, imóvel) sendo único, a ação deixa de ser oferecida.
    await expect(page.getByRole("button", { name: "Criar oportunidade" })).toHaveCount(0);
  });

  test("contatos que NÃO são de página de imóvel nunca oferecem conversão", async ({ page }) => {
    await login(page, ORG_ANALYTICS);
    await page.goto("/app/clientes");
    // O proprietário do seed só tem contatos de "anuncie seu imóvel" —
    // o oposto comercial do funil de comprador.
    await page.getByRole("link", { name: "Proprietário Analytics" }).first().click();
    await expect(page.locator("h2", { hasText: "Histórico de interações" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar oportunidade" })).toHaveCount(0);
  });
});
