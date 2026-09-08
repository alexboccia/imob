import { test, expect, type Page } from "@playwright/test";
import {
  login,
  entrarComo,
  obterTokenDeAcesso,
  MULTI_ORG,
  ORG_MULTI_A,
  ORG_MULTI_B,
  ORG_A,
  ORG_ACESSO,
} from "./helpers";

// =======================================================================
// Onboarding self-service (Fase 26)
// =======================================================================
// A afirmação que estes testes protegem, ponta a ponta:
//
//   UMA IMOBILIÁRIA COMEÇA A OPERAR SEM PASSAR POR NINGUÉM.
//
// E a segunda metade da fase: quem pertence a mais de uma imobiliária
// consegue trocar entre elas sem sair e entrar de novo.

async function pedirCadastro(page: Page, nome: string, email: string) {
  await page.goto("/cadastro");
  await page.locator("#nomeImobiliaria").fill(nome);
  await page.locator("#nomeResponsavel").fill("Pessoa Responsavel E2E");
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page.getByText(/Confirme seu e-mail para continuar/)).toBeVisible();
}

test.describe("nova imobiliária", () => {
  test("do cadastro público ao primeiro imóvel, sem ninguém no meio", async ({ page }) => {
    const marcador = Date.now();
    // O slug derivado começa com "e2e-cadastro-" — é por ele que o seed
    // limpa as organizações criadas por este spec a cada rodada.
    const nome = `E2E Cadastro ${marcador}`;
    const email = `cadastro-e2e-${marcador}@e2e.test`;

    await pedirCadastro(page, nome, email);

    // NADA foi criado ainda: o tenant só nasce depois da confirmação.
    await page.goto(`/e2e-cadastro-${marcador}`);
    expect(await page.title()).not.toContain(nome);

    const token = obterTokenDeAcesso("cadastro", email);
    await page.goto(`/cadastro/${token}`);
    // O endereço do site é mostrado ANTES de confirmar — quem cria
    // precisa saber qual URL vai receber.
    await expect(page.getByText(`/e2e-cadastro-${marcador}`)).toBeVisible();
    await page.locator("#senha").fill("senha-do-dono-e2e-1");
    await page.getByRole("button", { name: "Criar minha imobiliária" }).click();

    await page.waitForURL(/\/app\/login/);
    await expect(page.getByText(/Imobiliária criada/)).toBeVisible();

    // Entra com a própria senha, no próprio tenant.
    await entrarComo(page, { email, senha: "senha-do-dono-e2e-1" });
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText(nome).first()).toBeVisible();

    // A Home orienta em vez de despejar numa tela vazia.
    const passos = page.locator("h2").filter({ hasText: "Primeiros passos" });
    await expect(passos).toBeVisible();
    await expect(page.getByRole("link", { name: "Cadastre seu primeiro imóvel" })).toBeVisible();

    // No plano de entrada o limite é de um usuário: oferecer "convide
    // sua equipe" ali seria mandar a pessoa contra uma parede.
    await expect(page.getByRole("link", { name: "Convide sua equipe" })).toHaveCount(0);

    // É OWNER da própria imobiliária — e nada além disso.
    await expect(page.getByRole("link", { name: "Configurações" })).toBeVisible();

    // O caminho do primeiro imóvel é o formulário que já existe.
    await page.getByRole("link", { name: "Cadastre seu primeiro imóvel" }).click();
    await page.waitForURL(/\/app\/imoveis\/novo/);
  });

  test("o site público da imobiliária nova responde, mesmo sem imóvel nenhum", async ({
    page,
  }) => {
    const marcador = Date.now();
    const nome = `E2E Cadastro Site ${marcador}`;
    const email = `cadastro-e2e-site-${marcador}@e2e.test`;

    await pedirCadastro(page, nome, email);
    const token = obterTokenDeAcesso("cadastro", email);
    await page.goto(`/cadastro/${token}`);
    await page.locator("#senha").fill("senha-do-dono-e2e-1");
    await page.getByRole("button", { name: "Criar minha imobiliária" }).click();
    await page.waitForURL(/\/app\/login/);

    // Vazio é um estado LEGÍTIMO: a página abre, não quebra.
    const resposta = await page.goto(`/e2e-cadastro-site-${marcador}`);
    expect(resposta?.status()).toBe(200);
  });

  test("o mesmo link não cria duas imobiliárias", async ({ page }) => {
    const marcador = Date.now();
    const nome = `E2E Cadastro Replay ${marcador}`;
    const email = `cadastro-e2e-replay-${marcador}@e2e.test`;

    await pedirCadastro(page, nome, email);
    const token = obterTokenDeAcesso("cadastro", email);

    await page.goto(`/cadastro/${token}`);
    await page.locator("#senha").fill("senha-do-dono-e2e-1");
    await page.getByRole("button", { name: "Criar minha imobiliária" }).click();
    await page.waitForURL(/\/app\/login/);

    // Voltar no link já usado.
    await page.goto(`/cadastro/${token}`);
    await expect(page.getByText(/inválido, já foi usado ou expirou/)).toBeVisible();
    await expect(page.locator("#senha")).toHaveCount(0);
  });

  test("e-mail que já tem conta não vira takeover: a senha antiga continua valendo", async ({
    page,
  }) => {
    const marcador = Date.now();
    const nome = `E2E Cadastro Existente ${marcador}`;

    // Identidade que já existe e já tem senha própria.
    await pedirCadastro(page, nome, ORG_ACESSO.email);

    // A resposta pública é a mesma de um e-mail novo — o formulário não
    // é um oráculo de quem tem conta.
    const token = obterTokenDeAcesso("cadastro", ORG_ACESSO.email);
    await page.goto(`/cadastro/${token}`);
    // Nenhum campo de senha: criar outra imobiliária não é motivo para
    // trocar a credencial de ninguém.
    await expect(page.locator("#senha")).toHaveCount(0);
    await page.getByRole("button", { name: "Criar minha imobiliária" }).click();
    await page.waitForURL(/\/app\/login/);

    // A senha ORIGINAL continua entrando.
    await entrarComo(page, ORG_ACESSO);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("nome que colide com uma rota do produto é recusado no formulário", async ({ page }) => {
    await page.goto("/cadastro");
    await page.locator("#nomeImobiliaria").fill("Platform");
    await page.locator("#nomeResponsavel").fill("Pessoa Responsavel E2E");
    await page.locator("#email").fill(`reservado-${Date.now()}@e2e.test`);
    await page.getByRole("button", { name: "Criar minha conta" }).click();

    await expect(page.getByText(/não pode ser usado como endereço/)).toBeVisible();
    await expect(page.getByText(/Confirme seu e-mail/)).toHaveCount(0);
  });
});

test.describe("troca de organização", () => {
  test("trocar muda o tenant, o papel e o que a pessoa pode fazer", async ({ page }) => {
    await login(page, MULTI_ORG);

    // Entra na mais antiga: é OWNER na Organização J.
    await expect(page.getByText(ORG_MULTI_A.nome).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Configurações" })).toBeVisible();

    await page.getByRole("button", { name: "Trocar imobiliária" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    // O papel de cada opção aparece: a mesma pessoa é proprietária de
    // uma e corretora da outra, e trocar muda o que ela pode fazer.
    await expect(dialogo.getByText("Corretor")).toBeVisible();
    await dialogo.getByRole("button", { name: new RegExp(ORG_MULTI_B.nome) }).click();

    await page.waitForURL(/\/app$/);
    await expect(page.getByText(ORG_MULTI_B.nome).first()).toBeVisible();

    // O PAPEL mudou junto: como BROKER, Configurações some do menu.
    await expect(page.getByRole("link", { name: "Configurações" })).toHaveCount(0);

    // E as CONSULTAS passaram a usar B. Sem isto, "trocou" e "não
    // trocou" teriam a mesma aparência: só o rótulo no menu mudaria.
    await page.goto("/app/imoveis");
    await expect(page.getByText("Imovel Exclusivo Multi B").first()).toBeVisible();
    await expect(page.getByText("Imovel Exclusivo Multi A")).toHaveCount(0);

    // E volta.
    await page.getByRole("button", { name: "Trocar imobiliária" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(ORG_MULTI_A.nome) })
      .click();
    await page.waitForURL(/\/app$/);
    await expect(page.getByText(ORG_MULTI_A.nome).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Configurações" })).toBeVisible();

    // A reversão também é completa: os dados de B somem e os de A voltam.
    await page.goto("/app/imoveis");
    await expect(page.getByText("Imovel Exclusivo Multi A").first()).toBeVisible();
    await expect(page.getByText("Imovel Exclusivo Multi B")).toHaveCount(0);

    // E o fuso operacional é o de A: Configurações — que só o OWNER de A
    // abre — mostra o fuso desta organização, não o da outra.
    await page.goto("/app/configuracoes");
    await expect(page.locator("#timezone")).toHaveValue("America/Sao_Paulo");
  });

  test("quem pertence a uma única imobiliária não vê seletor nenhum", async ({ page }) => {
    await entrarComo(page, ORG_A);
    // Para a esmagadora maioria, a navegação continua exatamente como
    // era — só o nome da imobiliária, sem controle novo.
    await expect(page.getByRole("button", { name: "Trocar imobiliária" })).toHaveCount(0);
  });

  test("o dono self-service não alcança a plataforma", async ({ page }) => {
    await login(page, MULTI_ORG);
    // OWNER de uma organização não é Super Admin: /platform é outra
    // identidade, com outro login.
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/platform\/login/);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("cadastro e troca de organização cabem numa viewport estreita", async ({ page }) => {
    for (const rota of ["/cadastro", "/app/login"]) {
      await page.goto(rota);
      const larguras = await page.evaluate(() => ({
        conteudo: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(larguras.conteudo, `${rota} rolou horizontalmente`).toBeLessThanOrEqual(
        larguras.viewport
      );
    }

    await login(page, MULTI_ORG);
    // No celular o nome vive no cabeçalho compacto — escopado ao
    // <header>, porque a sidebar de desktop também tem o nome no DOM
    // (oculta por CSS) e um .first() solto pegaria justamente ela.
    await expect(page.locator("header").getByText(ORG_MULTI_A.nome)).toBeVisible();
    const larguras = await page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(larguras.conteudo).toBeLessThanOrEqual(larguras.viewport);
  });
});
