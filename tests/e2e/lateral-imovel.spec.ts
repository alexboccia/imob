import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  IDS_E2E,
  ORG_PORTFOLIO,
  despublicarPerfisNoBanco,
  esperarJanelaAntiSpam,
  publicarPerfisNoBanco,
} from "./helpers";

// =======================================================================
// Lateral da ficha + Política de Privacidade (Fase 51)
// =======================================================================
// A ordem da lateral é: preço e CTAs → corretor responsável → "Receba
// mais informações" → formulário → política de privacidade.
//
// Organização Portfólio (seed): o imóvel da Sônia tem responsável com
// perfil completo (foto, CRECI, bio e os três contatos públicos), e
// existe um imóvel SEM responsável para o caminho sem corretor.

const BASE = `/${ORG_PORTFOLIO.slug}`;
const SONIA = IDS_E2E.membroPortfolioSonia;
const FICHA_COM_CORRETOR = `${BASE}/imoveis/${IDS_E2E.imovelPortfolioSonia}`;
const FICHA_SEM_CORRETOR = `${BASE}/imoveis/e2e-imovel-portfolio-sem-responsavel`;
const POLITICA = `${BASE}/politica-de-privacidade`;

const lateral = (page: Page) => page.locator("[data-card-contato]");
const corretor = (page: Page) => page.locator("[data-card-corretor]");
const formulario = (page: Page) => lateral(page).locator("form");
const linkPolitica = (page: Page) =>
  lateral(page).getByRole("link", { name: "Política de Privacidade" });

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

/** O topo de cada peça da lateral, na ordem em que aparecem na tela. */
async function ordemDaLateral(page: Page, comCorretor: boolean) {
  const alvos: [string, Locator][] = [
    ["preço", lateral(page).locator("[data-preco]").first()],
    ...(comCorretor
      ? ([["corretor", corretor(page)]] as [string, Locator][])
      : []),
    ["título do formulário", lateral(page).getByRole("heading", { name: "Receba mais informações" })],
    ["campo nome", formulario(page).getByLabel("Nome")],
    ["botão enviar", formulario(page).getByRole("button", { name: "Enviar mensagem" })],
    ["política", linkPolitica(page)],
  ];
  const medidos: { nome: string; y: number }[] = [];
  for (const [nome, alvo] of alvos) medidos.push({ nome, y: (await caixa(alvo)).y });
  return medidos;
}

function errosDoConsole(page: Page) {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

test.beforeAll(() => publicarPerfisNoBanco(SONIA));
test.afterAll(() => despublicarPerfisNoBanco(ORG_PORTFOLIO.slug));

// -----------------------------------------------------------------------
// Composição
// -----------------------------------------------------------------------
test.describe("composição da lateral", () => {
  for (const largura of [1024, 1280, 1440]) {
    test(`${largura}px: preço → corretor → Receba mais informações → formulário → política`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(FICHA_COM_CORRETOR);

      const ordem = await ordemDaLateral(page, true);
      for (let i = 1; i < ordem.length; i++) {
        expect(ordem[i].y, `${ordem[i].nome} depois de ${ordem[i - 1].nome}`).toBeGreaterThan(
          ordem[i - 1].y
        );
      }
      // Tudo dentro do card lateral, que é uma coluna só.
      const card = await caixa(lateral(page));
      for (const alvo of [corretor(page), linkPolitica(page)]) {
        const b = await caixa(alvo);
        expect(b.x).toBeGreaterThanOrEqual(card.x - 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
      }
      // O corretor não aparece duas vezes na página.
      await expect(corretor(page)).toHaveCount(1);
      // E o formulário continua sendo o da ficha, com o imóvel no corpo.
      await expect(lateral(page).locator('input[name="imovelId"]')).toHaveCount(1);
    });
  }

  test("sem corretor responsável, a ordem continua correta e nenhum card vazio aparece", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FICHA_SEM_CORRETOR);
    await expect(corretor(page)).toHaveCount(0);
    await expect(page.getByText("Corretor(a) responsável")).toHaveCount(0);

    const ordem = await ordemDaLateral(page, false);
    for (let i = 1; i < ordem.length; i++) {
      expect(ordem[i].y, ordem[i].nome).toBeGreaterThan(ordem[i - 1].y);
    }
  });

  test("corretor completo: foto, nome, CRECI, bio, perfil e os três contatos publicados", async ({
    page,
  }) => {
    await page.goto(FICHA_COM_CORRETOR);
    const card = corretor(page);
    await expect(card.getByRole("heading", { name: "Corretor(a) responsável" })).toBeVisible();
    await expect(card.getByText("Sônia Portfolio")).toBeVisible();
    await expect(card.getByText("CRECI-SP 111.222-J")).toBeVisible();
    await expect(card.getByText(/Atende Centro e Jardins/)).toBeVisible();

    const foto = card.locator("img");
    await expect(foto).toHaveAttribute("alt", "Foto de Sônia Portfolio");
    expect(await foto.evaluate((el) => getComputedStyle(el).objectFit)).toBe("cover");

    await expect(card.getByRole("link", { name: "Ver perfil completo" })).toHaveAttribute(
      "href",
      `${BASE}/corretores/${SONIA}`
    );
    await expect(card.getByRole("link", { name: /Ligar para/ })).toHaveAttribute(
      "href",
      "tel:1133224455"
    );
    await expect(card.getByRole("link", { name: /Enviar e-mail para/ })).toHaveAttribute(
      "href",
      "mailto:sonia.publico@e2e.test"
    );
    const whatsapp = card.getByRole("link", { name: /Falar no WhatsApp com/ });
    expect(await whatsapp.getAttribute("href")).toContain("wa.me/11955550000");
    // Nada interno vaza para a página.
    expect(await page.content()).not.toContain("sonia-portfolio@e2e.test");
  });

  test("o formulário da lateral continua enviando", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FICHA_COM_CORRETOR);
    // CamposAntiSpam recusa envio em menos de 1,5s desde o render.
    await esperarJanelaAntiSpam(page);
    const form = formulario(page);
    await form.getByLabel("Nome").fill(`Visitante Fase 51 ${Date.now()}`);
    await form.getByLabel("Telefone").fill("11999990000");
    await form.getByLabel("E-mail").fill(`fase51-${Date.now()}@e2e.test`);
    await form.getByLabel("Mensagem").fill("Tenho interesse neste imóvel.");
    await form.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(lateral(page).getByText("Mensagem enviada com sucesso!")).toBeVisible();
  });
});

// -----------------------------------------------------------------------
// Toolbar do corretor (Fase 53)
// -----------------------------------------------------------------------
test.describe("ações do corretor", () => {
  const FICHA_SEM_CONTATOS = `${BASE}/imoveis/e2e-imovel-portfolio-rui-1`;
  const acao = (page: Page, chave: string) => page.locator(`[data-acao-corretor="${chave}"]`);

  /** Largura que a toolbar precisaria para caber numa linha. */
  async function larguraNecessaria(page: Page) {
    return corretor(page)
      .locator("[data-acao-corretor]")
      .first()
      .evaluate((perfil) => {
        const toolbar = perfil.parentElement!;
        const clone = perfil.cloneNode(true) as HTMLElement;
        clone.style.position = "absolute";
        clone.style.flex = "none";
        clone.style.minWidth = "0";
        perfil.after(clone);
        const intrinseca = clone.getBoundingClientRect().width;
        clone.remove();
        const vao = parseFloat(getComputedStyle(toolbar).columnGap || "0");
        const contatos = [...toolbar.querySelectorAll("[data-acao-corretor]")].slice(1);
        const larguraContatos = contatos.reduce((total, c) => total + c.getBoundingClientRect().width, 0);
        return intrinseca + larguraContatos + vao * contatos.length;
      });
  }

  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: perfil e contatos compactos, na mesma linha quando cabem`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 1000 });
      await page.goto(FICHA_COM_CORRETOR);

      const card = await caixa(corretor(page));
      const caixas: { chave: string; x: number; y: number; width: number; height: number }[] = [];
      for (const chave of ["perfil", "telefone", "whatsapp", "email"]) {
        caixas.push({ chave, ...(await caixa(acao(page, chave))) });
      }

      // Todos com a MESMA altura, em qualquer largura.
      for (const b of caixas) {
        expect(Math.abs(b.height - caixas[0].height), `altura de ${b.chave} @ ${largura}`).toBeLessThan(1);
      }
      // Ordem: perfil, telefone, WhatsApp, e-mail — nessa sequência de leitura.
      for (let i = 1; i < caixas.length; i++) {
        const anterior = caixas[i - 1];
        const atual = caixas[i];
        const mesmaLinha = Math.abs(atual.y - anterior.y) < 1;
        if (mesmaLinha) expect(atual.x, `${atual.chave} @ ${largura}`).toBeGreaterThanOrEqual(anterior.x + anterior.width);
        else expect(atual.y, `${atual.chave} @ ${largura}`).toBeGreaterThan(anterior.y);
      }
      // Contatos quadrados, com alvo de toque do projeto.
      const [perfil, ...contatos] = caixas;
      for (const b of contatos) {
        expect(Math.abs(b.width - b.height), `${b.chave} não é quadrado @ ${largura}`).toBeLessThan(1);
        expect(b.width, `alvo de toque de ${b.chave} @ ${largura}`).toBeGreaterThanOrEqual(36);
      }
      expect(perfil.width, `perfil @ ${largura}`).toBeGreaterThan(contatos[0].width);
      // Os três contatos sempre juntos, na mesma linha entre si.
      for (const b of contatos) expect(Math.abs(b.y - contatos[0].y), `${b.chave} @ ${largura}`).toBeLessThan(1);
      // Vãos iguais entre os contatos.
      const vaos = contatos.slice(1).map((b, i) => b.x - (contatos[i].x + contatos[i].width));
      for (const v of vaos) expect(Math.abs(v - vaos[0]), `vão @ ${largura}`).toBeLessThan(1);

      // Dentro do card e sem estouro da página.
      for (const b of caixas) {
        expect(b.x, `${b.chave} @ ${largura}`).toBeGreaterThanOrEqual(card.x - 0.5);
        expect(b.x + b.width, `${b.chave} @ ${largura}`).toBeLessThanOrEqual(card.x + card.width + 0.5);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        `estouro @ ${largura}`
      ).toBe(true);
      // Nada cortado dentro dos botões.
      for (const { chave } of caixas) {
        expect(
          await acao(page, chave).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          `conteúdo cortado em ${chave} @ ${largura}`
        ).toBe(true);
      }

      // Uma linha só quando a largura comporta — medido com a fonte
      // desta máquina, nunca com pixels fixos. Acima de lg isso é
      // obrigatório: a coluna sempre comporta.
      const necessaria = await larguraNecessaria(page);
      const umaLinha = caixas.every((b) => Math.abs(b.y - perfil.y) < 1);
      if (largura >= 1280) {
        expect(necessaria, `a coluna deveria comportar @ ${largura}`).toBeLessThanOrEqual(card.width + 0.5);
      }
      if (necessaria <= card.width + 0.5) {
        expect(umaLinha, `deveria caber numa linha @ ${largura}`).toBe(true);
        expect(Math.abs(perfil.x - card.x)).toBeLessThan(1);
        expect(Math.abs(caixas[3].x + caixas[3].width - (card.x + card.width))).toBeLessThan(1);
      } else {
        // Degradação controlada: o grupo de contatos desce inteiro.
        expect(umaLinha, `não cabia numa linha @ ${largura}`).toBe(false);
        expect(contatos[0].y).toBeGreaterThan(perfil.y);
      }
    });
  }

  test("contatos são só ícone: nenhum número ou rótulo visível, hrefs intactos", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FICHA_COM_CORRETOR);

    const toolbar = corretor(page).locator("[data-acao-corretor]");
    await expect(toolbar).toHaveCount(4);
    for (const chave of ["telefone", "whatsapp", "email"]) {
      // Nenhum texto visível dentro do botão.
      expect((await acao(page, chave).innerText()).trim(), chave).toBe("");
      await expect(acao(page, chave).locator("svg")).toHaveAttribute("aria-hidden", "true");
    }
    const textoDaToolbar = await corretor(page).locator("[data-acao-corretor]").last().locator("xpath=../..").innerText();
    expect(textoDaToolbar).not.toContain("(11)");
    expect(textoDaToolbar).not.toContain("1133224455");
    expect(textoDaToolbar).not.toContain("Falar no WhatsApp");
    expect(textoDaToolbar).not.toContain("sonia.publico@e2e.test");
    expect(textoDaToolbar.trim()).toBe("Ver perfil completo");

    // Os dados continuam nos hrefs e nos nomes acessíveis.
    await expect(acao(page, "perfil")).toHaveAttribute("href", `${BASE}/corretores/${SONIA}`);
    await expect(acao(page, "telefone")).toHaveAttribute("href", "tel:1133224455");
    await expect(acao(page, "telefone")).toHaveAccessibleName("Ligar para Sônia Portfolio");
    await expect(acao(page, "email")).toHaveAttribute("href", "mailto:sonia.publico@e2e.test");
    await expect(acao(page, "email")).toHaveAccessibleName("Enviar e-mail para Sônia Portfolio");
    const whatsapp = acao(page, "whatsapp");
    expect(await whatsapp.getAttribute("href")).toContain("wa.me/11955550000");
    expect(await whatsapp.getAttribute("href")).toContain("text=");
    await expect(whatsapp).toHaveAttribute("target", "_blank");
    await expect(whatsapp).toHaveAttribute("rel", /noopener/);
    await expect(whatsapp).toHaveAccessibleName("Falar no WhatsApp com Sônia Portfolio");

    // O perfil é o botão de contorno na cor do tenant, não um botão cheio.
    const cores = await acao(page, "perfil").evaluate((el) => {
      const e = getComputedStyle(el);
      return { fundo: e.backgroundColor, borda: e.borderTopColor, texto: e.color };
    });
    expect(cores.borda).toBe(cores.texto);
    expect(cores.fundo).not.toBe(cores.borda);
  });

  test("sem contatos publicados: só o perfil, sem espaço reservado", async ({ page }) => {
    publicarPerfisNoBanco(IDS_E2E.membroPortfolioRui);
    try {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.goto(FICHA_SEM_CONTATOS);
      await expect(corretor(page)).toBeVisible();
      await expect(corretor(page).locator("[data-acao-corretor]")).toHaveCount(1);
      await expect(acao(page, "perfil")).toBeVisible();
      for (const chave of ["telefone", "whatsapp", "email"]) {
        await expect(acao(page, chave)).toHaveCount(0);
      }
      // Sem botão desabilitado só para preencher a linha.
      await expect(corretor(page).locator("button, [aria-disabled='true']")).toHaveCount(0);
      const card = await caixa(corretor(page));
      const perfil = await caixa(acao(page, "perfil"));
      expect(Math.abs(perfil.x + perfil.width - (card.x + card.width))).toBeLessThan(1);
    } finally {
      despublicarPerfisNoBanco(ORG_PORTFOLIO.slug);
      publicarPerfisNoBanco(SONIA);
    }
  });
});

// -----------------------------------------------------------------------
// Política de privacidade
// -----------------------------------------------------------------------
test.describe("política de privacidade", () => {
  test("o link da ficha abre a página, com header, rodapé e sem erros", async ({ page }) => {
    const erros = errosDoConsole(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FICHA_COM_CORRETOR);

    const link = linkPolitica(page);
    await expect(link).toHaveAttribute("href", POLITICA);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${POLITICA}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeVisible();
    await expect(page.locator("header [data-logo-site]")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.getByText(/Última atualização:/)).toBeVisible();
    expect(erros).toEqual([]);
  });

  test("conteúdo: uma h1, seções em ordem, sem contato inventado", async ({ page }) => {
    await page.goto(POLITICA);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const titulos = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    expect(titulos.map((t) => t.split(".")[0])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    expect(titulos[0]).toContain("Sobre esta política");
    expect(titulos.at(-1)).toContain("Como entrar em contato");

    const texto = await page.locator("main").innerText();
    // Nenhum canal fabricado: só os que a organização publicou.
    for (const inventado of ["dpo@", "privacidade@", "encarregado@", "lorem", "exemplo.com"]) {
      expect(texto.toLowerCase()).not.toContain(inventado);
    }
    // Nenhuma promessa absoluta de segurança ou de não compartilhamento.
    expect(texto).not.toMatch(/totalmente segur|100% segur|nunca compartilh/i);
    // O link de contato da própria organização existe e é real.
    await expect(page.getByRole("link", { name: "página de contato" })).toHaveAttribute(
      "href",
      `${BASE}/contato`
    );
  });

  test("tenant: a página fala em nome da organização da rota", async ({ page }) => {
    await page.goto(POLITICA);
    const daPortfolio = await page.locator("main").innerText();
    expect(daPortfolio).toContain("Organização E2E Portfólio");

    await page.goto("/e2e-org-navegacao/politica-de-privacidade");
    const daNavegacao = await page.locator("main").innerText();
    expect(daNavegacao).toContain("Organização E2E Navegação");
    expect(daNavegacao).not.toContain("Organização E2E Portfólio");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/e2e-org-navegacao\/politica-de-privacidade$/
    );
    await expect(page).toHaveTitle(/^Política de Privacidade \| Organização E2E Navegação$/);
  });

  test("rodapé: o link existe nas páginas públicas e leva à política", async ({ page }) => {
    for (const rota of [BASE, `${BASE}/imoveis`, FICHA_COM_CORRETOR]) {
      await page.goto(rota);
      const link = page.locator("footer").getByRole("link", { name: "Política de Privacidade" });
      await expect(link).toHaveAttribute("href", POLITICA);
    }
    await page.locator("footer").getByRole("link", { name: "Política de Privacidade" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeVisible();
  });

  test("organização principal: a política responde sem prefixo", async ({ page }) => {
    await page.goto("/politica-de-privacidade");
    await expect(page.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeVisible();
    await expect(page.locator("footer").getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute(
      "href",
      "/politica-de-privacidade"
    );
  });
});

// -----------------------------------------------------------------------
// Largura
// -----------------------------------------------------------------------
test.describe("largura", () => {
  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: ficha e política sem estouro, com o link alcançável`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });

      await page.goto(FICHA_COM_CORRETOR);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        `ficha @ ${largura}`
      ).toBe(true);
      // Corretor e formulário inteiros dentro do card, em qualquer largura.
      const card = await caixa(lateral(page));
      for (const alvo of [corretor(page), formulario(page).getByLabel("Nome"), linkPolitica(page)]) {
        const b = await caixa(alvo);
        expect(b.x + b.width, `${largura}`).toBeLessThanOrEqual(card.x + card.width + 1);
        expect(b.width).toBeGreaterThan(0);
      }
      // Alvo de toque das ações do corretor.
      for (const acao of await corretor(page).getByRole("link").all()) {
        expect((await caixa(acao)).height).toBeGreaterThanOrEqual(36);
      }

      await page.goto(POLITICA);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        `política @ ${largura}`
      ).toBe(true);
      // Linha de leitura confortável, medida em CARACTERES da própria
      // fonte da página — pixels dependeriam da fonte da máquina (a do
      // CI é mais larga que a daqui).
      const caracteresPorLinha = await page.locator("main p").nth(1).evaluate((el) => {
        const regua = document.createElement("span");
        regua.textContent = "0".repeat(100);
        regua.style.font = getComputedStyle(el).font;
        regua.style.position = "absolute";
        regua.style.whiteSpace = "pre";
        el.after(regua);
        const larguraDoCaractere = regua.getBoundingClientRect().width / 100;
        regua.remove();
        return el.getBoundingClientRect().width / larguraDoCaractere;
      });
      expect(caracteresPorLinha, `caracteres por linha @ ${largura}`).toBeLessThanOrEqual(90);
      // E o texto não acompanha a largura da tela nas telas largas.
      const paragrafo = await caixa(page.locator("main p").nth(1));
      if (largura >= 1024) expect(paragrafo.width).toBeLessThan(largura - 200);
      // Título e conteúdo dentro da viewport.
      const h1 = await caixa(page.getByRole("heading", { level: 1 }));
      expect(h1.x).toBeGreaterThanOrEqual(0);
      expect(h1.x + h1.width).toBeLessThanOrEqual(largura);
    });
  }
});
