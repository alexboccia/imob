import { test, expect, type Page } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// =======================================================================
// Clientes compatíveis → Relacionar (jornada reversa, Fase 80)
// =======================================================================
// A Fase 78 já provou, do lado do CLIENTE, que "Relacionar" numa
// recomendação cria/reusa o mesmo PropertyInterest e aparece em Imóveis
// relacionados (tests/e2e/relacionar-imovel-cliente.spec.ts). Este
// arquivo prova a direção oposta, que nunca tinha cobertura E2E: da
// FICHA DO IMÓVEL, "Relacionar cliente" numa recomendação de "Clientes
// compatíveis" usa a MESMA Server Action (criarInteressePessoa) e produz
// exatamente o mesmo efeito — aparece em "Clientes interessados" (agora
// via InteresseImovelItem) e no Pipeline, sem duplicar a negociação.

function nomeUnico(prefixo: string) {
  return `${prefixo} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function criarImovelDisponivel(page: Page, titulo: string) {
  await page.goto("/app/imoveis/novo");
  await page.locator("#titulo").fill(titulo);
  await page.locator('input[name="bairro"]').fill("Bairro E2E Reverso");
  // "São Paulo" — cidade real do seed da Org A (achado da Fase 77:
  // cidade inédita vaza pra buscarSugestoesLocalizacao e afeta outros
  // specs que assumem o conjunto fechado de cidades da Org A).
  await page.locator('input[name="cidade"]').fill("São Paulo");
  await page.locator('select[name="estado"]').selectOption("SP");
  await page.locator("#preco").fill(String(500_000 * 100)); // CampoMoeda: dígitos x 100
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Disponível" }).click();
  await page.getByRole("button", { name: "Salvar imóvel" }).click();
  await page.waitForURL(/\/app\/imoveis\/[^/]+\?salvo=1/);
  return page.url().split("?")[0];
}

async function criarClienteComPreferenciaCompativel(page: Page, nome: string) {
  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nome);
  await page.waitForURL(/search=/);
  await page.getByRole("link", { name: nome }).click();
  await page.waitForURL(/\/app\/clientes\/[^/?]+$/);
  const personId = page.url().split("/").pop()!;

  await page.getByRole("button", { name: "Adicionar preferências" }).click();
  await page.getByRole("combobox", { name: "Finalidade" }).click();
  await page.getByRole("option", { name: "Comprar" }).click();
  await page.getByLabel("Cidades", { exact: true }).fill("São Paulo");
  await page.keyboard.press("Enter");
  await page.locator("#minPrice").fill(String(400_000 * 100));
  await page.locator("#maxPrice").fill(String(600_000 * 100));
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/clientes/")),
    page.getByRole("button", { name: "Salvar preferências" }).click(),
  ]);
  return personId;
}

test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

test.describe("estados vazios", () => {
  test("imóvel novo, sem interessado, mostra o estado vazio de Clientes interessados", async ({
    page,
  }) => {
    // Só "Clientes interessados" é verificado aqui: um imóvel recém-criado
    // tem garantidamente ZERO PropertyInterest. "Clientes compatíveis"
    // depende de QUAIS PersonPreference já existem na Org A compartilhada
    // (outros specs desta suíte criam várias, algumas com a mesma cidade/
    // faixa de preço de propósito) — testar esse estado vazio de forma
    // confiável exigiria uma organização dedicada só para isso, e a
    // distinção "sem preferência na org" vs. "preferências existem mas
    // nenhuma bate" já é exaustivamente provada a nível de integração em
    // tests/integration/property-matching-reverso.test.ts (AQ/AR/AS).
    const titulo = `Imóvel Sem Interesse E2E ${Date.now()}`;
    const url = await criarImovelDisponivel(page, titulo);
    await page.goto(url);

    const secaoInteressados = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Clientes interessados" }),
    });
    await expect(secaoInteressados.getByText("Nenhum cliente relacionado a este imóvel ainda.")).toBeVisible();
  });
});

test.describe("jornada reversa: imóvel → cliente compatível → Relacionar", () => {
  test("'Relacionar cliente' cria o PropertyInterest, aparece em Clientes interessados e no Pipeline, e para de oferecer a ação", async ({
    page,
  }) => {
    const titulo = `Imóvel Reverso E2E ${Date.now()}`;
    const url = await criarImovelDisponivel(page, titulo);

    const nomeCliente = nomeUnico("Cliente Reverso");
    await criarClienteComPreferenciaCompativel(page, nomeCliente);

    await page.goto(url);
    const secaoCompativeis = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Clientes compatíveis" }),
    });
    const linhaCompativel = secaoCompativeis.locator("li").filter({ hasText: nomeCliente });
    await expect(linhaCompativel).toBeVisible();
    await expect(linhaCompativel.getByRole("button", { name: "Relacionar cliente" })).toBeVisible();

    // A ação real: MESMA Server Action de criarInteressePessoa usada do
    // lado do cliente (Fase 78) — aqui chamada com o personId da
    // recomendação, não com um id vindo de fora.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app/imoveis/")),
      linhaCompativel.getByRole("button", { name: "Relacionar cliente" }).click(),
    ]);
    await page.reload();

    // A recomendação não oferece mais a ação — estado reflete a
    // realidade, mesma regra já provada do lado do cliente.
    const linhaCompativelDepois = secaoCompativeis.locator("li").filter({ hasText: nomeCliente });
    await expect(linhaCompativelDepois.getByRole("button", { name: "Relacionar cliente" })).toHaveCount(0);
    await expect(linhaCompativelDepois.getByText(/Já relacionado/)).toBeVisible();

    // Aparece em "Clientes interessados" — mesmo registro, agora via
    // InteresseImovelItem (Fase 80).
    const secaoInteressados = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Clientes interessados" }),
    });
    const cardInteressado = secaoInteressados
      .locator('[data-slot="card"]')
      .filter({ hasText: nomeCliente });
    await expect(cardInteressado).toBeVisible();
    await expect(cardInteressado.getByText("Interessado")).toBeVisible();
    // Fase 92 — mesma linha do lado do imóvel: InteresseImovelItem é
    // compartilhado entre as duas fichas.
    await expect(cardInteressado.getByText(/Criada em/)).toBeVisible();

    // Só UM PropertyInterest — nenhuma duplicidade visível na lista.
    await expect(
      secaoInteressados.locator('[data-slot="card"]').filter({ hasText: nomeCliente })
    ).toHaveCount(1);

    // E a mesma negociação aparece no Pipeline (Fase P.4, projeção
    // operacional de PropertyInterest — nunca uma segunda fonte de
    // verdade), sem nenhum código de integração novo.
    await page.goto("/app/pipeline");
    await expect(page.getByText(nomeCliente).first()).toBeVisible();
  });
});
