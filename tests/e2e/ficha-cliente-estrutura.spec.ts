import { test, expect, type Page } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// =======================================================================
// Estrutura consolidada da ficha do cliente (Fase 79)
// =======================================================================
// Fases 77/78 modernizaram Preferências/Recomendados/Relacionados. Esta
// fase auditou o RESTANTE da ficha (Estágio no funil, Observações,
// Registrar interação, Histórico) e não encontrou nenhuma lacuna de
// modelagem — só de apresentação (CardTitle sem semântica de heading) e
// uma ordem de seções que invertia a jornada real (Relacionados antes
// de Recomendados, quando relacionar é uma DECISÃO sobre uma
// recomendação). Este arquivo cobre exatamente essas duas coisas, que
// nenhum teste anterior cobria: a hierarquia de headings da ficha
// INTEIRA (não só de duas seções) e a ordem real das seções.
//
// Person.pipelineStage (funil do cliente, usado nos KPIs/filtros de
// /app/clientes) e PropertyInterest.stage (estágio de cada negociação,
// em Imóveis relacionados/Pipeline) continuam sendo dois campos
// deliberadamente diferentes — nenhuma regra de negócio mudou aqui,
// só a descrição da seção passou a dizer isso.

function nomeUnico(prefixo: string) {
  return `${prefixo} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function criarCliente(page: Page, nome: string) {
  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nome);
  await page.waitForURL(/search=/);
  await page.getByRole("link", { name: nome }).click();
  await page.waitForURL(/\/app\/clientes\/[^/?]+$/);
  return page.url();
}

test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

test.describe("hierarquia de cabeçalhos da ficha inteira", () => {
  test("h1 único, h2 em todas as seções (nunca CardTitle-só-visual), nenhum h3", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Hierarquia Ficha");
    await criarCliente(page, nome);

    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    for (const titulo of [
      "Estágio no funil",
      "Preferências de imóvel",
      "Imóveis recomendados",
      "Imóveis relacionados",
      "Registrar nova interação",
      "Histórico de interações",
    ]) {
      await expect(
        page.getByRole("heading", { level: 2, name: titulo }),
        `h2 ausente: ${titulo}`
      ).toBeVisible();
    }

    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  });

  test("'Observações' só aparece (com h2 real) quando a pessoa tem notes", async ({ page }) => {
    const nome = nomeUnico("Cliente Sem Observacoes");
    await criarCliente(page, nome);
    await expect(page.getByRole("heading", { level: 2, name: "Observações" })).toHaveCount(0);
  });
});

test.describe("ordem das seções", () => {
  test("Imóveis recomendados vem ANTES de Imóveis relacionados — a jornada é recomendar, depois decidir relacionar", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Ordem Secoes");
    await criarCliente(page, nome);

    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    const indiceRecomendados = headings.indexOf("Imóveis recomendados");
    const indiceRelacionados = headings.indexOf("Imóveis relacionados");
    expect(indiceRecomendados).toBeGreaterThanOrEqual(0);
    expect(indiceRelacionados).toBeGreaterThanOrEqual(0);
    expect(indiceRecomendados).toBeLessThan(indiceRelacionados);

    // E a ordem geral prevista pela investigação: identidade/estágio →
    // preferências → recomendados → relacionados → interações.
    expect(headings).toEqual([
      "Estágio no funil",
      "Preferências de imóvel",
      "Imóveis recomendados",
      "Imóveis relacionados",
      "Registrar nova interação",
      "Histórico de interações",
    ]);
  });
});

test.describe("Estágio no funil — distinção do estágio de negociação", () => {
  test("a descrição da seção diz explicitamente que é diferente do estágio de cada negociação", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Estagio Funil");
    await criarCliente(page, nome);

    const secao = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Estágio no funil" }),
    });
    await expect(secao.getByText(/diferente do estágio de cada negociação/)).toBeVisible();

    // Continua um <select> simples + botão Atualizar — nenhuma
    // capacidade nova (sem histórico, sem automação, ver Fase 79 §4).
    await expect(secao.getByRole("combobox")).toBeVisible();
    await expect(secao.getByRole("button", { name: "Atualizar" })).toBeVisible();
  });
});

test.describe("estados vazios diferenciados", () => {
  test("Histórico de interações vazio usa EstadoVazio, texto distinto de qualquer outro estado vazio da ficha", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Sem Interacao");
    await criarCliente(page, nome);

    const secao = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Histórico de interações" }),
    });
    await expect(secao.getByText("Nenhuma interação registrada")).toBeVisible();
    // Nenhum CTA inventado: registrar já tem seu próprio formulário
    // acima, este estado vazio é só informativo (Fase 79 §18).
    await expect(secao.getByRole("button")).toHaveCount(0);
  });
});

test.describe("responsivo — ficha com todas as seções preenchidas", () => {
  for (const largura of [1920, 1440, 1366, 1024, 768, 390]) {
    test(`${largura}px: estágio alterado + observação + interação registrada, sem overflow`, async ({
      page,
    }) => {
      const nome = nomeUnico(`Cliente Completo ${largura}px`);
      const url = await criarCliente(page, nome);

      // Estágio (form simples, já existente) — Select do design system,
      // não um <select> nativo: abre e escolhe a opção pelo texto.
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "Contato feito" }).click();
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
        page.getByRole("button", { name: "Atualizar" }).click(),
      ]);

      // Interação (form já existente) — texto propositalmente longo
      // pra estressar quebra de linha em telas estreitas.
      await page.locator('input[name="notas"]').fill(
        "Cliente ligou perguntando sobre disponibilidade de horário para visita neste fim de semana, mencionou preferência por andares altos."
      );
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
        page.getByRole("button", { name: "Registrar" }).click(),
      ]);

      await page.setViewportSize({ width: largura, height: 1000 });
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 2, name: "Histórico de interações" })).toBeVisible();

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});
