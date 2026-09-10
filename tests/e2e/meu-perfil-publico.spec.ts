import { test, expect } from "@playwright/test";
import { ORG_CENTRAL_CORRETOR, despublicarPerfisNoBanco, login } from "./helpers";

// =======================================================================
// Autoatendimento do perfil público
// =======================================================================
// Roda com um BROKER de uma organização dedicada (Org E) — nunca com a
// Org A, cujo perfil é ligado e desligado por outros specs.
//
// A restauração usa a via independente de navegador (ver helpers): num
// timeout, a limpeza pela UI falharia com a página já fechada e deixaria
// um perfil publicado para o próximo teste.

const CRECI = "CRECI 88.777-F";
const BIO = "Trabalho com apartamentos compactos na regiao central.";
const TELEFONE = "11944448888";
const EMAIL_PUBLICO = "corretor.central@imobiliaria.test";

async function abrirMeuPerfil(page: import("@playwright/test").Page) {
  await page.goto("/app/meu-perfil");
  await expect(page.getByRole("heading", { name: "Meu perfil público" })).toBeVisible();
}

async function salvarPerfil(
  page: import("@playwright/test").Page,
  valores: {
    publicar: boolean;
    creci?: string;
    bio?: string;
    whatsapp?: string;
    telefone?: string;
    email?: string;
  }
) {
  await abrirMeuPerfil(page);
  await page.locator("#perfilPublicoCreci").fill(valores.creci ?? "");
  await page.locator("#perfilPublicoBio").fill(valores.bio ?? "");
  await page.locator("#perfilPublicoWhatsapp").fill(valores.whatsapp ?? "");
  await page.locator("#perfilPublicoTelefone").fill(valores.telefone ?? "");
  await page.locator("#perfilPublicoEmail").fill(valores.email ?? "");

  const marcado =
    (await page
      .getByTestId("perfil-publico-ativo")
      .locator('[role="checkbox"]')
      .getAttribute("aria-checked")) === "true";
  if (marcado !== valores.publicar) {
    await page.getByTestId("perfil-publico-ativo").click();
  }
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Perfil público atualizado.")).toBeVisible();
}

test.describe("corretor mantém o próprio perfil público", () => {
  test("a tela existe, explica a consequência e diz que ainda não está publicado", async ({
    page,
  }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    try {
      await abrirMeuPerfil(page);
      await expect(
        page.getByText(/aparecem no seu perfil público e nos imóveis/i)
      ).toBeVisible();
      await expect(page.getByTestId("perfil-nao-publicado")).toBeVisible();
      // Todos os campos públicos estão aqui.
      for (const id of [
        "#perfilPublicoCreci",
        "#perfilPublicoBio",
        "#perfilPublicoWhatsapp",
        "#perfilPublicoTelefone",
        "#perfilPublicoEmail",
      ]) {
        await expect(page.locator(id)).toBeVisible();
      }
    } finally {
      despublicarPerfisNoBanco();
    }
  });

  test("o menu oferece a porta para quem pode entrar", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    await expect(
      page.getByRole("link", { name: "Meu perfil público" }).first()
    ).toBeVisible();
  });

  test("publica o próprio perfil e o site reflete na hora", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    try {
      await salvarPerfil(page, {
        publicar: true,
        creci: CRECI,
        bio: BIO,
        telefone: TELEFONE,
        email: EMAIL_PUBLICO,
      });

      // Publicado, o CTA aparece — e leva a uma página real.
      const link = page.getByTestId("ver-perfil-publico");
      await expect(link).toBeVisible();
      await expect(page.getByTestId("perfil-nao-publicado")).toHaveCount(0);

      const href = (await link.getAttribute("href"))!;
      const resposta = await page.goto(href);
      expect(resposta?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(CRECI)).toBeVisible();
      await expect(page.getByText(BIO)).toBeVisible();
      await expect(page.getByRole("link", { name: /Ligar para/i })).toHaveAttribute(
        "href",
        `tel:${TELEFONE}`
      );
      await expect(page.getByRole("link", { name: /Enviar e-mail para/i })).toHaveAttribute(
        "href",
        `mailto:${EMAIL_PUBLICO}`
      );
    } finally {
      despublicarPerfisNoBanco();
    }
  });

  test("despublicar tira do ar sem apagar o que foi escrito", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    try {
      await salvarPerfil(page, { publicar: true, creci: CRECI, bio: BIO });
      const href = (await page.getByTestId("ver-perfil-publico").getAttribute("href"))!;

      await salvarPerfil(page, { publicar: false, creci: CRECI, bio: BIO });

      // Fora do ar...
      const resposta = await page.goto(href);
      expect(resposta?.status()).toBe(404);

      // ...e os dados continuam no formulário.
      await abrirMeuPerfil(page);
      await expect(page.locator("#perfilPublicoCreci")).toHaveValue(CRECI);
      await expect(page.locator("#perfilPublicoBio")).toHaveValue(BIO);
      await expect(page.getByTestId("ver-perfil-publico")).toHaveCount(0);
    } finally {
      despublicarPerfisNoBanco();
    }
  });

  test("limpar um contato remove o botão correspondente do site", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    try {
      await salvarPerfil(page, { publicar: true, telefone: TELEFONE, email: EMAIL_PUBLICO });
      let href = (await page.getByTestId("ver-perfil-publico").getAttribute("href"))!;
      await page.goto(href);
      await expect(page.getByRole("link", { name: /Ligar para/i })).toBeVisible();

      await salvarPerfil(page, { publicar: true, email: EMAIL_PUBLICO });
      href = (await page.getByTestId("ver-perfil-publico").getAttribute("href"))!;
      await page.goto(href);
      await expect(page.getByRole("link", { name: /Ligar para/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Enviar e-mail para/i })).toBeVisible();
    } finally {
      despublicarPerfisNoBanco();
    }
  });

  test("validação inválida não salva e mostra o erro no campo", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    try {
      await abrirMeuPerfil(page);
      await page.locator("#perfilPublicoTelefone").fill("1234");
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      await expect(page.getByText("Telefone inválido.")).toBeVisible();
      await expect(page.getByText("Perfil público atualizado.")).toHaveCount(0);
    } finally {
      despublicarPerfisNoBanco();
    }
  });
});

test.describe("autoatendimento não vira gestão de usuários", () => {
  test("o corretor não edita nenhum usuário pela tela de administração", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    await page.goto("/app/usuarios");
    // A listagem é somente-leitura para ele (decisão anterior do
    // produto); o que não pode é a EDIÇÃO responder.
    const primeiroLink = page.locator('a[href^="/app/usuarios/"]').first();
    if ((await primeiroLink.count()) > 0) {
      await primeiroLink.click();
      await expect(
        page.getByText("Apenas administradores podem editar usuários.")
      ).toBeVisible();
      // E nenhum campo de perfil público editável aparece ali.
      await expect(page.locator("#perfilPublicoCreci")).toHaveCount(0);
    }
  });

  test("teclado: dá para alcançar e alternar a publicação sem mouse", async ({ page }) => {
    await login(page, ORG_CENTRAL_CORRETOR);
    try {
      await abrirMeuPerfil(page);
      const creci = page.locator("#perfilPublicoCreci");
      await creci.focus();
      await expect(creci).toBeFocused();
      await creci.fill(CRECI);

      const checkbox = page.getByTestId("perfil-publico-ativo").locator('[role="checkbox"]');
      await checkbox.focus();
      await expect(checkbox).toBeFocused();
      await page.keyboard.press("Space");
      await expect(checkbox).toHaveAttribute("aria-checked", "true");
    } finally {
      despublicarPerfisNoBanco();
    }
  });

  for (const largura of [390, 1280]) {
    test(`${largura}px: a tela cabe e o formulário é utilizável`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await login(page, ORG_CENTRAL_CORRETOR);
      try {
        await abrirMeuPerfil(page);
        await expect(page.locator("#perfilPublicoCreci")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          ),
          `overflow @ ${largura}px`
        ).toBe(true);
      } finally {
        despublicarPerfisNoBanco();
      }
    });
  }
});
