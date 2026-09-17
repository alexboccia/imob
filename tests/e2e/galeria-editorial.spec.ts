import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E, ORG_RECURSOS, login } from "./helpers";

// =======================================================================
// Conteúdo editorial da galeria (Fase 45)
// =======================================================================
// Título e subtítulo do DESTAQUE (do imóvel), selo de entrega (regra do
// cabeçalho: lançamento + data) e legenda de cada FOTO (da mídia). Todos
// os textos abaixo são de fixture — o produto não tem nenhum deles.

const BASE = "/e2e-org-recursos";
const ficha = (id: string) => `${BASE}/imoveis/${id}`;
const edicao = (id: string) => `/app/imoveis/${id}`;
const DOBRA = 900;
const TITULO = "Um novo jeito de viver em Santana";
const SUBTITULO = "Conforto, modernidade e localização privilegiada.";

const principal = (page: Page) => page.locator("[data-foto-principal]");
const hero = (page: Page) => page.locator("[data-galeria-hero]");
const carrossel = (page: Page) => page.locator("[data-galeria-carrossel]");
const lightbox = (page: Page) => page.locator("[data-lightbox]");
const celulas = (page: Page) => page.locator("[data-foto-complementar]");

type Caixa = { x: number; y: number; width: number; height: number };

async function caixa(locator: Locator): Promise<Caixa> {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

const dentro = (a: Caixa, b: Caixa) =>
  a.x >= b.x - 0.5 &&
  a.y >= b.y - 0.5 &&
  a.x + a.width <= b.x + b.width + 0.5 &&
  a.y + a.height <= b.y + b.height + 0.5;

const colide = (a: Caixa, b: Caixa) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function semOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/** Legendas cuja caixa está inteira dentro de `area` (o slide visível). */
async function legendasVisiveisEm(page: Page, area: Caixa): Promise<string[]> {
  const todas = page.locator("[data-galeria-carrossel] [data-legenda-foto]");
  const textos: string[] = [];
  for (const el of await todas.all()) {
    const b = await el.boundingBox();
    if (b && dentro(b, area)) textos.push((await el.textContent()) ?? "");
  }
  return textos;
}

function vigiarDialogos(page: Page) {
  const dialogos: string[] = [];
  page.on("dialog", async (d) => {
    dialogos.push(d.message());
    await d.dismiss();
  });
  return dialogos;
}

// -----------------------------------------------------------------------
// Hero público — combinações
// -----------------------------------------------------------------------
test.describe("hero público (1280px)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
  });

  test("A) sem conteúdo editorial: a foto da Fase 44, sem gradiente nem rótulos", async ({ page }) => {
    await page.goto(ficha(IDS_E2E.imovelGaleria7));
    await expect(principal(page).locator("[data-selo-entrega]")).toHaveCount(0);
    await expect(principal(page).locator("[data-titulo-destaque]")).toHaveCount(0);
    await expect(principal(page).locator("[data-subtitulo-destaque]")).toHaveCount(0);
    await expect(principal(page).locator("[data-gradiente-destaque]")).toHaveCount(0);
    await expect(hero(page).locator("[data-legenda-foto]")).toHaveCount(0);
    // O CTA ocupa o mesmo canto de antes.
    const p = await caixa(principal(page));
    const cta = await caixa(principal(page).locator("[data-ver-galeria]"));
    expect(cta.y + cta.height).toBeGreaterThan(p.y + p.height - 40);
    expect(cta.x - p.x).toBeLessThan(40);
  });

  test("B) só título: nada de subtítulo, e a legenda da capa não disputa com ele", async ({ page }) => {
    await page.goto(ficha(IDS_E2E.imovelEditorialTitulo));
    await expect(principal(page).locator("[data-titulo-destaque]")).toHaveText(TITULO);
    await expect(principal(page).locator("[data-subtitulo-destaque]")).toHaveCount(0);
    await expect(principal(page).locator("[data-selo-entrega]")).toHaveCount(0);
    await expect(principal(page).getByText("Fachada")).toHaveCount(0);
    await expect(principal(page).locator("[data-gradiente-destaque]")).toHaveCount(1);
  });

  test("C) só subtítulo: não exige título", async ({ page }) => {
    await page.goto(ficha(IDS_E2E.imovelEditorialSubtitulo));
    await expect(principal(page).locator("[data-subtitulo-destaque]")).toHaveText(SUBTITULO);
    await expect(principal(page).locator("[data-titulo-destaque]")).toHaveCount(0);
  });

  test("D) título + subtítulo + legendas das complementares", async ({ page }) => {
    const dialogos = vigiarDialogos(page);
    await page.goto(ficha(IDS_E2E.imovelEditorialAmbos));
    await expect(principal(page).locator("[data-titulo-destaque]")).toHaveText(TITULO);
    await expect(principal(page).locator("[data-subtitulo-destaque]")).toHaveText(SUBTITULO);
    await expect(principal(page).getByText("Fachada")).toHaveCount(0);

    // Foto 2 com legenda; foto 3 sem legenda (nenhum rótulo vazio).
    await expect(celulas(page).nth(0).locator("[data-legenda-foto]")).toHaveText("Áreas comuns");
    await expect(celulas(page).nth(1).locator("[data-legenda-foto]")).toHaveCount(0);

    // Legenda longa: cortada com reticências, dentro da célula.
    const longa = celulas(page).nth(2).locator("[data-legenda-foto]");
    await expect(longa).toHaveText(/^Suíte máster com varanda gourmet/);
    expect(dentro(await caixa(longa), await caixa(celulas(page).nth(2)))).toBe(true);
    expect(await longa.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await longa.evaluate((el) => getComputedStyle(el).textOverflow)).toBe("ellipsis");

    // Texto que parece HTML aparece como texto e não executa.
    await expect(celulas(page).nth(3).locator("[data-legenda-foto]")).toHaveText("<script>alert(1)</script>");
    await expect(hero(page).locator("script")).toHaveCount(0);
    expect(dialogos).toEqual([]);
  });

  test("E) lançamento com data: selo 'Entrega prevista Nov/2027'; sem texto, a legenda da capa aparece", async ({
    page,
  }) => {
    await page.goto(ficha(IDS_E2E.imovelEditorialEntrega));
    const selo = principal(page).locator("[data-selo-entrega]");
    await expect(selo).toContainText("Entrega prevista");
    await expect(selo).toContainText("Nov/2027");
    await expect(selo.locator("svg")).toHaveAttribute("aria-hidden", "true");
    await expect(principal(page).locator("[data-titulo-destaque]")).toHaveCount(0);
    await expect(principal(page).locator("[data-legenda-foto]")).toHaveText("Fachada");
    // Nada de data crua.
    expect(await principal(page).innerText()).not.toMatch(/2027-11|01\/11\/2027|11\/01\/2027/);
  });

  test("F) data num imóvel pronto (não lançamento): sem selo", async ({ page }) => {
    await page.goto(ficha(IDS_E2E.imovelEditorialDataSemLancamento));
    await expect(principal(page).locator("[data-selo-entrega]")).toHaveCount(0);
    await expect(principal(page).getByText("Entrega prevista")).toHaveCount(0);
  });

  test("G) lançamento sem data: sem selo e sem placeholder", async ({ page }) => {
    await page.goto(ficha(IDS_E2E.imovelEditorialLancamentoSemData));
    await expect(page.getByText("Lançamento", { exact: true }).first()).toBeVisible();
    await expect(principal(page).locator("[data-selo-entrega]")).toHaveCount(0);
    expect(await principal(page).innerText()).not.toMatch(/entrega|em breve|consulte|—/i);
  });

  test("alt continua sendo a posição da foto, nunca o título do destaque nem a legenda", async ({ page }) => {
    await page.goto(ficha(IDS_E2E.imovelEditorialCompleto));
    const alts = await hero(page).locator("img").evaluateAll((els) => els.map((el) => el.getAttribute("alt")));
    expect(alts).toEqual(
      [1, 2, 3, 4, 5].map((i) => `Foto ${i} de 7 — Imovel Editorial Completo E2E`)
    );
  });
});

test.describe("H) composição completa", () => {
  for (const largura of [1024, 1280, 1440]) {
    test(`${largura}px: selo, título, subtítulo e CTA empilhados dentro da foto, sem colisão`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(ficha(IDS_E2E.imovelEditorialCompleto));

      const p = await caixa(principal(page));
      const partes = [
        principal(page).locator("[data-selo-entrega]"),
        principal(page).locator("[data-titulo-destaque]"),
        principal(page).locator("[data-subtitulo-destaque]"),
        principal(page).locator("[data-ver-galeria]"),
      ];
      const caixas = await Promise.all(partes.map(caixa));
      for (const b of caixas) expect(dentro(b, p)).toBe(true);
      for (let i = 1; i < caixas.length; i++) {
        expect(caixas[i].y).toBeGreaterThanOrEqual(caixas[i - 1].y + caixas[i - 1].height);
      }
      // Nada disso encosta no "Voltar".
      const voltar = await caixa(principal(page).getByRole("button", { name: "Voltar" }));
      for (const b of caixas) expect(colide(b, voltar)).toBe(false);

      // Texto claro sobre gradiente; a foto não é coberta inteira.
      await expect(principal(page).locator("[data-gradiente-destaque]")).toHaveCount(1);
      const titulo = principal(page).locator("[data-titulo-destaque]");
      expect(await titulo.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
      // O título domina o subtítulo.
      const tamanho = (el: Locator) => el.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      expect(await tamanho(titulo)).toBeGreaterThan(
        (await tamanho(principal(page).locator("[data-subtitulo-destaque]"))) * 1.3
      );

      // Legendas das complementares, cada uma dentro da sua célula; na do
      // "+N" a continuação vence e a legenda sai.
      const esperadas = ["Áreas comuns", "Apartamento decorado", "Academia"];
      for (const [i, texto] of esperadas.entries()) {
        const legenda = celulas(page).nth(i).locator("[data-legenda-foto]");
        await expect(legenda).toHaveText(texto);
        expect(dentro(await caixa(legenda), await caixa(celulas(page).nth(i)))).toBe(true);
      }
      await expect(celulas(page).nth(3)).toContainText("+2");
      await expect(celulas(page).nth(3).locator("[data-legenda-foto]")).toHaveCount(0);
      await expect(hero(page).getByText("Espaço gourmet")).toHaveCount(0);

      expect(await semOverflow(page)).toBe(true);

      // Fase 52 — o topo não tem comercial; o CTA da própria foto
      // continua na primeira dobra.
      if (largura >= 1280) {
        await expect(page.locator("[data-cabecalho-imovel] [data-preco]")).toHaveCount(0);
        const cta = caixas[3];
        expect(cta.y + cta.height).toBeLessThanOrEqual(DOBRA);
      }
    });
  }

  test("lightbox: legenda de cada foto; título do destaque não se repete", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelEditorialCompleto));
    await principal(page).locator("[data-ver-galeria]").click();
    const lb = lightbox(page);
    await expect(lb).toBeVisible();
    await expect(lb.getByText(TITULO)).toHaveCount(0);

    const legendaAtual = async () => {
      const area = await caixa(lb.locator(".swiper").first());
      const textos: string[] = [];
      for (const el of await lb.locator("[data-legenda-foto]").all()) {
        const b = await el.boundingBox();
        if (b && dentro(b, area)) textos.push((await el.textContent()) ?? "");
      }
      return textos;
    };

    await expect(lb.getByText("1/7")).toBeVisible();
    await expect.poll(legendaAtual).toEqual(["Fachada"]);
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    await expect(lb.getByText("5/7")).toBeVisible();
    await expect.poll(legendaAtual).toEqual(["Espaço gourmet"]);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(lb.getByText("7/7")).toBeVisible();
    await expect.poll(legendaAtual).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(lb).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// Celular e tablet
// -----------------------------------------------------------------------
test.describe("carrossel com conteúdo editorial", () => {
  for (const largura of [320, 390, 768]) {
    test(`${largura}px: 1º slide adaptado, sem colisão; legendas acompanham cada foto`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(ficha(IDS_E2E.imovelEditorialCompleto));

      const area = await caixa(carrossel(page));
      expect(area.width).toBeGreaterThanOrEqual(largura - 1);
      const conteudo = page.locator("[data-conteudo-destaque-carrossel]").first();
      const partes = [
        conteudo.locator("[data-selo-entrega]"),
        conteudo.locator("[data-titulo-destaque]"),
        conteudo.locator("[data-subtitulo-destaque]"),
      ];
      await expect(partes[0]).toContainText("Nov/2027");
      await expect(partes[1]).toHaveText(TITULO);
      await expect(partes[2]).toHaveText(SUBTITULO);

      const obstaculos = await Promise.all(
        [
          carrossel(page).getByRole("button", { name: "Foto anterior" }),
          carrossel(page).getByRole("button", { name: "Próxima foto" }),
          carrossel(page).getByRole("button", { name: "Voltar" }),
          carrossel(page).locator("[data-ver-galeria]"),
          carrossel(page).locator("[data-contador-fotos]"),
        ].map(caixa)
      );
      for (const parte of partes) {
        const b = await caixa(parte);
        expect(dentro(b, area), "texto fora da foto").toBe(true);
        for (const o of obstaculos) expect(colide(b, o), "texto encostando num controle").toBe(false);
      }
      // O texto não cobre a foto inteira: ocupa menos da metade da altura.
      const topoTexto = (await caixa(partes[0])).y;
      expect(area.y + area.height - topoTexto).toBeLessThan(area.height * 0.5);

      // 1º slide: há título, então a legenda da capa não aparece.
      expect(await legendasVisiveisEm(page, area)).toEqual([]);

      const proxima = carrossel(page).getByRole("button", { name: "Próxima foto" });
      const contador = carrossel(page).locator("[data-contador-fotos]");
      await proxima.click();
      await expect(contador).toHaveText("2 / 7");
      await expect.poll(() => legendasVisiveisEm(page, area)).toEqual(["Áreas comuns"]);
      // O texto do destaque saiu junto com o 1º slide.
      expect(dentro(await caixa(partes[1]), area)).toBe(false);

      await proxima.click();
      await expect(contador).toHaveText("3 / 7");
      await expect.poll(() => legendasVisiveisEm(page, area)).toEqual(["Apartamento decorado"]);

      // Da 1 para trás chega à 7, que não tem legenda.
      await carrossel(page).getByRole("button", { name: "Foto anterior" }).click();
      await carrossel(page).getByRole("button", { name: "Foto anterior" }).click();
      await carrossel(page).getByRole("button", { name: "Foto anterior" }).click();
      await expect(contador).toHaveText("7 / 7");
      await expect.poll(() => legendasVisiveisEm(page, area)).toEqual([]);

      expect(await semOverflow(page)).toBe(true);
    });
  }

  test("390px: só selo no 1º slide, e a legenda da capa aparece no alto", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(ficha(IDS_E2E.imovelEditorialEntrega));
    const area = await caixa(carrossel(page));
    await expect(page.locator("[data-conteudo-destaque-carrossel] [data-selo-entrega]").first()).toContainText(
      "Nov/2027"
    );
    await expect.poll(() => legendasVisiveisEm(page, area)).toEqual(["Fachada"]);
    const legenda = (await caixa(page.locator("[data-galeria-carrossel] [data-legenda-foto]").first()));
    const voltar = await caixa(carrossel(page).getByRole("button", { name: "Voltar" }));
    expect(colide(legenda, voltar)).toBe(false);
  });

  test("390px sem conteúdo editorial: carrossel igual ao da Fase 44", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(ficha(IDS_E2E.imovelGaleria7));
    await expect(page.locator("[data-conteudo-destaque-carrossel]")).toHaveCount(0);
    expect((await caixa(carrossel(page))).height).toBe(340);
  });
});

// -----------------------------------------------------------------------
// Admin
// -----------------------------------------------------------------------
test.describe("admin", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
  });

  const itens = (page: Page) => page.locator("[data-foto-admin]");
  const legenda = (page: Page, i: number) => itens(page).nth(i).getByLabel("Legenda (opcional)");
  const numeroDaFoto = (item: Locator) =>
    item.locator("img").evaluate((el) => {
      const m = decodeURIComponent(el.getAttribute("src") ?? "").match(/<title>foto-(\d+)<\/title>/);
      return m ? Number(m[1]) : NaN;
    });
  const ordemAtual = async (page: Page) =>
    Promise.all((await itens(page).all()).map((item) => numeroDaFoto(item)));

  async function salvar(page: Page) {
    await page.getByRole("button", { name: "Salvar imóvel" }).click();
    await page.waitForURL(/\?salvo=1/);
  }

  test("cadastra título, subtítulo e 5 legendas, e a ficha pública mostra tudo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(edicao(IDS_E2E.imovelEditorialAdmin));

    // Ponto de partida determinístico: capa na 1ª posição.
    await itens(page).nth(0).getByLabel("Capa").check();

    await expect(page.getByText("Conteúdo da foto de destaque")).toBeVisible();
    await page.getByLabel("Título (opcional)", { exact: true }).fill(TITULO);
    await page.getByLabel("Subtítulo (opcional)", { exact: true }).fill(SUBTITULO);
    const legendas = ["Fachada", "Áreas comuns", "Apartamento decorado", "Academia", "Espaço gourmet"];
    await expect(itens(page)).toHaveCount(5);
    for (const [i, texto] of legendas.entries()) await legenda(page, i).fill(texto);

    await salvar(page);
    await page.reload();
    await expect(page.getByLabel("Título (opcional)", { exact: true })).toHaveValue(TITULO);
    await expect(page.getByLabel("Subtítulo (opcional)", { exact: true })).toHaveValue(SUBTITULO);
    for (const [i, texto] of legendas.entries()) await expect(legenda(page, i)).toHaveValue(texto);

    await page.goto(ficha(IDS_E2E.imovelEditorialAdmin));
    await expect(principal(page).locator("[data-selo-entrega]")).toContainText("Nov/2027");
    await expect(principal(page).locator("[data-titulo-destaque]")).toHaveText(TITULO);
    await expect(principal(page).locator("[data-subtitulo-destaque]")).toHaveText(SUBTITULO);
    await expect(principal(page).locator("[data-ver-galeria]")).toHaveText("Ver galeria (5 fotos)");
    for (const [i, texto] of legendas.slice(1).entries()) {
      await expect(celulas(page).nth(i).locator("[data-legenda-foto]")).toHaveText(texto);
    }
  });

  test("reordenar B, C, A e trocar a capa: cada legenda fica na sua foto, o destaque fica no imóvel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    // Fotos identificadas pelo NÚMERO (src do fixture), nunca pela posição.
    // A = foto 1, B = foto 2, C = foto 3, D = foto 4.
    const foto = (n: number) => itens(page).filter({ has: page.locator(`img[src*="foto-${n}%3C"]`) });
    const legendaDa = (n: number) => foto(n).getByLabel("Legenda (opcional)");
    const recarregar = async () => {
      await page.reload();
      // O arraste depende dos handlers do React: sem esperar a hidratação,
      // o dragTo acontece sobre HTML ainda inerte e nada se move.
      await page.waitForLoadState("networkidle");
    };

    await page.goto(edicao(IDS_E2E.imovelEditorialAdmin));
    await page.waitForLoadState("networkidle");
    // A capa é sempre listada primeiro no formulário; para reordenar A, B e
    // C livremente, a capa fica em D durante esta parte.
    await foto(4).getByLabel("Capa").check();
    await page.getByLabel("Título (opcional)", { exact: true }).fill(TITULO);
    await page.getByLabel("Subtítulo (opcional)", { exact: true }).fill(SUBTITULO);
    await legendaDa(1).fill("Fachada");
    await legendaDa(2).fill("Academia");
    await legendaDa(3).fill("");
    await legendaDa(4).fill("");
    await legendaDa(5).fill("");
    await salvar(page);
    await recarregar();
    expect(await ordemAtual(page)).toEqual([4, 1, 2, 3, 5]);

    // Arrasta A (pela imagem) para o lugar de C: D, B, C, A, E.
    await foto(1).locator("[data-arrastar-foto]").dragTo(foto(3));
    expect(await ordemAtual(page)).toEqual([4, 2, 3, 1, 5]);
    await expect(legendaDa(2)).toHaveValue("Academia");
    await expect(legendaDa(3)).toHaveValue("");
    await expect(legendaDa(1)).toHaveValue("Fachada");
    // E cada campo continua na posição da sua foto.
    await expect(legenda(page, 1)).toHaveValue("Academia");
    await expect(legenda(page, 2)).toHaveValue("");
    await expect(legenda(page, 3)).toHaveValue("Fachada");

    await salvar(page);
    await recarregar();
    expect(await ordemAtual(page)).toEqual([4, 2, 3, 1, 5]);
    await expect(legendaDa(2)).toHaveValue("Academia");
    await expect(legendaDa(3)).toHaveValue("");
    await expect(legendaDa(1)).toHaveValue("Fachada");

    // Capa em A, depois em B: nenhuma legenda muda de foto e o destaque
    // continua o mesmo.
    for (const [capa, legendaDaCapa] of [
      [1, "Fachada"],
      [2, "Academia"],
    ] as const) {
      await foto(capa).getByLabel("Capa").check();
      await salvar(page);
      await recarregar();
      expect((await ordemAtual(page))[0]).toBe(capa);
      await expect(foto(capa).getByLabel("Capa")).toBeChecked();
      await expect(legendaDa(1)).toHaveValue("Fachada");
      await expect(legendaDa(2)).toHaveValue("Academia");
      await expect(legendaDa(3)).toHaveValue("");
      await expect(page.getByLabel("Título (opcional)", { exact: true })).toHaveValue(TITULO);
      await expect(page.getByLabel("Subtítulo (opcional)", { exact: true })).toHaveValue(SUBTITULO);

      // Público: a nova capa é o destaque, com o MESMO título; a legenda
      // dela não aparece ali (há título).
      await page.goto(ficha(IDS_E2E.imovelEditorialAdmin));
      await expect(principal(page).locator(`img[src*="foto-${capa}%3C"]`)).toHaveCount(1);
      await expect(principal(page).locator("[data-titulo-destaque]")).toHaveText(TITULO);
      await expect(principal(page).getByText(legendaDaCapa)).toHaveCount(0);
      await page.goto(edicao(IDS_E2E.imovelEditorialAdmin));
      await page.waitForLoadState("networkidle");
    }

    // Com B como capa, A voltou a ser uma complementar — com a legenda dela.
    await page.goto(ficha(IDS_E2E.imovelEditorialAdmin));
    const celulaDeA = celulas(page).filter({ has: page.locator('img[src*="foto-1%3C"]') });
    await expect(celulaDeA).toHaveCount(1);
    await expect(celulaDeA.locator("[data-legenda-foto]")).toHaveText("Fachada");
  });

  test("interagir com a legenda não arrasta a foto: seleção, teclado, copiar/colar e Tab", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(edicao(IDS_E2E.imovelEditorialAdmin));
    const antes = await ordemAtual(page);
    const campo = legenda(page, 0);

    await campo.fill("Fachada");
    await campo.click();
    await expect(campo).toBeFocused();

    // Selecionar arrastando o mouse a partir do FIM do texto, dentro do
    // campo (a âncora fica depois da última letra; ir para a esquerda
    // estende a seleção até o início).
    const b = await caixa(campo);
    await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 8, b.y + b.height / 2, { steps: 5 });
    expect(await campo.evaluate((el: HTMLInputElement) => (el.selectionEnd ?? 0) - (el.selectionStart ?? 0))).toBe(7);
    // Continua arrastando até sobre outra foto: com o item inteiro
    // arrastável, era aqui que a foto trocava de lugar.
    const outra = await caixa(itens(page).nth(2));
    await page.mouse.move(outra.x + 20, outra.y + 20, { steps: 5 });
    await page.mouse.up();
    expect(await ordemAtual(page)).toEqual(antes);
    await expect(campo).toHaveValue("Fachada");
    expect(await campo.evaluate((el: HTMLInputElement) => (el.selectionEnd ?? 0) - (el.selectionStart ?? 0))).toBeGreaterThan(0);

    // Teclado: início/fim da linha e setas. No macOS o Chrome não move o
    // cursor com Home/End num input — lá o equivalente é Cmd+←/→.
    const mac = process.platform === "darwin";
    const inicio = mac ? "Meta+ArrowLeft" : "Home";
    const fim = mac ? "Meta+ArrowRight" : "End";
    await campo.press(inicio);
    await page.keyboard.type("A ");
    await campo.press(fim);
    await page.keyboard.type(" B");
    await campo.press("ArrowLeft");
    await campo.press("ArrowLeft");
    await page.keyboard.type("X");
    await expect(campo).toHaveValue("A FachadaX B");

    // Copiar e colar.
    await campo.press("ControlOrMeta+a");
    await campo.press("ControlOrMeta+c");
    await campo.press(fim);
    await campo.press("ControlOrMeta+v");
    await expect(campo).toHaveValue("A FachadaX BA FachadaX B");

    // Enter não envia o imóvel; Tab sai do campo.
    await campo.press("Enter");
    await expect(page).not.toHaveURL(/salvo=1/);
    await campo.press("Tab");
    await expect(campo).not.toBeFocused();

    expect(await ordemAtual(page)).toEqual(antes);
  });

  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: card Fotos com legendas, sem overflow nem controle espremido`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(edicao(IDS_E2E.imovelEditorialCompleto));
      await expect(itens(page)).toHaveCount(7);
      const card = page.locator('[data-slot="card"]').filter({
        has: page.locator('[data-slot="card-title"]', { hasText: /^Fotos$/ }),
      });
      const c = await caixa(card);
      for (const item of await itens(page).all()) {
        const i = await caixa(item);
        expect(dentro(i, c)).toBe(true);
        const imagem = await caixa(item.locator("[data-arrastar-foto]"));
        const remover = await caixa(item.getByRole("button", { name: "Remover foto" }));
        expect(dentro(remover, imagem)).toBe(true);
        expect(remover.width).toBeGreaterThanOrEqual(20);
        const campo = await caixa(item.getByLabel("Legenda (opcional)"));
        expect(campo.width, `legenda estreita @ ${largura}px`).toBeGreaterThanOrEqual(100);
        expect(dentro(campo, i)).toBe(true);
        await expect(item.getByLabel("Capa")).toBeVisible();
      }
      for (const nome of ["Título (opcional)", "Subtítulo (opcional)"]) {
        const b = await caixa(page.getByLabel(nome, { exact: true }));
        expect(dentro(b, c)).toBe(true);
        expect(b.width).toBeGreaterThanOrEqual(200);
      }
      expect(await semOverflow(page)).toBe(true);
    });
  }

  test("limite do título é validado pelo servidor", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(edicao(IDS_E2E.imovelEditorialAdmin));
    await page.getByLabel("Título (opcional)", { exact: true }).evaluate((el, texto) => {
      const campo = el as HTMLInputElement;
      campo.removeAttribute("maxlength");
      campo.value = texto;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    }, "x".repeat(81));
    await page.getByRole("button", { name: "Salvar imóvel" }).click();
    await expect(page.getByText(/título do destaque deve ter no máximo 80/i)).toBeVisible();
  });
});
