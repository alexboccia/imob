import { test, expect } from "@playwright/test";
import { IDS_E2E, ORG_A, ORG_B, login, restaurarPerfilDespublicado } from "./helpers";

// =======================================================================
// Perfil público do corretor
// =======================================================================
// A rota existe atrás do MESMO portão do card da ficha: publicar é
// `publicProfileEnabled`, e nada mais. Estes testes provam os dois lados
// — o que aparece quando há opt-in, e o 404 quando não há (ou quando o
// id vem de outra organização).
//
// Publicar é estado GLOBAL do tenant: todo teste que publica restaura no
// finally, através de restaurarPerfilDespublicado, que cai para escrita
// direta no banco se a página já estiver fechada (ver helpers.ts).

const URL_IMOVEL = `/imoveis/${IDS_E2E.imovelComBadgesOrgA}`;
const CRECI = "CRECI 77.881-F";
const BIO = "Especialista em lancamentos na zona norte, com foco em primeira compra.";

// O id do membro não é fixo no seed, então é descoberto uma vez pela
// própria página do imóvel — que é onde o link do perfil nasce.
async function urlDoPerfil(page: import("@playwright/test").Page): Promise<string> {
  await page.goto(URL_IMOVEL);
  const href = await page
    .locator("[data-card-corretor]")
    .getByRole("link", { name: "Ver perfil completo" })
    .getAttribute("href");
  expect(href, "o card precisa expor o link do perfil").toBeTruthy();
  return href!;
}

async function abrirEdicaoDoOwner(page: import("@playwright/test").Page) {
  await page.goto("/app/usuarios");
  await page.getByRole("link", { name: new RegExp(ORG_A.email) }).first().click();
  await page.waitForURL(/\/app\/usuarios\/[^/]+$/);
}

async function definirPerfilPublico(
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
  await abrirEdicaoDoOwner(page);
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
  await page.waitForURL(/\/app\/usuarios$/);
}

test.describe("Perfil público do corretor — página", () => {
  test("publicado: apresentação completa, com imóveis do corretor", async ({ page }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, {
        publicar: true,
        creci: CRECI,
        bio: BIO,
        whatsapp: "11955551111",
      });
      const url = await urlDoPerfil(page);
      await page.goto(url);

      // Hierarquia: um h1 só, o nome do profissional.
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toBeVisible();
      await expect(page.getByText("Corretor(a) de imóveis")).toBeVisible();
      await expect(page.getByText(CRECI)).toBeVisible();
      await expect(page.getByText(BIO)).toBeVisible();

      // Trilha semântica.
      const trilha = page.getByRole("navigation", { name: "Você está aqui" });
      await expect(trilha.getByRole("link", { name: "Imóveis" })).toBeVisible();

      // Carteira: o imóvel do seed cujo responsável é este membro.
      const secao = page.getByRole("heading", { name: "Imóveis deste corretor" });
      await expect(secao).toBeVisible();
      await expect(
        page.getByRole("link", { name: new RegExp(IDS_E2E.imovelComBadgesOrgA) })
      ).toHaveCount(0); // o card linka por href, não por texto do id
      const cards = page.locator(`a[href*="/imoveis/"]`);
      expect(await cards.count()).toBeGreaterThan(0);
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("sem opt-in a rota não existe publicamente (404)", async ({ page }) => {
    // Descobre o id COM o perfil ligado, depois desliga e tenta de novo:
    // é o cenário real de despublicar alguém que já circulou.
    await login(page, ORG_A);
    let url: string;
    try {
      await definirPerfilPublico(page, { publicar: true, creci: CRECI });
      url = await urlDoPerfil(page);
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }

    const resposta = await page.goto(url);
    expect(resposta?.status()).toBe(404);
    expect(await page.content()).not.toContain(CRECI);
  });

  test("IDOR: id de membro de OUTRA organização não resolve neste tenant", async ({
    page,
  }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: true, creci: CRECI });
      const url = await urlDoPerfil(page);
      const idDoMembro = url.split("/").pop()!;

      // O MESMO id, pedido sob o site da organização B: o membro existe,
      // está publicado, e mesmo assim não pode ser encontrado aqui.
      const resposta = await page.goto(`/${ORG_B.slug}/corretores/${idDoMembro}`);
      expect(resposta?.status()).toBe(404);
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("membro inexistente devolve 404, sem revelar se o id existe", async ({ page }) => {
    const resposta = await page.goto("/corretores/cmzzzzzzzzzzzzzzzzzzzzzzz");
    expect(resposta?.status()).toBe(404);
  });

  test("campos opcionais ausentes: sem foto, sem CRECI, sem bio, sem WhatsApp", async ({
    page,
  }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: true });
      const url = await urlDoPerfil(page);
      await page.goto(url);

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Corretor(a) de imóveis")).toBeVisible();
      // Sem número próprio: nenhum botão de WhatsApp, mesmo com a
      // organização tendo número institucional configurado.
      await expect(page.getByRole("link", { name: /Falar no WhatsApp/i })).toHaveCount(0);
      await expect(page.getByText(CRECI)).toHaveCount(0);
      // Sem foto pública, nenhuma <img> de avatar.
      await expect(page.locator("main img, h1 ~ img")).toHaveCount(0);
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("WhatsApp é o número PESSOAL, nunca o institucional", async ({ page }) => {
    const numero = "11955551111";
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: true, whatsapp: numero });
      const url = await urlDoPerfil(page);
      await page.goto(url);

      const botao = page.getByRole("link", { name: /Falar no WhatsApp com/i });
      await expect(botao).toBeVisible();
      const href = await botao.getAttribute("href");
      expect(href).toContain(`wa.me/${numero}`);
      expect(href).toContain("text=");
      await expect(botao).toContainText("Falar no WhatsApp");
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("nenhum dado privado chega ao HTML", async ({ page }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: true, creci: CRECI, bio: BIO });
      const url = await urlDoPerfil(page);
      await page.goto(url);
      const html = await page.content();

      // E-mail de login, nomes de campos internos e papéis não existem
      // nesta página — não porque foram escondidos, mas porque a query
      // nunca os buscou.
      expect(html).not.toContain(ORG_A.email);
      for (const proibido of ["publicProfileEnabled", "contactEmail", "OWNER", "organizationId"]) {
        expect(html, `"${proibido}" não pode aparecer`).not.toContain(proibido);
      }
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("metadata usa só dado publicado", async ({ page }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: true, creci: CRECI, bio: BIO });
      const url = await urlDoPerfil(page);
      await page.goto(url);

      await expect(page).toHaveTitle(/Corretor\(a\) de imóveis/);
      const descricao = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(descricao).toContain(BIO.slice(0, 30));
      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");
      expect(canonical).toContain("/corretores/");
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("o card do imóvel leva ao perfil, e o perfil volta para os imóveis", async ({
    page,
  }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: true, creci: CRECI });
      await page.goto(URL_IMOVEL);
      await page
        .locator("[data-card-corretor]")
        .getByRole("link", { name: "Ver perfil completo" })
        .click();
      await page.waitForURL(/\/corretores\//);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // Teclado: o CTA de volta é alcançável e focável.
      const voltar = page
        .getByRole("navigation", { name: "Você está aqui" })
        .getByRole("link", { name: "Imóveis" });
      await voltar.focus();
      await expect(voltar).toBeFocused();
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: perfil sem overflow, avatar e textos íntegros`, async ({ page }) => {
      await login(page, ORG_A);
      try {
        await definirPerfilPublico(page, {
          publicar: true,
          creci: CRECI,
          bio: BIO,
          whatsapp: "11955551111",
        });
        const url = await urlDoPerfil(page);
        await page.setViewportSize({ width: largura, height: 900 });
        await page.goto(url);

        const medida = await page.evaluate(() => {
          const h1 = document.querySelector("h1")!;
          const avatar = document.querySelector("span.rounded-full")!.getBoundingClientRect();
          const botao = document.querySelector('a[href^="https://wa.me/"]');
          return {
            avatarQuadrado: Math.abs(avatar.width - avatar.height) < 2,
            avatarNaoEsmagado: avatar.width >= 100,
            nomeVisivel: h1.getBoundingClientRect().height > 0,
            alturaBotao: botao ? botao.getBoundingClientRect().height : 0,
            semOverflow:
              document.documentElement.scrollWidth <= window.innerWidth + 1,
          };
        });
        expect(medida.semOverflow, `overflow @ ${largura}px`).toBe(true);
        expect(medida.avatarQuadrado && medida.avatarNaoEsmagado, `avatar @ ${largura}px`).toBe(
          true
        );
        expect(medida.nomeVisivel).toBe(true);
        expect(medida.alturaBotao, `botão @ ${largura}px`).toBeGreaterThanOrEqual(36);
      } finally {
        await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
      }
    });
  }
});

// =======================================================================
// Contatos públicos — telefone e e-mail
// =======================================================================
const TELEFONE = "11933332222";
const EMAIL_PUBLICO = "corretor.publico@imobiliaria.test";

test.describe("contatos públicos do corretor", () => {
  test("gestão: os campos existem, são rotulados e explicam a consequência", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await abrirEdicaoDoOwner(page);

    await expect(page.getByLabel("Telefone público (opcional)")).toBeVisible();
    await expect(page.getByLabel("E-mail público (opcional)")).toBeVisible();
    // O texto precisa dizer o que acontece ao preencher.
    await expect(
      page.getByText(/preencher um deles significa publicá-lo no site/i)
    ).toBeVisible();
  });

  test("com telefone e e-mail publicados, o perfil oferece as três ações", async ({
    page,
  }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, {
        publicar: true,
        creci: CRECI,
        whatsapp: "11955551111",
        telefone: TELEFONE,
        email: EMAIL_PUBLICO,
      });
      const url = await urlDoPerfil(page);
      await page.goto(url);

      const ligar = page.getByRole("link", { name: /Ligar para/i });
      await expect(ligar).toBeVisible();
      // tel: com os dígitos locais, sem DDI inventado.
      await expect(ligar).toHaveAttribute("href", `tel:${TELEFONE}`);
      // O número aparece formatado para leitura humana.
      await expect(ligar).toContainText("(11) 93333-2222");

      const email = page.getByRole("link", { name: /Enviar e-mail para/i });
      await expect(email).toBeVisible();
      // mailto: sem query string — nada de assunto/corpo na URL.
      await expect(email).toHaveAttribute("href", `mailto:${EMAIL_PUBLICO}`);

      await expect(page.getByRole("link", { name: /Falar no WhatsApp com/i })).toBeVisible();
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("limpar o telefone tira o botão de ligar, e o resto continua", async ({ page }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, {
        publicar: true,
        telefone: TELEFONE,
        email: EMAIL_PUBLICO,
      });
      let url = await urlDoPerfil(page);
      await page.goto(url);
      await expect(page.getByRole("link", { name: /Ligar para/i })).toBeVisible();

      await definirPerfilPublico(page, { publicar: true, email: EMAIL_PUBLICO });
      url = await urlDoPerfil(page);
      await page.goto(url);
      await expect(page.getByRole("link", { name: /Ligar para/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Enviar e-mail para/i })).toBeVisible();
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("o card do imóvel mostra os mesmos contatos, e só eles", async ({ page }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, {
        publicar: true,
        creci: CRECI,
        telefone: TELEFONE,
        // Sem e-mail e sem WhatsApp próprios de propósito.
      });
      await page.goto(URL_IMOVEL);
      const card = page.locator("[data-card-corretor]");
      await expect(card.getByRole("link", { name: "Ver perfil completo" })).toBeVisible();
      await expect(card.getByRole("link", { name: /Ligar para/i })).toHaveAttribute(
        "href",
        `tel:${TELEFONE}`
      );
      await expect(card.getByRole("link", { name: /Enviar e-mail para/i })).toHaveCount(0);
      // Sem WhatsApp PRÓPRIO, nenhum botão de WhatsApp no card — mesmo
      // com a imobiliária tendo número institucional configurado.
      await expect(card.getByRole("link", { name: /WhatsApp/i })).toHaveCount(0);
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("nenhum contato publicado: card e perfil seguem válidos, sem botões pessoais", async ({
    page,
  }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: true, creci: CRECI });
      await page.goto(URL_IMOVEL);
      const card = page.locator("[data-card-corretor]");
      await expect(card).toBeVisible();
      await expect(card.getByRole("link", { name: "Ver perfil completo" })).toBeVisible();
      for (const acao of [/Ligar para/i, /Enviar e-mail para/i, /WhatsApp/i]) {
        await expect(card.getByRole("link", { name: acao })).toHaveCount(0);
      }
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test("dados privados do painel nunca aparecem no site", async ({ page }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, {
        publicar: true,
        telefone: TELEFONE,
        email: EMAIL_PUBLICO,
      });
      const url = await urlDoPerfil(page);
      await page.goto(url);
      const html = await page.content();
      // O e-mail de LOGIN continua fora, mesmo com e-mail público
      // preenchido — são campos diferentes e só um deles é publicável.
      expect(html).not.toContain(ORG_A.email);
      expect(html).toContain(EMAIL_PUBLICO);
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  test('o painel oferece "Ver este perfil no site" só quando publicado', async ({ page }) => {
    await login(page, ORG_A);
    try {
      await definirPerfilPublico(page, { publicar: false });
      await abrirEdicaoDoOwner(page);
      await expect(page.getByTestId("ver-perfil-publico")).toHaveCount(0);

      await definirPerfilPublico(page, { publicar: true });
      await abrirEdicaoDoOwner(page);
      const link = page.getByTestId("ver-perfil-publico");
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href).toContain("/corretores/");
      // O link precisa levar a uma página real, não a um 404.
      const destino = await page.goto(href!);
      expect(destino?.status()).toBe(200);
    } finally {
      await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
    }
  });

  for (const largura of [320, 390, 768, 1280]) {
    test(`${largura}px: quatro ações no card sem overflow e com alvo de toque`, async ({
      page,
    }) => {
      await login(page, ORG_A);
      try {
        await definirPerfilPublico(page, {
          publicar: true,
          creci: CRECI,
          whatsapp: "11955551111",
          telefone: TELEFONE,
          email: EMAIL_PUBLICO,
        });
        await page.setViewportSize({ width: largura, height: 900 });
        await page.goto(URL_IMOVEL);

        const medida = await page.locator("[data-card-corretor]").evaluate((card) => {
          const acoes = [...card.querySelectorAll("a")];
          return {
            quantidade: acoes.length,
            alturaMinima: Math.min(...acoes.map((a) => a.getBoundingClientRect().height)),
            cabemNoCard: acoes.every(
              (a) => a.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1
            ),
            semOverflow: card.scrollWidth <= card.clientWidth + 1,
          };
        });
        expect(medida.quantidade, `ações @ ${largura}px`).toBe(4);
        expect(medida.alturaMinima, `alvo de toque @ ${largura}px`).toBeGreaterThanOrEqual(36);
        expect(medida.cabemNoCard, `ações fora do card @ ${largura}px`).toBe(true);
        expect(medida.semOverflow, `overflow @ ${largura}px`).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          ),
          `overflow da página @ ${largura}px`
        ).toBe(true);
      } finally {
        await restaurarPerfilDespublicado(() => definirPerfilPublico(page, { publicar: false }));
      }
    });
  }
});
