import { test, expect, type Page } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// =======================================================================
// Edição cadastral do cliente (Fase 114)
// =======================================================================
// Até esta fase não existia NENHUMA forma de corrigir nome/e-mail/
// telefone/observações de um cliente já cadastrado — achado da Fase 112,
// reconfirmado por grep exaustivo antes de implementar. Este spec cobre a
// jornada real: ficha → "Editar" → alterar → salvar → ficha mostra o
// valor novo, e o caminho de erro (conflito de identificador).

function nomeUnico(prefixo: string) {
  return `${prefixo} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function criarCliente(page: Page, nome: string, extra: { email?: string; telefone?: string } = {}) {
  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nome);
  if (extra.email) await page.getByPlaceholder("E-mail", { exact: true }).fill(extra.email);
  if (extra.telefone) await page.getByPlaceholder("Telefone/WhatsApp").fill(extra.telefone);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nome);
  await page.waitForURL(/search=/);
  await page.getByRole("link", { name: nome }).click();
  await page.waitForURL(/\/app\/clientes\/[^/?]+$/);
}

test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

test.describe("Fase 114 — editar dados cadastrais do cliente", () => {
  test("editar nome e e-mail: a ficha reflete os novos valores depois de salvar", async ({ page }) => {
    const nomeOriginal = nomeUnico("Cliente Editável");
    await criarCliente(page, nomeOriginal);

    await page.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar cliente" });
    await expect(dialogo).toBeVisible();

    const nomeNovo = `${nomeOriginal} — corrigido`;
    await dialogo.getByLabel("Nome").fill(nomeNovo);
    await dialogo.getByLabel("E-mail").fill("corrigido@email-teste.com");
    await dialogo.getByRole("button", { name: "Salvar" }).click();

    await expect(dialogo).not.toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: nomeNovo })).toBeVisible();
    await expect(page.getByText("corrigido@email-teste.com")).toBeVisible();
  });

  test("fechar sem salvar preserva o valor anterior", async ({ page }) => {
    const nome = nomeUnico("Cliente Sem Salvar");
    await criarCliente(page, nome);

    await page.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar cliente" });
    await dialogo.getByLabel("Nome").fill("Isto não deve ser salvo");
    await dialogo.getByRole("button", { name: "Fechar" }).click();

    await expect(dialogo).not.toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
  });

  test("conflito de e-mail mostra erro compreensível, sem recarregar a página com dado perdido", async ({
    page,
  }) => {
    const emailOcupado = `ocupado-${Date.now()}@email-teste.com`;
    await criarCliente(page, nomeUnico("Cliente Dono do E-mail"), { email: emailOcupado });

    const nomeAlvo = nomeUnico("Cliente Tentando o Mesmo E-mail");
    await criarCliente(page, nomeAlvo);

    await page.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar cliente" });
    await dialogo.getByLabel("E-mail").fill(emailOcupado);
    await dialogo.getByRole("button", { name: "Salvar" }).click();

    await expect(dialogo.getByText(/já existe/i)).toBeVisible();
    // O diálogo continua aberto, com o nome ainda correto — nada foi
    // perdido nem a edição "resolveu" para o outro cliente.
    await expect(dialogo.getByLabel("Nome")).toHaveValue(nomeAlvo);
  });

  test("teclado: o campo Nome é alcançável e editável sem mouse, e Escape fecha o diálogo", async ({
    page,
  }) => {
    const nome = nomeUnico("Cliente Teclado");
    await criarCliente(page, nome);

    await page.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar cliente" });
    await dialogo.getByLabel("Nome").focus();
    await page.keyboard.type(" (editado por teclado)");
    await expect(dialogo.getByLabel("Nome")).toHaveValue(`${nome} (editado por teclado)`);

    await page.keyboard.press("Escape");
    await expect(dialogo).not.toBeVisible();
  });

  test("390px: o diálogo de edição não estoura a tela", async ({ page }) => {
    const nome = nomeUnico("Cliente Mobile");
    await criarCliente(page, nome);
    // Redimensiona DEPOIS de criar/navegar — a criação passa pela busca
    // global, que em 390px tem comportamento próprio já coberto por
    // outros specs; o que esta teste prova é só o diálogo em si.
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar cliente" });
    await expect(dialogo).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
