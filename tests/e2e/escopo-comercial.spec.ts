import { test, expect } from "@playwright/test";
import {
  ORG_RESTRITA,
  ORG_RESTRITA_ANA,
  ORG_RESTRITA_BRUNO,
  entrarComo,
  login,
} from "./helpers";

// =======================================================================
// Política de visibilidade comercial (Fase 22)
// =======================================================================
// Organização G é a única do seed com RESTRICTED. Ana e Bruno são BROKER
// com carteiras separadas, mais um cliente compartilhado entre os dois.
//
// A matriz completa (política × papel) e os IDORs de escrita estão em 32
// unitários e 30 de integração. Aqui prova-se o que só o navegador prova:
// que a tela não vaza, nem pela URL.

test.describe("RESTRICTED — corretor fica na própria carteira", () => {
  test("Clientes, Pipeline e Agenda mostram só a carteira da Ana", async ({ page }) => {
    await login(page, ORG_RESTRITA_ANA);

    await page.goto("/app/clientes");
    const clientes = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(clientes).toContain("Cliente Exclusivo Da Ana");
    expect(clientes).not.toContain("Cliente Exclusivo Do Bruno");
    // Negociação sem responsável é fila gerencial — não é pool aberto.
    expect(clientes).not.toContain("Negociacao Sem Dono");

    await page.goto("/app/pipeline");
    const pipeline = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(pipeline).toContain("Cliente Exclusivo Da Ana");
    expect(pipeline).not.toContain("Cliente Exclusivo Do Bruno");

    await page.goto("/app/agenda");
    const agenda = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(agenda).toContain("Follow-up de Cliente Exclusivo Da Ana");
    expect(agenda).not.toContain("Follow-up de Cliente Exclusivo Do Bruno");
  });

  test("o filtro ?responsavel não expande o escopo", async ({ page }) => {
    await login(page, ORG_RESTRITA_ANA);

    // Mesmo pedindo explicitamente a fila sem responsável, nada aparece.
    await page.goto("/app/pipeline?responsavel=SEM");
    const semDono = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(semDono).not.toContain("Negociacao Sem Dono");

    // E o board continua sem a carteira do Bruno.
    await page.goto("/app/pipeline");
    expect((await page.locator("main").innerText())).not.toContain("Cliente Exclusivo Do Bruno");
  });

  test("abrir a ficha de cliente fora do escopo pelo id devolve 404, sem revelar existência", async ({
    page,
  }) => {
    // Bruno descobre o id do próprio cliente...
    await login(page, ORG_RESTRITA_BRUNO);
    await page.goto("/app/clientes");
    await page.getByRole("link", { name: "Cliente Exclusivo Do Bruno" }).first().click();
    await page.waitForURL(/\/app\/clientes\/[^/]+$/);
    const urlDoBruno = page.url();

    // ... e a Ana tenta abrir a mesma URL.
    await entrarComo(page, ORG_RESTRITA_ANA);
    const resposta = await page.goto(urlDoBruno);
    expect(resposta?.status()).toBe(404);
    const corpo = (await page.locator("body").innerText()).replace(/ /g, " ");
    expect(corpo).not.toContain("Cliente Exclusivo Do Bruno");
  });

  test("a busca de clientes não vaza PII de fora do escopo", async ({ page }) => {
    await login(page, ORG_RESTRITA_ANA);
    await page.goto("/app/clientes?q=Exclusivo");
    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(texto).toContain("Cliente Exclusivo Da Ana");
    expect(texto).not.toContain("Cliente Exclusivo Do Bruno");
  });
});

test.describe("RESTRICTED — cliente compartilhado", () => {
  test("os dois veem a pessoa; cada um vê apenas a própria negociação", async ({ page }) => {
    for (const corretor of [ORG_RESTRITA_ANA, ORG_RESTRITA_BRUNO]) {
      await entrarComo(page, corretor);
      await page.goto("/app/clientes?q=Compartilhado");
      const lista = (await page.locator("main").innerText()).replace(/ /g, " ");
      // PII COMPARTILHADO: a pessoa é entidade da organização.
      expect(lista).toContain("Cliente Compartilhado");

      await page.getByRole("link", { name: "Cliente Compartilhado" }).first().click();
      await page.waitForURL(/\/app\/clientes\/[^/]+$/);
      const ficha = (await page.locator("main").innerText()).replace(/ /g, " ");
      // NEGOCIAÇÕES SEPARADAS: cada um vê um imóvel só.
      const meu = corretor === ORG_RESTRITA_ANA ? "Apartamento E2E Restrita" : "Cobertura E2E Restrita";
      const alheio = corretor === ORG_RESTRITA_ANA ? "Cobertura E2E Restrita" : "Apartamento E2E Restrita";
      expect(ficha).toContain(meu);
      expect(ficha).not.toContain(alheio);
    }
  });
});

test.describe("RESTRICTED — gestor mantém a organização", () => {
  test("o OWNER vê as duas carteiras e a fila sem responsável", async ({ page }) => {
    await login(page, ORG_RESTRITA);

    await page.goto("/app/pipeline");
    const pipeline = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(pipeline).toContain("Cliente Exclusivo Da Ana");
    expect(pipeline).toContain("Cliente Exclusivo Do Bruno");
    expect(pipeline).toContain("Negociacao Sem Dono");

    // E a visão de equipe da Fase 21 continua funcionando.
    await page.goto("/app?visao=equipe");
    await expect(page.getByRole("heading", { name: "Resumo da equipe" })).toBeVisible();
    const equipe = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(equipe).toContain("Ana Restrita");
    expect(equipe).toContain("Bruno Restrito");
    expect(equipe).toContain("negociação sem responsável");
  });
});

test.describe("configuração da política", () => {
  // Estes testes ESCREVEM a política da Organização G. Restaurar apenas
  // no fim do caminho feliz não basta: uma falha no meio deixaria a
  // organização em COLLABORATIVE e derrubaria o teste seguinte — foi
  // exatamente o que aconteceu numa execução da suíte completa. O
  // afterAll restaura SEMPRE, inclusive depois de falha ou retry.
  test.afterAll(async ({ browser }) => {
    const pagina = await browser.newPage();
    await login(pagina, ORG_RESTRITA);
    await pagina.goto("/app/configuracoes");
    await pagina.locator("#visibilidade-RESTRICTED").check();
    await Promise.all([
      pagina.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/app/configuracoes")
      ),
      pagina.getByRole("button", { name: /Salvar alterações/ }).click(),
    ]);
    await pagina.close();
  });

  test("OWNER vê e altera a política; a mudança reflete sem deploy", async ({ page }) => {
    await login(page, ORG_RESTRITA);
    await page.goto("/app/configuracoes");

    await expect(
      page.locator('[data-slot="card-title"]', { hasText: "Visibilidade da carteira comercial" })
    ).toBeVisible();
    await expect(page.getByText("Alterar esta opção não transfere nem apaga nada")).toBeVisible();

    // O estado atual da Org G é "Restrita".
    await expect(page.locator("#visibilidade-RESTRICTED")).toBeChecked();

    // Troca para Compartilhada e confirma que a Ana passa a ver tudo.
    await page.locator("#visibilidade-COLLABORATIVE").check();
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/app/configuracoes")
      ),
      page.getByRole("button", { name: /Salvar alterações/ }).click(),
    ]);
    await page.goto("/app/configuracoes");
    await expect(page.locator("#visibilidade-COLLABORATIVE")).toBeChecked();

    await entrarComo(page, ORG_RESTRITA_ANA);
    await page.goto("/app/pipeline");
    // ESTA é a prova de COLLABORATIVE: a mesma corretora que não via a
    // carteira do Bruno passa a ver, sem deploy e sem migrar dado.
    expect(await page.locator("main").innerText()).toContain("Cliente Exclusivo Do Bruno");

    // Restaura o estado do seed para não contaminar a próxima execução.
    await entrarComo(page, ORG_RESTRITA);
    await page.goto("/app/configuracoes");
    await page.locator("#visibilidade-RESTRICTED").check();
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/app/configuracoes")
      ),
      page.getByRole("button", { name: /Salvar alterações/ }).click(),
    ]);
    await page.goto("/app/configuracoes");
    await expect(page.locator("#visibilidade-RESTRICTED")).toBeChecked();
  });

  // ACHADO DA AUDITORIA, registrado como dívida: a PÁGINA de
  // Configurações não tem gate de papel — só a Server Action tem
  // (PAPEIS_GESTAO_CONFIGURACOES). Um corretor consegue abrir a tela;
  // o que ele não consegue é SALVAR. É isso que se prova aqui, porque é
  // isso que está de fato imposto.
  test("corretor não consegue alterar a política, mesmo abrindo a tela", async ({ page }) => {
    await entrarComo(page, ORG_RESTRITA_ANA);
    await page.goto("/app/configuracoes");

    await page.locator("#visibilidade-COLLABORATIVE").check();
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/app/configuracoes")
      ),
      page.getByRole("button", { name: /Salvar alterações/ }).click(),
    ]);

    // A política continua RESTRITA — o servidor recusou.
    await entrarComo(page, ORG_RESTRITA);
    await page.goto("/app/configuracoes");
    await expect(page.locator("#visibilidade-RESTRICTED")).toBeChecked();

    // E a Ana continua sem ver a carteira do Bruno.
    await entrarComo(page, ORG_RESTRITA_ANA);
    await page.goto("/app/pipeline");
    expect(await page.locator("main").innerText()).not.toContain("Cliente Exclusivo Do Bruno");
  });

  test("sem overflow em 375/390/430/768/1024/1280/1440", async ({ page }) => {
    await entrarComo(page, ORG_RESTRITA);
    for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/configuracoes");
      await expect(page.locator("#visibilidade-RESTRICTED")).toBeVisible();
      const rolagemX = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      expect(rolagemX, `rolou ${rolagemX}px em ${largura}px`).toBe(0);
    }
  });
});
