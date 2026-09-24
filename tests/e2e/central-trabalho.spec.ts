import { test, expect } from "@playwright/test";
import { ORG_CENTRAL, ORG_B, login } from "./helpers";

// Central de trabalho (Fase 17).
//
// Roda na Organização E, dedicada, porque as asserções são números
// ABSOLUTOS e PESSOAIS — mesmo motivo estrutural de ORG_AGENDA e
// ORG_ANALYTICS (ver prisma/seed-e2e.ts).
//
// Seed determinístico: 1 visita atrasada, 1 visita hoje, 1 visita
// próxima, 1 follow-up hoje e 1 amanhã (Fase 19), 4 negociações do dono
// e 1 de outro corretor.

test.describe("Central de trabalho", () => {
  test("mostra atraso, hoje, próximos e só as minhas negociações", async ({ page }) => {
    await login(page, ORG_CENTRAL);

    const main = page.locator("main");
    const texto = (await main.innerText()).replace(/ /g, " ");

    // ATRASADAS — bloco só existe quando há atraso, e o número é exato.
    await expect(page.getByRole("heading", { name: "Atrasadas" })).toBeVisible();
    expect(texto).toContain("1 compromisso em aberto");
    expect(texto).toContain("Central Atrasada");

    // HOJE
    await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
    expect(texto).toContain("2 compromissos agendados");
    expect(texto).toContain("Central Hoje");

    // PRÓXIMOS
    await expect(page.getByRole("heading", { name: "Próximos compromissos" })).toBeVisible();
    expect(texto).toContain("Central Proxima");
    // Fase 19 — o outro tipo de compromisso aparece com o TIPO e o
    // ASSUNTO em texto, nunca só um ícone.
    expect(texto).toContain("Follow-up");
    expect(texto).toContain("Enviar proposta revisada");

    // MINHAS NEGOCIAÇÕES — três do dono, e a do outro corretor NUNCA.
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toBeVisible();
    expect(texto).toContain("4 negociações em andamento sob sua responsabilidade");
    expect(texto).not.toContain("Central De Outro Corretor");

    // Fato derivado, não julgamento: a negociação sem agenda futura é
    // declarada como tal, e a que tem visita marcada não.
    expect(texto).toContain("Sem próximo compromisso");
    // Fase 19 — o próximo compromisso é NOMEADO pelo tipo: "Com visita
    // agendada" passaria a ser falso para uma negociação cujo próximo
    // compromisso é um follow-up.
    expect(texto).toContain("Visita em ");
    expect(texto).toContain("Follow-up em ");
    // E nenhuma linguagem de score/prioridade inventada.
    expect(texto).not.toContain("Prioridade");
    expect(texto).not.toContain("lead quente");
  });

  test("os itens levam à superfície correta", async ({ page }) => {
    await login(page, ORG_CENTRAL);

    // Clicar no cliente de um compromisso abre a ficha dele.
    await page.getByRole("link", { name: "Central Hoje" }).first().click();
    await page.waitForURL(/\/app\/clientes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Central Hoje" })).toBeVisible();
  });

  test("organização sem CRM não vê a Central, e a Home continua de pé", async ({ page }) => {
    // Org B não tem o módulo CRM: os blocos operacionais somem inteiros,
    // em vez de aparecerem vazios ou quebrarem.
    await login(page, ORG_B);
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Próximos compromissos" })).toHaveCount(0);
    // A visão geral (que não depende de CRM) continua renderizando.
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  });

  for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
    test(`${largura}px: a Home não rola horizontalmente`, async ({ page }) => {
      await login(page, ORG_CENTRAL);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app");
      // A Central continua legível — horário e nome do cliente.
      await expect(page.locator("main")).toContainText("Central Hoje");
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

// =====================================================================
// Fase 65.1 — Agenda e Minhas negociações com hierarquia de seção
// =====================================================================
test.describe("Central de trabalho — seções do novo padrão", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_CENTRAL);
    await page.goto("/app");
  });

  test("existe uma seção Agenda, e Hoje/Próximos vivem dentro dela", async ({ page }) => {
    const titulo = page.getByRole("heading", { name: "Agenda", exact: true });
    await expect(titulo).toBeVisible();
    // Seção (h2), não título de card (h3) — é o nível acima de "Hoje".
    expect(await titulo.evaluate((el) => el.tagName)).toBe("H2");
    await expect(page.getByText("Seus compromissos e próximos atendimentos.")).toBeVisible();

    const secao = titulo.locator("xpath=ancestor::section[1]");
    await expect(secao.getByRole("heading", { name: "Hoje" })).toBeVisible();
    await expect(secao.getByRole("heading", { name: "Próximos compromissos" })).toBeVisible();
  });

  test("Agenda NÃO virou aba — o conteúdo continua visível sem clique", async ({ page }) => {
    // A regra oficial do backoffice: abas só para contextos distintos
    // entre os quais se alterna. O Dashboard é visão consolidada; esconder
    // a agenda obrigaria a clicar para saber se há algo hoje.
    await expect(page.getByRole("tab", { name: "Agenda" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
  });

  test("Minhas negociações é seção e rotula os dois fatos temporais", async ({ page }) => {
    const titulo = page.getByRole("heading", { name: "Minhas negociações" });
    await expect(titulo).toBeVisible();
    expect(await titulo.evaluate((el) => el.tagName)).toBe("H2");
    // Um cabeçalho só para o mesmo conteúdo — o card não repete o título.
    await expect(page.getByRole("heading", { name: "Minhas negociações" })).toHaveCount(1);

    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");
    // A contagem e o critério de ordenação continuam visíveis.
    expect(texto).toContain("4 negociações em andamento sob sua responsabilidade");
    expect(texto).toContain("sem alteração há mais tempo primeiro");

    // Antes era uma frase corrida separada por "·": não dava para saber
    // qual data era qual sem ler tudo. Agora cada fato tem rótulo.
    expect(texto).toContain("Último contato");
    expect(texto).toContain("Próximo compromisso");
    // Os fatos em si não mudaram.
    expect(texto).toContain("Sem próximo compromisso");
    expect(texto).toContain("Visita em ");
  });

  test("nenhuma ação fictícia foi criada nas negociações", async ({ page }) => {
    // Não existe rota por negociação (/app/pipeline é um board, não há
    // /app/pipeline/[id]) — um botão "Ver negociação" seria um destino
    // inventado. A navegação por item continua sendo o nome do cliente.
    await expect(page.getByRole("link", { name: /Ver negociação/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Ver negociação/i })).toHaveCount(0);
  });
});
