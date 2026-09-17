import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E } from "./helpers";

// =======================================================================
// Primeira tela comercial da ficha (Fase 43)
// =======================================================================
// No desktop, IDENTIDADE + PREÇO + AÇÃO + IMAGEM sem rolar. A prova é por
// bounding box contra a altura real da janela (900px) — `toBeVisible()`
// sozinho aceitaria um preço lá embaixo, que é exatamente o defeito que
// esta fase corrige.
//
// Organização W não tem WhatsApp: aqui o CTA do cabeçalho é o fallback
// para o formulário. O caso com WhatsApp (href e placement HEADER) vive
// em analytics-tracking.spec.ts, na organização dedicada a cliques.

const BASE = "/e2e-org-recursos";
const ficha = (id: string) => `${BASE}/imoveis/${id}`;
const DOBRA = 900;
const DESKTOP = [1280, 1440];
const MOBILE = [320, 390, 768];

const bloco = (page: Page) => page.locator("[data-bloco-comercial]");
const semEspacoEspecial = (s: string) => s.replace(/\s+/g, " ");

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

/** Inteiro acima da dobra, sem rolar. */
async function acimaDaDobra(locator: Locator, nome: string) {
  await expect(locator, nome).toBeVisible();
  const box = await caixa(locator);
  expect(box.y + box.height, `${nome} abaixo da dobra`).toBeLessThanOrEqual(DOBRA);
}

async function semOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

// -----------------------------------------------------------------------
// Desktop — o que tem de estar na primeira tela
// -----------------------------------------------------------------------
test.describe("desktop — primeira dobra", () => {
  for (const largura of DESKTOP) {
    test(`${largura}px SALE: identidade, preço, custos, ação e galeria sem rolar`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(ficha(IDS_E2E.imovelDobraVenda));

      await acimaDaDobra(page.getByRole("heading", { level: 1 }), "título");
      // Fase 46 — tipo e finalidade agora vêm no breadcrumb.
      const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
      await acimaDaDobra(breadcrumb.getByRole("link", { name: "Comprar", exact: true }), "finalidade");
      await acimaDaDobra(breadcrumb.getByRole("link", { name: "Apartamento", exact: true }), "tipo");

      const preco = bloco(page).locator('[data-preco="venda"]');
      await acimaDaDobra(preco, "preço");
      expect(semEspacoEspecial(await preco.innerText())).toBe("R$ 850.000");

      // Custos com o rótulo e o formato do card lateral — sem "/mês"
      // inventado: o cadastro não diz a periodicidade.
      const custos = semEspacoEspecial(await bloco(page).locator("dl").innerText());
      expect(custos).toContain("Condomínio:");
      expect(custos).toContain("R$ 720");
      expect(custos).toContain("IPTU:");
      expect(custos).toContain("R$ 310");
      expect(custos).not.toMatch(/mês|ano/);

      await acimaDaDobra(bloco(page).getByRole("link", { name: "Tenho interesse" }), "CTA");

      // Parte significativa da galeria também está na primeira tela.
      const foto = await caixa(page.getByRole("button", { name: "Ampliar foto" }).first());
      expect(foto.y).toBeLessThan(DOBRA);
      expect(DOBRA - foto.y, "galeria quase toda abaixo da dobra").toBeGreaterThanOrEqual(300);

      // Sem vídeo: nenhuma seção de vídeo, layout coerente.
      await expect(page.locator("#videos")).toHaveCount(0);
      expect(await semOverflow(page)).toBe(true);
    });

    test(`${largura}px com dois vídeos e dois preços: nada sai da primeira dobra`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(ficha(IDS_E2E.imovelDobraAmbos));

      await acimaDaDobra(page.getByRole("heading", { level: 1 }), "título");
      await acimaDaDobra(bloco(page).locator('[data-preco="venda"]'), "preço de venda");
      await acimaDaDobra(bloco(page).locator('[data-preco="aluguel"]'), "preço de aluguel");
      await acimaDaDobra(bloco(page).getByRole("link", { name: "Tenho interesse" }), "CTA");

      // O vídeo mora na coluna principal: começa depois da dobra e não
      // invade a coluna do card lateral.
      const videos = await caixa(page.locator("#videos"));
      const lateral = await caixa(page.locator("[data-card-contato]"));
      expect(videos.y).toBeGreaterThan(DOBRA);
      expect(videos.x + videos.width).toBeLessThanOrEqual(lateral.x);
      // E o card lateral não foi empurrado para o fim da página por ele.
      expect(lateral.y).toBeLessThan(videos.y);
      expect(await semOverflow(page)).toBe(true);
    });

    test(`${largura}px com vídeo, tour e planta: preço e ação continuam na dobra`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(ficha(IDS_E2E.imovelTresRecursos));
      await acimaDaDobra(bloco(page).locator('[data-preco="venda"]'), "preço");
      await acimaDaDobra(bloco(page).getByRole("link", { name: "Tenho interesse" }), "CTA");
    });
  }

  test("RENT: aluguel mensal, sem preço de venda nem rótulo de finalidade dupla", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelDobraAluguel));

    const precos = bloco(page).locator("[data-preco]");
    await expect(precos).toHaveCount(1);
    const aluguel = bloco(page).locator('[data-preco="aluguel"]');
    await acimaDaDobra(aluguel, "aluguel");
    expect(semEspacoEspecial(await aluguel.innerText())).toBe("R$ 4.500/mês");
    await expect(bloco(page).getByText(/Para (comprar|alugar)/)).toHaveCount(0);
    await acimaDaDobra(bloco(page).getByRole("link", { name: "Tenho interesse" }), "CTA");
  });

  test("SALE_AND_RENT: os dois valores, cada um com o seu rótulo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelDobraAmbos));

    const venda = bloco(page).locator('[data-preco="venda"]');
    const aluguel = bloco(page).locator('[data-preco="aluguel"]');
    expect(semEspacoEspecial(await venda.innerText())).toMatch(/^Para comprar\s*R\$ 900\.000$/);
    expect(semEspacoEspecial(await aluguel.innerText())).toMatch(
      /^Para alugar\s*R\$ 5\.000\/mês$/
    );

    // Mesma regra do card lateral: os mesmos dois valores lá.
    const lateral = page.locator("[data-card-contato]");
    await expect(lateral.locator("[data-preco]")).toHaveCount(2);
    expect(semEspacoEspecial(await lateral.locator('[data-preco="aluguel"]').innerText())).toBe(
      semEspacoEspecial(await aluguel.innerText())
    );
  });

  test("sem preço cadastrado: nenhum valor inventado, e a ação continua", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelDobraSemPreco));

    await expect(bloco(page).locator("[data-preco]")).toHaveCount(0);
    await expect(bloco(page).locator("[data-valores-imovel]")).toHaveCount(0);
    expect(await bloco(page).innerText()).not.toMatch(/consult|a partir|R\$/i);
    await acimaDaDobra(bloco(page).getByRole("link", { name: "Tenho interesse" }), "CTA");
  });

  test("sem WhatsApp, o CTA leva ao formulário do card lateral (teclado incluso)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelDobraVenda));

    await expect(bloco(page).locator('a[href*="wa.me"]')).toHaveCount(0);
    const cta = bloco(page).getByRole("link", { name: "Tenho interesse" });
    await expect(cta).toHaveAttribute("href", "#contato-imovel");
    await expect(page.locator("#contato-imovel")).toHaveCount(1);

    // Navegável por teclado, com foco visível.
    await cta.focus();
    await expect(cta).toBeFocused();
    const anel = await cta.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(anel).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contato-imovel$/);
    await expect(page.locator("#contato-imovel")).toBeInViewport();
  });
});

// -----------------------------------------------------------------------
// Duplicidades removidas
// -----------------------------------------------------------------------
test.describe("um controle por função fora do lightbox", () => {
  for (const largura of [390, 1280]) {
    test(`${largura}px: exatamente um Compartilhar e um atalho de vídeo visíveis`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(ficha(IDS_E2E.imovelTresRecursos));

      // Fase 47 — o Compartilhar do cabeçalho agora tem texto visível.
      await expect(page.getByRole("button", { name: "Compartilhar", exact: true })).toHaveCount(1);
      await expect(page.locator('a[href="#videos"] >> visible=true')).toHaveCount(1);
      // O atalho que sobra é o da barra de recursos.
      await expect(
        page.locator("[data-recursos-imovel]").getByRole("link", { name: "Vídeo" })
      ).toHaveAttribute("href", "#videos");
    });
  }

  test("o Compartilhar do lightbox continua funcionando", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelTresRecursos));
    await page.evaluate(() => {
      delete (window.navigator as unknown as { share?: unknown }).share;
    });

    await page.getByRole("button", { name: "Ampliar foto" }).first().click();
    const fechar = page.getByRole("button", { name: "Fechar" });
    await expect(fechar).toBeVisible();

    // Dentro do lightbox há um segundo contexto de compartilhamento.
    const compartilhar = page.getByRole("button", { name: "Compartilhar", exact: true });
    await expect(compartilhar).toHaveCount(2);
    await page.locator("[data-lightbox]").getByRole("button", { name: "Compartilhar" }).click();
    await expect(page.getByText("Link copiado", { exact: true })).toBeVisible();
    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiado).toContain(`/imoveis/${IDS_E2E.imovelTresRecursos}`);
    // Fase 47 — a mesma URL canônica do menu do cabeçalho.
    expect(copiado).toBe(await page.locator('link[rel="canonical"]').getAttribute("href"));

    // As demais ações do lightbox seguem ali.
    const lightbox = page.locator("div.fixed.inset-0", {
      has: page.getByRole("button", { name: "Aumentar zoom" }),
    });
    await expect(lightbox.getByRole("button", { name: "Aumentar zoom" })).toBeVisible();
    await expect(lightbox.getByRole("button", { name: "Enviar mensagem" })).toBeVisible();
    await fechar.click();
    await expect(fechar).toBeHidden();
  });
});

// -----------------------------------------------------------------------
// Vídeos — posição e acessibilidade
// -----------------------------------------------------------------------
const BLOCOS_DA_COLUNA: [string, (page: Page) => Locator][] = [
  ["Descrição", (p) => p.getByRole("heading", { name: "Descrição", exact: true })],
  ["Frase", (p) => p.locator("[data-frase-destaque]")],
  ["Características", (p) => p.locator("[data-caracteristicas]").first()],
  ["Vídeo", (p) => p.locator("#videos")],
  ["Obra", (p) => p.getByRole("heading", { name: /Evolução da obra/ })],
  ["Plantas", (p) => p.locator("#plantas")],
  ["Materiais", (p) => p.locator("[data-materiais-imovel]")],
  ["Localização", (p) => p.getByRole("heading", { name: "Localização", exact: true })],
  ["Por perto", (p) => p.locator("[data-locais-proximos]")],
  // Fase 51 — o corretor saiu da coluna de conteúdo para a lateral,
  // logo acima do formulário (ver lateral-imovel.spec.ts).
];

/** Os blocos presentes, na ordem do documento — e em y crescente. */
async function blocosEmOrdem(page: Page): Promise<string[]> {
  const presentes: { nome: string; y: number; el: Locator }[] = [];
  for (const [nome, achar] of BLOCOS_DA_COLUNA) {
    const el = achar(page);
    if ((await el.count()) === 0) continue;
    presentes.push({ nome, y: (await caixa(el)).y, el });
  }
  for (let i = 1; i < presentes.length; i++) {
    const antes = await presentes[i - 1].el.elementHandle();
    const depois = await presentes[i].el.elementHandle();
    const emOrdem = await page.evaluate(
      ([a, b]) => Boolean(a!.compareDocumentPosition(b!) & Node.DOCUMENT_POSITION_FOLLOWING),
      [antes, depois]
    );
    expect(emOrdem, `${presentes[i - 1].nome} deveria vir antes de ${presentes[i].nome}`).toBe(true);
    expect(presentes[i].y).toBeGreaterThan(presentes[i - 1].y);
  }
  return presentes.map((p) => p.nome);
}

test.describe("ordem da coluna principal", () => {
  test("Descrição < Frase < Características < Vídeo < Localização", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelDobraAmbos));
    expect(await blocosEmOrdem(page)).toEqual([
      "Descrição",
      "Frase",
      "Características",
      "Vídeo",
      "Localização",
    ]);
  });

  test("Vídeo < Plantas < Localização (sem descrição, a sequência se fecha)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelTresRecursos));
    expect(await blocosEmOrdem(page)).toEqual(["Vídeo", "Plantas", "Localização"]);
  });

  test("lançamento sem vídeo: Características < Obra < Materiais < Localização", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(`/e2e-org-a/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    expect(await blocosEmOrdem(page)).toEqual([
      "Descrição",
      "Características",
      "Obra",
      "Materiais",
      "Localização",
    ]);
  });

  test("sem vídeo, o espaçamento da coluna não abre vão", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelComLocais));
    expect(await blocosEmOrdem(page)).toEqual(["Localização", "Por perto"]);
    // O primeiro bloco da coluna começa no topo da grade, alinhado ao
    // card lateral — nenhum espaço reservado para um vídeo inexistente.
    const localizacao = await caixa(page.getByRole("heading", { name: "Localização", exact: true }));
    const lateral = await caixa(page.locator("[data-card-contato]"));
    expect(Math.abs(localizacao.y - lateral.y)).toBeLessThan(40);
  });
});

test.describe("vídeos — acessibilidade e largura", () => {
  test("cada iframe tem título descritivo e distinto", async ({ page }) => {
    await page.goto(ficha(IDS_E2E.imovelDobraAmbos));
    const secao = page.locator("#videos");
    await expect(secao.getByRole("heading", { name: "Vídeos" })).toBeVisible();
    const frames = secao.locator("iframe");
    await expect(frames).toHaveCount(2);
    await expect(frames.nth(0)).toHaveAttribute(
      "title",
      "Vídeo do imóvel Imovel Dobra Venda e Locacao E2E — 1"
    );
    await expect(frames.nth(1)).toHaveAttribute(
      "title",
      "Vídeo do imóvel Imovel Dobra Venda e Locacao E2E — 2"
    );
  });

  test("um vídeo só: título sem numeração", async ({ page }) => {
    await page.goto(ficha(IDS_E2E.imovelTresRecursos));
    const secao = page.locator("#videos");
    await expect(secao.getByRole("heading", { name: "Vídeo", exact: true })).toBeVisible();
    await expect(secao.locator("iframe")).toHaveAttribute(
      "title",
      "Vídeo do imóvel Imovel Tres Recursos E2E"
    );
  });

  for (const largura of [...MOBILE, ...DESKTOP]) {
    test(`${largura}px: o vídeo cabe na coluna e mantém 16:9`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(ficha(IDS_E2E.imovelDobraAmbos));
      const frame = await caixa(page.locator("#videos iframe").first());
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(largura);
      expect(Math.abs(frame.width / frame.height - 16 / 9)).toBeLessThan(0.02);
      expect(await semOverflow(page)).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------
// Mobile e tablet — a barra fixa continua sendo o bloco comercial
// -----------------------------------------------------------------------
test.describe("abaixo de lg", () => {
  for (const largura of MOBILE) {
    test(`${largura}px: sem bloco comercial no topo; barra fixa com preço e contato`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto(ficha(IDS_E2E.imovelDobraVenda));

      await expect(bloco(page)).toBeHidden();
      const barra = page.locator("[data-cta-imovel]");
      await expect(barra).toBeVisible();
      await expect(barra.locator("[data-precos-barra] p")).toHaveCount(1);
      expect(semEspacoEspecial(await barra.locator("[data-precos-barra]").innerText())).toBe(
        "R$ 850.000"
      );

      const contato = barra.getByRole("link", { name: "Contato" });
      const box = await caixa(contato);
      expect(box.x + box.width).toBeLessThanOrEqual(largura);
      await contato.click();
      await expect(page.locator("#contato-imovel")).toBeInViewport();
      expect(await semOverflow(page)).toBe(true);
    });

    test(`${largura}px SALE_AND_RENT: a barra mostra os dois valores`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto(ficha(IDS_E2E.imovelDobraAmbos));

      const precos = page.locator("[data-cta-imovel] [data-precos-barra] p");
      await expect(precos).toHaveCount(2);
      // Texto acessível completo; visualmente o "/mês" distingue o aluguel.
      expect(semEspacoEspecial(await precos.nth(0).textContent() ?? "")).toBe(
        "Para comprar: R$ 900.000"
      );
      expect(semEspacoEspecial(await precos.nth(1).textContent() ?? "")).toBe(
        "Para alugar: R$ 5.000/mês"
      );
      // Nada da barra sai da tela, mesmo em 320px.
      for (const el of await page.locator("[data-cta-imovel] p, [data-cta-imovel] a").all()) {
        const box = await caixa(el);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(largura);
      }
      expect(await semOverflow(page)).toBe(true);
    });
  }

  test("RENT na barra: um valor, mensal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(ficha(IDS_E2E.imovelDobraAluguel));
    const precos = page.locator("[data-cta-imovel] [data-precos-barra]");
    expect(semEspacoEspecial(await precos.innerText())).toBe("R$ 4.500/mês");
  });

  test("sem preço: a barra não inventa valor", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(ficha(IDS_E2E.imovelDobraSemPreco));
    const barra = page.locator("[data-cta-imovel]");
    await expect(barra).toBeVisible();
    await expect(barra.locator("[data-precos-barra]")).toHaveCount(0);
    expect(await barra.innerText()).not.toMatch(/consult|R\$/i);
  });
});
