import { test, expect, type Locator, type Page } from "@playwright/test";
import { IDS_E2E, ORG_NAVEGACAO } from "./helpers";

// =======================================================================
// Imóvel anterior / Próximo imóvel (Fase 48)
// =======================================================================
// A sequência é a da listagem pública padrão da organização. A
// Organização Y (seed) tem três imóveis publicados — Recente, Meio,
// Antigo, nessa ordem — e um rascunho, um inativo e um reservado com
// datas ENTRE eles, que nunca podem aparecer como vizinhos.

const BASE = `/${ORG_NAVEGACAO.slug}`;
const ficha = (id: string) => `${BASE}/imoveis/${id}`;
const RECENTE = IDS_E2E.imovelNavegacaoRecente;
const MEIO = IDS_E2E.imovelNavegacaoMeio;
const ANTIGO = IDS_E2E.imovelNavegacaoAntigo;
const TITULO = {
  [RECENTE]: "Imovel Navegacao Recente E2E",
  [MEIO]: "Imovel Navegacao Meio E2E",
  [ANTIGO]: "Imovel Navegacao Antigo E2E",
} as Record<string, string>;

const cabecalho = (page: Page) => page.locator("[data-cabecalho-imovel]");
const anterior = (page: Page) => page.getByRole("link", { name: "Imóvel anterior", exact: true });
const proximo = (page: Page) => page.getByRole("link", { name: "Próximo imóvel", exact: true });
const anteriorDesabilitado = (page: Page) =>
  page.getByRole("button", { name: "Imóvel anterior", exact: true });
const proximoDesabilitado = (page: Page) =>
  page.getByRole("button", { name: "Próximo imóvel", exact: true });
const seta = (page: Page, direcao: "anterior" | "proximo") =>
  page.locator(`[data-seta-imovel="${direcao}"]`);
const botaoCompartilhar = (page: Page) =>
  page.locator("[data-acoes-imovel]").getByRole("button", { name: "Compartilhar", exact: true });
const botaoSalvar = (page: Page) => page.locator("[data-salvar-imovel]");
const canonica = (page: Page) => page.locator('link[rel="canonical"]').getAttribute("href");

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa").not.toBeNull();
  return box!;
}

function errosDoConsole(page: Page) {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

async function estaNaFicha(page: Page, id: string) {
  await expect(page).toHaveURL(new RegExp(`${ficha(id)}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITULO[id]);
  // Exatamente UMA canônica, a da ficha nova. Durante a troca no cliente
  // a antiga e a nova coexistem por um instante; ler com strict mode ali
  // lançaria em vez de esperar.
  await expect
    .poll(() =>
      page.locator('link[rel="canonical"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")))
    )
    .toEqual([expect.stringMatching(new RegExp(`${ficha(id)}$`))]);
}

// -----------------------------------------------------------------------
// Sequência
// -----------------------------------------------------------------------
test.describe("sequência", () => {
  test("é a ordem da listagem pública padrão, sem rascunho, inativo ou reservado", async ({ page }) => {
    await page.goto(`${BASE}/imoveis`);
    const hrefs = await page
      .locator('a[href*="/imoveis/e2e-imovel-navegacao"]')
      .evaluateAll((els) => [...new Set(els.map((a) => new URL((a as HTMLAnchorElement).href).pathname))]);
    expect(hrefs).toEqual([ficha(RECENTE), ficha(MEIO), ficha(ANTIGO)]);

    // Cada ficha aponta para as vizinhas NESSA ordem.
    const esperado: [string, string | null, string | null][] = [
      [RECENTE, null, MEIO],
      [MEIO, RECENTE, ANTIGO],
      [ANTIGO, MEIO, null],
    ];
    for (const [id, antes, depois] of esperado) {
      await page.goto(ficha(id));
      if (antes) await expect(anterior(page)).toHaveAttribute("href", ficha(antes));
      else await expect(anteriorDesabilitado(page)).toBeDisabled();
      if (depois) await expect(proximo(page)).toHaveAttribute("href", ficha(depois));
      else await expect(proximoDesabilitado(page)).toBeDisabled();
    }
  });

  test("ficha reservada (pública, fora da listagem) navega a partir de onde estaria", async ({ page }) => {
    await page.goto(ficha(IDS_E2E.imovelNavegacaoReservado));
    await expect(anterior(page)).toHaveAttribute("href", ficha(RECENTE));
    await expect(proximo(page)).toHaveAttribute("href", ficha(MEIO));
  });

  test("rascunho e inativo continuam fora do ar", async ({ page }) => {
    for (const id of [IDS_E2E.imovelNavegacaoRascunho, IDS_E2E.imovelNavegacaoInativo]) {
      const resposta = await page.goto(ficha(id));
      expect(resposta?.status()).toBe(404);
    }
  });

  test("outra organização: as setas nunca saem dela", async ({ page }) => {
    // Organização W tem dezenas de imóveis sem data de publicação; os
    // vizinhos de qualquer ficha dela ficam na própria W.
    await page.goto(`/e2e-org-recursos/imoveis/${IDS_E2E.imovelGaleria5}`);
    for (const link of [anterior(page), proximo(page)]) {
      if ((await link.count()) === 0) continue;
      expect(await link.getAttribute("href")).toMatch(/^\/e2e-org-recursos\/imoveis\/[^/]+$/);
    }
  });
});

// -----------------------------------------------------------------------
// Navegação
// -----------------------------------------------------------------------
test.describe("navegação", () => {
  test("próximo, próximo, voltar e anterior: URL, título e canônica acompanham", async ({ page }) => {
    const erros = errosDoConsole(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ficha(RECENTE));
    await estaNaFicha(page, RECENTE);
    await expect(anteriorDesabilitado(page)).toBeDisabled();

    await proximo(page).click();
    await estaNaFicha(page, MEIO);
    await proximo(page).click();
    await estaNaFicha(page, ANTIGO);
    await expect(proximoDesabilitado(page)).toBeDisabled();

    await page.goBack();
    await estaNaFicha(page, MEIO);

    await anterior(page).click();
    await estaNaFicha(page, RECENTE);
    await expect(anteriorDesabilitado(page)).toBeDisabled();

    expect(erros).toEqual([]);
  });

  test("setas pelo teclado; a desabilitada fica fora da ordem de foco", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ficha(RECENTE));
    // Teclado só depois da hidratação. Enter num link ANTES dela é uma
    // corrida do framework que já existia (o card de "imóveis próximos"
    // reproduz igual): a ficha nova chega com a canônica antiga ainda no
    // <head>. Não é o que este teste mede.
    await page.waitForLoadState("networkidle");
    await botaoSalvar(page).focus();
    await page.keyboard.press("Tab");
    // A anterior está desabilitada: o foco pula direto para a próxima.
    await expect(proximo(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await estaNaFicha(page, MEIO);
  });

  test("ícones decorativos, nome acessível nas setas", async ({ page }) => {
    await page.goto(ficha(MEIO));
    for (const direcao of ["anterior", "proximo"] as const) {
      const s = seta(page, direcao);
      await expect(s.locator("svg")).toHaveAttribute("aria-hidden", "true");
      await expect(s).toHaveAccessibleName(direcao === "anterior" ? "Imóvel anterior" : "Próximo imóvel");
    }
  });

  test("navegar não é contato: nenhuma escrita e nenhum evento além da visualização", async ({ page }) => {
    const escritas: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (url.hostname !== "localhost" || r.method() === "GET") return;
      if (url.pathname === "/api/analytics/evento") return;
      escritas.push(`${r.method()} ${url.pathname}`);
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __beacons: unknown[] };
      w.__beacons = [];
      navigator.sendBeacon = (_url: string | URL, dados?: BodyInit | null) => {
        w.__beacons.push(dados);
        return true;
      };
    });

    await page.goto(ficha(RECENTE));
    await proximo(page).click();
    await estaNaFicha(page, MEIO);
    await anterior(page).click();
    await estaNaFicha(page, RECENTE);

    expect(escritas).toEqual([]);
    const tipos = await page.evaluate(async () => {
      const w = window as unknown as { __beacons: (Blob | string)[] };
      const corpos = await Promise.all(w.__beacons.map((b) => (typeof b === "string" ? b : b.text())));
      return corpos.map((c) => JSON.parse(c).type as string);
    });
    expect(tipos.every((t) => t === "PROPERTY_VIEW")).toBe(true);
  });
});

// -----------------------------------------------------------------------
// Salvar e compartilhar acompanham a ficha
// -----------------------------------------------------------------------
test.describe("ações seguem o imóvel atual", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("favorito: cada ficha tem o seu estado", async ({ page }) => {
    await page.goto(ficha(RECENTE));
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");

    await proximo(page).click();
    await estaNaFicha(page, MEIO);
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");

    await anterior(page).click();
    await estaNaFicha(page, RECENTE);
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "true");
    // Tirar o favorito aqui não mexe no do outro.
    await botaoSalvar(page).click();
    await expect(botaoSalvar(page)).toHaveAttribute("aria-pressed", "false");

    const salvos = await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k) ?? "[]"),
      `easymob:favoritos:v1:${ORG_NAVEGACAO.slug}`
    );
    expect(salvos).toEqual([MEIO]);
  });

  test("compartilhar: o menu usa a canônica da ficha atual", async ({ page }) => {
    await page.addInitScript(() => {
      delete (window.navigator as unknown as { share?: unknown }).share;
    });
    const urlFacebook = async () => {
      await botaoCompartilhar(page).click();
      const item = page.getByRole("menuitem", { name: /Facebook/ });
      await expect(item).toBeVisible();
      const href = await item.getAttribute("href");
      await page.keyboard.press("Escape");
      await expect(item).toBeHidden();
      return new URL(href!).searchParams.get("u");
    };

    await page.goto(ficha(RECENTE));
    expect(await urlFacebook()).toBe(await canonica(page));
    expect(await urlFacebook()).toMatch(new RegExp(`${ficha(RECENTE)}$`));

    await proximo(page).click();
    await estaNaFicha(page, MEIO);
    expect(await urlFacebook()).toMatch(new RegExp(`${ficha(MEIO)}$`));
    expect(await urlFacebook()).toBe(await canonica(page));
  });
});

// -----------------------------------------------------------------------
// Layout — só geometria RELATIVA (fontes e arredondamento mudam entre
// máquinas; a relação entre as caixas não).
// -----------------------------------------------------------------------
test.describe("layout", () => {
  const colide = (a: DOMRectLike, b: DOMRectLike) =>
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5;
  type DOMRectLike = { x: number; y: number; width: number; height: number };

  async function medir(page: Page) {
    return {
      cab: await caixa(cabecalho(page)),
      titulo: await caixa(page.getByRole("heading", { level: 1 })),
      compartilhar: await caixa(botaoCompartilhar(page)),
      salvar: await caixa(botaoSalvar(page)),
      anterior: await caixa(seta(page, "anterior")),
      proximo: await caixa(seta(page, "proximo")),
    };
  }

  for (const largura of [320, 390, 768, 1024, 1280, 1440]) {
    test(`${largura}px: quatro ações inteiras, setas 40x40 à direita, sem estouro`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(ficha(MEIO));
      const m = await medir(page);

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const botoes = [m.compartilhar, m.salvar, m.anterior, m.proximo];
      for (const b of botoes) {
        expect(b.x).toBeGreaterThanOrEqual(m.cab.x - 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(m.cab.x + m.cab.width + 0.5);
        expect(colide(b, m.titulo)).toBe(false);
      }
      for (let i = 0; i < botoes.length; i++)
        for (let j = i + 1; j < botoes.length; j++) expect(colide(botoes[i], botoes[j])).toBe(false);

      // Setas: redondas, 40x40 no mínimo, juntas, e a última na borda
      // direita do conteúdo em qualquer largura.
      for (const s of [m.anterior, m.proximo]) {
        expect(s.width).toBeGreaterThanOrEqual(40);
        expect(s.height).toBeGreaterThanOrEqual(40);
      }
      const raio = await seta(page, "proximo").evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
      expect(raio).toBeGreaterThanOrEqual(m.proximo.height / 2 - 1);
      expect(Math.abs(m.anterior.y - m.proximo.y)).toBeLessThan(1);
      expect(m.proximo.x).toBeGreaterThan(m.anterior.x);
      expect(Math.abs(m.proximo.x + m.proximo.width - (m.cab.x + m.cab.width))).toBeLessThan(1);

      // Compartilhar e Salvar lado a lado.
      expect(Math.abs(m.compartilhar.y - m.salvar.y)).toBeLessThan(1);
      expect(m.salvar.x).toBeGreaterThan(m.compartilhar.x);

      const centro = (b: DOMRectLike) => b.y + b.height / 2;
      if (largura >= 1024) {
        // Um grupo só, na linha do título: mesma linha, mesma distância
        // entre vizinhos, à direita do título.
        for (const b of botoes) expect(Math.abs(centro(b) - centro(m.compartilhar))).toBeLessThan(1);
        const vaos = [
          m.salvar.x - (m.compartilhar.x + m.compartilhar.width),
          m.anterior.x - (m.salvar.x + m.salvar.width),
          m.proximo.x - (m.anterior.x + m.anterior.width),
        ];
        for (const v of vaos) expect(Math.abs(v - vaos[0])).toBeLessThan(1);
        expect(m.compartilhar.x).toBeGreaterThanOrEqual(m.titulo.x + m.titulo.width);
        expect(Math.abs(m.compartilhar.y - m.titulo.y)).toBeLessThan(8);
      } else {
        // Abaixo de lg: Compartilhar começa na borda esquerda; as setas
        // ficam na mesma linha ou na seguinte, nunca acima.
        expect(Math.abs(m.compartilhar.x - m.cab.x)).toBeLessThan(1);
        expect(m.compartilhar.y).toBeGreaterThan(m.titulo.y + m.titulo.height);
        expect(m.anterior.y).toBeGreaterThanOrEqual(m.compartilhar.y - 3);
        if (m.anterior.y > m.salvar.y + m.salvar.height - 1) {
          // Quebrou: a linha das setas vem logo depois.
          expect(m.anterior.y - (m.salvar.y + m.salvar.height)).toBeLessThan(16);
        } else {
          expect(Math.abs(centro(m.anterior) - centro(m.salvar))).toBeLessThan(1);
        }
      }
    });
  }

  test("seta desabilitada ocupa o mesmo lugar: nada se move entre fichas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ficha(MEIO));
    const meio = await medir(page);
    await page.goto(ficha(RECENTE)); // anterior desabilitada
    const primeiro = await medir(page);
    await page.goto(ficha(ANTIGO)); // próxima desabilitada
    const ultimo = await medir(page);
    for (const outra of [primeiro, ultimo]) {
      for (const chave of ["compartilhar", "salvar", "anterior", "proximo"] as const) {
        expect(Math.abs(outra[chave].x - meio[chave].x)).toBeLessThan(1);
        expect(Math.abs(outra[chave].width - meio[chave].width)).toBeLessThan(1);
        expect(Math.abs(outra[chave].height - meio[chave].height)).toBeLessThan(1);
      }
    }
  });
});
