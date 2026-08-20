import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Redesenho do Pipeline — fluxo completo: cria um cliente, relaciona um
// imóvel (RelacionarImovelForm, já existente — cria um PropertyInterest
// real stage=INTERESTED), confirma que o card aparece na etapa certa do
// Kanban, exercita filtro de prioridade e busca, abre o drawer da
// negociação, move de etapa, fecha como ganho, e confirma que aparece em
// "Encerradas". Nomes com timestamp pra nunca colidir entre execuções
// (Person só é limpa no global-setup, não entre specs).
test.describe("Pipeline", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
  });

  test("KPIs renderizam, card aparece na etapa certa, filtro de prioridade, busca, abre negociação, move etapa, marca como ganho", async ({
    page,
  }) => {
    const nomeUnico = `Cliente Pipeline E2E ${Date.now()}`;
    // Telefone também precisa ser único por organização
    // (@@unique([organizationId, phoneNormalized]) em Person) — um valor
    // fixo colidiria com o cliente que clientes.spec.ts já cria na mesma
    // ORG_A, dentro da mesma rodada de E2E (Person só é limpa no
    // global-setup do seed, não entre specs).
    const telefoneUnico = `119${String(Date.now()).slice(-8)}`;

    // Cria o cliente e relaciona o imóvel seedado (mesmo fluxo real do
    // produto — sem seed extra, sem atalho de banco).
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
    await page.getByPlaceholder("Telefone/WhatsApp").fill(telefoneUnico);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nomeUnico);
    await page.waitForURL(/search=/);
    await page.getByRole("row", { name: new RegExp(nomeUnico) }).getByText("Novo lead").click();
    await page
      .locator('[data-slot="sheet-content"]')
      .filter({ hasText: nomeUnico })
      .getByRole("button", { name: "Ver perfil completo" })
      .click();
    await page.waitForURL(/\/app\/clientes\/.+/);

    // Título capturado dinamicamente (não fixo): o imóvel seedado
    // (IDS_E2E.imovelParaEditarOrgA) é compartilhado com
    // imoveis.spec.ts, que pode já ter renomeado seu título ("Apartamento
    // E2E editado com sucesso") antes deste spec rodar na mesma execução
    // — Property não é limpa entre specs, só Person.
    await page.getByRole("combobox", { name: "Imóvel" }).click();
    const opcaoImovel = page.getByRole("option", { name: /^Apartamento E2E/ });
    const tituloImovel = (await opcaoImovel.textContent()) ?? "Apartamento E2E";
    await opcaoImovel.click();
    await page.getByRole("button", { name: "Relacionar imóvel" }).click();
    await expect(page.getByText(tituloImovel)).toBeVisible();

    // KPIs — sempre renderizam, mesmo antes de checar o card.
    await page.goto("/app/pipeline");
    await expect(page.getByText("Em andamento", { exact: true })).toBeVisible();
    await expect(page.getByText("Ganhos", { exact: true })).toBeVisible();
    await expect(page.getByText("Perdidos", { exact: true })).toBeVisible();
    await expect(page.getByText("Taxa de ganho", { exact: true })).toBeVisible();

    // Card aparece na coluna "Interessado" (stage inicial de
    // criarInteressePessoa), não em nenhuma outra.
    const colunaInteressado = page.locator("h2", { hasText: "Interessado" }).locator("..");
    const card = colunaInteressado.locator("div", { hasText: nomeUnico }).last();
    await expect(card).toBeVisible();
    await expect(card.getByText(tituloImovel)).toBeVisible();
    await expect(card.getByText("Centro")).toBeVisible();

    // Filtro de prioridade — negociação recém-criada, sem visita/aging
    // relevante, classifica como NORMAL (Fase P.8) — some do filtro "Alta",
    // continua no filtro "Normal".
    await page.getByRole("link", { name: /^Alta \(\d+\)$/ }).click();
    await expect(page.getByText(nomeUnico)).not.toBeVisible();
    await page.getByRole("link", { name: /^Normal \(\d+\)$/ }).click();
    await expect(page.getByText(nomeUnico)).toBeVisible();
    await page.getByRole("link", { name: /^Todas \(\d+\)$/ }).click();

    // Busca — sem resultado pra um nome inexistente, com resultado pro
    // nome real.
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill("Nome Que Nunca Existe Zzz");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("Nenhuma negociação encontrada com estes filtros.")).toBeVisible();
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill(nomeUnico);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(nomeUnico)).toBeVisible();

    // Abre a negociação — drawer mostra os mesmos dados do card, fecha via
    // Esc (mesmo padrão do ClienteDrawer).
    await page.getByRole("button", { name: "Abrir negociação" }).click();
    const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: nomeUnico });
    await expect(drawer.getByRole("heading", { name: nomeUnico })).toBeVisible();
    await expect(drawer.getByText(tituloImovel)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer.getByRole("heading", { name: nomeUnico })).not.toBeVisible();

    // Move de etapa direto pelo card (MoverEstagioPipeline) — mesma Server
    // Action de sempre (atualizarEstagioInteresse), sem nova regra.
    const cardAtual = page.locator("div", { hasText: nomeUnico }).filter({ has: page.getByRole("button", { name: "Mover" }) });
    await cardAtual.getByRole("combobox", { name: "Mover para outra etapa" }).click();
    await page.getByRole("option", { name: "Visita agendada" }).click();
    await cardAtual.getByRole("button", { name: "Mover" }).click();
    await expect(page.getByText("Movendo...")).not.toBeVisible();

    const colunaVisita = page.locator("h2", { hasText: "Visita agendada" }).locator("..");
    await expect(colunaVisita.getByText(nomeUnico)).toBeVisible();

    // Marca como ganho — dentro do drawer (FechamentoInteresse), some do
    // Kanban "Em andamento" e passa a aparecer em "Encerradas".
    await page.getByRole("button", { name: "Abrir negociação" }).click();
    const drawerGanho = page.locator('[data-slot="sheet-content"]').filter({ hasText: nomeUnico });
    await drawerGanho.getByRole("button", { name: "Marcar como ganho" }).click();
    await expect(drawerGanho.getByText("Salvando...")).not.toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");

    await expect(page.getByText(nomeUnico)).not.toBeVisible();

    // A troca de aba preserva a busca ativa (mesmo comportamento de
    // sempre) — "Encerradas" já chega filtrada só pra este cliente.
    await page.getByRole("link", { name: /^Encerradas$/ }).click();
    await expect(page.getByText(nomeUnico)).toBeVisible();
    await expect(page.getByText(/^Ganho — Fechado em/)).toBeVisible();
  });

  // Estados vazios — filtro/busca sem nenhum resultado, independente de
  // quantas negociações já existam de execuções anteriores (Person/
  // PropertyInterest só são limpos no global-setup do seed, não entre
  // specs) — busca por um nome que nunca existiria é determinístico
  // independente da ordem de execução dos testes.
  test("estados vazios: busca sem resultado mostra mensagem neutra, sem erro", async ({ page }) => {
    await page.goto("/app/pipeline");
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill("Nome Que Nunca Existe Zzz Vazio");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("Nenhuma negociação encontrada com estes filtros.")).toBeVisible();

    await page.getByRole("link", { name: /^Encerradas$/ }).click();
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill("Nome Que Nunca Existe Zzz Vazio");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("Nenhuma negociação encontrada com estes filtros.")).toBeVisible();
  });

  // Mobile 375px — sem overflow horizontal do documento, mesmo critério de
  // tests/e2e/mobile-nav.spec.ts.
  test("375px: sem overflow horizontal do documento", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/app/pipeline");
    const semOverflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflowHorizontal).toBe(true);

    await page.getByRole("link", { name: /^Encerradas$/ }).click();
    const semOverflowEncerradas = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflowEncerradas).toBe(true);
  });
});
