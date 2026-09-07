import { test, expect } from "@playwright/test";
import { ORG_AGENDA, ORG_CENTRAL, login } from "./helpers";

// =======================================================================
// Follow-up comercial (Fase 19)
// =======================================================================
// O ciclo de vida completo roda na Organização da Agenda, que é onde os
// outros specs já criam dados próprios a cada rodada — o cenário é criado
// pelo próprio teste, nunca depende de contagem absoluta de outro spec.
//
// As asserções de CONTAGEM na Central ficam na Org E (dedicada, seed
// determinístico), pelo mesmo motivo estrutural de sempre.
//
// As bordas finas (relógio fixo, atrasado/hoje/futuro, guardas de tipo,
// ausência de Interaction) são provadas por 18 testes unitários e 38 de
// integração. Aqui prova-se o que só o navegador prova: o fluxo real.

const HORARIO_FUTURO = () => {
  // Amanhã às 14:30 no fuso da organização. A Org da Agenda está em UTC
  // (ver prisma/seed-e2e.ts), então o valor do datetime-local é
  // literalmente o horário de parede — sem conversão no teste.
  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${amanha.getUTCFullYear()}-${p2(amanha.getUTCMonth() + 1)}-${p2(
    amanha.getUTCDate()
  )}T14:30`;
};

async function negociacaoNova(page: import("@playwright/test").Page, nome: string) {
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
}

test.describe("ciclo de vida do follow-up", () => {
  test("criar, ver na Agenda e concluir — sem tocar no stage da negociação", async ({ page }) => {
    await login(page, ORG_AGENDA);
    const nome = `Cliente Follow Up ${Date.now()}`;
    await negociacaoNova(page, nome);
    const urlFicha = page.url();

    // A negociação nasce em "Interessado" e é isso que precisa continuar
    // valendo no fim do teste.
    const antes = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(antes).toContain("Interessado");

    // ---- CRIAR ----
    await page.getByRole("button", { name: "Agendar follow-up" }).click();
    await page.getByLabel("O que precisa ser feito").fill("Enviar proposta revisada");
    await page.getByLabel("Data e horário").first().fill(HORARIO_FUTURO());
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
      page.getByRole("button", { name: "Agendar", exact: true }).click(),
    ]);
    await page.reload();

    const comFollowUp = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(comFollowUp).toContain("Follow-up: Enviar proposta revisada");
    // Criar follow-up NÃO avança o stage (agendar visita avançaria).
    expect(comFollowUp).toContain("Interessado");
    expect(comFollowUp).not.toContain("Visita agendada");

    // ---- AGENDA ----
    await page.goto("/app/agenda?aba=proximas");
    const agenda = (await page.locator("main").innerText()).replace(/ /g, " ");
    // O TIPO e o ASSUNTO aparecem em texto, nunca só um ícone.
    expect(agenda).toContain("Follow-up");
    expect(agenda).toContain("Enviar proposta revisada");
    expect(agenda).toContain("14:30");

    // O drawer do follow-up NÃO oferece ações de visita.
    await page
      .getByRole("button", { name: "Ver detalhes" })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Follow-up" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Concluir" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remarcar" })).toHaveCount(0);

    // ---- CONCLUIR ----
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      page.getByRole("button", { name: "Concluir" }).click(),
    ]);

    // Sai das pendências...
    await page.goto("/app/agenda?aba=proximas");
    const depoisAgenda = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(depoisAgenda).not.toContain("Enviar proposta revisada");

    // ...e a negociação continua EXATAMENTE onde estava. Concluir um
    // follow-up não é uma visita realizada.
    await page.goto(urlFicha);
    const depoisFicha = (await page.locator("main").innerText()).replace(/ /g, " ");
    expect(depoisFicha).toContain("Interessado");
    expect(depoisFicha).not.toContain("Visitado");
    // E nenhuma interação foi inventada na timeline.
    expect(depoisFicha).toContain("Nenhuma interação registrada");
  });

  test("o assunto é obrigatório e o formulário diz o fuso do horário", async ({ page }) => {
    await login(page, ORG_AGENDA);
    await negociacaoNova(page, `Cliente Follow Up Val ${Date.now()}`);

    await page.getByRole("button", { name: "Agendar follow-up" }).click();
    // O campo declara o fuso — datetime-local não carrega nenhum.
    await expect(page.getByText("Horário no fuso da organização:").first()).toBeVisible();

    // Campo obrigatório: o navegador barra o envio antes do servidor.
    const assunto = page.getByLabel("O que precisa ser feito");
    await expect(assunto).toHaveAttribute("required", "");
    await expect(assunto).toHaveAttribute("maxlength", "120");
  });

  test("negociação encerrada não oferece follow-up", async ({ page }) => {
    await login(page, ORG_AGENDA);
    const nome = `Cliente Follow Up Fechado ${Date.now()}`;
    await negociacaoNova(page, nome);

    await expect(page.getByRole("button", { name: "Agendar follow-up" })).toBeVisible();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      page.getByRole("button", { name: "Marcar como perdido" }).click(),
    ]);
    await page.reload();

    await expect(page.getByRole("button", { name: "Agendar follow-up" })).toHaveCount(0);
  });
});

test.describe("follow-up na Central de trabalho", () => {
  test("aparece com tipo e assunto, e a negociação deixa de estar sem próximo compromisso", async ({
    page,
  }) => {
    await login(page, ORG_CENTRAL);
    const texto = (await page.locator("main").innerText()).replace(/ /g, " ");

    // O follow-up de hoje entra no bloco HOJE, junto da visita.
    expect(texto).toContain("2 compromissos agendados");
    expect(texto).toContain("Enviar proposta revisada");

    // A negociação do follow-up NÃO é "sem próximo compromisso" — e o
    // próximo é nomeado pelo tipo, não presumido como visita.
    expect(texto).toContain("Follow-up em ");

    // Bloco de HOJE contém o follow-up; o de próximos, o de amanhã.
    const blocoHoje = page
      .getByRole("heading", { name: "Hoje", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(blocoHoje).toContainText("Enviar proposta revisada");
    await expect(blocoHoje).toContainText("Follow-up");
    await expect(blocoHoje).toContainText("Visita");
  });

  test("sem overflow horizontal em 375/390/430/768/1024/1280/1440", async ({ page }) => {
    await login(page, ORG_CENTRAL);

    for (const largura of [375, 390, 430, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      for (const rota of ["/app", "/app/agenda"]) {
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
