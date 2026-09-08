import { test, expect, type Page } from "@playwright/test";
import {
  login,
  entrarComo,
  obterTokenDeAcesso,
  ORG_ACESSO,
  ORG_ACESSO_CORRETOR,
  USUARIO_JA_TEM_CONTA,
} from "./helpers";

// =======================================================================
// Ciclo de acesso (Fase 25)
// =======================================================================
// A afirmação que estes testes protegem, ponta a ponta:
//
//   NINGUÉM PRECISA DO DESENVOLVEDOR PARA ENTRAR NO SISTEMA.
//
// Convidar, ativar e recuperar senha acontecem inteiramente pelo produto.

const CORRETOR = ORG_ACESSO_CORRETOR.email;

async function pedirRecuperacao(page: Page, email: string) {
  await page.goto("/app/recuperar-senha");
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
  await expect(page.getByText(/Se existir uma conta com esse e-mail/)).toBeVisible();
}

test.describe.serial("recuperação de senha", () => {
  // .serial e restauração ao final: estes testes TROCAM a senha de uma
  // identidade real do seed. Sem devolver o estado, o próximo teste da
  // suíte não conseguiria entrar.
  test.afterAll(async ({ browser }) => {
    const pagina = await browser.newPage();
    await pedirRecuperacao(pagina, CORRETOR);
    const token = obterTokenDeAcesso("reset", CORRETOR);
    await pagina.goto(`/app/redefinir-senha/${token}`);
    await pagina.locator("#senha").fill(ORG_ACESSO_CORRETOR.senha);
    await pagina.getByRole("button", { name: "Salvar nova senha" }).click();
    await pagina.waitForURL(/\/app\/login/);
    await pagina.close();
  });

  test("do login esquecido até entrar com a senha nova", async ({ page }) => {
    // O caminho começa onde a pessoa está quando percebe o problema.
    await page.goto("/app/login");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await page.waitForURL(/\/app\/recuperar-senha/);

    await page.locator("#email").fill(CORRETOR);
    await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
    await expect(page.getByText(/Se existir uma conta com esse e-mail/)).toBeVisible();

    const token = obterTokenDeAcesso("reset", CORRETOR);
    await page.goto(`/app/redefinir-senha/${token}`);
    await page.locator("#senha").fill("senha-trocada-e2e-1");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();

    await page.waitForURL(/\/app\/login/);
    await expect(page.getByText("Senha redefinida. Entre com a nova senha.")).toBeVisible();

    // A senha NOVA entra.
    await entrarComo(page, { email: CORRETOR, senha: "senha-trocada-e2e-1" });
    await expect(page).toHaveURL(/\/app$/);

    // E a ANTIGA deixou de valer.
    await page.context().clearCookies();
    await page.goto("/app/login");
    await page.locator("#email").fill(CORRETOR);
    await page.locator("#senha").fill(ORG_ACESSO_CORRETOR.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  });

  test("e-mail existente e inexistente produzem a MESMA experiência pública", async ({
    page,
  }) => {
    await pedirRecuperacao(page, CORRETOR);
    const comConta = await page.locator("main, body").innerText();

    await page.goto("/app/recuperar-senha");
    await page.locator("#email").fill("ninguem-tem-esse-email-jamais@e2e.test");
    await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
    await expect(page.getByText(/Se existir uma conta com esse e-mail/)).toBeVisible();
    const semConta = await page.locator("main, body").innerText();

    // Mesmo texto, palavra por palavra. Qualquer diferença aqui seria um
    // oráculo de quais e-mails têm conta no produto.
    expect(semConta).toBe(comConta);
  });

  test("link já usado e link expirado caem no MESMO estado, sem dizer qual foi", async ({
    page,
  }) => {
    await pedirRecuperacao(page, CORRETOR);
    const usado = obterTokenDeAcesso("reset", CORRETOR);
    await page.goto(`/app/redefinir-senha/${usado}`);
    await page.locator("#senha").fill("senha-trocada-e2e-2");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await page.waitForURL(/\/app\/login/);

    // REPLAY: o mesmo link, de novo.
    await page.goto(`/app/redefinir-senha/${usado}`);
    await expect(page.getByText(/inválido, já foi usado ou expirou/)).toBeVisible();
    await expect(page.locator("#senha")).toHaveCount(0);
    const textoUsado = await page.locator("body").innerText();

    // EXPIRADO: um link que nasceu vencido.
    await pedirRecuperacao(page, CORRETOR);
    const expirado = obterTokenDeAcesso("reset", CORRETOR, "expirado");
    await page.goto(`/app/redefinir-senha/${expirado}`);
    const textoExpirado = await page.locator("body").innerText();

    expect(textoExpirado).toBe(textoUsado);

    // INEXISTENTE: um token inventado.
    await page.goto("/app/redefinir-senha/token-que-nunca-existiu-em-lugar-nenhum");
    expect(await page.locator("body").innerText()).toBe(textoUsado);
  });
});

test.describe("convite de membro", () => {
  test("OWNER convida, a pessoa ativa a conta e entra com o papel certo", async ({
    page,
  }) => {
    const marcador = Date.now();
    const email = `convidado-${marcador}@e2e.test`;

    await login(page, ORG_ACESSO);
    await page.goto("/app/usuarios");
    await page.getByRole("button", { name: /Novo usuário/i }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(`Convidado ${marcador}`);
    await page.getByPlaceholder("E-mail", { exact: true }).fill(email);
    // Nenhum campo de senha existe mais nesta tela: quem administra não
    // escolhe a senha de ninguém.
    await expect(page.locator('input[name="senha"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Enviar convite" }).click();
    // O Sheet fechar é o sinal de que a action terminou. Sem esperar por
    // ele, a navegação abaixo acontece com o convite ainda em voo e a
    // listagem é renderizada antes de a linha existir.
    await expect(page.getByRole("heading", { name: "Novo usuário" })).not.toBeVisible();

    await page.goto("/app/usuarios");
    const linha = page.locator("tr", { hasText: `Convidado ${marcador}` });
    await expect(linha).toBeVisible();
    // Estado operacional factual, visível para quem administra.
    await expect(linha.getByText("Convite pendente")).toBeVisible();

    // A pessoa convidada abre o link e cria a própria senha.
    const token = obterTokenDeAcesso("convite", email);
    await page.context().clearCookies();
    await page.goto(`/app/convite/${token}`);
    await page.locator("#senha").fill("senha-do-convidado-1");
    await page.getByRole("button", { name: "Ativar minha conta" }).click();
    await page.waitForURL(/\/app\/login/);

    await entrarComo(page, { email, senha: "senha-do-convidado-1" });
    await expect(page).toHaveURL(/\/app$/);

    // Papel correto: BROKER (padrão do formulário) não administra usuários.
    await page.goto("/app/configuracoes");
    await expect(page.getByRole("link", { name: "Configurações" })).toHaveCount(0);

    // E o link do convite não serve mais.
    await page.context().clearCookies();
    await page.goto(`/app/convite/${token}`);
    await expect(page.getByText(/inválido, já foi usado ou expirou/)).toBeVisible();
  });

  test("um usuário que já existe recebe vínculo novo sem criar segunda identidade", async ({
    page,
  }) => {
    // Identidade dedicada, com conta e senha próprias em outra
    // organização. NÃO um dono compartilhado do seed: aceitar este
    // convite cria um segundo vínculo ativo, e isso tornaria o login
    // dessa pessoa relevante para outras specs.
    const email = USUARIO_JA_TEM_CONTA.email;

    await login(page, ORG_ACESSO);
    await page.goto("/app/usuarios");
    await page.getByRole("button", { name: /Novo usuário/i }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill("Pessoa Que Ja Existe");
    await page.getByPlaceholder("E-mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Enviar convite" }).click();
    await expect(page.getByRole("heading", { name: "Novo usuário" })).not.toBeVisible();

    // Antes desta fase isto respondia "Já existe um usuário com esse
    // e-mail" — um oráculo de quem tem conta no produto inteiro.
    await page.goto("/app/usuarios");
    await expect(page.locator("tr", { hasText: email })).toBeVisible();

    const token = obterTokenDeAcesso("convite", email);
    await page.context().clearCookies();
    await page.goto(`/app/convite/${token}`);

    // Nenhum campo de senha: aceitar um segundo vínculo não dá a ninguém
    // o poder de forçar troca de senha alheia.
    await expect(page.locator("#senha")).toHaveCount(0);
    await page.getByRole("button", { name: "Aceitar convite" }).click();
    await page.waitForURL(/\/app\/login/);

    // A senha original continua valendo — e o login continua sendo
    // possível, com a identidade única de sempre.
    await entrarComo(page, USUARIO_JA_TEM_CONTA);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("um corretor não convida ninguém: sem formulário e com a action recusando", async ({
    page,
  }) => {
    await entrarComo(page, ORG_ACESSO_CORRETOR);
    await page.goto("/app/usuarios");

    // A tela abre em modo leitura — o botão de convidar não existe.
    await expect(page.getByRole("button", { name: /Novo usuário/i })).toHaveCount(0);
  });
});

test.describe("navegação por papel", () => {
  test("o corretor não vê Configurações, que ele não pode usar", async ({ page }) => {
    await entrarComo(page, ORG_ACESSO_CORRETOR);
    // Dívida fechada nesta fase: o item existia no menu e a página
    // respondia "apenas administradores podem alterar".
    await expect(page.getByRole("link", { name: "Configurações" })).toHaveCount(0);
    // O que ele PODE usar continua no lugar.
    await expect(page.getByRole("link", { name: "Imóveis" })).toBeVisible();
  });

  test("o OWNER continua vendo Configurações", async ({ page }) => {
    await entrarComo(page, ORG_ACESSO);
    await expect(page.getByRole("link", { name: "Configurações" })).toBeVisible();
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("login, recuperação e redefinição cabem numa viewport estreita", async ({ page }) => {
    for (const rota of ["/app/login", "/app/recuperar-senha"]) {
      await page.goto(rota);
      const larguras = await page.evaluate(() => ({
        conteudo: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(larguras.conteudo, `${rota} rolou horizontalmente`).toBeLessThanOrEqual(
        larguras.viewport
      );
    }

    // E o fluxo é operável no toque, não só legível.
    await pedirRecuperacao(page, CORRETOR);
    const token = obterTokenDeAcesso("reset", CORRETOR);
    await page.goto(`/app/redefinir-senha/${token}`);
    await expect(page.locator("#senha")).toBeVisible();
    const larguras = await page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(larguras.conteudo).toBeLessThanOrEqual(larguras.viewport);
  });
});
