import { test, expect } from "@playwright/test";
import { ORG_FUSO, login } from "./helpers";

// =======================================================================
// Fuso horário da organização (Fase 18)
// =======================================================================
// Roda na Organização F, a ÚNICA do seed fora de UTC
// (America/Sao_Paulo) — mesmo motivo estrutural das organizações
// dedicadas C, D e E: aqui se afirmam números absolutos e classificações
// exatas, que ficariam à mercê da ordem de execução em qualquer tenant
// compartilhado (ver prisma/seed-e2e.ts).
//
// O seed cria duas visitas escolhidas para serem INDISTINGUÍVEIS em UTC
// e distintas no calendário de São Paulo:
//
//   "Fuso Fim Do Dia"        hoje   23:30 local  -> HOJE
//   "Fuso Comeco De Amanha"  amanhã 00:15 local  -> PRÓXIMA
//
// Sob a convenção da Fase 17 (UTC literal) as duas cairiam no mesmo
// balde. É exatamente esse defeito que esta fase corrige.
//
// Poucos cenários, fortes: as bordas finas (DST, 23h/25h, milissegundo)
// são provadas por 61 testes unitários e 43 de integração, onde o
// relógio pode ser fixado — um navegador não é o lugar para isso.

test.describe("calendário comercial no fuso da organização", () => {
  test("Central separa fim do dia de começo de amanhã, mesmo sendo o mesmo dia em UTC", async ({
    page,
  }) => {
    await login(page, ORG_FUSO);

    const main = page.locator("main");
    await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
    const texto = (await main.innerText()).replace(/ /g, " ");

    // As duas visitas existem na tela...
    expect(texto).toContain("Fuso Fim Do Dia");
    expect(texto).toContain("Fuso Comeco De Amanha");

    // ... mas em blocos diferentes. "Hoje" tem exatamente uma.
    expect(texto).toContain("1 compromisso agendado");

    // O bloco de HOJE contém a das 23:30 e NÃO a das 00:15.
    const blocoHoje = page
      .getByRole("heading", { name: "Hoje", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(blocoHoje).toContainText("Fuso Fim Do Dia");
    await expect(blocoHoje).not.toContainText("Fuso Comeco De Amanha");

    const blocoProximos = page
      .getByRole("heading", { name: "Próximos compromissos" })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(blocoProximos).toContainText("Fuso Comeco De Amanha");
    await expect(blocoProximos).not.toContainText("Fuso Fim Do Dia");
  });

  test("o horário exibido é o local da organização, nunca o UTC nem o do navegador", async ({
    page,
  }) => {
    await login(page, ORG_FUSO);
    const main = page.locator("main");
    await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
    const texto = (await main.innerText()).replace(/ /g, " ");

    // 23:30 é o horário de parede em São Paulo. Em UTC o mesmo instante
    // seria 02:30 do dia seguinte — se aparecesse assim, a correção não
    // teria chegado à tela.
    expect(texto).toContain("23:30");
    expect(texto).not.toContain("02:30");
  });

  test("Agenda e Central concordam sobre o que é hoje", async ({ page }) => {
    await login(page, ORG_FUSO);
    const central = (await page.locator("main").innerText()).replace(/ /g, " ");
    // A Central afirma 1 compromisso hoje.
    expect(central).toContain("1 compromisso agendado");

    await page.goto("/app/agenda");
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
    const agenda = (await page.locator("main").innerText()).replace(/ /g, " ");

    // A aba Hoje da Agenda mostra a MESMA visita — e não a de amanhã.
    expect(agenda).toContain("Fuso Fim Do Dia");
    expect(agenda).toContain("23:30");
    expect(agenda).not.toContain("Fuso Comeco De Amanha");
  });

  test("o formulário de visita declara em que fuso o horário é lido", async ({ page }) => {
    await login(page, ORG_FUSO);
    await page.goto("/app/agenda");
    await page.getByRole("button", { name: "Ver detalhes" }).first().click();
    await page.getByRole("button", { name: "Remarcar" }).click();

    // O campo datetime-local não carrega fuso nenhum — a tela precisa
    // dizer qual é, ou o horário digitado fica ambíguo.
    await expect(page.getByText("Horário no fuso da organização: São Paulo")).toBeVisible();

    // E o valor pré-preenchido é o horário LOCAL, não o UTC: sem isso o
    // corretor "corrigiria" um horário que já estava certo.
    const valor = await page.locator('input[name="scheduledAt"]').inputValue();
    expect(valor).toMatch(/T23:30$/);
  });
});

test.describe("configurar o fuso", () => {
  test("Configurações mostra o fuso atual e explica para que ele serve", async ({ page }) => {
    await login(page, ORG_FUSO);
    await page.goto("/app/configuracoes");

    // CardTitle do design system renderiza um <div>, não um heading
    // (achado da Fase 17, preservado aqui em vez de alterar o componente
    // compartilhado, o que mexeria em todos os cards do produto).
    await expect(
      page.locator('[data-slot="card-title"]', { hasText: "Fuso horário da organização" })
    ).toBeVisible();
    await expect(
      page.getByText("Usado para Agenda, Central e períodos do Analytics.")
    ).toBeVisible();
    // A promessa que sustenta a fase inteira, dita na tela.
    await expect(
      page.getByText("Alterar o fuso não muda nenhuma data já registrada")
    ).toBeVisible();

    // O seletor traz o valor persistido (IANA) e um rótulo legível.
    const seletor = page.locator("#timezone");
    await expect(seletor).toHaveValue("America/Sao_Paulo");
    await expect(seletor.locator('option[value="America/Sao_Paulo"]')).toHaveText(
      /São Paulo \(UTC−03:00\)/
    );
    // Nenhum offset fixo é oferecido como fuso.
    await expect(seletor.locator('option[value="-03:00"]')).toHaveCount(0);

    // Ninguém precisa digitar um identificador IANA em texto livre.
    await expect(page.locator('input[name="timezone"]')).toHaveCount(0);
  });

  test("nenhuma tela nova: o fuso fica dentro do formulário de Configurações que já existia", async ({
    page,
  }) => {
    await login(page, ORG_FUSO);
    await page.goto("/app/configuracoes");
    // Um único botão de salvar para a página inteira.
    await expect(page.getByRole("button", { name: /Salvar alterações/ })).toHaveCount(1);
    const titulo = (nome: string) => page.locator('[data-slot="card-title"]', { hasText: nome });
    await expect(titulo("Identidade visual")).toBeVisible();
    await expect(titulo("Fuso horário da organização")).toBeVisible();
  });

  test("sem overflow horizontal em 375/390/430/768/1024/1280/1440", async ({ page }) => {
    await login(page, ORG_FUSO);

    for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });

      for (const rota of ["/app", "/app/agenda", "/app/configuracoes"]) {
        await page.goto(rota);
        await expect(page.locator("main")).toBeVisible();
        const rolagemX = await page.evaluate(() => {
          window.scrollTo(9999, 0);
          const x = window.scrollX;
          window.scrollTo(0, 0);
          return x;
        });
        expect(rolagemX, `${rota} rolou ${rolagemX}px em ${largura}px`).toBe(0);
      }
    }
  });
});

// =======================================================================
// Cenário 2 — trocar o fuso da organização
// =======================================================================
// O único teste desta suíte que ESCREVE configuração. Roda por último, na
// organização dedicada, e restaura o valor ao final; o seed também o
// reescreve a cada execução (garantirOrganizacaoComDono faz upsert com
// timezone), então uma falha no meio não contamina a próxima rodada.
test.describe.serial("trocar o fuso reinterpreta o calendário, sem tocar no dado", () => {
  // O formulário de Configurações não exibe mensagem de sucesso — só de
  // erro. O sinal de que gravou é o próprio valor voltar persistido, que
  // é o que se espera aqui em vez de inventar um texto de UI.
  async function salvarFuso(pagina: import("@playwright/test").Page, fuso: string) {
    await pagina.goto("/app/configuracoes");
    await pagina.locator("#timezone").selectOption(fuso);
    await Promise.all([
      pagina.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/app/configuracoes")
      ),
      pagina.getByRole("button", { name: /Salvar alterações/ }).click(),
    ]);
    await pagina.goto("/app/configuracoes");
    await expect(pagina.locator("#timezone")).toHaveValue(fuso);
  }

  test.afterAll(async ({ browser }) => {
    const pagina = await browser.newPage();
    await login(pagina, ORG_FUSO);
    await salvarFuso(pagina, "America/Sao_Paulo");
    await pagina.close();
  });

  test("de São Paulo para UTC: a mesma visita muda de bloco e de horário exibido", async ({
    page,
  }) => {
    await login(page, ORG_FUSO);

    // Estado inicial: 23:30 local, dentro de HOJE.
    let texto = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(texto).toContain("23:30");
    expect(texto).toContain("1 compromisso agendado");

    await salvarFuso(page, "UTC");

    // Sem deploy, sem recarregar nada além da própria navegação: a
    // invalidação da tag do fuso é o que faz a Home refletir na hora.
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
    texto = (await page.locator("main").innerText()).replace(/ /g, " ");

    // O INSTANTE não mudou — mas lido em UTC ele é 02:30 do dia seguinte.
    expect(texto).toContain("02:30");
    expect(texto).not.toContain("23:30");

    // E por isso a visita deixou de pertencer a hoje: ela migrou para
    // "Próximos compromissos". Nenhuma linha foi reescrita para isso.
    const blocoProximos = page
      .getByRole("heading", { name: "Próximos compromissos" })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(blocoProximos).toContainText("Fuso Fim Do Dia");
    expect(texto).toContain("0 compromissos agendados");
  });
});
