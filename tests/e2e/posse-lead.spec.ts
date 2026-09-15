import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  ORG_POSSE,
  ORG_POSSE_ANA,
  ORG_POSSE_BRUNO,
  ORG_POSSE_COLAB_ANA,
  ORG_POSSE_COLAB_BRUNO,
  login,
} from "./helpers";

// =======================================================================
// Posse do lead — da caixa de entrada ao dono (Fase 36)
// =======================================================================
// Antes desta fase, um contato do site não tinha dono e não havia como
// lhe dar um: em política restrita ele ficava invisível para todo
// corretor, e criar a negociação — o único caminho que existia — exige um
// imóvel que um contato genérico não tem.
//
// Organizações dedicadas (S restrita, T colaborativa), cada contato com
// um propósito único, para nenhum teste depender da ordem do outro.
//
// AS INVARIANTES QUE ESTA SPEC PROTEGE:
//   assumir/atribuir NÃO é atender — o contato continua na fila
//   assumir NUNCA rouba — quem chegou depois recebe recusa
//   restrita não vaza — Bruno não vê o lead da Ana
//   colaborativa não vira restrita — ter dono não esconde de ninguém

const BLOCO = "[data-novos-contatos]";

function item(page: Page, nome: string) {
  return page.locator(BLOCO).locator("li").filter({ hasText: nome });
}

async function abrirCentral(page: Page, credenciais: Parameters<typeof login>[1]) {
  await login(page, credenciais);
  await page.goto("/app");
}

// Uma pessoa diferente é um NAVEGADOR diferente, não a mesma aba com os
// cookies apagados: limpar cookie no meio da jornada deixava a sessão
// anterior viva o bastante para /app/login redirecionar de volta, e o
// login seguinte ficava esperando um campo que nunca aparecia.
//
// Contexto próprio por persona também é o que a jornada realmente está
// afirmando — três pessoas distintas, cada uma na sua máquina, vendo
// coisas diferentes do mesmo contato.
async function comoUsuario(browser: Browser, credenciais: Parameters<typeof login>[1]) {
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await abrirCentral(pagina, credenciais);
  return { pagina, fechar: () => contexto.close() };
}

// -----------------------------------------------------------------------
// RESTRICTED — a jornada completa de distribuição
// -----------------------------------------------------------------------
test.describe("restrita: da fila ao dono", () => {
  // UMA jornada, do contato órfão ao cliente atendido. É um teste só de
  // propósito: cada passo depende do anterior ter acontecido de verdade,
  // e quebrá-lo em três criaria dependência de ordem entre testes.
  test("gestão distribui, o corretor recebe, atende — e o colega nunca vê", async ({
    browser,
  }) => {
    const gestao = await comoUsuario(browser, ORG_POSSE);
    const page = gestao.pagina;
    // 1-4. O contato chegou, não tem negociação, e a gestão vê que ele
    //      não é de ninguém.
    const lead = item(page, "Lead Atribuir Posse");
    await expect(lead).toHaveCount(1);
    await expect(lead.getByText("Sem responsável")).toBeVisible();
    await expect(page.locator(BLOCO)).toContainText("sem responsável");

    // 5. ATRIBUIR é ação gerencial explícita — um diálogo onde o gestor
    //    escolhe para quem, nunca um clique cego.
    await lead.getByRole("button", { name: "Atribuir a..." }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText("Não registra atendimento")).toBeVisible();
    await dialogo.getByLabel("Responsável pelo contato").selectOption({ label: "Ana Posse" });
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app")),
      dialogo.getByRole("button", { name: "Salvar responsável" }).click(),
    ]);

    // 6. ATRIBUIR NÃO É ATENDER: continua na fila, agora com dono.
    await page.reload();
    const distribuido = item(page, "Lead Atribuir Posse");
    await expect(distribuido).toHaveCount(1);
    await expect(distribuido).toContainText("Ana Posse");
    await expect(distribuido.getByText("Sem responsável")).toHaveCount(0);

    // 7-8. Ana entra e enxerga o que é dela.
    const ana = await comoUsuario(browser, ORG_POSSE_ANA);
    const daAna = item(ana.pagina, "Lead Atribuir Posse");
    await expect(daAna).toHaveCount(1);
    await expect(daAna).toContainText("você");

    // Posse dá acesso à PESSOA: a ficha abre de verdade.
    await daAna.getByRole("link", { name: "Lead Atribuir Posse" }).click();
    await ana.pagina.waitForURL(/\/app\/clientes\/[^/]+$/);
    await expect(
      ana.pagina.getByRole("heading", { name: "Lead Atribuir Posse" })
    ).toBeVisible();

    // 9. BRUNO NÃO VÊ. Em política restrita, lead de colega não é dele.
    const bruno = await comoUsuario(browser, ORG_POSSE_BRUNO);
    await expect(item(bruno.pagina, "Lead Atribuir Posse")).toHaveCount(0);
    expect(await bruno.pagina.content()).not.toContain("Lead Atribuir Posse");
    await bruno.fechar();

    // 10-11. Ana atende — e é o ATENDIMENTO que tira da fila.
    await ana.pagina.goto("/app");
    await item(ana.pagina, "Lead Atribuir Posse")
      .getByRole("button", { name: "Registrar atendimento" })
      .click();
    const atendimento = ana.pagina.getByRole("dialog");
    await atendimento.getByLabel("Como foi o contato").selectOption("CALL");
    await atendimento.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(ana.pagina.getByText("Atendimento registrado.")).toBeVisible();

    // 12-14. Sai da fila, o cliente continua acessível, e o refresh prova
    //        que tudo isso veio do servidor.
    await ana.pagina.reload();
    await expect(item(ana.pagina, "Lead Atribuir Posse")).toHaveCount(0);
    await ana.pagina.goto("/app/clientes");
    await expect(
      ana.pagina.getByRole("link", { name: "Lead Atribuir Posse" }).first()
    ).toBeVisible();

    await ana.fechar();
    await gestao.fechar();
  });
});

// -----------------------------------------------------------------------
// Assumir
// -----------------------------------------------------------------------
test.describe("assumir", () => {
  test("um corretor pega o lead para si, e isso não é atendimento", async ({ page }) => {
    await abrirCentral(page, ORG_POSSE_ANA);

    const lead = item(page, "Lead Assumir Posse");
    await expect(lead).toHaveCount(1);
    await expect(lead.getByText("Sem responsável")).toBeVisible();

    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app")),
      lead.getByRole("button", { name: "Assumir" }).click(),
    ]);

    await page.reload();
    const depois = item(page, "Lead Assumir Posse");
    // ASSUMIR NÃO É ATENDER: continua aguardando, agora com dono, e o
    // refresh prova que o estado veio do servidor.
    await expect(depois).toHaveCount(1);
    await expect(depois).toContainText("Ana Posse");
    await expect(depois).toContainText("você");
    // A ação some: não há o que assumir num contato que já é seu.
    await expect(depois.getByRole("button", { name: "Assumir" })).toHaveCount(0);
    // E o atendimento continua pendente — nenhum fato de contato foi
    // inventado pela posse.
    await expect(depois.getByRole("button", { name: "Registrar atendimento" })).toBeVisible();
  });

  test("ASSUMIR NUNCA ROUBA: o colega recebe recusa e o dono não muda", async ({ browser }) => {
    // Bruno não alcança o lead da Ana pela Central (restrita), então a
    // tentativa é feita de onde ela seria possível na vida real: o card
    // não existe para ele. A recusa da action com estado stale é provada
    // no teste de integração, que consegue disparar as duas de verdade.
    const bruno = await comoUsuario(browser, ORG_POSSE_BRUNO);
    await expect(item(bruno.pagina, "Lead Assumir Posse")).toHaveCount(0);
    await bruno.fechar();

    // E o dono continua sendo a Ana.
    const ana = await comoUsuario(browser, ORG_POSSE_ANA);
    await expect(item(ana.pagina, "Lead Assumir Posse")).toContainText("Ana Posse");
    await ana.fechar();
  });
});

// -----------------------------------------------------------------------
// O caso que não tinha solução: contato sem imóvel
// -----------------------------------------------------------------------
test.describe("contato sem imóvel", () => {
  test("ganha dono, é atendido e nenhuma negociação é inventada", async ({ browser }) => {
    const gestao = await comoUsuario(browser, ORG_POSSE);
    const page = gestao.pagina;

    const lead = item(page, "Lead Sem Imovel Posse");
    await expect(lead).toHaveCount(1);
    await expect(lead.getByText("Sem responsável")).toBeVisible();
    // Sem imóvel: nenhum card de imóvel, e "Criar oportunidade" não
    // existe — ela exige propertyId, e é por isso que este contato não
    // tinha nenhum caminho para ter dono antes desta fase.
    await expect(lead.getByRole("button", { name: "Criar oportunidade" })).toHaveCount(0);

    await lead.getByRole("button", { name: "Atribuir a..." }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Responsável pelo contato").selectOption({ label: "Ana Posse" });
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app")),
      dialogo.getByRole("button", { name: "Salvar responsável" }).click(),
    ]);

    // A Ana recebe, abre e atende — tudo sem imóvel nenhum.
    const ana = await comoUsuario(browser, ORG_POSSE_ANA);
    const daAna = item(ana.pagina, "Lead Sem Imovel Posse");
    await expect(daAna).toContainText("Ana Posse");

    await daAna.getByRole("button", { name: "Registrar atendimento" }).click();
    const atendimento = ana.pagina.getByRole("dialog");
    await atendimento.getByLabel("Como foi o contato").selectOption("CALL");
    await atendimento.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(ana.pagina.getByText("Atendimento registrado.")).toBeVisible();

    // Na ficha: nenhuma negociação artificial apareceu.
    await ana.pagina.goto("/app/clientes");
    await ana.pagina.getByRole("link", { name: "Lead Sem Imovel Posse" }).first().click();
    await ana.pagina.waitForURL(/\/app\/clientes\/[^/]+$/);
    await expect(ana.pagina.getByText("Nenhum imóvel relacionado ainda.")).toBeVisible();
    // E a posse está declarada na própria ficha.
    await expect(ana.pagina.getByText("Ana Posse").first()).toBeVisible();

    await ana.fechar();
    await gestao.fechar();
  });
});

// -----------------------------------------------------------------------
// COLLABORATIVE não vira RESTRICTED
// -----------------------------------------------------------------------
test.describe("colaborativa", () => {
  test("ter dono responde 'quem conduz', e não esconde de ninguém", async ({ browser }) => {
    const ana = await comoUsuario(browser, ORG_POSSE_COLAB_ANA);
    const page = ana.pagina;
    const lead = item(page, "Lead Colab Posse");
    await expect(lead.getByText("Sem responsável")).toBeVisible();

    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app")),
      lead.getByRole("button", { name: "Assumir" }).click(),
    ]);
    await page.reload();
    await expect(item(page, "Lead Colab Posse")).toContainText("Ana Colab");

    // BRUNO CONTINUA VENDO — política colaborativa não foi estreitada.
    const bruno = await comoUsuario(browser, ORG_POSSE_COLAB_BRUNO);
    const paraBruno = item(bruno.pagina, "Lead Colab Posse");
    await expect(paraBruno).toHaveCount(1);
    // Mas ele não é o responsável, e a tela diz de quem é.
    await expect(paraBruno).toContainText("Ana Colab");
    await expect(paraBruno).not.toContainText("você");
    // E não há o que assumir: assumir nunca rouba.
    await expect(paraBruno.getByRole("button", { name: "Assumir" })).toHaveCount(0);

    await bruno.fechar();
    await ana.fechar();
  });

  test("um corretor não pode atribuir para outro — isso é autoridade gerencial", async ({
    page,
  }) => {
    await abrirCentral(page, ORG_POSSE_COLAB_BRUNO);
    const lead = item(page, "Lead Colab Posse");
    await expect(lead).toHaveCount(1);
    // O botão não existe para BROKER. Esconder é higiene de interface —
    // quem recusa de verdade é a action, provada na integração.
    await expect(lead.getByRole("button", { name: /Atribuir|Transferir/ })).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// Responsivo
// -----------------------------------------------------------------------
test.describe("responsivo", () => {
  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: card de contato com posse não estoura a tela`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await abrirCentral(page, ORG_POSSE);

      // Contato SEM IMÓVEL e que nenhuma jornada muta: é o card mais
      // estreito e o que mais quebra — nome longo, badge de estado e duas
      // ações na mesma linha — e precisa estar sempre no estado "sem
      // responsável" para as duas ações aparecerem.
      const card = item(page, "Lead Responsivo Posse");
      await expect(card).toHaveCount(1);
      await expect(card.getByText("Sem responsável")).toBeVisible();
      await expect(card.getByRole("button", { name: "Atribuir a..." })).toBeVisible();

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});
