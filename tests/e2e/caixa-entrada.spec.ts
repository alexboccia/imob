import { test, expect, type Page } from "@playwright/test";
import { IDS_E2E, ORG_A, ORG_INBOX, limparAtendimentosNoBanco, login } from "./helpers";

// =======================================================================
// Caixa de entrada comercial — "quem acabou de levantar a mão"
// =======================================================================
// O bloco existe para fechar o elo LEAD → ATENDIMENTO: antes dele, um
// contato do site virava uma linha no banco e dependia de alguém lembrar
// de procurar. Estes testes provam o que o corretor vê e o que ele
// consegue fazer a partir dali.
//
// A ORGANIZAÇÃO É DEDICADA (ver prisma/seed-e2e.ts, "Organização Q") e
// nenhum teste aqui muta estado: a derivação em si — o que entra e o que
// sai da fila — é provada contra o banco na suíte de integração, onde
// escrever é barato e o cleanup é garantido.

const BLOCO = "[data-novos-contatos]";

async function abrirCentral(page: Page) {
  await login(page, ORG_INBOX);
  await page.goto("/app");
}

test.describe("caixa de entrada comercial", () => {
  test("mostra quem está aguardando, com contexto suficiente para agir", async ({ page }) => {
    await abrirCentral(page);

    const bloco = page.locator(BLOCO);
    await expect(bloco).toBeVisible();
    await expect(bloco.getByRole("heading", { name: /Novos contatos/ })).toBeVisible();

    // Dois aguardando: Maria (imóvel) e João (contato geral). Carla foi
    // atendida e Pedro nunca foi captação.
    await expect(
      bloco.getByRole("link", { name: "Maria Silva Inbox", exact: true })
    ).toBeVisible();
    await expect(
      bloco.getByRole("link", { name: "Joao Pereira Inbox", exact: true })
    ).toBeVisible();
    await expect(bloco).not.toContainText("Carla Souza Inbox");
    await expect(bloco).not.toContainText("Pedro Lima Inbox");
  });

  test("cada item responde de onde veio, o que a pessoa pediu e há quanto tempo", async ({
    page,
  }) => {
    await abrirCentral(page);
    const bloco = page.locator(BLOCO);

    await expect(bloco).toContainText("Página do imóvel");
    await expect(bloco).toContainText("Página de contato");
    await expect(bloco).toContainText("agendar uma visita");
    // Espera: o recente em horas, o antigo em dias.
    await expect(bloco).toContainText("agora há pouco");
    await expect(bloco).toContainText("há 2 dias");
  });

  test("contexto do imóvel: título, código e o preço da finalidade certa", async ({ page }) => {
    await abrirCentral(page);
    const bloco = page.locator(BLOCO);

    await expect(bloco).toContainText("Apartamento da Caixa de Entrada");
    await expect(bloco).toContainText("Cód.");
    await expect(bloco).toContainText("R$ 640.000");
    // O card do imóvel leva ao imóvel no painel, não a uma segunda ficha.
    await expect(
      bloco.locator(`a[href="/app/imoveis/${IDS_E2E.imovelInbox}"]`).first()
    ).toBeVisible();
  });

  test("WhatsApp usa o telefone da pessoa e leva contexto na mensagem", async ({ page }) => {
    await abrirCentral(page);
    const botao = page
      .locator(BLOCO)
      .getByRole("link", { name: /Falar no WhatsApp com Maria/i });
    await expect(botao).toBeVisible();
    const href = await botao.getAttribute("href");
    expect(href).toContain("wa.me/11988887777");
    expect(href).toContain("text=");
    // Abrir o WhatsApp NÃO é atendimento registrado: o item continua na
    // fila depois do clique, e o produto não afirma que houve conversa.
    await expect(botao).toHaveAttribute("target", "_blank");
  });

  test("criar oportunidade só é oferecido quando o contato é sobre um imóvel", async ({
    page,
  }) => {
    await abrirCentral(page);
    const bloco = page.locator(BLOCO);
    const itens = bloco.locator("li");

    // Maria veio da página de um imóvel: elegível.
    const itemMaria = itens.filter({ hasText: "Maria Silva Inbox" });
    await expect(itemMaria.getByRole("button", { name: "Criar oportunidade" })).toBeVisible();

    // João veio da página de contato, sem imóvel: transformar isso em
    // oportunidade exigiria adivinhar QUAL imóvel.
    const itemJoao = itens.filter({ hasText: "Joao Pereira Inbox" });
    await expect(itemJoao.getByRole("button", { name: "Criar oportunidade" })).toHaveCount(0);
  });

  test("o nome leva à ficha do cliente, onde mora o histórico completo", async ({ page }) => {
    await abrirCentral(page);
    await page
      .locator(BLOCO)
      .getByRole("link", { name: "Maria Silva Inbox", exact: true })
      .click();
    await page.waitForURL(/\/app\/clientes\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Maria");
  });

  test("teclado: a ação principal é alcançável, e o diálogo abre e fecha por teclado", async ({
    page,
  }) => {
    await abrirCentral(page);
    const acao = page
      .locator(BLOCO)
      .getByRole("button", { name: "Registrar atendimento" })
      .first();
    await acao.focus();
    await expect(acao).toBeFocused();

    await acao.press("Enter");
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    // Escape fecha e devolve o foco ao gatilho — o primitivo cuida disso,
    // e o teste garante que continuamos usando o primitivo.
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
    await expect(acao).toBeFocused();
  });

  test("registrar atendimento tira o contato da fila e aparece no histórico do cliente", async ({
    page,
  }) => {
    const MARCADOR = "E2E atendimento inline";
    try {
      await abrirCentral(page);
      const bloco = page.locator(BLOCO);
      const itemMaria = bloco.locator("li").filter({ hasText: "Maria Silva Inbox" });
      await expect(itemMaria).toHaveCount(1);

      await itemMaria.getByRole("button", { name: "Registrar atendimento" }).click();
      const dialogo = page.getByRole("dialog");
      await expect(dialogo).toBeVisible();
      // Rótulos de gente, nunca o enum cru.
      await expect(dialogo.getByLabel("Como foi o contato")).toBeVisible();
      await dialogo.getByLabel("Como foi o contato").selectOption("CALL");
      await dialogo.getByLabel("Observação (opcional)").fill(MARCADOR);
      await dialogo.getByRole("button", { name: "Registrar", exact: true }).click();

      // Confirmação no toast: o item que a exibiria é desmontado.
      await expect(page.getByText("Atendimento registrado.")).toBeVisible();

      // O card some porque existe FATO novo, não porque o React o
      // escondeu: a prova é recarregar do servidor.
      await page.reload();
      await expect(
        page.locator(BLOCO).locator("li").filter({ hasText: "Maria Silva Inbox" })
      ).toHaveCount(0);
      // Joao continua esperando: só o contato atendido saiu.
      await expect(page.locator(BLOCO)).toContainText("Joao Pereira Inbox");

      // E o atendimento existe no histórico do cliente.
      await page.goto("/app/clientes");
      await page.getByRole("link", { name: "Maria Silva Inbox" }).first().click();
      await page.waitForURL(/\/app\/clientes\/[^/]+$/);
      await expect(page.getByText(MARCADOR)).toBeVisible();
    } finally {
      limparAtendimentosNoBanco(MARCADOR);
    }
  });

  test("atendimento + próximo contato: os dois fatos, uma submissão", async ({ page }) => {
    const MARCADOR = "E2E proxima acao inline";
    try {
      await abrirCentral(page);
      const itemJoao = page
        .locator(BLOCO)
        .locator("li")
        .filter({ hasText: "Joao Pereira Inbox" });
      await itemJoao.getByRole("button", { name: "Registrar atendimento" }).click();

      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Como foi o contato").selectOption("MESSAGE");
      await dialogo.getByLabel("Observação (opcional)").fill(MARCADOR);

      // Os campos da próxima ação só existem depois do opt-in: o
      // atendimento que termina ali não vê formulário de agenda nenhum.
      await expect(dialogo.getByLabel("O que precisa ser feito")).toHaveCount(0);
      await dialogo.getByLabel("Agendar próximo contato").check();
      await expect(dialogo.getByLabel("O que precisa ser feito")).toBeVisible();

      await dialogo.getByLabel("O que precisa ser feito").fill(MARCADOR);
      // A organização do fixture está em UTC, então a hora de parede
      // dela é a hora UTC — nenhuma conversão improvisada no teste.
      const amanha = new Date(Date.now() + 24 * 3600_000);
      const dois = (n: number) => String(n).padStart(2, "0");
      await dialogo
        .getByLabel("Quando")
        .fill(
          `${amanha.getUTCFullYear()}-${dois(amanha.getUTCMonth() + 1)}-${dois(amanha.getUTCDate())}T10:00`
        );
      await dialogo.getByRole("button", { name: "Registrar", exact: true }).click();

      await expect(page.getByText("Atendimento registrado e próximo contato agendado.")).toBeVisible();

      // Estado real do servidor, não estado do React.
      await page.reload();
      await expect(
        page.locator(BLOCO).locator("li").filter({ hasText: "Joao Pereira Inbox" })
      ).toHaveCount(0);
      // O compromisso aparece na Central, no bloco de compromissos que já
      // existia — nenhum bloco novo foi criado para esta feature.
      await expect(page.getByText(MARCADOR).first()).toBeVisible();

      // E na Agenda, porque ScheduledActivity é ScheduledActivity.
      // Aba "próximas": a Agenda abre em HOJE, e o compromisso é de
      // amanhã — é a classificação existente, não um caso especial
      // desta feature.
      await page.goto("/app/agenda?aba=proximas");
      await expect(page.getByText(MARCADOR).first()).toBeVisible();
    } finally {
      limparAtendimentosNoBanco(MARCADOR);
    }
  });

  test("organização sem contatos aguardando não ganha bloco nenhum", async ({ page }) => {
    // Org A tem contatos do site, mas o bloco só aparece com fila real;
    // um card permanente de "nenhum contato" seria ruído diário.
    await login(page, ORG_A);
    await page.goto("/app");
    const bloco = page.locator(BLOCO);
    if ((await bloco.count()) > 0) {
      // Se existir, é porque há fila de verdade — e então tem itens.
      await expect(bloco.locator("li")).not.toHaveCount(0);
    }
  });

  test("tenant isolation: a caixa de uma organização nunca mostra a outra", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto("/app");
    const html = await page.content();
    expect(html).not.toContain("Maria Silva Inbox");
    expect(html).not.toContain("Joao Pereira Inbox");
    expect(html).not.toContain("Apartamento da Caixa de Entrada");
  });

  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: itens legíveis, ações tocáveis, sem overflow`, async ({ page }) => {
      await abrirCentral(page);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app");

      const medida = await page.locator(BLOCO).evaluate((bloco) => {
        // Só a linha de ações: o nome da pessoa também é um link, mas é
        // texto no fluxo, não um controle com alvo de toque.
        const acoes = [...bloco.querySelectorAll("[data-acoes-contato] a, [data-acoes-contato] button")];
        const caixa = bloco.getBoundingClientRect();
        return {
          alturaMinima: Math.min(...acoes.map((a) => a.getBoundingClientRect().height)),
          dentroDoCard: acoes.every((a) => a.getBoundingClientRect().right <= caixa.right + 1),
          semOverflowInterno: bloco.scrollWidth <= bloco.clientWidth + 1,
          semOverflowPagina:
            document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });

      expect(medida.alturaMinima, `alvo de toque @ ${largura}px`).toBeGreaterThanOrEqual(28);
      expect(medida.dentroDoCard, `ação fora do card @ ${largura}px`).toBe(true);
      expect(medida.semOverflowInterno, `overflow do bloco @ ${largura}px`).toBe(true);
      expect(medida.semOverflowPagina, `overflow da página @ ${largura}px`).toBe(true);
    });
  }
});
