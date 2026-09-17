import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E } from "./helpers";

// =======================================================================
// Galeria comercial da ficha (Fase 44)
// =======================================================================
// Desktop (>= lg): HERO de uma peça só — foto principal + até 4
// complementares. Abaixo de lg: carrossel. Os dois abrem o MESMO
// lightbox, com todas as fotos na ordem cadastrada.
//
// Os fixtures (seed, Organização W) usam SVGs numerados em data URL, com
// "<title>foto-N</title>": ler o src diz exatamente qual foto está em cada
// lugar, sem depender de screenshot.

const BASE = "/e2e-org-recursos";
const ficha = (id: string) => `${BASE}/imoveis/${id}`;
const DOBRA = 900;

const FIXTURES: Record<number, string> = {
  0: IDS_E2E.imovelGaleria0,
  1: IDS_E2E.imovelGaleria1,
  2: IDS_E2E.imovelGaleria2,
  3: IDS_E2E.imovelGaleria3,
  4: IDS_E2E.imovelGaleria4,
  5: IDS_E2E.imovelGaleria5,
  7: IDS_E2E.imovelGaleria7,
};

const hero = (page: Page) => page.locator("[data-galeria-hero]");
const carrossel = (page: Page) => page.locator("[data-galeria-carrossel]");
const lightbox = (page: Page) => page.locator("[data-lightbox]");

/** Número da foto a partir do src (data URL com <title>foto-N</title>). */
async function numerosDasFotos(imagens: Locator): Promise<number[]> {
  const srcs = await imagens.evaluateAll((els) => els.map((el) => el.getAttribute("src") ?? ""));
  return srcs.map((src) => {
    const m = decodeURIComponent(src).match(/<title>foto-(\d+)<\/title>/);
    return m ? Number(m[1]) : NaN;
  });
}

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

function dentro(
  interna: { x: number; y: number; width: number; height: number },
  externa: { x: number; y: number; width: number; height: number }
) {
  return (
    interna.x >= externa.x - 0.5 &&
    interna.y >= externa.y - 0.5 &&
    interna.x + interna.width <= externa.x + externa.width + 0.5 &&
    interna.y + interna.height <= externa.y + externa.height + 0.5
  );
}

async function semOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

const rotulo = (n: number) => `Ver galeria (${n} ${n === 1 ? "foto" : "fotos"})`;
const intervalo = (de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => de + i);

// -----------------------------------------------------------------------
// Desktop — composição do HERO
// -----------------------------------------------------------------------
test.describe("desktop — hero 1 + 4", () => {
  for (const largura of [1024, 1280, 1440]) {
    test(`${largura}px: principal dominante, 2x2 ao lado, vãos iguais, tudo dentro`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(ficha(IDS_E2E.imovelGaleria7));

      await expect(carrossel(page)).toBeHidden();
      const h = await caixa(hero(page));
      const principal = await caixa(page.locator("[data-foto-principal]"));
      const secundarias = page.locator("[data-foto-complementar]");
      await expect(secundarias).toHaveCount(4);
      const s = await Promise.all([0, 1, 2, 3].map((i) => caixa(secundarias.nth(i))));

      // Proporção do hero: horizontal, altura na faixa pedida.
      expect(h.width / h.height).toBeGreaterThan(2);
      expect(h.height).toBeGreaterThanOrEqual(largura >= 1280 ? 480 : 440);
      expect(h.height).toBeLessThanOrEqual(620);

      // Principal com 52–56% da largura e maior que qualquer secundária.
      const fracao = principal.width / h.width;
      expect(fracao).toBeGreaterThanOrEqual(0.52);
      expect(fracao).toBeLessThanOrEqual(0.56);
      for (const b of s) {
        expect(principal.width * principal.height).toBeGreaterThan(4 * b.width * b.height * 0.9);
      }
      expect(Math.abs(principal.height - h.height)).toBeLessThan(1);

      // 2x2: duas colunas e duas linhas, alinhadas.
      expect(Math.abs(s[0].y - s[1].y)).toBeLessThan(1);
      expect(Math.abs(s[2].y - s[3].y)).toBeLessThan(1);
      expect(Math.abs(s[0].x - s[2].x)).toBeLessThan(1);
      expect(Math.abs(s[1].x - s[3].x)).toBeLessThan(1);
      expect(s[1].x).toBeGreaterThan(s[0].x);
      expect(s[2].y).toBeGreaterThan(s[0].y);

      // Vãos consistentes: principal↔grade, entre colunas e entre linhas.
      const vaoPrincipal = s[0].x - (principal.x + principal.width);
      const vaoColunas = s[1].x - (s[0].x + s[0].width);
      const vaoLinhas = s[2].y - (s[0].y + s[0].height);
      expect(vaoPrincipal).toBeGreaterThan(2);
      expect(vaoPrincipal).toBeLessThan(16);
      expect(Math.abs(vaoColunas - vaoPrincipal)).toBeLessThan(1);
      expect(Math.abs(vaoLinhas - vaoPrincipal)).toBeLessThan(1);

      // Nada sai do hero, e o hero não sai da tela.
      expect(dentro(principal, h)).toBe(true);
      for (const b of s) expect(dentro(b, h)).toBe(true);
      expect(h.x + h.width).toBeLessThanOrEqual(largura);
      expect(await semOverflow(page)).toBe(true);

      // Cantos arredondados por fora, uma peça só.
      const raio = await hero(page).evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
      expect(raio).toBeGreaterThan(0);
      expect(await hero(page).evaluate((el) => getComputedStyle(el).overflow)).toBe("hidden");

      // CTA sobre a foto principal, no canto inferior esquerdo.
      const cta = hero(page).getByRole("button", { name: rotulo(7) });
      await expect(cta).toBeVisible();
      const c = await caixa(cta);
      expect(dentro(c, principal)).toBe(true);
      expect(c.x - principal.x).toBeLessThan(principal.width / 3);
      expect(c.y).toBeGreaterThan(principal.y + principal.height / 2);
    });
  }

  for (const largura of [1280, 1440]) {
    test(`${largura}px: a galeria não tira preço e CTA da primeira dobra (Fase 43)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(ficha(IDS_E2E.imovelGaleria7));

      const bloco = page.locator("[data-bloco-comercial]");
      for (const el of [
        page.getByRole("heading", { level: 1 }),
        bloco.locator('[data-preco="venda"]'),
        bloco.getByRole("link", { name: "Tenho interesse" }),
        hero(page).getByRole("button", { name: rotulo(7) }),
      ]) {
        const b = await caixa(el);
        expect(b.y + b.height).toBeLessThanOrEqual(DOBRA);
      }
      const h = await caixa(hero(page));
      expect(DOBRA - h.y).toBeGreaterThanOrEqual(400);
    });
  }
});

// -----------------------------------------------------------------------
// Quantidade de fotos
// -----------------------------------------------------------------------
test.describe("quantidade de fotos (1280px)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
  });

  test("0 fotos: aviso discreto, sem hero, sem CTA de galeria", async ({ page }) => {
    await page.goto(ficha(FIXTURES[0]));
    const vazio = page.locator("[data-galeria-vazia]");
    await expect(vazio).toHaveText("Sem fotos");
    const b = await caixa(vazio);
    expect(b.height).toBeLessThanOrEqual(200);
    await expect(hero(page)).toHaveCount(0);
    await expect(carrossel(page)).toHaveCount(0);
    await expect(page.locator("[data-ver-galeria]")).toHaveCount(0);
    // O preço e o CTA seguem na dobra mesmo sem foto.
    const cta = await caixa(page.locator("[data-bloco-comercial]").getByRole("link"));
    expect(cta.y + cta.height).toBeLessThanOrEqual(DOBRA);
  });

  for (const n of [1, 2, 3, 4, 5, 7]) {
    test(`${n} foto(s): grade sem repetição nem célula vazia, lightbox completo e em ordem`, async ({
      page,
    }) => {
      await page.goto(ficha(FIXTURES[n]));
      const h = await caixa(hero(page));
      const visiveis = Math.min(n, 5);

      // Exatamente as primeiras fotos, na ordem, sem repetição.
      const noHero = await numerosDasFotos(hero(page).locator("img"));
      expect(noHero).toEqual(intervalo(1, visiveis));

      const secundarias = page.locator("[data-foto-complementar]");
      await expect(secundarias).toHaveCount(visiveis - 1);
      const principal = await caixa(page.locator("[data-foto-principal]"));

      if (n === 1) {
        expect(Math.abs(principal.width - h.width)).toBeLessThan(1);
      } else {
        const lados = await Promise.all(
          intervalo(0, visiveis - 2).map((i) => caixa(secundarias.nth(i)))
        );
        // Nenhuma célula vazia: as complementares cobrem a coluna direita.
        const areaDireita = (h.x + h.width - (lados[0].x)) * h.height;
        const areaCoberta = lados.reduce((soma, b) => soma + b.width * b.height, 0);
        expect(areaCoberta / areaDireita).toBeGreaterThan(0.93);
        if (n === 2) expect(Math.abs(lados[0].height - h.height)).toBeLessThan(1);
        if (n === 3) {
          expect(Math.abs(lados[0].x - lados[1].x)).toBeLessThan(1);
          expect(lados[1].y).toBeGreaterThan(lados[0].y);
        }
        if (n === 4) {
          // Uma larga em cima, duas embaixo.
          expect(lados[0].width).toBeGreaterThan(lados[1].width * 1.9);
          expect(Math.abs(lados[1].y - lados[2].y)).toBeLessThan(1);
        }
      }

      // CTA com a contagem real.
      await expect(hero(page).locator("[data-ver-galeria]")).toHaveText(rotulo(n));

      // Mais de 5: a última célula avisa quantas faltam.
      if (n > 5) {
        const ultima = secundarias.last();
        await expect(ultima).toHaveAccessibleName(`Ver mais ${n - 5} fotos`);
        await expect(ultima).toContainText(`+${n - 5}`);
      } else {
        await expect(hero(page).getByText(/^\+\d+$/)).toHaveCount(0);
      }

      // Lightbox: todas as fotos, na ordem.
      await hero(page).locator("[data-ver-galeria]").click();
      await expect(lightbox(page)).toBeVisible();
      expect(await numerosDasFotos(lightbox(page).locator("img"))).toEqual(intervalo(1, n));
      if (n > 1) {
        await expect(lightbox(page).getByText(`1/${n}`)).toBeVisible();
        await lightbox(page).getByRole("button", { name: "Próxima foto" }).click();
        await expect(lightbox(page).getByText(`2/${n}`)).toBeVisible();
        await page.keyboard.press("ArrowLeft");
        await expect(lightbox(page).getByText(`1/${n}`)).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(lightbox(page)).toHaveCount(0);
    });
  }

  test("clicar numa complementar abre o lightbox nela; o +N abre na primeira que faltava", async ({
    page,
  }) => {
    await page.goto(ficha(FIXTURES[7]));
    await page.getByRole("button", { name: "Ampliar foto 3 de 7" }).click();
    await expect(lightbox(page).getByText("3/7")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Ver mais 2 fotos" }).click();
    await expect(lightbox(page).getByText("6/7")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Ampliar foto 1 de 7" }).click();
    await expect(lightbox(page).getByText("1/7")).toBeVisible();
  });
});

// -----------------------------------------------------------------------
// Celular e tablet — carrossel
// -----------------------------------------------------------------------
test.describe("abaixo de lg — carrossel", () => {
  for (const largura of [320, 390, 768]) {
    test(`${largura}px: carrossel utilizável, sem grade esmagada nem miniaturas`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto(ficha(IDS_E2E.imovelGaleria7));

      await expect(hero(page)).toBeHidden();
      await expect(page.locator("[data-foto-complementar] >> visible=true")).toHaveCount(0);
      const c = await caixa(carrossel(page));
      expect(c.width).toBeGreaterThanOrEqual(largura - 1);
      expect(c.height).toBeGreaterThanOrEqual(300);
      expect(await semOverflow(page)).toBe(true);

      // A faixa de miniaturas saiu: nenhuma imagem pequena visível.
      const pequenas = await page.locator("main img >> visible=true").evaluateAll((els) =>
        els.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.width < 120;
        }).length
      );
      expect(pequenas).toBe(0);

      // Fotos acessíveis: as 7 reais; os clones do giro ficam de fora.
      const acessiveis = await carrossel(page).locator("img").evaluateAll((els) =>
        els.filter((el) => !el.closest("[aria-hidden='true']")).map((el) => el.getAttribute("alt"))
      );
      expect(acessiveis).toEqual(intervalo(1, 7).map((i) => `Foto ${i} de 7 — Imovel Galeria 7 E2E`));

      // Contador, setas e CTA.
      const contador = carrossel(page).locator("[data-contador-fotos]");
      await expect(contador).toHaveText("1 / 7");
      await carrossel(page).getByRole("button", { name: "Próxima foto" }).click();
      await expect(contador).toHaveText("2 / 7");
      await carrossel(page).getByRole("button", { name: "Foto anterior" }).click();
      await carrossel(page).getByRole("button", { name: "Foto anterior" }).click();
      await expect(contador).toHaveText("7 / 7");

      const cta = carrossel(page).getByRole("button", { name: rotulo(7) });
      const b = await caixa(cta);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(dentro(b, c)).toBe(true);
      const contadorBox = await caixa(contador);
      expect(b.x + b.width).toBeLessThan(contadorBox.x);

      // O lightbox abre na foto em que o visitante está.
      await cta.click();
      await expect(lightbox(page).getByText("7/7")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(lightbox(page)).toHaveCount(0);
    });
  }

  test("390px: arrastar troca a foto", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(ficha(IDS_E2E.imovelGaleria7));
    const c = await caixa(carrossel(page));
    const contador = carrossel(page).locator("[data-contador-fotos]");
    await expect(contador).toHaveText("1 / 7");
    const y = c.y + c.height / 2;
    await page.mouse.move(c.x + c.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width * 0.5, y, { steps: 5 });
    await page.mouse.move(c.x + c.width * 0.15, y, { steps: 5 });
    await page.mouse.up();
    await expect(contador).toHaveText("2 / 7");
  });

  test("390px com 1 foto: sem setas nem contador, CTA presente", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(ficha(FIXTURES[1]));
    await expect(carrossel(page)).toBeVisible();
    await expect(carrossel(page).getByRole("button", { name: /Próxima foto|Foto anterior/ })).toHaveCount(0);
    await expect(carrossel(page).locator("[data-contador-fotos]")).toHaveCount(0);
    await expect(carrossel(page).getByRole("button", { name: rotulo(1) })).toBeVisible();
  });
});

// -----------------------------------------------------------------------
// Regras que a galeria não pode quebrar
// -----------------------------------------------------------------------
test.describe("acessibilidade, duplicidades e carregamento", () => {
  test("alt por posição, sem controles aninhados, teclado e foco de volta ao CTA", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelGaleria7));

    const alts = await hero(page).locator("img").evaluateAll((els) => els.map((el) => el.getAttribute("alt")));
    expect(alts).toEqual(intervalo(1, 5).map((i) => `Foto ${i} de 7 — Imovel Galeria 7 E2E`));

    // Nenhum botão/link dentro de outro.
    const aninhados = await page.evaluate(() =>
      [...document.querySelectorAll("[data-galeria-hero], [data-galeria-carrossel]")].reduce(
        (total, galeria) =>
          total + galeria.querySelectorAll("button button, button a, a button, a a").length,
        0
      )
    );
    expect(aninhados).toBe(0);

    // CTA pelo teclado, com foco visível; fechar devolve o foco a ele.
    const cta = hero(page).locator("[data-ver-galeria]");
    await cta.focus();
    await expect(cta).toBeFocused();
    expect(await cta.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(lightbox(page)).toBeVisible();
    await expect(lightbox(page)).toHaveAttribute("role", "dialog");
    await expect(lightbox(page).getByRole("button", { name: "Fechar" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(lightbox(page)).toHaveCount(0);
    await expect(cta).toBeFocused();
  });

  test("ações do lightbox preservadas: zoom, compartilhar e mensagem", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelGaleria5));
    await hero(page).locator("[data-ver-galeria]").click();
    const lb = lightbox(page);
    await expect(lb.getByRole("button", { name: "Aumentar zoom" })).toBeEnabled();
    await expect(lb.getByRole("button", { name: "Diminuir zoom" })).toBeDisabled();
    await expect(lb.getByRole("button", { name: "Compartilhar" })).toBeVisible();
    await expect(lb.getByRole("button", { name: "Enviar mensagem" })).toBeVisible();
    // Fora do lightbox segue existindo um único Compartilhar visível.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Compartilhar", exact: true })).toHaveCount(1);
  });

  for (const largura of [390, 1280]) {
    test(`${largura}px: nada de Compartilhar ou Vídeo dentro da galeria`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: DOBRA });
      await page.goto(ficha(IDS_E2E.imovelGaleria7));
      const galeria = largura >= 1024 ? hero(page) : carrossel(page);
      await expect(galeria.getByRole("button", { name: "Compartilhar" })).toHaveCount(0);
      await expect(galeria.getByText("Vídeo")).toHaveCount(0);
      await expect(galeria.locator('a[href="#videos"]')).toHaveCount(0);
      // Voltar continua sobre a foto.
      await expect(galeria.getByRole("button", { name: "Voltar" })).toBeVisible();
    });
  }

  test("só a foto principal pede prioridade de carregamento no desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelGaleria7));
    const principal = page.locator("[data-foto-principal] img");
    await expect(principal).toHaveAttribute("fetchpriority", "high");
    await expect(principal).toHaveAttribute("loading", "eager");
    // As complementares não disputam prioridade. (Não dá para exigir
    // loading="lazy" nestes fixtures: o next/image desliga o lazy para
    // src em data:, que é o que o seed usa.)
    const secundarias = page.locator("[data-foto-complementar] img");
    await expect(secundarias).toHaveCount(4);
    for (const img of await secundarias.all()) {
      await expect(img).not.toHaveAttribute("loading", "eager");
      await expect(img).not.toHaveAttribute("fetchpriority", "high");
    }
    // Nenhum preload de imagem: a LCP muda com a viewport (carrossel ×
    // hero), caso em que a doc do Next 16 pede eager + fetchPriority.
    await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(0);
  });

  test("com URL real do storage, a principal é eager/alta prioridade", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: DOBRA });
    await page.goto(ficha(IDS_E2E.imovelDobraVenda));
    const principal = page.locator("[data-foto-principal] img");
    await expect(principal).toHaveAttribute("src", /\/_next\/image\?url=/);
    await expect(principal).toHaveAttribute("loading", "eager");
    await expect(principal).toHaveAttribute("fetchpriority", "high");
    // sizes compatível com a célula: foto única ocupa a largura do hero.
    await expect(principal).toHaveAttribute("sizes", /1120px/);
  });
});
